import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,appendFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Journal} from '../input/journal.mjs';
import {rawRecord,exactJSON,units,validateRaw} from '../input/contrato.mjs';
import {normalize,htmlText,parseFeed} from '../input/normalizar.mjs';
import {Store} from '../input/almacen.mjs';
import {analyzeText,narrativeEvent,attentionWindow} from '../input/nlp.mjs';
import {filterTransfers,ChainConnector} from '../input/cadena.mjs';
import {pollSource,delay,coinbaseSocket} from '../input/red.mjs';
import {startInput,authenticateWebhook} from '../input/servidor.mjs';
import {xiBatches,proveInputXI,trainingFacts} from '../input/puente.mjs';
import {auditAssertions} from '../input/auditoria.mjs';
import {startLaplace} from '../tools/iniciar.mjs';

const T='2026-10-30T12:00:00.000Z';
const source={id:'fixture/macro',adapter:'macro_json',url:'https://example.org/macro'};
const macro=(value='123.125',extra={})=>rawRecord(source,JSON.stringify({id:'GDP-1',revision:'r1',series_id:'GDP',observed_at:'2026-01-01T00:00:00Z',unit:'USD',value,...extra}),{received_at:T});
const temp=()=>mkdtemp(join(tmpdir(),'laplace-input-'));
async function db(){const s=await Store.open({embeddedDirectory:'memory://'});await s.migrate();return s}
async function eventually(fn,ms=8000){const until=Date.now()+ms;while(Date.now()<until){if(await fn())return;await delay(25)}assert.fail('condition did not converge')}

