#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync,gzipSync} from 'node:zlib';
import {Store} from '../input/almacen.mjs';
import {startInput} from '../input/servidor.mjs';
import {Journal} from '../input/journal.mjs';
import {kafkaClient,initializeTopics} from '../input/kafka.mjs';
import {trainingFacts,proveInputXI} from '../input/puente.mjs';
import {need} from '../input/contrato.mjs';

const load=async p=>JSON.parse(await readFile(p,'utf8'));
function dbOptions(config,directory){
  if(config.database_url_env)need(process.env[config.database_url_env],'configure '+config.database_url_env);
  return {databaseURL:config.database_url_env?process.env[config.database_url_env]:null,embeddedDirectory:join(directory,'postgres'),prefix:config.kafka?.prefix};
}
export async function runInput(args){
  const [command,...p]=args;
  const defaultConfig=fileURLToPath(new URL('../input/config.local.json',import.meta.url));
  if(command==='instalar'){
    need(p.length<=2,'uso: entrada instalar [CONFIG.json] [DIRECTORIO]');
    const config=await load(p[0]??defaultConfig),directory=p[1]??'registros/input',store=config.role==='collector'?null:await Store.open(dbOptions(config,directory));
    try{
      const database=store?await store.migrate({timescale:config.timescale===true}):null;let kafka=null,institutions=null;
      if(store&&config.institutional_registry){const bytes=await readFile(config.institutional_registry);institutions=await store.importInstitutions(JSON.parse(gunzipSync(bytes,{maxOutputLength:100000000}).toString()))}
      if(config.mode==='kafka'){
        const k=config.kafka,brokers=k.brokers_env?(process.env[k.brokers_env]??'').split(',').filter(Boolean):k.brokers;
        kafka=await initializeTopics(kafkaClient({...k,brokers}),k);
      }
      const journal=await new Journal(join(directory,'wal'),config.journal).open();await journal.close();
      console.log(JSON.stringify({status:'installed',database,institutions,kafka_topics_created:kafka,
        adapters:['coinbase_ticker','rss','html','document_json','macro_json','chain_block','chain_part','status'],
        enabled_sources:config.sources.filter(s=>s.enabled!==false).map(s=>s.id),
        disabled_sources:config.sources.filter(s=>s.enabled===false).map(s=>s.id),continuous_process_running:false},null,2));
    }finally{await store?.close()}return;
  }
  if(command==='iniciar'){
    need(p.length<=2,'uso: entrada iniciar [CONFIG.json] [DIRECTORIO]');const config=await load(p[0]??defaultConfig);
    if(config.database_url_env&&config.role!=='collector')dbOptions(config,p[1]??'registros/input');
    const app=await startInput(config,{directory:p[1]??'registros/input'});
    console.log(JSON.stringify({status:'running',health:'http://'+(app.address.address==='::'?'[::]':app.address.address)+':'+app.address.port+'/health',mode:config.mode}));
    let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close()};process.once('SIGTERM',stop);process.once('SIGINT',stop);return;
  }
  if(command==='estado'){
    need(p.length<=1,'uso: entrada estado [DIRECTORIO]');console.log(JSON.stringify(await load(join(p[0]??'registros/input','health.json')),null,2));return;
  }
  if(command==='reproducir'){
    need(p.length===3,'uso: entrada reproducir CONFIG.json DIRECTORIO_WAL DIRECTORIO_SALIDA_NUEVO');
    await mkdir(p[2],{recursive:false});const config=await load(p[0]),journal=await new Journal(p[1]).open(),store=await Store.open({embeddedDirectory:join(p[2],'postgres')});
    try{await store.migrate();let records=0;for(const r of journal.records(journal.archivedThrough)){await store.process(r.raw);records++}
      const report={records,replay_start_sequence:journal.archivedThrough+1,expired_prefix_records:journal.archivedThrough,...await store.health(),asof_preserved:true,derived_nlp_replayed:false};await writeFile(join(p[2],'resultado.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
    }finally{await journal.close();await store.close()}return;
  }
  if(['exportar','verificar-xi','auditar'].includes(command)){
    need(p.length===(command==='verificar-xi'?5:4),'uso: entrada '+command+' CONFIG.json DIRECTORIO CORTE_UTC '+(command==='verificar-xi'?'BIN_XI DIRECTORIO_NUEVO':'SALIDA_NUEVA'));
    const config=await load(p[0]),store=await Store.open(dbOptions(config,p[1]));
    try{const events=await store.events({cutoff:p[2],limit:10000});
      if(command==='auditar'){
        const report=await store.audit({cutoff:p[2]});await writeFile(p[3],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
      }else if(command==='exportar'){
        const result=trainingFacts(events);await writeFile(p[3],result.jsonl,{flag:'wx'});console.log(JSON.stringify({exported:result.facts.length,scope:'latest_10000_events',excluded:result.excluded,training_executed:false},null,2));
      }else{
        const result=proveInputXI(p[3],events,{cutoff:p[2]});await mkdir(p[4],{recursive:false});
        for(let i=0;i<result.batches.length;i++)await writeFile(join(p[4],String(i+1).padStart(3,'0')+'.xi.gz'),gzipSync(result.batches[i].xi),{flag:'wx'});
        const report={...result,batches:result.batches.map(({xi,...b})=>b)};
        await writeFile(join(p[4],'resultado.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({records:result.observations.length,batches:result.batches.length,excluded:result.excluded,exact_roundtrip:result.exact_roundtrip,prediction_generated:false},null,2));
      }
    }finally{await store.close()}return;
  }
  throw Error('uso: node tools/laplace.mjs entrada instalar|iniciar|estado|reproducir|exportar|verificar-xi|auditar ...');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await runInput(process.argv.slice(2))}catch(error){console.error('Entrada Laplace: '+error.message);process.exitCode=1}
}
