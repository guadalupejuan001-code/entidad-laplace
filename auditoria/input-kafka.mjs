#!/usr/bin/env node
/* Explicit integration experiment. Every invocation uses a fresh Kafka data
 * directory and kills only the three processes it creates. Requires Java 17. */
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {kafkaClient,initializeTopics,publisher,startConsumer} from '../input/kafka.mjs';
import {Store} from '../input/almacen.mjs';
import {rawRecord,need} from '../input/contrato.mjs';
import {delay} from '../input/red.mjs';

need(process.env.KAFKA_HOME&&process.argv[2],'uso: KAFKA_HOME=KAFKA_4_1_2 node auditoria/input-kafka.mjs SALIDA_NUEVA.json');
const home=resolve(process.env.KAFKA_HOME),base=await mkdtemp(join(tmpdir(),'laplace-kafka-')),cluster=randomBytes(16).toString('base64url');
const children=[],fds=[];let producer,store,rawConsumer,nlpConsumer;
async function run(path,args,log){
  await new Promise((resolve,reject)=>{const c=spawn(path,args,{stdio:['ignore',log,log],env:{...process.env,KAFKA_HEAP_OPTS:'-Xms128m -Xmx128m'}});
    c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error('Kafka utility exit '+code)))});
}
try{
  for(let n=1;n<=3;n++){
    const dir=join(base,'node'+n);await mkdir(dir);const fd=openSync(join(dir,'server.log'),'a');fds.push(fd);
    const properties=`process.roles=broker,controller\nnode.id=${n}\ncontroller.quorum.voters=1@127.0.0.1:19093,2@127.0.0.1:29093,3@127.0.0.1:39093\nlisteners=PLAINTEXT://127.0.0.1:${n}9092,CONTROLLER://127.0.0.1:${n}9093\nadvertised.listeners=PLAINTEXT://127.0.0.1:${n}9092\ncontroller.listener.names=CONTROLLER\nlistener.security.protocol.map=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT\ninter.broker.listener.name=PLAINTEXT\nlog.dirs=${dir}/data\nnum.partitions=3\nnum.network.threads=2\nnum.io.threads=2\noffsets.topic.replication.factor=3\ntransaction.state.log.replication.factor=3\ntransaction.state.log.min.isr=2\ndefault.replication.factor=3\nmin.insync.replicas=2\nunclean.leader.election.enable=false\ngroup.initial.rebalance.delay.ms=0\nlog.retention.hours=24\nlog.segment.bytes=33554432\nmessage.max.bytes=6291456\nreplica.fetch.max.bytes=8388608\n`;
    await writeFile(join(dir,'server.properties'),properties);
    await run(join(home,'bin/kafka-storage.sh'),['format','-t',cluster,'-c',join(dir,'server.properties')],fd);
  }
  for(let n=1;n<=3;n++)children.push(spawn(join(home,'bin/kafka-server-start.sh'),[join(base,'node'+n,'server.properties')],
    {detached:true,stdio:['ignore',fds[n-1],fds[n-1]],env:{...process.env,KAFKA_HEAP_OPTS:'-Xms256m -Xmx256m'}}));
  const client=kafkaClient({brokers:['127.0.0.1:19092','127.0.0.1:29092','127.0.0.1:39092']}),prefix='laplace.check.'+Date.now();
  let ready=false;const startLimit=Date.now()+90000;
  while(Date.now()<startLimit){
    need(children.every(c=>c.exitCode===null&&c.signalCode===null),'broker startup failed; inspect '+base);
    try{await initializeTopics(client,{prefix,partitions:3,replicas:3,minISR:2});ready=true;break}catch{await delay(1000)}
  }
  need(ready,'cluster startup timed out; inspect '+base);
  producer=await publisher(client);store=await Store.open({embeddedDirectory:'memory://',prefix});await store.migrate();
  let injected=0;const processRaw=store.process.bind(store);store.process=async raw=>{if(injected<2){injected++;throw Object.assign(Error('injected storage outage'),{code:'ECONNRESET'})}return processRaw(raw)};
  rawConsumer=await startConsumer(client,store,{prefix});nlpConsumer=await startConsumer(client,store,{prefix,lane:'documents'});
  const source={id:'fixture/kafka',adapter:'macro_json',url:'https://example.org'};
  const raw=n=>rawRecord(source,JSON.stringify({id:'m'+n,revision:'0',series_id:'TEST',unit:'units',value:String(n),observed_at:'2026-01-01T00:00:00Z'}));
  const records=Array.from({length:12},(_,n)=>raw(n));
  for(const value of [...records,records[0]])await producer.publish({topic:prefix+'.raw',key:source.id,value});
  await producer.publish({topic:prefix+'.raw',key:source.id,value:rawRecord({...source,adapter:'document_json'},JSON.stringify({id:'d1',url:'https://example.org/a',title:'Odio Nvidia pero amo Bitcoin',text:'Quiero comprar Bitcoin.'}))});
  async function converge(count){
    const limit=Date.now()+30000;while(Date.now()<limit){await store.drainOutbox(message=>producer.publish(message));const h=await store.health();if(h.events===String(count)&&h.pending_outbox==='0')return;await delay(100)}
    throw Error('pipeline did not converge to '+count);
  }
  await converge(14);children[2].kill('SIGTERM');await delay(1500);
  await producer.publish({topic:prefix+'.raw',key:source.id,value:raw(12)});await converge(15);
  const report={kafka_version:'4.1.2',brokers:3,replicas:3,min_insync_replicas:2,acks:'all',initial_unique_macro_events:12,repeated_delivery:1,
    documents:1,derived_narratives:1,transient_storage_failures_recovered:injected,events_after_one_broker_stopped:15,
    health:await store.health(),benchmark:false,scope:'single host; three processes; not three failure-independent machines'};
  await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}finally{
  await rawConsumer?.disconnect();await nlpConsumer?.disconnect();await producer?.close();await store?.close();
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGTERM')}catch{}}
  await Promise.all(children.map(child=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{
    const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}resolve()},10000);
    child.once('exit',()=>{clearTimeout(timer);resolve()});
  })));
  for(const fd of fds)closeSync(fd);
}
