import {readFile,mkdir,open,unlink,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {hostname} from 'node:os';
import {Pool} from 'pg';
import {validateEvent,validateRaw,need,sha,stable} from './contrato.mjs';
import {normalize} from './normalizar.mjs';
import {narrativeEvent,aliasesFromRegistry} from './nlp.mjs';
import {Registry} from '../pulso/registro.mjs';
import {auditAssertions} from './auditoria.mjs';
import {proyectarI001} from '../estado-financiero/repositorio.mjs';

export class SemanticConflict extends Error{}
export class Store{
  constructor(db,{embedded=false,prefix='laplace.input',lock=null}={}){this.db=db;this.embedded=embedded;this.prefix=prefix;this.lock=lock;this.serial=Promise.resolve()}
  static async open({databaseURL,embeddedDirectory,prefix='laplace.input'}={}){
    if(databaseURL)return new Store(new Pool({connectionString:databaseURL,max:8,connectionTimeoutMillis:10000,statement_timeout:15000,query_timeout:20000}),{prefix});
    need(embeddedDirectory,'configure a database URL or an embedded directory');
    if(embeddedDirectory!=='memory://')await mkdir(dirname(embeddedDirectory),{recursive:true});
    let lock=null;
    if(embeddedDirectory!=='memory://'){
      const path=embeddedDirectory+'.writer.lock';let fd;
      try{fd=await open(path,'wx',0o600)}catch(error){
        if(error.code!=='EEXIST')throw error;
        const owner=JSON.parse(await readFile(path,'utf8'));let dead=false;
        if(owner.host===hostname()&&Number.isInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0)}catch(e){dead=e.code==='ESRCH'}}
        need(dead,'embedded database already open; stop input before offline export or use server PostgreSQL');
        await rename(path,path+'.stale.'+Date.now());fd=await open(path,'wx',0o600);
      }
      await fd.writeFile(stable({pid:process.pid,host:hostname(),at:new Date().toISOString()}));await fd.sync();lock={fd,path};
    }
    try{const {PGlite}=await import('@electric-sql/pglite');
      const db=new PGlite(embeddedDirectory);await db.waitReady;return new Store(db,{embedded:true,prefix,lock});
    }catch(error){if(lock){await lock.fd.close();await unlink(lock.path)}throw error}
  }
  async migrate({timescale=false}={}){
    if(timescale){need(!this.embedded,'Timescale requires a PostgreSQL server, not PGlite');await this.db.query('CREATE EXTENSION IF NOT EXISTS timescaledb')}
    const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
    // Separate statements also work with prepared-query clients.
    for(const sql of schema.split(';').filter(x=>x.trim()))await this.db.query(sql);
    const financial=await readFile(new URL('../estado-financiero/schema.sql',import.meta.url),'utf8');
    for(const sql of financial.split(';').filter(x=>x.trim()))await this.db.query(sql);
    if(timescale)await this.db.query("SELECT create_hypertable('input_events','known_at',if_not_exists => TRUE)");
    return {engine:this.embedded?'embedded_postgresql':'postgresql',timescale};
  }
  transaction(fn){
    const run=async()=>{
      if(this.embedded)return this.db.transaction(fn);
      const client=await this.db.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value}
      catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    };
    if(!this.embedded)return run();
    // PGlite is one PostgreSQL connection; serialize whole transactions.
    const job=this.serial.then(run,run);this.serial=job.catch(()=>{});return job;
  }
  async enqueue(tx,key,topic,stream,body){
    await tx.query('INSERT INTO input_outbox(effect_key,topic,stream_key,body) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(effect_key) DO NOTHING',
      [key,this.prefix+'.'+topic,stream,JSON.stringify(body)]);
  }
  async insertEvent(tx,e){
    validateEvent(e);
    const inserted=await tx.query('INSERT INTO input_event_keys(event_key,semantic_sha256,known_at) VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING RETURNING event_key',
      [e.event_key,e.semantic_sha256,e.known_at]);
    if(!inserted.rows.length){
      const old=(await tx.query('SELECT semantic_sha256 FROM input_event_keys WHERE event_key=$1',[e.event_key])).rows[0];
      if(old.semantic_sha256!==e.semantic_sha256)throw new SemanticConflict('event identity reused with changed content; supply a revision');
      return false;
    }
    await tx.query('INSERT INTO input_events(known_at,event_key,type,subject,source_id,event_time,event) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [e.known_at,e.event_key,e.type,e.subject,e.source_id,e.event_time,JSON.stringify(e)]);
    // EF001 forma parte de la misma transaccion: nunca proyectar un evento no admitido.
    await proyectarI001(tx,e);
    await this.enqueue(tx,'clean:'+e.event_key,'clean',e.stream_key,e);
    if(e.type==='document')await this.enqueue(tx,'nlp:'+e.event_key,'documents',e.stream_key,e);
    if(e.type==='chain_block'){
      const p=e.payload;
      if(p.operation==='connect')await tx.query(`INSERT INTO input_chain_current(network,height,block_hash,canonical,finalized,known_at)
        VALUES($1,$2,$3,true,false,$4) ON CONFLICT(network,height) DO UPDATE SET block_hash=$3,canonical=true,finalized=false,known_at=$4
        WHERE input_chain_current.known_at <= $4`,[p.network,p.height,p.hash,e.known_at]);
      else await tx.query(`UPDATE input_chain_current SET canonical=$4,finalized=$5,known_at=$6
        WHERE network=$1 AND height=$2 AND block_hash=$3 AND known_at <= $6`,
        [p.network,p.height,p.hash,p.operation!=='disconnect',p.operation==='finalize',e.known_at]);
    }
    return true;
  }
  async process(raw){
    let events;
    try{validateRaw(raw);events=normalize(raw)}catch(error){return this.quarantine(raw,error.message)}
    try{return await this.transaction(async tx=>{
      const inbox=await tx.query('INSERT INTO input_inbox(delivery_id,raw_sha256,received_at,source_id,raw) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(delivery_id) DO NOTHING RETURNING delivery_id',
        [raw.delivery_id,raw.raw_sha256,raw.received_at,raw.source_id,JSON.stringify(raw)]);
      if(!inbox.rows.length){const old=(await tx.query('SELECT raw_sha256 FROM input_inbox WHERE delivery_id=$1',[raw.delivery_id])).rows[0];
        if(old.raw_sha256!==raw.raw_sha256)throw new SemanticConflict('delivery ID reused with different bytes');
        return {status:'duplicate_delivery',inserted:0};}
      let inserted=0;for(const e of events)inserted+=Number(await this.insertEvent(tx,e));
      return {status:'processed',inserted,events:events.length};
    })}catch(error){if(error instanceof SemanticConflict)return this.quarantine(raw,error.message);throw error}
  }
  async quarantine(raw,reason){
    const record=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{invalid_value:raw??null};
    const id=String(record.delivery_id??sha(stable(record)))+':'+String(record.raw_sha256??sha(stable(record)));
    await this.transaction(async tx=>{
      await tx.query('INSERT INTO input_quarantine(delivery_id,reason,raw) VALUES($1,$2,$3::jsonb) ON CONFLICT(delivery_id) DO NOTHING',[id,reason.slice(0,1000),JSON.stringify(record)]);
      await this.enqueue(tx,'quarantine:'+id,'quarantine',String(record.stream_key??'invalid'),{reason:reason.slice(0,1000),raw:record});
    });return {status:'quarantined',inserted:0,reason};
  }
  async processDocument(doc,options={}){
    validateEvent(doc);need(doc.type==='document','NLP work item must be a validated document');
    const derived=narrativeEvent(doc,{aliases:this.aliases,...options});
    return this.transaction(async tx=>{
      const key=derived.event_key,r=await tx.query('INSERT INTO input_nlp_inbox(event_key) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_key',[key]);
      if(!r.rows.length)return {status:'duplicate_document'};
      await this.insertEvent(tx,derived);return {status:'processed',event:derived};
    });
  }
  async importInstitutions(registry){
    // Reuse P001's integrity checks and identities; never infer control from holdings.
    new Registry(registry);
    this.aliases=aliasesFromRegistry(registry);
    const summary={entities:registry.entities.length,assertions:registry.assertions.length,
      reports:registry.reports.length,registry_sha256:registry.registry_sha256,training_executed:false};
    await this.transaction(async tx=>{
      const r=await tx.query('INSERT INTO input_registry_imports(registry_sha256,source_known_at,summary) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING registry_sha256',
        [registry.registry_sha256,registry.sources.map(s=>s.known_at).sort().at(-1),JSON.stringify(summary)]);
      if(!r.rows.length)return;
      for(let i=0;i<registry.entities.length;i+=500)await tx.query(`INSERT INTO input_entity_versions(entity_id,registry_sha256,entity)
        SELECT x->>'id',$2,x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING`,[JSON.stringify(registry.entities.slice(i,i+500)),registry.registry_sha256]);
      for(let i=0;i<registry.assertions.length;i+=500)await tx.query(`INSERT INTO input_institution_assertions(assertion_id,known_at,assertion)
        SELECT x->>'id',(x->>'known_at')::timestamptz,x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING`,[JSON.stringify(registry.assertions.slice(i,i+500))]);
      for(let i=0;i<registry.sources.length;i+=500)await tx.query(`INSERT INTO input_institution_sources(source_id,source)
        SELECT x->>'id',x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING`,[JSON.stringify(registry.sources.slice(i,i+500))]);
    });
    return summary;
  }
  async drainOutbox(publish,{limit=100}={}){
    return this.transaction(async tx=>{
      const rows=(await tx.query('SELECT id,topic,stream_key,body FROM input_outbox WHERE sent_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED',[limit])).rows;
      for(const r of rows){await publish({topic:r.topic,key:r.stream_key,value:r.body});await tx.query('UPDATE input_outbox SET sent_at=now() WHERE id=$1',[r.id])}
      return rows.length;
    });
  }
  async events({cutoff=new Date().toISOString(),limit=4096,type=null}={}){
    need(Number.isInteger(limit)&&limit>=1&&limit<=10000,'invalid query budget');
    const q=type?' AND type=$3':'';
    return (await this.db.query('SELECT event FROM input_events WHERE known_at <= $1'+q+' ORDER BY known_at DESC,event_key DESC LIMIT $2',type?[cutoff,limit,type]:[cutoff,limit])).rows.map(r=>r.event).reverse();
  }
  async health(){
    const r=await this.db.query(`SELECT (SELECT count(*)::text FROM input_events) AS events,
      (SELECT count(*)::text FROM input_quarantine) AS quarantined,
      (SELECT count(*)::text FROM input_outbox WHERE sent_at IS NULL) AS pending_outbox`);
    return {engine:this.embedded?'embedded_postgresql':'postgresql',...r.rows[0]};
  }
  async audit({cutoff=new Date().toISOString()}={}){
    const events=await this.events({cutoff,type:'macro',limit:10000});
    return {scope:'latest_10000_macro_events',cutoff,results:auditAssertions(events.map(e=>({subject:e.subject,metric:e.payload.series_id,
      period:e.event_time,unit:e.payload.unit,value:e.payload.value,known_at:e.known_at,origin_id:e.quality.origin_id??new URL(e.source_url).hostname,
      source_kind:e.quality.source_kind??'unknown',event_key:e.event_key})),{cutoff}),unstructured_claim_verification:'pending_evidence'};
  }
  async close(){
    try{await this.serial;if(this.embedded)await this.db.close();else await this.db.end()}
    finally{if(this.lock){await this.lock.fd.close();await unlink(this.lock.path);this.lock=null}}
  }
}
