/* LAPLACE Android 2.0 — integra el archivo mundial EF002 VERIFICADO.
 * Conserva datos reales, su procedencia, conocimiento temporal y fuente.
 * No convierte una captura transversal en entrenamiento de futuro.
 */
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyUniverseSnapshot} from '../../universo/estados.mjs';
import {verificarSelloCaptura} from '../../universo/integridad.mjs';
import {resumirFuentesEF002} from '../../estado-financiero/resumen-fuentes.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const scriptDir=dirname(fileURLToPath(import.meta.url));
const source=resolve(process.argv[2]??'world_archive/capturas');
function manifests(root){
  const pending=[root],files=[];
  while(pending.length){
    const d=pending.pop();
    for(const x of readdirSync(d,{withFileTypes:true})){
      if(x.isDirectory())pending.push(join(d,x.name));
      else if(x.isFile()&&x.name.endsWith('.manifest.json'))
        files.push(join(d,x.name));
    }
  }
  return files.sort();
}
function load(file){
  const manifest=JSON.parse(readFileSync(file,'utf8'));
  const zipped=readFileSync(file.replace('.manifest.json','.json.gz'));
  if(sha(zipped)!==manifest.archive_sha256)throw Error('Archivo EF002 alterado: '+file);
  const raw=gunzipSync(zipped,{maxOutputLength:64*1024*1024});
  if(raw.length!==manifest.original_bytes)throw Error('Tamaño descomprimido inválido');
  const capture=JSON.parse(raw.toString('utf8'));
  verificarSelloCaptura(capture);
  verifyUniverseSnapshot(capture.universal_state);
  if(capture.capture_sha256!==manifest.capture_sha256||
     capture.universal_state.snapshot_sha256!==manifest.snapshot_sha256)
    throw Error('Hashes U001/U003 incorrectos');
  if(capture.universal_state.known_states!==manifest.states_observed)
    throw Error('Estados no coinciden con manifiesto');
  return {capture,manifest};
}
const files=manifests(source);
if(!files.length)throw Error('EF002: ninguna captura pública real');
// Se verifican TODOS los manifiestos, no sólo las últimas ocho capturas.
 // Memoria acotada: sólo se conservan las dos capturas completas más recientes.
