#!/usr/bin/env node
/* APK M004 incorpora un resumen DE LA PRUEBA RETROSPECTIVA real.
 * No se inyectan probabilidades futuras falsas ni se alteran motores.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
const require=createRequire(import.meta.url);
const M=require('./app/src/main/assets/regime-m004.js');
const folder=dirname(fileURLToPath(import.meta.url)),
  source=resolve(folder,'../../evidencia/entrenamiento-x002-20261030/velas.json');
const c=JSON.parse(readFileSync(source,'utf8'));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
if(c.schema!=='laplace-x002-candles-v1'||
   c.rows.length!==7488||digest(c.rows)!==c.rows_sha256||
   c.reference_availability!=='historical_candle_close_is_assumed_not_attested')
 throw Error('M004: no empaquetar datos históricos sin trazabilidad');
const horizons=[5,15,60].map(h=>M.evaluateRegimes(c.rows,
  {granularity:300,equity:false,horizonMinutes:h,cutoff:c.cutoff}));
const summary={schema:'laplace-m004-android-retrospective-v1',
  source:{asset:'BTC-USD',bars:c.rows.length,source:'Coinbase X002 archive',
    received_at:c.received_at,cutoff:c.cutoff,rows_sha256:c.rows_sha256,
    vintages_historically_authenticated:false},
  horizons:horizons.map(x=>({
    minutes:x.horizon_minutes,status:x.status,
    test_cases:x.independent_test_cases,
    oos_model_mae_bps:x.aggregate.model_mae_bps,
    oos_baseline_mae_bps:x.aggregate.unconditional_mae_bps,
    oos_gain:x.aggregate.relative_gain,
    improving_folds:x.aggregate.folds_with_improvement,
    selected_variants:x.folds.map(y=>y.selected??'abstained')
  })),
  experiments_are_retrospective:true,prospectively_validated:false,
  can_generate_production_price:false,causality_proven:false,
  automatic_trading:false};
const output=join(folder,'app/src/main/assets/m004-evidence.js');
writeFileSync(output,'window.LAPLACE_M004_EVIDENCE = '+JSON.stringify(summary)+';\n');
console.log(JSON.stringify({valid:true,source_rows:c.rows.length,
  scenarios:horizons.map(h=>({horizon:h.horizon_minutes,
    n:h.independent_test_cases,status:h.status,
    model_mae_bps:h.aggregate.model_mae_bps,
    baseline_mae_bps:h.aggregate.unconditional_mae_bps})),
  path:output,production:false}));
