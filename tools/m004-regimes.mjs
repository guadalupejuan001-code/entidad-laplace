#!/usr/bin/env node
/* M004 - entrenamiento retrospectivo a partir de OHLCV autenticadas por SHA.
 * La recepción 2026-10-30 no certifica los vintages intradía históricos.
 * No genera órdenes, no modifica el motor de precios original.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const M=require('../apps/laplace-android/app/src/main/assets/regime-m004.js');
const file=join(root,'evidencia/entrenamiento-x002-20261030/velas.json');
const output=resolve(process.argv[2]??'build/m004/report.json');
const c=JSON.parse(readFileSync(file,'utf8'));
const sha=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
if(c.schema!=='laplace-x002-candles-v1'||
   c.reference_availability!=='historical_candle_close_is_assumed_not_attested'||
   sha(c.rows)!==c.rows_sha256||c.rows.length!==7488)
  throw Error('X002 OHLCV no verificable: rechazar entrenamiento');
const horizons=[5,15,60].map(minutes=>M.evaluateRegimes(c.rows,{
  granularity:300,equity:false,horizonMinutes:minutes,cutoff:c.cutoff}));
const report={schema:'laplace-m004-real-archive-evidence-v1',
  source:{schema:c.schema,candles:c.rows.length,
    captured_at:c.received_at,cutoff_at:c.cutoff,rows_sha256:c.rows_sha256,
    provider:'Coinbase Exchange public OHLCV historical archive',
    authenticated_historical_vintages:false,
    historical_close_known_by_assumption:true},
  model_version:M.VERSION,model_schema:M.SCHEMA,
  horizons,generated_at:new Date().toISOString(),
  accuracy_is_retrospective_only:true,
  causality_proven:false,prospectively_validated:false,
  automatic_trading:false,production_activation_allowed:false,
  original_m001_f001_f002_xi_unchanged:true};
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const summary=report.horizons.map(x=>({
  minutes:x.horizon_minutes,status:x.status,
  holdout_cases:x.independent_test_cases,
  magnitude_model_mae_bps:x.aggregate.model_mae_bps,
  magnitude_baseline_mae_bps:x.aggregate.unconditional_mae_bps,
  relative_gain:x.aggregate.relative_gain,
  improving_folds:x.aggregate.folds_with_improvement
}));
console.log(JSON.stringify({output,source:c.rows_sha256,summary,
  production_activation_allowed:false,automatic_trading:false},null,2));
