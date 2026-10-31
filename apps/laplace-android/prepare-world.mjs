/* LAPLACE Android 2.0 — integra el archivo mundial EF002 VERIFICADO.
 * Conserva datos reales, su procedencia, conocimiento temporal y fuente.
 * No convierte una captura transversal en entrenamiento de futuro.
 */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyUniverseSnapshot} from '../../universo/estados.mjs';
import {verificarSelloCaptura} from '../../universo/integridad.mjs';

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
const snapshots=files.slice(-8).map(load);
const latest=snapshots.at(-1),snapshot=latest.capture.universal_state;
const states=snapshot.states.map(x=>({
  id:x.id,domain:x.domain,variable:x.variable,unit:x.unit,
  value:x.value,known_at:x.known_at,observed_at:x.observed_at,
  source_url:x.source_url
}));
const previous=snapshots.length>=2?snapshots.at(-2).capture.universal_state:null;
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
const summary=latest.manifest.summary??{};
const world={
  schema:'laplace-android-world-ef002-verified-v2',
  captured_at:latest.capture.at,states_count:states.length,
  states:states,
  domains:snapshot.domains.length,
  capture_sha256:latest.capture.capture_sha256,
  snapshot_sha256:snapshot.snapshot_sha256,
  source_count:latest.manifest.sources_observed,
  snapshots_verified:snapshots.length,
  archive_manifests_count:files.length,
  history:snapshots.map(({manifest})=>({
    captured_at:manifest.captured_at,
    states:manifest.states_observed,sources:manifest.sources_observed,
    capture_sha256:manifest.capture_sha256
  })),
  observed_changes_between_last_two:observedChanges,
  groups:(latest.capture.coverage?.groups??[]).map(g=>({
    group:String(g.group),signals:Number(g.signals??0),status:String(g.status)
  })).sort((a,b)=>b.signals-a.signals),
  source_summary:(summary.source_summary??[]).map(g=>({
    group:g.group,observed_sources:g.observed_sources,
    failed_sources:g.failed_sources,restricted_sources:g.restricted_sources,
    signal_count:g.signal_count
  })),
  coverage_complete:false,forecast_model_uses_world:false,
  original_m001_model_uses_world:false,ef004_requires_history:true,
  automatic_trading:false
};
const output=join(scriptDir,'app/src/main/assets/world.js');
writeFileSync(output,'window.LAPLACE_WORLD = '+JSON.stringify(world)+';\n');
console.log(JSON.stringify({verified:true,states:states.length,domains:world.domains,
  groups:world.groups.length,archives:files.length,history:world.snapshots_verified,
  changes:observedChanges.length,sha:world.capture_sha256,size:readFileSync(output).length}));
