import {Kafka,Partitioners,logLevel} from 'kafkajs';
import {need,validateEvent} from './contrato.mjs';
import {delay} from './red.mjs';
export const TOPICS=['raw','clean','documents','quarantine'];
export function kafkaClient({brokers,prefix='laplace.input',clientId='laplace-input-i001',ssl=false,sasl}={}){
  need(Array.isArray(brokers)&&brokers.length>0,'Kafka brokers missing');
  return new Kafka({clientId,brokers,ssl,sasl,logLevel:logLevel.ERROR,connectionTimeout:10000,requestTimeout:30000,
    retry:{initialRetryTime:300,retries:5}});
}
export async function initializeTopics(client,{prefix='laplace.input',replicas=3,partitions=12,minISR=2}={}){
  need(replicas>=minISR&&minISR>=1,'invalid replication profile');const admin=client.admin();await admin.connect();
  try{return await admin.createTopics({waitForLeaders:true,topics:TOPICS.map(name=>({topic:prefix+'.'+name,numPartitions:partitions,replicationFactor:replicas,
    configEntries:[{name:'min.insync.replicas',value:String(minISR)},{name:'unclean.leader.election.enable',value:'false'},
      {name:'retention.ms',value:String(7*86400000)},{name:'max.message.bytes',value:String(6*1024*1024)}]}))})}
  finally{await admin.disconnect()}
}
export async function publisher(client){
  const producer=client.producer({idempotent:true,maxInFlightRequests:1,createPartitioner:Partitioners.DefaultPartitioner,allowAutoTopicCreation:false});
  await producer.connect();return {
    async publish({topic,key,value}){await producer.send({topic,acks:-1,messages:[{key,value:JSON.stringify(value)}]})},
    close:()=>producer.disconnect()
  };
}
export async function startConsumer(client,store,{prefix='laplace.input',lane='raw',groupId}={}){
  const consumer=client.consumer({groupId:groupId??prefix+'.'+lane+'.i001',allowAutoTopicCreation:false,maxBytesPerPartition:8*1024*1024});
  await consumer.connect();await consumer.subscribe({topic:prefix+'.'+lane,fromBeginning:true});
  let stopping=false;const disconnect=consumer.disconnect.bind(consumer);consumer.disconnect=async()=>{stopping=true;await disconnect()};
  await consumer.run({autoCommit:false,partitionsConsumedConcurrently:3,eachMessage:async({topic,partition,message,heartbeat})=>{
    const bytes=message.value??Buffer.alloc(0);let body,transportValid=true;
    try{body=JSON.parse(bytes.toString())}catch{transportValid=false;body={delivery_id:'kafka:'+topic+':'+partition+':'+message.offset,stream_key:topic,raw_text:bytes.toString('base64')}}
    let completed=false,failures=0;
    while(!stopping){
      try{
        if(!transportValid)await store.quarantine(body,'invalid transport JSON');
        else if(lane==='documents'){
          let valid=true;try{validateEvent(body);need(body.type==='document'&&typeof body.payload.title==='string'&&typeof body.payload.text==='string','invalid NLP work item')}catch{valid=false}
          if(valid)await store.processDocument(body);else await store.quarantine({delivery_id:'kafka:'+topic+':'+partition+':'+message.offset,stream_key:topic,body},'invalid NLP work item');
        }else await store.process(body);
        completed=true;break;
      }catch{
        // Storage failure is not a malformed event. Hold this partition's ACK
        // and heartbeat while retrying; other partitions/sources can continue.
        await heartbeat();await delay(Math.min(5000,200*2**Math.min(++failures,5)));
      }
    }
    if(!completed)return;
    await heartbeat();
    // DB transaction includes the outbox. Kafka offset ACK follows SQL commit.
    await consumer.commitOffsets([{topic,partition,offset:(BigInt(message.offset)+1n).toString()}]);
  }});
  return consumer;
}
