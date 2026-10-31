import {createServer} from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {Journal,atomicJSON} from './journal.mjs';
import {Store} from './almacen.mjs';
import {rawRecord,need,MAX_BODY} from './contrato.mjs';
import {pollSource,coinbaseSocket,Supervisor,delay} from './red.mjs';
import {ChainConnector} from './cadena.mjs';
import {kafkaClient,publisher,startConsumer} from './kafka.mjs';

async function bodyBytes(req){
  let count=0;const chunks=[];
  for await(const chunk of req){count+=chunk.length;need(count<=MAX_BODY,'webhook body exceeds budget');chunks.push(chunk)}
  return Buffer.concat(chunks);
}
export function authenticateWebhook(source,headers,body,{now=Date.now()}={}){
  const secret=process.env[source.secret_env];need(typeof secret==='string'&&secret.length>=24,'webhook secret missing or too short');
  const stamp=String(headers['x-laplace-timestamp']??''),signature=String(headers['x-laplace-signature']??'');
  need(/^\d{10,13}$/.test(stamp),'webhook timestamp missing');const time=Number(stamp)*(stamp.length===10?1000:1);
  need(Math.abs(time-now)<=300000,'webhook timestamp expired');
  need(/^sha256=[a-f0-9]{64}$/.test(signature),'webhook signature missing');
  const expected=createHmac('sha256',secret).update(stamp+'.').update(body).digest();
  need(timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')),'webhook authentication failed');
}
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value)+'\n')};
export async function startInput(config,{directory='registros/input',port=config.port??8787,host=config.host??'127.0.0.1',fetchImpl}={}){
  need(['local','kafka'].includes(config.mode??'local'),'input mode must be local or kafka');
  const kafkaMode=config.mode==='kafka',role=config.role??'all';need(['all','collector','processor'].includes(role),'unknown input role');
  need(kafkaMode||role==='all','local input uses role all');
  await mkdir(directory,{recursive:true});const controller=new AbortController(),signal=controller.signal;
  const sources=(role==='processor'?[]:config.sources??[]).filter(s=>s.enabled!==false);need(new Set(sources.map(s=>s.id)).size===sources.length,'duplicate source IDs');
  for(const s of sources.filter(s=>s.transport==='webhook'))need(process.env[s.secret_env]?.length>=24,'configure webhook secret '+s.secret_env);
  if(config.database_url_env&&role!=='collector')need(process.env[config.database_url_env],'missing database configuration '+config.database_url_env);
  const journal=await new Journal(join(directory,'wal'),config.journal??{}).open();
  let store=null,producer=null,consumers=[],server;
  const metrics={accepted:0,published:0,processed:0,quarantined:0,last_error:null,started_at:new Date().toISOString(),sources:{}};
  const sourceTasks=[],background=[],supervisor=new Supervisor({signal,status:report});
  async function admit(source,body,options={}){
    const raw=rawRecord(source,body,options),record=await journal.append({raw});metrics.accepted++;
    metrics.sources[source.id]={...(metrics.sources[source.id]??{}),last_received_at:raw.received_at};return record;
  }
  async function report(source,state){
    metrics.sources[source.id]={...(metrics.sources[source.id]??{}),...state};
    return admit({...source,id:source.id+'.status',adapter:'status'},JSON.stringify(state));
  }
  try{
    if(!kafkaMode||role!=='collector'){
      store=await Store.open({databaseURL:config.database_url_env?process.env[config.database_url_env]:null,
        embeddedDirectory:join(directory,'postgres'),prefix:config.kafka?.prefix});
      await store.migrate({timescale:config.timescale===true});
      if(config.institutional_registry){const bytes=await readFile(config.institutional_registry);metrics.institutions=await store.importInstitutions(JSON.parse(gunzipSync(bytes,{maxOutputLength:100000000}).toString()))}
    }
    let client;
    if(kafkaMode){
      const brokers=config.kafka?.brokers_env?(process.env[config.kafka.brokers_env]??'').split(',').filter(Boolean):config.kafka?.brokers;
      let sasl;if(config.kafka?.sasl)sasl={mechanism:config.kafka.sasl.mechanism,username:process.env[config.kafka.sasl.username_env],password:process.env[config.kafka.sasl.password_env]};
      client=kafkaClient({...config.kafka,brokers,sasl});
      // Producer connection errors do not prevent collectors from fsyncing into the WAL.
      background.push((async()=>{let cursor=(await journal.cursor('kafka_delivery')).seq;
        while(!signal.aborted){try{
          producer??=await publisher(client);
          let n=0;for(const record of journal.records(cursor)){
            await producer.publish({topic:(config.kafka?.prefix??'laplace.input')+'.raw',key:record.raw.stream_key,value:record.raw});
            cursor=record.seq;metrics.published++;await journal.checkpoint('kafka_delivery',{seq:cursor});if(++n>=256||signal.aborted)break;
          }await journal.prune(cursor,{retainMs:config.local_retention_ms??86400000});await delay(n?1:100,signal);
        }catch(error){metrics.last_error={stage:'kafka_publish',code:error.code??error.name,at:new Date().toISOString()};await delay(1000,signal)}}
      })());
      if(store)background.push((async()=>{
        while(!signal.aborted&&consumers.length<2){
          try{consumers.push(await startConsumer(client,store,{prefix:config.kafka?.prefix}));
            consumers.push(await startConsumer(client,store,{prefix:config.kafka?.prefix,lane:'documents'}))}
          catch(error){metrics.last_error={stage:'kafka_consumer',code:error.code??error.name,at:new Date().toISOString()};for(const c of consumers)await c.disconnect();consumers=[];await delay(1000,signal)}
        }
      })());
    }else background.push((async()=>{
      let cursor=(await journal.cursor('local_projection')).seq;
      while(!signal.aborted){try{
        let n=0;for(const record of journal.records(cursor)){
          const result=await store.process(record.raw);metrics.processed++;metrics.quarantined+=Number(result.status==='quarantined');
          cursor=record.seq;await journal.checkpoint('local_projection',{seq:cursor});if(++n>=256||signal.aborted)break;
        }await journal.prune(cursor,{retainMs:config.local_retention_ms??86400000});await delay(n?1:100,signal);
      }catch(error){metrics.last_error={stage:'projection',code:error.code??error.name,at:new Date().toISOString()};await delay(1000,signal)}}
    })());
    if(store)background.push((async()=>{
      while(!signal.aborted){try{
        if(kafkaMode){if(producer)await store.drainOutbox(message=>producer.publish(message),{limit:32})}
        else{
          // Local effects run outside a held SQL transaction. Their own inbox deduplicates replays.
          const rows=(await store.db.query('SELECT id,topic,body FROM input_outbox WHERE sent_at IS NULL ORDER BY id LIMIT 32')).rows;
          for(const r of rows){if(r.topic.endsWith('.documents'))await store.processDocument(r.body);
            await store.db.query('UPDATE input_outbox SET sent_at=now() WHERE id=$1',[r.id])}
        }
      }catch(error){metrics.last_error={stage:'outbox',code:error.code??error.name,at:new Date().toISOString()}}
        await delay(100,signal);
      }
    })());
    for(const source of sources){
      if(source.transport==='webhook')continue;
      if(source.transport==='http'){const state={};sourceTasks.push(supervisor.run(source,()=>pollSource(source,admit,{fetchImpl,state})))}
      else if(source.transport==='websocket')sourceTasks.push(supervisor.run(source,()=>coinbaseSocket(source,admit,{signal,report,fetchImpl})));
      else if(source.transport==='chain'){const connector=await new ChainConnector(source,journal).open();sourceTasks.push(supervisor.run(source,()=>connector.listen({signal})))}
      else throw Error('unknown source transport '+source.transport);
    }
    async function health(){
      const sourceHealth={};for(const source of sources){const x={...supervisor.states.get(source.id),...metrics.sources[source.id]};
        x.stale=source.max_staleness_ms&&x.last_received_at?Date.now()-Date.parse(x.last_received_at)>source.max_staleness_ms:null;sourceHealth[source.id]=x}
      return {schema:'laplace.input.health.i001',at:new Date().toISOString(),mode:config.mode??'local',role,
        ready:!journal.closed&&!journal.fatal&&journal.bytes+journal.queuedBytes<journal.maxBytes,
        wal:{durable_sequence:journal.durableSeq,bytes:journal.bytes,queued_bytes:journal.queuedBytes,capacity_bytes:journal.maxBytes},
        ...metrics,sources:sourceHealth,storage:store?await store.health():null,
        capture_scope:'configured_sources_only',throughput_benchmark_completed:false};
    }
    server=createServer(async(req,res)=>{
      try{
        const path=new URL(req.url,'http://localhost').pathname;
        if(req.method==='GET'&&path==='/health'){const h=await health();send(res,h.ready?200:503,h);return}
        if(req.method==='POST'&&path.startsWith('/webhook/')){
          const source=sources.find(s=>s.transport==='webhook'&&s.id===decodeURIComponent(path.slice(9)));if(!source){send(res,404,{error:'unknown webhook source'});return}
          const body=await bodyBytes(req);try{authenticateWebhook(source,req.headers,body)}catch{send(res,401,{error:'webhook authentication failed'});return}
          const delivery=String(req.headers['x-delivery-id']??'');need(delivery.length>0&&delivery.length<=240,'x-delivery-id required');
          const record=await admit(source,body,{native_id:delivery,content_type:String(req.headers['content-type']??'application/json')});
          send(res,202,{status:'durably_admitted',sequence:record.seq,delivery_id:record.raw.delivery_id});return;
        }
        send(res,404,{error:'unknown route'});
      }catch(error){if(error.code==='INPUT_BACKPRESSURE'){res.setHeader('Retry-After','1');send(res,503,{error:'input capacity reached; retry required'})}
        else send(res,400,{error:'request rejected'})}
    });
    server.requestTimeout=20000;server.headersTimeout=10000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
    background.push((async()=>{while(!signal.aborted){try{await atomicJSON(join(directory,'health.json'),await health())}catch{}await delay(1000,signal)}})());
    return {journal,store,admit,health,address:server.address(),async close(){
      controller.abort();await new Promise(resolve=>server.close(resolve));await Promise.allSettled(sourceTasks);await Promise.allSettled(background);
      for(const c of consumers)await c.disconnect();await producer?.close();await journal.close();
      try{await atomicJSON(join(directory,'health.json'),{...await health(),stopped_at:new Date().toISOString()})}finally{await store?.close()}
    }};
  }catch(error){controller.abort();server?.close();await Promise.allSettled(sourceTasks);await Promise.allSettled(background);
    for(const c of consumers)await c.disconnect();await producer?.close();await journal.close();await store?.close();throw error}
}
