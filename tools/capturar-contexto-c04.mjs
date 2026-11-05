#!/usr/bin/env node
/* Consulta actual explícita; no programa ciclos ni convierte backtests en vivo. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {descubrirManifiestosEF002,leerArchivoEF002} from '../estado-financiero/captura.mjs';
import {crearMarcoMercadoC04,incorporarMarcosC04} from '../estado-financiero/contexto-mercado-c04.mjs';
import {capturarContextoMercadoC04} from '../universo/contexto-mercado-live.mjs';
const [archive,output]=process.argv.slice(2);
if(!archive||!output)throw Error('Uso: node tools/capturar-contexto-c04.mjs ARCHIVO_EF002 SALIDA');
const paths=await descubrirManifiestosEF002(archive),last=paths.sort().at(-1);
if(!last)throw Error('Falta una captura mundial base');
const {capture:base}=await leerArchivoEF002(last);
await mkdir(output,{recursive:true});
const frames=[],items=[];
for(const asset of ['BTC-USD','ETH-USD','SOL-USD']){
  const payload=await capturarContextoMercadoC04(asset);
  const frame=crearMarcoMercadoC04(payload,base,{asOf:new Date().toISOString()});
  frames.push(frame);const file=join(output,asset+'.json');
  await writeFile(file,JSON.stringify(frame,null,2)+'\n',{flag:'wx'});
  items.push({asset,frame_sha256:frame.frame_sha256,observations:frame.observations.length,
    sources:frame.sources,compact_bytes:Buffer.byteLength(JSON.stringify(frame)),file:asset+'.json'});
}
const expanded=incorporarMarcosC04([base],frames,{asOf:new Date().toISOString()});
const summary={schema:'laplace-c04-live-evidence-v1',as_of:new Date().toISOString(),
  base_capture_sha256:base.capture_sha256,base_captured_at:base.at,
  base_serialized_bytes:Buffer.byteLength(JSON.stringify(base)),
  frames_replayed:expanded.frames_materialized,unresolved:expanded.unresolved,items,
  source_data:'actual_current_public_Coinbase_responses',synthetic_data_used:false,
  predictions_evaluated:0,predictive_gain_demonstrated:false,automatic_trading:false};
await writeFile(join(output,'resumen-real.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
