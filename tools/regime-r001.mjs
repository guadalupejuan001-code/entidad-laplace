#!/usr/bin/env node
/* Genera auditoría R001 en un archivo nuevo. No trading y sin precios futuros
 * emitidos: todas las etiquetas pertenecen al backtest retrospectivo.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {auditRegimeTransitions} from '../experimentos/regime-r001.mjs';
const [captureArg='evidencia/entrenamiento-x002-20261030/velas.json',
 outputArg='build/r001/transition-audit.json',...rest]=process.argv.slice(2);
const need=(x,m)=>{if(!x)throw Error(m)};
try{
 need(!rest.length,'Uso: node tools/regime-r001.mjs [CAPTURA.json] [SALIDA.json]');
 const input=JSON.parse(await readFile(resolve(captureArg),'utf8'));
 const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 need(input.schema==='laplace-x002-candles-v1'&&
  input.reference_availability==='historical_candle_close_is_assumed_not_attested'&&
  Array.isArray(input.rows)&&hash(input.rows)===input.rows_sha256,
  'El histórico X002 no cumple el sello o declara disponibilidad no verificada');
 need(Array.isArray(input.sources)&&input.sources.length>0&&
  input.sources.every(x=>x.status==='received'&&/^[a-f0-9]{64}$/.test(x.body_sha256??'')),
  'Faltan referencias autenticables de la captura original');
 const audit=auditRegimeTransitions(input.rows,{cutoff:input.cutoff});
 const result={...audit,
  source:{provider:'Coinbase Exchange',asset:'BTC-USD',cutoff:input.cutoff,
   received_at:input.received_at,rows_sha256:input.rows_sha256,
   original_provider_responses_rechecked_here:false,
   historical_close_vintage_attested:false,
   source_requests:input.sources.length},
  verification:'capture_rows_sha256_verified; individual_http_response_bodies_not_replayed',
  summary_not_prospective:true,generated_at:new Date().toISOString(),
  original_f001_f002_m003_m004_unchanged:true};
 need(result.folds.every(x=>x.production_activation_allowed===false)&&
  result.automatic_trading===false,'R001: contrato de investigación incumplido');
 const path=resolve(outputArg);
 await mkdir(dirname(path),{recursive:true});
 await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({path,schema:result.schema,
  observed_regimes:result.observations,
  total_transitions:result.valid_transition_pairs,
  chronological_holdout_transitions_not_independent:result.holdout_transition_pairs,
  folds:result.folds.map(f=>({status:f.status,
    brier_conditional:f.score?.conditional_brier??null,
    brier_unconditional:f.score?.unconditional_brier??null,
    brier_always_stay:f.score?.always_stay_brier??null,
    magnitude_conditional_mae_bps:f.magnitude_score?.conditional_mae_bps??null,
    magnitude_baseline_mae_bps:f.magnitude_score?.unconditional_mae_bps??null,
    magnitude_bootstrap_interval:f.magnitude_score?.bootstrap_interval??null})),
  existing_models_modified:false,automatic_trading:false}));
}catch(e){console.error('R001: '+String(e?.stack??e));process.exitCode=1}