test('external JSON preserves large integers, decimal lexemes and rejects duplicate keys',()=>{
  assert.deepEqual(exactJSON('{"a":123456789012345678901234567890,"b":0.00000001}'),{a:'123456789012345678901234567890',b:'0.00000001'});
  assert.throws(()=>exactJSON('{"a":1,"a":2}'));
  assert.equal(units('123456789.00000001',8),12345678900000001n);
  assert.throws(()=>units('1.000000001',8));
});
test('raw hash, conservative availability and revisions protect history',()=>{
  const raw=macro(),e=normalize(raw)[0];assert.equal(e.known_at,T);assert.equal(e.payload.value,'123.125');
  assert.equal(normalize(macro('123.125',{revision:'r2'}))[0].event_key===e.event_key,false);
  assert.throws(()=>validateRaw({...raw,body_base64:Buffer.from('{}').toString('base64')}));
  assert.throws(()=>rawRecord({...source,stream_key:{}},'{}'),/stream key/);
  assert.throws(()=>normalize(macro('1',{observed_at:'2027-01-01T00:00:00Z'})),/after receipt/);
});
test('WAL group commit, rotation, single writer and exact replay',async()=>{
  const dir=await temp(),j=await new Journal(dir,{segmentBytes:1000}).open();
  try{await assert.rejects(()=>new Journal(dir).open(),/locked/);
    const a=await Promise.all(Array.from({length:40},(_,i)=>j.append({raw:macro(String(i))})));
    assert.deepEqual(a.map(r=>r.seq),Array.from({length:40},(_,i)=>i+1));assert.equal([...j.records()].length,40);
  }finally{await j.close()}
  const again=await new Journal(dir).open();assert.equal(again.durableSeq,40);assert.equal([...again.records(37)].length,3);await again.close();
});
test('WAL only repairs an incomplete tail; middle checksum corruption is isolated',async()=>{
  const dir=await temp(),j=await new Journal(dir).open();await j.append({raw:macro()});await j.close();
  const name=(await readdir(dir)).find(n=>n.endsWith('.wal')),path=join(dir,name),original=await readFile(path);
  await appendFile(path,Buffer.from([0,0,1]));const recovered=await new Journal(dir).open();assert.equal(recovered.durableSeq,1);await recovered.close();assert.equal((await stat(path)).size,original.length);
  const corrupt=Buffer.from(original);corrupt[corrupt.length-5]^=1;await writeFile(path,corrupt);await assert.rejects(()=>new Journal(dir).open(),/checksum/);
});
test('WAL capacity backpressures and acknowledged retention preserves sequence',async()=>{
  const dir=await temp(),small=await new Journal(dir,{maxBytes:100,maxQueuedBytes:100}).open();
  await assert.rejects(()=>small.append({raw:macro()}),e=>e.code==='INPUT_BACKPRESSURE');await small.close();
  const j=await new Journal(dir,{segmentBytes:1000}).open();for(let i=0;i<4;i++)await j.append({raw:macro(String(i))});
  assert.equal(await j.prune(0,{retainMs:0}),0);assert.ok(await j.prune(3,{retainMs:0})>0);await j.close();
  const again=await new Journal(dir).open();assert.equal(again.seq,4);assert.equal((await again.append({raw:macro('5')})).seq,5);await again.close();
});
test('SQL deduplicates deliveries and events; conflicts quarantine without stopping next event',async()=>{
  const store=await db();try{
    const raw=macro();assert.equal((await store.process(raw)).inserted,1);assert.equal((await store.process(raw)).status,'duplicate_delivery');
    assert.equal((await store.process(macro())).inserted,0);
    assert.equal((await store.process(macro('999'))).status,'quarantined');
    assert.equal((await store.process(macro('999',{revision:'r2'}))).inserted,1);
    assert.equal((await store.events()).length,2);assert.equal((await store.health()).quarantined,'1');
    assert.equal((await store.events({cutoff:'2026-10-30T11:59:59Z'})).length,0);
  }finally{await store.close()}
});
test('outbox publish failure remains retryable after committed SQL',async()=>{
  const store=await db();try{await store.process(macro());await assert.rejects(()=>store.drainOutbox(async()=>{throw Error('broker down')}),/broker down/);
    assert.equal((await store.health()).pending_outbox,'1');let sent=0;await store.drainOutbox(async()=>{sent++});assert.equal(sent,1);assert.equal((await store.health()).pending_outbox,'0');
  }finally{await store.close()}
});
test('malformed source is quarantined and a subsequent source event still commits',async()=>{
  const store=await db();try{assert.equal((await store.process(rawRecord(source,'{',{received_at:T}))).status,'quarantined');
    assert.equal((await store.process(null)).status,'quarantined');assert.equal((await store.process([])).status,'quarantined');
    assert.equal((await store.process(macro())).inserted,1);assert.equal((await store.health()).events,'1');
  }finally{await store.close()}
});
test('RSS and Atom parse safely; executable HTML and DTD do not become content',()=>{
  const rss='<rss><channel><item><guid>x</guid><title>Nvidia grows</title><link>https://example.org/a</link><description>Text</description><pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  const result=normalize(rawRecord({...source,adapter:'rss'},rss,{received_at:T}));assert.equal(result[0].type,'document');assert.equal(result[0].payload.title,'Nvidia grows');
  assert.equal(parseFeed('<feed><entry><id>a</id><title>T</title><link href="https://example.org"/><summary>S</summary></entry></feed>').length,1);
  assert.equal(htmlText('<p>Visible</p><script>secret()</script><style>hidden</style>'),'Visible');
  assert.throws(()=>parseFeed('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss/>'),/forbidden/);
});
test('light NLP targets entities, handles negation and records interpretation availability',()=>{
  const x=analyzeText('Odio Nvidia pero amo Bitcoin.','No odio JPMorgan. Quiero comprar Nvidia.');
  assert.ok(x.find(t=>t.entity==='NVDA').polarity<0);assert.ok(x.find(t=>t.entity==='BTC').polarity>0);assert.ok(x.find(t=>t.entity==='JPM').polarity>0);
  assert.equal(x.find(t=>t.entity==='NVDA').declared_intent,true);
  const d=normalize(rawRecord({...source,adapter:'document_json'},JSON.stringify({id:'a',url:'https://example.org/a',title:'Odio Nvidia',text:'',published:'2026-01-01T00:00:00Z'}),{received_at:T}))[0];
  const n=narrativeEvent(d,{available_at:'2026-10-30T12:05:00Z'});assert.equal(n.known_at,'2026-10-30T12:05:00.000Z');
  assert.equal(attentionWindow([n],{cutoff:T}).length,0);assert.equal(attentionWindow([n,n],{cutoff:'2026-10-30T12:06:00Z'})[0].distinct_content,1);
});
test('HTTP validators advance only after durable admission',async()=>{
  const state={},fetchImpl=async()=>new Response('{"x":1}',{status:200,headers:{etag:'v1'}});
  await assert.rejects(()=>pollSource(source,async()=>{throw Error('disk full')},{state,fetchImpl}));assert.equal(state.etag,undefined);
  await pollSource(source,async()=>({seq:1}),{state,fetchImpl});assert.equal(state.etag,'v1');
});
test('on-chain filters preserve uint256 and exclude internal exchange transfers',()=>{
  const amount='1234567890123456789012345678901234567890',labels=[{asset:'ETH',address:'a',platform:'X',kind:'exchange',known_at:T},{asset:'ETH',address:'b',platform:'X',kind:'exchange',known_at:T}];
  const result=filterTransfers([{id:'t',asset:'ETH',amount_raw:amount,from:'a',to:'b'}],{labels,known_at:T});
  assert.equal(result.transfers[0].amount_raw,amount);assert.equal(result.transfers[0].internal,true);assert.equal(result.netflows.length,0);
  assert.equal(filterTransfers([{asset:'BTC',amount_raw:'1',from:null,to:'b'}],{known_at:T}).netflows.length,0);
});
test('Bitcoin reorganization retracts and backfills with durable cursor recovery',async()=>{
  const dir=await temp(),j=await new Journal(dir).open();let chain=['h10','h11'];
  const rpc={async call(method,args=[]){if(method==='getblockcount')return {result:String(9+chain.length)};
    if(method==='getblockhash')return {result:chain[args[0]-10]};
    if(method==='getblock'){
      const height=chain.indexOf(args[0])+10;
      return {response_sha256:'fixture',result:{height:String(height),hash:args[0],previousblockhash:height===10?'h9':chain[height-11],time:'1793354400',tx:[{txid:args[0]+'tx',vout:[{n:'0',value:'1.00000000',scriptPubKey:{address:'target'}}]}]}};
    }
    throw Error(method);
  }};
  const src={id:'fixture/btc',adapter:'chain_block',network:'bitcoin',evidence_url:'https://bitcoin.org',from_height:10,confirmations:6};
  try{const c=await new ChainConnector(src,j,{rpc}).open();await c.poll();chain=['h10','fork11','fork12'];const r=await c.poll();assert.equal(r.retracted,1);assert.equal(r.connected,2);
    const events=[...j.records()].map(r=>normalize(r.raw)[0]);assert.deepEqual(events.map(e=>e.payload.operation),['connect','connect','disconnect','connect','connect']);
    const recovered=await new ChainConnector(src,j,{rpc}).open();assert.equal(recovered.state.next_height,13);assert.equal(recovered.state.headers.at(-1).hash,'fork12');
    const store=await db();try{for(const r of j.records())await store.process(r.raw);const row=(await store.db.query('SELECT * FROM input_chain_current WHERE height=11')).rows[0];assert.equal(row.block_hash,'fork11');assert.equal(row.canonical,true)}finally{await store.close()}
  }finally{await j.close()}
});
test('authenticated webhook ACK has a replayable WAL record and SQL projection',async()=>{
  const dir=await temp();process.env.LAPLACE_TEST_WEBHOOK_SECRET='fixture_secret_at_least_24_characters';
  const config={mode:'local',sources:[{...source,id:'webhook/test',transport:'webhook',secret_env:'LAPLACE_TEST_WEBHOOK_SECRET'}]};
  const app=await startInput(config,{directory:dir,port:0});
  try{
    await assert.rejects(()=>Store.open({embeddedDirectory:join(dir,'postgres')}),/already open/);
    const body=Buffer.from(JSON.stringify({id:'w1',revision:'r1',series_id:'CPI',observed_at:'2026-01-01T00:00:00Z',value:'3.1',unit:'percent'}));
    const stamp=String(Date.now()),signature='sha256='+createHmac('sha256',process.env.LAPLACE_TEST_WEBHOOK_SECRET).update(stamp+'.').update(body).digest('hex');
    const headers={'x-laplace-timestamp':stamp,'x-laplace-signature':signature,'x-delivery-id':'delivery1'};
    const response=await fetch('http://127.0.0.1:'+app.address.port+'/webhook/webhook%2Ftest',{method:'POST',headers,body});
    assert.equal(response.status,202);const ack=await response.json();assert.ok([...app.journal.records()].some(r=>r.seq===ack.sequence));
    await eventually(async()=>(await app.store.health()).events==='1');
    assert.throws(()=>authenticateWebhook(config.sources[0],{...headers,'x-laplace-signature':'sha256='+'0'.repeat(64)},body));
  }finally{await app.close();delete process.env.LAPLACE_TEST_WEBHOOK_SECRET}
});
test('bridge exports eligible training facts and keeps oversized exact integers on host',()=>{
  const events=[normalize(macro())[0],normalize(macro('9999999999999999999999999',{id:'big'}))[0]];
  const result=xiBatches(events,{cutoff:T});assert.equal(result.observations.length,1);assert.equal(result.observations[0].value,12312500000);assert.equal(result.excluded.length,1);
  assert.equal(trainingFacts(events).facts.length,1);assert.equal(trainingFacts(events).training_executed,false);
});
test('I001 numeric projection round-trips through original XI/Ether',{skip:!process.env.MUNDO_X_QUANTUM},()=>{
  const result=proveInputXI(process.env.MUNDO_X_QUANTUM,[normalize(macro())[0]],{cutoff:T});assert.equal(result.exact_roundtrip,true);assert.equal(result.batches[0].proof.materialized_bytes,48);
});
test('same trade with a changed bid/ask is a new quote revision',()=>{
  const source={id:'ticker/test',adapter:'coinbase_ticker',url:'https://example.org',product:'BTC-USD'};
  const quote={product_id:'BTC-USD',price:'70000.00',time:'2026-10-30T11:00:00Z',trade_id:'100',bid:'69999.00',ask:'70001.00'};
  const a=normalize(rawRecord(source,JSON.stringify(quote),{received_at:T}))[0],b=normalize(rawRecord(source,JSON.stringify({...quote,bid:'69998.00'}),{received_at:T}))[0];
  assert.notEqual(a.event_key,b.event_key);assert.equal(a.native_id,b.native_id);
});
test('structured audit separates revisions, repeated origins and opposing assertions',()=>{
  const base={subject:'US',metric:'GDP',period:'2026-Q2',unit:'USD',known_at:'2026-10-30T11:00:00Z',event_key:'a',origin_id:'primary',source_kind:'primary',value:'1'};
  const changed={...base,value:'2',known_at:T,event_key:'b'},other={...base,origin_id:'outlet',source_kind:'secondary',event_key:'c'};
  assert.equal(auditAssertions([base,changed],{cutoff:T})[0].status,'primary_source_assertion');
  assert.equal(auditAssertions([base,changed,other],{cutoff:T})[0].status,'conflicting_assertions');
  assert.equal(auditAssertions([base,base,base],{cutoff:T})[0].variants[0].origins.length,1);
});
test('Ethereum decodes exact ERC20 amounts, excludes ERC721 and recovers through RPC',async()=>{
  const j=await new Journal(await temp()).open(),big='123456789012345678901234567890';
  const hash='0x'+'a'.repeat(64),parent='0x'+'b'.repeat(64),token='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),from='0x'+'3'.repeat(40);
  const rpc={async call(method,args){
    if(method==='eth_blockNumber')return {result:'0xa'};
    if(method==='eth_getBlockByNumber')return {response_sha256:'r',result:{number:'0xa',hash,parentHash:parent,timestamp:'0x6ae33b20',transactions:[]}};
    if(method==='eth_getLogs')return {response_sha256:'l',result:[
      {address:token,blockHash:hash,topics:['transfer','0x'+'0'.repeat(24)+from.slice(2),'0x'+'0'.repeat(24)+to.slice(2)],data:'0x'+BigInt(big).toString(16).padStart(64,'0'),transactionHash:hash,logIndex:'0x0'},
      {address:token,blockHash:hash,topics:['transfer','a','b','token-id'],data:'0x',transactionHash:hash,logIndex:'0x1'}]};throw Error(method);
  }};
  try{const c=await new ChainConnector({id:'fixture/eth',adapter:'chain_block',network:'ethereum',evidence_url:'https://ethereum.org',from_height:10,tokens:[{address:token,asset:'TOKEN',decimals:6}]},j,{rpc}).open();
    await c.poll();const e=normalize([...j.records()][0].raw)[0];assert.equal(e.payload.transfers.length,1);assert.equal(e.payload.transfers[0].amount_raw,big);
    assert.equal(normalize([...j.records()][1].raw)[0].payload.operation,'finalize');
  }finally{await j.close()}
});
test('oversized transfer lists use durable parts before the canonical block manifest',async()=>{
  const j=await new Journal(await temp(),{maxQueuedBytes:16*1024*1024}).open();
  const source={id:'fixture/large',adapter:'chain_block',network:'ethereum',evidence_url:'https://ethereum.org',from_height:10};
  const c=await new ChainConnector(source,j,{rpc:{}}).open();
  const transfers=Array.from({length:9000},(_,i)=>({id:'tx-'+i,asset:'ETH',from:'a',to:'b',amount_raw:'100000000000000000000',evidence:'x'.repeat(160)}));
  try{await c.transition('connect',{height:10,hash:'large',parent_hash:'p',time:'2026-10-30T11:00:00Z',transfers},{headers:[],generation:0,next_height:11});
    const records=[...j.records()];assert.ok(records.length>2);assert.ok(records.slice(0,-1).every(r=>normalize(r.raw)[0].type==='chain_transfer_batch'));
    const final=normalize(records.at(-1).raw)[0];assert.equal(final.payload.operation,'connect');assert.equal(final.payload.selected_transfer_count,'9000');assert.equal(final.payload.transfer_chunks.length,records.length-1);
    assert.equal(records.slice(0,-1).reduce((n,r)=>n+normalize(r.raw)[0].payload.transfers.length,0),9000);
  }finally{await j.close()}
});
test('Laplace combined launcher exposes live input state and records a graceful stop',async()=>{
  const dir=await temp(),app=await startLaplace({config:{mode:'local',sources:[]},directory:dir,inputOptions:{port:0},panelOptions:{puerto:0,archivo:join(dir,'panel.json')}});
  try{await eventually(async()=>{
    const r=await fetch('http://127.0.0.1:'+app.panel.address().port+'/api/entrada');const data=await r.json();return data.status==='activa';
  })}finally{await app.close()}
  const summary=JSON.parse(await readFile(join(dir,'health.json'),'utf8'));assert.equal(summary.ready,false);assert.ok(summary.stopped_at);
});
test('a malformed WebSocket burst obeys the same bounded queue as valid traffic',async()=>{
  class Socket extends EventEmitter{send(){}pause(){}resume(){}terminate(){this.terminated=true}}
  const socket=new Socket();let calls=0,release;
  const source={id:'ws/test',adapter:'coinbase_ticker',url:'wss://example.org',evidence_url:'https://example.org',products:['BTC-USD']};
  const pending=coinbaseSocket(source,async()=>{if(++calls===1)return;return new Promise(r=>{release=r})},
    {socketFactory:()=>socket,fetchImpl:async()=>new Response('{}',{status:200})});
  const rejected=assert.rejects(pending,/queue full/);await eventually(()=>socket.listenerCount('message')>0);
  for(let i=0;i<258;i++)socket.emit('message',Buffer.from('{'));
  await rejected;assert.equal(socket.terminated,true);release?.();
});
