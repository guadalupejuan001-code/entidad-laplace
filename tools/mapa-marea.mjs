#!/usr/bin/env node
/* M003: investigar dinámica de mercado usando OHLCV archivado auténtico.
 * El informe es un experimento retrospectivo, nunca una señal para operar.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {investigarMarea,MAREA_SCHEMA,MAREA_PLAN} from '../experimentos/marea-m003.mjs';
const repoCapture='evidencia/entrenamiento-x002-20261030/velas.json';
const [source=repoCapture,destination,...rest]=process.argv.slice(2);
if(source==='--help'||rest.length||!destination){
  console.log('Uso: node tools/mapa-marea.mjs [CAPTURA_X002.json] INFORME_M003.json');
  if(rest.length||!destination&&source!=='--help')process.exitCode=2;
}else{
  try{
    const original=JSON.parse(await readFile(resolve(source),'utf8'));
    const sha=s=>createHash('sha256').update(s).digest('hex');
    if(original.schema!=='laplace-x002-candles-v1'||
      original.reference_availability!=='historical_candle_close_is_assumed_not_attested'||
      !Array.isArray(original.rows)||sha(JSON.stringify(original.rows))!==original.rows_sha256)
      throw Error('Captura X002 alterada o disponibilidad histórica no documentada');
    if(!Array.isArray(original.sources)||original.sources.length<1||
      original.sources.some(s=>s.status!=='received'||!s.body_sha256||
        s.archive_ref===undefined))
      throw Error('La captura no tiene procedencia suficiente');
    const report=investigarMarea(original.rows,{cutoff:original.cutoff});
    const result={...report,
      source_capture_schema:original.schema,
      source_capture_file:source,
      source_capture_rows_sha256:original.rows_sha256,
      source_capture_received_at:original.received_at,
      source_provider_responses:original.sources.length,
      source_raw_responses_verified_by_m003:false,
      original_x002_reference_availability:original.reference_availability,
      experiment_not_fresh_prospective:true,
      generated_at:new Date().toISOString(),
      no_trading:true};
    if(result.schema!==MAREA_SCHEMA||result.experiments.some(e=>
      e.can_promote_to_price_engine!==false))throw Error('Integridad de M003 no satisfecha');
    const target=resolve(destination);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({schema:MAREA_SCHEMA,source,output:target,
      rows:report.observed_candles,gaps:report.gaps,
      horizons:report.experiments.map(x=>({
        minutes:x.horizon_minutes,status:x.status,
        test_samples:x.analyzed_nonoverlapping_outcomes,
        selected_mae_bps:x.evaluation.selected?.mae_bps,
        inertia_mae_bps:x.evaluation.inertia_only?.mae_bps,
        persistence_mae_bps:x.evaluation.persistence?.mae_bps,
        stability:x.stability})),
      causal_claim:false,automatic_trading:false}));
  }catch(error){
    console.error('MAREA M003: '+String(error.stack??error));
    process.exitCode=1;
  }
}
