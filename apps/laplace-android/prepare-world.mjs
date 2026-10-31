/* Empaqueta el resumen de la última captura EF002 REAL en la APK.
 * Verifica hashes U003, U001 y gzip antes de incluir el archivo.
 * No fabrica señales ni cambia los datos de procedencia.
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
function locate(root){
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
const paths=locate(source);
if(!paths.length)throw Error('EF002: No hay ninguna captura archivada');
const last=paths.at(-1),manifest=JSON.parse(readFileSync(last,'utf8'));
const zipped=readFileSync(last.replace('.manifest.json','.json.gz'));
if(sha(zipped)!==manifest.archive_sha256)throw Error('Archivo EF002 alterado');
const raw=gunzipSync(zipped,{maxOutputLength:32*1024*1024});
if(raw.length!==manifest.original_bytes)throw Error('Tamaño original distinto');
const capture=JSON.parse(raw.toString('utf8'));
verificarSelloCaptura(capture);
verifyUniverseSnapshot(capture.universal_state);
if(capture.capture_sha256!==manifest.capture_sha256||
   capture.universal_state.snapshot_sha256!==manifest.snapshot_sha256)
  throw Error('Los hashes U001/U003 no coinciden con el manifest');
const publicWorld={
  schema:'laplace-android-world-summary-v1',captured_at:capture.at,
  states:capture.universal_state.known_states,
  domains:capture.universal_state.domains.length,
  capture_sha256:capture.capture_sha256,
  snapshot_sha256:capture.universal_state.snapshot_sha256,
  groups:(capture.coverage?.groups??[]).map(g=>({
    group:String(g.group),signals:Number(g.signals??0),status:String(g.status)
  })).sort((a,b)=>b.signals-a.signals),
  full_world_observed:false,forecast_model_uses_world:false,
  automatic_trading:false
};
writeFileSync(join(scriptDir,'app/src/main/assets/world.js'),
  'window.LAPLACE_WORLD = '+JSON.stringify(publicWorld)+';\n');
console.log(JSON.stringify({verified:true,states:publicWorld.states,
  groups:publicWorld.groups.length,sha:publicWorld.capture_sha256,
  capture:publicWorld.captured_at}));
