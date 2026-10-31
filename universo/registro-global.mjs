import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {observeGlobalUniverse} from './global.mjs';
import {EXPECTED_SIGNAL_BUDGET} from './catalogo-global.mjs';

const args=process.argv.slice(2);
const at=args.indexOf('--directorio');
const directory=at>=0?resolve(args[at+1]??''):resolve('universo-registro');
if(!directory)throw Error('Directorio global requerido');
mkdirSync(directory,{recursive:true});
const capture=await observeGlobalUniverse();
const nominal=Object.values(EXPECTED_SIGNAL_BUDGET).reduce((a,b)=>a+b,0);
const missingGroups=capture.coverage.groups.filter(g=>g.signals===0).map(g=>g.group);
const summary={
  schema:'laplace-u002-global-summary-v1',
  at:capture.at,
  known_signals:capture.coverage.known_signals,
  nominal_signals:nominal,
  unfilled_nominal_slots:Math.max(0,nominal-capture.coverage.known_signals),
  missing_groups:missingGroups,
  domains:capture.coverage.domains,
  observed_sources:capture.coverage.observed_sources,
  failed_sources:capture.coverage.failed_sources,
  snapshot_sha256:capture.universal_state.snapshot_sha256,
  capture_sha256:capture.capture_sha256,
  prediction_inputs_enabled:capture.prediction_inputs_enabled,
  automatic_trading:capture.automatic_trading
};
writeFileSync(directory+'/global-latest.json',JSON.stringify(capture,null,2)+'\n');
writeFileSync(directory+'/global-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
// Persistir el diagnóstico antes de fallar: una fuente caída no borra la evidencia.
if(capture.coverage.failed_sources||missingGroups.length||!capture.universal_state.known_states)
  throw Error('Captura U002 con fuentes o dominios ausentes; consultar global-summary.json');