let latest=null,previousLatest=null;
const history=[];
for(const file of files){
  const entry=load(file);
  previousLatest=latest;
  latest=entry;
  history.push({captured_at:entry.manifest.captured_at,
    states:entry.manifest.states_observed,sources:entry.manifest.sources_observed,
    capture_sha256:entry.manifest.capture_sha256,
    snapshot_sha256:entry.manifest.snapshot_sha256,
    archive_sha256:entry.manifest.archive_sha256});
}
const snapshot=latest.capture.universal_state;
const states=snapshot.states.map(x=>({
  id:x.id,domain:x.domain,variable:x.variable,unit:x.unit,
  value:x.value,known_at:x.known_at,observed_at:x.observed_at,
  source_url:x.source_url
}));
const previous=previousLatest?.capture.universal_state??null;
const before=new Map((previous?.states??[]).map(x=>[x.id,x]));
const observedChanges=[];
for(const state of states){
  const old=before.get(state.id);
  if(old&&old.domain===state.domain&&old.variable===state.variable&&
     old.unit===state.unit&&old.value!==state.value&&
     Date.parse(old.known_at)<=Date.parse(state.known_at)){
    observedChanges.push({
      id:state.id,domain:state.domain,variable:state.variable,
      unit:state.unit,from:old.value,to:state.value,
      old_known_at:old.known_at,new_known_at:state.known_at
    });
  }
}
const world={
  schema:'laplace-android-world-ef002-verified-v2',
  captured_at:latest.capture.at,states_count:states.length,
  states:states,
  domains:snapshot.domains.length,
  capture_sha256:latest.capture.capture_sha256,
  snapshot_sha256:snapshot.snapshot_sha256,
  source_count:latest.manifest.sources_observed,
  snapshots_verified:history.length,
  archive_manifests_count:files.length,
  history,history_index_complete:true,state_history_on_device:false,
  source_status:latest.capture.source_status??[],
  observed_changes_between_last_two:observedChanges,
  groups:(latest.capture.coverage?.groups??[]).map(g=>({
    group:String(g.group),signals:Number(g.signals??0),status:String(g.status)
  })).sort((a,b)=>b.signals-a.signals),
  source_summary:resumirFuentesEF002(latest.capture.source_status??[]).map(g=>({
    group:g.group,observed_sources:g.observed_sources,
    failed_sources:g.failed_sources,restricted_sources:g.restricted_sources,
    signal_count:g.signal_count
  })),
  coverage_complete:false,forecast_model_uses_world:false,
  original_m001_model_uses_world:false,ef004_requires_history:true,
  automatic_trading:false
};
// EF004 no puede declararse entrenado por ver 2/3 capturas.
// Sólo se publica un reporte verdaderamente asociado al tamaño del archivo.
const models=resolve(process.argv[3]??'model_archive/reportes');
const reports=[];
if(existsSync(models)){
  for(const name of readdirSync(models).filter(x=>/^status-.*\.json$/.test(x))){
    let report;
    try{report=JSON.parse(readFileSync(join(models,name),'utf8'));}catch{continue}
    if(report?.schema!=='laplace-demonio-financiero-ef004-v1'||
       report.verification!=='real_archives_only_not_synthetic'||
       report.archive_count!==files.length||
       !Number.isFinite(Date.parse(report.as_of))||
       Date.parse(report.as_of)<Date.parse(latest.capture.at)-10000)continue;
    if(report.status!=='abstained'&&report.status!=='experimental_model_frozen')continue;
    if(report.automatic_trading!==false||report.production_activation_allowed!==false)continue;
    reports.push({name,report});
  }
}
reports.sort((a,b)=>Date.parse(b.report.as_of)-Date.parse(a.report.as_of));
if(reports.length){
  const {name,report}=reports[0];
  world.ef004_report={schema:report.schema,status:report.status,
    reason:report.reason??null,model_ready:report.model_ready===true,
    captures_seen:report.captures_seen??null,
    contiguous_captures:report.contiguous_captures??null,
    required_training_pairs:report.required_training_pairs??null,
    required_validation_pairs:report.required_validation_pairs??null,
    required_holdout_pairs:report.required_holdout_pairs??null,
    observed_training_pairs:report.observed_training_pairs??null,
    observed_validation_pairs:report.observed_validation_pairs??null,
    observed_holdout_pairs:report.observed_holdout_pairs??null,
    as_of:report.as_of,source_branch:'laplace-modelos',report_name:name,
    verification:report.verification};
}else world.ef004_report=null;
// F002: cálculo conjunto verificado sobre exactamente ESTE archivo.
// No se toma un informe antiguo como si fuese una predicción vigente.
const f002Directory=resolve(process.argv[4]??'model_archive/informes-f002');
const f002Candidates=[];
if(existsSync(f002Directory)){
  for(const name of readdirSync(f002Directory).filter(x=>/^status-[a-f0-9]{64}-[a-f0-9]{12}\.json$/.test(x))){
    let report;
    try{report=JSON.parse(readFileSync(join(f002Directory,name),'utf8'));}catch{continue}
    if(report.schema!=='laplace-f002-joint-archive-v1'||
      report.verified_real_archives_only!==true||
      report.archive_manifests_verified!==files.length||
      !Array.isArray(report.supplemental_evidence_verified)||
      report.archive_count!==files.length+report.supplemental_evidence_verified.length||
      report.input_capture_sha256!==latest.capture.capture_sha256||
      report.production_activation_allowed!==false||
      report.automatic_trading!==false||
      report.central_f001_price_modified!==false||
      !/^[a-f0-9]{64}$/.test(report.model_source_sha256??'')||
      !['abstained','experimental_shadow_frozen'].includes(report.status))continue;
    f002Candidates.push({name,report});
  }
}
f002Candidates.sort((a,b)=>a.name.localeCompare(b.name));
if(f002Candidates.length){
  const {name,report}=f002Candidates.at(-1);
  // La APK muestra un diagnóstico, NO copia el motor del servidor ni
  // reetiqueta F001 como una predicción multifuente validada.
  world.f002_report={
    schema:report.schema,status:report.status,reason:report.reason??null,
    archive_count:report.archive_count,
    archive_manifests_verified:report.archive_manifests_verified,
    supplemental_evidence_verified:report.supplemental_evidence_verified.length,
    source_series:report.distinct_source_series,
    domains:report.observed_domains,
    matched_verified_outcomes:report.matched_outcomes,
    training_pairs:report.training?.observed_training_pairs??
      report.observed_training_pairs??0,
    validation_pairs:report.training?.observed_validation_pairs??
      report.observed_validation_pairs??0,
    holdout_pairs:report.training?.observed_holdout_pairs??
      report.observed_holdout_pairs??0,
    source_groups:report.source_groups??[],
    input_coverage:report.input_coverage??[],
    prospectively_validated:false,
    central_f001_price_modified:false,
    production_activation_allowed:false,automatic_trading:false,
    model_source_sha256:report.model_source_sha256,
    capture_sha256:latest.capture.capture_sha256,
    report_filename:name,source_branch:'laplace-modelos',
    experimental_price:report.status==='experimental_shadow_frozen'?
      report.forecast?.estimated_price_unrounded??null:null
  };
}else world.f002_report=null;
const output=join(scriptDir,'app/src/main/assets/world.js');
writeFileSync(output,'window.LAPLACE_WORLD = '+JSON.stringify(world)+';\n');
console.log(JSON.stringify({verified:true,states:states.length,domains:world.domains,
  groups:world.groups.length,archives:files.length,history:world.snapshots_verified,
  changes:observedChanges.length,f002:world.f002_report?.status??'no_report',
  ef004:world.ef004_report?.status??'no_report',
  sha:world.capture_sha256,size:readFileSync(output).length}));
