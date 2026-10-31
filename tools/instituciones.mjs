#!/usr/bin/env node
/* Herramienta de captura/refinamiento, consulta temporal y prueba del XI original. */
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {hash,need} from '../pulso/registro.mjs';
import {collectInstitutionSources} from '../pulso/sec.mjs';
import {refineInstitutionRegistry,institutionalSnapshot,institutionalBatches,institutionalTrainingFacts} from '../pulso/instituciones.mjs';
import {compileGlobalEther,proveGlobalEther} from '../universo/ether-global.mjs';
import {stringifyJSONL} from '../historia/contrato.mjs';

const readJSON=path=>JSON.parse(path.endsWith('.gz')?gunzipSync(readFileSync(path),{maxOutputLength:100_000_000}).toString('utf8'):readFileSync(path,'utf8'));
const writeJSON=(path,data)=>writeFileSync(path,path.endsWith('.gz')?gzipSync(JSON.stringify(data)+'\n'):JSON.stringify(data,null,2)+'\n',{flag:'wx'});
export function readInstitutionCapture(path){
  const base=dirname(resolve(path)),manifest=readJSON(path);
  need(manifest.schema==='laplace-pulso-sec-capture-p001-v1','manifest SEC inválido');
  const cache=new Map();
  const raw=d=>{
    const target=resolve(base,d.file);need(target.startsWith(base+sep),'archivo de fuente fuera de captura');
    need(statSync(target).size<=40_000_000,'archivo comprimido excesivo');
    const bytes=cache.get(target)??gunzipSync(readFileSync(target),{maxOutputLength:40_000_000});
    need(hash(bytes.toString('utf8'))===d.body_sha256&&bytes.length===d.size_bytes,'fuente original alterada');
    cache.set(target,bytes);return {url:d.url,received_at:d.received_at,text:bytes.toString('utf8')};
  };
  return manifest.bundles.map(b=>({...b,submission:raw(b.submission),tickers:raw(b.tickers),
    subsidiaries:{...b.subsidiaries,document:raw(b.subsidiaries.document)},
    holdings:{...b.holdings,document:raw(b.holdings.document),cover:raw(b.holdings.cover)}}));
}
export function archiveInstitutionCapture(collection,directory){
  const dir=resolve(directory);mkdirSync(dir,{recursive:false});mkdirSync(resolve(dir,'raw'));
  const descriptors=new Map();
  const archive=raw=>{
    const body=Buffer.from(raw.text),digest=hash(raw.text),file='raw/'+digest+'.txt.gz';
    if(!descriptors.has(digest)){writeFileSync(resolve(dir,file),gzipSync(body),{flag:'wx'});descriptors.set(digest,true)}
    return {file,url:raw.url,received_at:raw.received_at,body_sha256:digest,size_bytes:body.length};
  };
  const bundles=collection.bundles.map(b=>({...b,submission:archive(b.submission),tickers:archive(b.tickers),
    subsidiaries:{...b.subsidiaries,document:archive(b.subsidiaries.document)},
    holdings:{...b.holdings,document:archive(b.holdings.document),cover:archive(b.holdings.cover)}}));
  // Keep discovery/index responses too, including successful downloads from incomplete bundles.
  const discovery=Object.fromEntries(Object.entries(collection.sources??{}).map(([k,r])=>[k,archive(r)]));
  const manifest={schema:'laplace-pulso-sec-capture-p001-v1',bundles,discovery,status:collection.status??[]};
  writeJSON(resolve(dir,'capture.json'),manifest);return resolve(dir,'capture.json');
}
export function writeInstitutionOutputs(bundles,directory,{previous=null}={}){
  const registry=refineInstitutionRegistry(bundles,{previous});
  const cutoff=registry.sources.map(s=>s.known_at).sort().at(-1),view=institutionalSnapshot(registry,{cutoff});
  mkdirSync(directory,{recursive:false});writeJSON(resolve(directory,'registry.json.gz'),registry);
  writeFileSync(resolve(directory,'entrenamiento.jsonl'),stringifyJSONL(institutionalTrainingFacts(registry,{cutoff})),{flag:'wx'});
  const summary={schema:'laplace-pulso-resumen-p001-v1',cutoff,registry_sha256:registry.registry_sha256,
    entities:registry.entities.length,relations:view.edges.length,reports:view.reports,
    existing_market_entities_refined:registry.entities.filter(e=>e.roles.includes('existing_market_instrument')&&e.source_ids.length).map(e=>e.id),
    catalogue_scope:'LaPlaceDIG/main at base commit; no other AI corpus was modified',
    source:'SEC official EX-21 and Form 13F; latest published reports at capture',
    predictive_training_run:false,complete_control_tree:false,prediction_inputs_enabled:false};
  writeJSON(resolve(directory,'resumen.json'),summary);return summary;
}
export async function runInstitutions(args){
  const [command,...p]=args;
  if(command==='actualizar'){
    need(p.length>=1&&p.length<=2,'uso: actualizar DIRECTORIO_NUEVO [REGISTRO_ANTERIOR.json.gz]');
    need(process.env.SEC_USER_AGENT,'configure SEC_USER_AGENT con identificación y contacto del operador');
    const collected=await collectInstitutionSources({userAgent:process.env.SEC_USER_AGENT});
    need(collected.bundles.length>0,'ninguna institución disponible: '+JSON.stringify(collected.status));
    const path=archiveInstitutionCapture(collected,p[0]);
    const result=writeInstitutionOutputs(readInstitutionCapture(path),resolve(p[0],'resultado'),{previous:p[1]?readJSON(p[1]):null});
    console.log(JSON.stringify({...result,collection_status:collected.status},null,2));return;
  }
  if(command==='importar'){
    need(p.length>=2&&p.length<=3,'uso: importar CAPTURE.json DIRECTORIO_NUEVO [REGISTRO_ANTERIOR.json.gz]');
    console.log(JSON.stringify(writeInstitutionOutputs(readInstitutionCapture(p[0]),p[1],{previous:p[2]?readJSON(p[2]):null}),null,2));return;
  }
  if(command==='consultar'){
    need(p.length===2,'uso: consultar REGISTRY.json.gz CORTE_UTC');
    console.log(JSON.stringify(institutionalSnapshot(readJSON(p[0]),{cutoff:p[1]}),null,2));return;
  }
  if(command==='verificar-xi'){
    need(p.length===4,'uso: verificar-xi REGISTRY.json.gz CORTE_UTC BIN_XI DIRECTORIO_NUEVO');
    const registry=readJSON(p[0]),{batches,observations}=institutionalBatches(registry,{cutoff:p[1]});
    need(batches.length>0,'sin relaciones conocidas al corte');mkdirSync(p[3],{recursive:false});
    const proofs=[];
    for(let i=0;i<batches.length;i++){
      const name=String(i+1).padStart(3,'0'),compiled=compileGlobalEther(batches[i]);
      writeFileSync(resolve(p[3],name+'.xi.gz'),gzipSync(compiled.xi),{flag:'wx'});
      writeJSON(resolve(p[3],name+'.snapshot.json.gz'),batches[i]);
      proofs.push(proveGlobalEther(p[2],batches[i]));
    }
    const result={relations:observations.length,batches:proofs.length,exact_roundtrip:proofs.every(p=>p.exact_roundtrip),
      full_text_graph_in_host_registry:true,native_payload:'numeric_relation_states_and_hashed_dictionary_keys',
      runtime_binary_sha256:hash(readFileSync(p[2])),proofs};
    writeJSON(resolve(p[3],'resultado.json'),result);console.log(JSON.stringify(result,null,2));return;
  }
  throw Error('uso: node tools/laplace.mjs instituciones actualizar|importar|consultar|verificar-xi ...');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await runInstitutions(process.argv.slice(2))}catch(error){console.error('Pulso Mundial: '+error.message);process.exitCode=1}
}
