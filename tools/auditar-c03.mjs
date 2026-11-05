#!/usr/bin/env node
/* Auditoría explícita de archivos originales. No descarga ni programa tareas. */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {descubrirManifiestosEF002,leerArchivoEF002} from '../estado-financiero/captura.mjs';
import {ejecutarConjuntoC03} from '../prediccion/conjunta-c03.mjs';
const [archive,output,labelFile]=process.argv.slice(2);
if(!archive||!output)throw Error('Uso: node tools/auditar-c03.mjs ARCHIVO_EF002 SALIDA.json [BTC-USD-300.json.gz.b64]');
const paths=await descubrirManifiestosEF002(archive),captures=[];
for(const path of paths)captures.push((await leerArchivoEF002(path)).capture);
captures.sort((a,b)=>a.at.localeCompare(b.at));
const asOf=new Date().toISOString(),targetCandles=labelFile?{granularity:300,
  rows:JSON.parse(gunzipSync(Buffer.from(readFileSync(labelFile,'utf8').trim(),'base64')).toString()).rows}:null;
const horizons=[];
for(const minutes of [5,15,30,60,120,360,1440,2880,10080,20160]){
  const r=ejecutarConjuntoC03(captures,{asOf,horizonHours:minutes/60,targetCandles});
  horizons.push({minutes,status:r.status,reason:r.reason,counts:r.counts??null,model_ready:r.model_ready,
    source_series:r.source_series,components:r.components,label_kind:r.label_kind??null,
    model_sha256:r.model_sha256??null,holdout:r.holdout??null});
}
const report={schema:'laplace-c03-real-archive-audit-v1',as_of:asOf,
  model_source_sha256:createHash('sha256').update(readFileSync(new URL('../prediccion/conjunta-c03.mjs',import.meta.url))).digest('hex'),
  archive_count:captures.length,first_capture:captures[0]?.at,latest_capture:captures.at(-1)?.at,
  latest_capture_sha256:captures.at(-1)?.capture_sha256,
  verified_real_archives_only:true,synthetic_data_used:false,
  label_file:labelFile??null,horizons,automatic_trading:false};
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({archive_count:report.archive_count,latest_capture:report.latest_capture,
  horizons:horizons.map(({minutes,reason,counts})=>({minutes,reason,counts}))}));
