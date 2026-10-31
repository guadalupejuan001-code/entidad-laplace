#!/usr/bin/env node
/* Diagnóstico EF004: read-only, convierte la última captura pública archivada
 * en lotes XI/Ether; requiere binario Mundo X original para prueba material.
 */
import {resolve} from 'node:path';
import {descubrirManifiestosEF002,leerArchivoEF002} from '../estado-financiero/captura.mjs';
import {prepararMemoriaNativaEF004,verificarMemoriaNativaEF004}
  from '../demonio/puente-xi-ef004.mjs';
const [root,binary,...extra]=process.argv.slice(2);
if(!root||extra.length){
  console.error('Uso: node tools/probar-demonio-xi.mjs ARCHIVOS_EF002 [MUNDO_X_QUANTUM]');
  process.exitCode=2;
}else{
  try{
    const manifests=await descubrirManifiestosEF002(resolve(root),{maxFiles:2500});
    if(!manifests.length)throw Error('Sin capturas históricas verificables');
    const summaries=[];
    for(const p of manifests){
      const row=await leerArchivoEF002(p);
      summaries.push({p,at:row.capture.at,capture:row.capture});
    }
    summaries.sort((a,b)=>a.at.localeCompare(b.at));
    const capture=summaries.at(-1).capture;
    const result=binary?verificarMemoriaNativaEF004(resolve(binary),capture):
      prepararMemoriaNativaEF004(capture);
    const {projection,...publicResult}=result;
    console.log(JSON.stringify({...publicResult,archives:manifests.length,
      no_financial_predictions_causal_claim:false,
      automatic_trading:false},null,2));
  }catch(e){console.error('EF004 XI/Ether: '+String(e.message));process.exitCode=1}
}
