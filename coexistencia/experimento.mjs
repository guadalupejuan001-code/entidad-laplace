/* E003: coexistence and pattern journal, in explicitly synthetic worlds. */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalLedger,stringifyJSONL} from '../historia/contrato.mjs';
import {syntheticNarrativeData} from '../narrativa/experimento.mjs';
import {trainDual,predictDual} from './modelo.mjs';
import {registerForecast,reconcileJournal,readJournal,patternResults,provePattern} from './patrones.mjs';

const need=(ok,message)=>{if(!ok)throw new Error(message)};
const decimal=value=>(value/100000000n)+'.'+(value%100000000n).toString().padStart(8,'0');
export function closedNarrativeData(){
  const data=syntheticNarrativeData();
  const prices=data.records.filter(row=>row.kind==='precio').sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
  let price=50000n*100000000n;
  const replaced=prices.map((row,day)=>{
    if(day>0){const context=(day-1)%4;price=[1,2].includes(context)?price*1008n/1000n:price*994n/1000n}
    return {...row,value:decimal(price)};
  });
  return {...data,records:canonicalLedger([...data.records.filter(row=>row.kind!=='precio'),...replaced])};
}

export function dualExperiment(binary,directory){
  const out=resolve(directory);mkdirSync(out,{recursive:true});
  const save=(name,value)=>writeFileSync(join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
  const closed=closedNarrativeData(),trained=trainDual(binary,closed.records,closed.config);
  need(trained.checkpoint&&trained.deterministic.status==='ley_identificada','no se identifico la ley cerrada');
  save('00_hechos_cerrados_sinteticos.jsonl',stringifyJSONL(closed.records));
  save('01_modelo_dual.json',trained.checkpoint);
  const checkpoint=JSON.parse(readFileSync(join(out,'01_modelo_dual.json'),'utf8'));
  const journal=join(out,'02_registro_patrones.jsonl');
  // The directory represents one run. Refuse an existing audit archive so a
  // repeated experiment cannot accidentally reuse already observed outcomes.
  need(readJournal(journal).length===0,'usar un directorio nuevo para el experimento dual');
  let paired=0;
  for(let t=Date.parse(closed.config.validation_end);t<Date.parse(closed.test_end);t+=86400000){
    const forecast=predictDual(binary,checkpoint,closed.records,new Date(t).toISOString());
    if(forecast.comparison.two_results)paired++;
    registerForecast(journal,forecast);
  }
  const before=readJournal(journal),lastForecast=before.at(-1).forecast.forecast_sha256;
  need(before.every(event=>event.type==='forecast'),'se observaron resultados antes de emitir pronosticos');
  const first=before[0];
  need(registerForecast(journal,first.forecast).status==='ya_registrado','registro no idempotente');
  const observed=reconcileJournal(journal,closed.records,closed.test_end);
  const after=readJournal(journal),registry=patternResults(after);
  need(after.find(event=>event.forecast_id===before.at(-1).forecast_id).forecast.forecast_sha256===lastForecast,
    'se reescribio un pronostico antiguo');
  const totals=registry.patterns.reduce((sum,pattern)=>({
    issued:sum.issued+pattern.metrics.issued,hits:sum.hits+pattern.metrics.deterministic_hits,
    observed:sum.observed+pattern.metrics.observed,probabilistic:sum.probabilistic+pattern.metrics.probabilistic_evaluated
  }),{issued:0,hits:0,observed:0,probabilistic:0});
  need(paired===64&&totals.hits===64&&observed.observations_added===64,'fallo del contraste de doble salida');
  need(registry.patterns.length===4,'se separaron fechas de un mismo patron');
  save('03_patrones_y_resultados.json',registry);
  const proof=provePattern(binary,after,registry.patterns[0].pattern_id);
  save('04_patron_en_ether.xi',proof.checkpoint.xi);
  const noisy=syntheticNarrativeData(),uncertain=trainDual(binary,noisy.records,noisy.config);
  const noisyForecast=predictDual(binary,uncertain.checkpoint,noisy.records,noisy.config.validation_end);
  need(uncertain.deterministic.status==='ley_refutada'&&noisyForecast.results.deterministic.value===null&&
    noisyForecast.results.probabilistic.probability!==null,'no coexistieron abstencion y probabilidad');
  save('05_control_con_ruido.json',noisyForecast);
  const summary={suite:'LAPLACE_E003_DOS_RESULTADOS_Y_PATRONES',synthetic:true,
    objective:trained.target,closed_world:{paired_forecasts:paired,observed:totals.observed,
      deterministic_hits:totals.hits,probabilistic_evaluated:totals.probabilistic,
      patterns:registry.patterns.length,events:after.length,
      pattern_metrics:registry.patterns.map(item=>({pattern_id:item.pattern_id,...item.metrics}))},
    exact_rules:trained.deterministic.rules,selected_features:trained.deterministic.selected_features,
    noisy_world:{deterministic_status:uncertain.deterministic.status,
      deterministic_value:noisyForecast.results.deterministic.value,
      probabilistic_status:noisyForecast.results.probabilistic.status,
      probability:noisyForecast.results.probabilistic.probability},
    shared_objective:true,no_averaging:true,original_forecasts_preserved:true,
    pattern_ether_proof:proof.native,financial_edge_demonstrated:false,orders_executed:0};
  save('resultado.json',summary);return summary;
}
