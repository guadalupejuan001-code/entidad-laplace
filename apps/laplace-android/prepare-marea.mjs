#!/usr/bin/env node
/* El resultado M003 se calcula una vez al compilar, nunca a partir de las
 * cotizaciones del usuario ni fingiendo pronósticos de mercado en vivo.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {investigarMarea} from '../../experimentos/marea-m003.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=join(root,'evidencia/entrenamiento-x002-20261030/velas.json');
const target=join(dirname(fileURLToPath(import.meta.url)),
  'app/src/main/assets/marea.js');
const c=JSON.parse(readFileSync(source,'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
if(c.schema!=='laplace-x002-candles-v1'||hash(c.rows)!==c.rows_sha256||
   c.reference_availability!=='historical_candle_close_is_assumed_not_attested')
 throw Error('No se acepta historia M003 cuya procedencia o cierre sean dudosos');
const report=investigarMarea(c.rows,{cutoff:c.cutoff});
const compact={schema:'laplace-marea-m003-mobile-summary-v1',
  asset:'BTC-USD',captured_through:c.cutoff,
  source_rows_sha256:c.rows_sha256,
  source_received_at:c.received_at,history_bars:report.observed_candles,
  historical_close_known_by_assumption:true,
  prospective_validation:false,causality_proven:false,
  auto_trading:false,changes_f001_or_m001:false,
  study:report.experiments.map(exp=>({
    minutes:exp.horizon_minutes,status:exp.status,
    independent_horizon_outcomes:exp.analyzed_nonoverlapping_outcomes,
    baseline_mae_bps:exp.evaluation.persistence?.mae_bps??null,
    selected_mae_bps:exp.evaluation.selected?.mae_bps??null,
    inertia_mae_bps:exp.evaluation.inertia_only?.mae_bps??null,
    selected_feature_groups:exp.stability.selected_feature_groups,
    beats_persistence_folds:exp.stability.beat_persistence_folds,
    regimes:exp.folds.filter(f=>f.status==='retrospective_research_only').
      map(f=>f.regimes.map(r=>({regime:r.regime,n:r.examples,
        baseline_mae_bps:r.persistence?.mae_bps??null})))
  }))
};
writeFileSync(target,'window.LAPLACE_MAREA = '+JSON.stringify(compact)+';\n');
console.log(JSON.stringify({marea_integrated:true,
  bars:compact.history_bars,
  model_changes_price:false,periods:compact.study.length,
  path:target}));
