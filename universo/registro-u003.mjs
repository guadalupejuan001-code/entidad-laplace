import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {observeWorldU003} from './global-u003.mjs';
import {persistMacroCapture} from './vintages-macro.mjs';

const args=process.argv.slice(2),at=args.indexOf('--directorio');
const directory=at>=0?resolve(args[at+1]??''):resolve('universo-u003-registro');
if(!directory)throw Error('Directorio U003 requerido');
mkdirSync(directory,{recursive:true});
const capture=await observeWorldU003();
const macroJournal=persistMacroCapture(directory,capture);
const critical=['regional_markets','commodity_futures','policy_rates','employment_monthly',
  'employment_high_frequency','electricity','maritime','geo_news'];
const missing=critical.filter(name=>!capture.coverage.groups.some(g=>g.group===name&&g.signals>0));
const summary={
  schema:'laplace-u003-world-summary-v1',at:capture.at,
  base_signals:capture.coverage.base_signals,known_signals:capture.coverage.known_signals,
  added_signals:capture.coverage.added_signals,domains:capture.coverage.domains,
  observed_sources:capture.coverage.observed_sources,failed_sources:capture.coverage.failed_sources,
  optional_sources:capture.coverage.optional_sources,
  missing_critical_groups:missing,
  coverage_status:missing.length?'partial':capture.coverage.failed_sources?'partial_sources':'required_domains_observed',
  geo_news_topics_complete:capture.geo_news_coverage?.all_requested_topics_available??false,
  macro_journal:macroJournal,
  exact_vintage_group:capture.coverage.groups.find(x=>x.group==='macro_exact_vintages')??null,
  snapshot_sha256:capture.universal_state.snapshot_sha256,capture_sha256:capture.capture_sha256,
  prediction_inputs_enabled:capture.prediction_inputs_enabled,automatic_trading:capture.automatic_trading
};
writeFileSync(directory+'/u003-latest.json',JSON.stringify(capture,null,2)+'\n');
writeFileSync(directory+'/u003-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(!capture.coverage.base_signals||capture.coverage.known_signals<500||
   capture.coverage.added_signals<130||capture.coverage.domains<14||missing.length)
  throw Error('Captura U003 parcial; diagnóstico conservado en u003-summary.json: '+missing.join(','));
