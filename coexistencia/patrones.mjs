/* Append-only audit archive, derived pattern views and delayed outcomes.
 * Learned parameters stay in XI checkpoints. This journal is their evidence
 * archive; aggregate views and optional Ether projections are derived.
 */
import {readFileSync,statSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonicalLedger,timestamp} from '../historia/contrato.mjs';
import {digest} from '../inteligencia/laplace.mjs';
import {marketObservation} from '../narrativa/modelo.mjs';
import {compareOutputs} from './modelo.mjs';
import {storeObject} from './estado-xi.mjs';

const SCHEMA='laplace-pattern-journal-v1',ZERO='0'.repeat(64);
export const MAX_EVENTS=2048,MAX_JOURNAL_BYTES=8*1024*1024;
const need=(ok,message)=>{if(!ok)throw new Error(message)};
function checkForecast(forecast){
  need(forecast?.schema==='laplace-dual-forecast-v1','pronostico dual invalido');
  const {forecast_sha256,...body}=forecast;
  need(digest(JSON.stringify(body))===forecast_sha256,'hash de pronostico alterado');
  need(digest(JSON.stringify(forecast.pattern.definition))===forecast.pattern.id,'identidad de patron alterada');
  need(JSON.stringify(forecast.objective)===JSON.stringify(forecast.pattern.definition.objective),
    'objetivo del patron no coincide');
  const cutoff=timestamp(forecast.cutoff),due=timestamp(forecast.due_at);
  need(Date.parse(due)-Date.parse(cutoff)===forecast.objective.horizon_hours*3600000,'horizonte incoherente');
  const {deterministic:exact,probabilistic:prob}=forecast.results;
  need(exact.value===null||exact.value===0||exact.value===1,'resultado determinista invalido');
  need(prob.probability===null||(Number.isFinite(prob.probability)&&prob.probability>0&&prob.probability<1),
    'resultado probabilistico invalido');
  need((prob.probability===null&&prob.reference_probability===null)||
    (Number.isFinite(prob.reference_probability)&&prob.reference_probability>0&&prob.reference_probability<1),
    'referencia probabilistica invalida');
}
const queryId=forecast=>digest(JSON.stringify({model:forecast.model_sha256,cutoff:forecast.cutoff,
  state:forecast.narrative_state_sha256,objective:forecast.objective}));

export function validateJournal(events){
  need(Array.isArray(events)&&events.length<=MAX_EVENTS,'diario excede '+MAX_EVENTS+' eventos');
  let previous=ZERO;
  const forecasts=new Map(),settled=new Set(),analyses=new Set();
  for(let i=0;i<events.length;i++){
    const event=events[i],{event_sha256,...body}=event;
    need(event.schema===SCHEMA&&event.sequence===i+1&&event.previous_sha256===previous&&
      digest(JSON.stringify(body))===event_sha256,'cadena de eventos alterada en '+(i+1));
    timestamp(event.recorded_at,'recorded_at');
    if(event.type==='forecast'){
      checkForecast(event.forecast);
      need(event.forecast_id===queryId(event.forecast)&&!forecasts.has(event.forecast_id),
        'pronostico duplicado o identidad incoherente');
      need(event.pattern_id===event.forecast.pattern.id,'patron ajeno al pronostico');
      forecasts.set(event.forecast_id,event);
    }else if(event.type==='analysis'){
      const issued=forecasts.get(event.forecast_id),{analysis_sha256,...result}=event.analysis;
      need(issued&&event.pattern_id===issued.pattern_id,'analisis ajeno al pronostico/patron');
      need(digest(JSON.stringify(result))===analysis_sha256&&!analyses.has(event.forecast_id+'|'+analysis_sha256),
        'analisis alterado o duplicado');
      need(event.analysis.schema==='laplace-realities-v1'&&
        event.analysis.assumed_law_xi_sha256===issued.forecast.results.deterministic.model_xi_sha256&&
        JSON.stringify(event.analysis.objective)===JSON.stringify(issued.forecast.objective),
        'ley/objetivo del analisis no coincide');
      analyses.add(event.forecast_id+'|'+analysis_sha256);
    }else{
      need(event.type==='observation','tipo de evento desconocido');
      const issued=forecasts.get(event.forecast_id);
      need(issued&&!settled.has(event.forecast_id),'observacion huerfana o duplicada');
      need(event.pattern_id===issued.pattern_id,'observacion en otro patron');
      need(event.observed_at===issued.forecast.due_at&&timestamp(event.known_at)>=event.observed_at,
        'observacion anticipada o de otro horizonte');
      need(event.y===0||event.y===1,'etiqueta observada invalida');
      need(Array.isArray(event.price_ids)&&event.price_ids.length===2&&
        Array.isArray(event.source_urls)&&event.source_urls.length===2&&
        event.source_urls.every(url=>new URL(url).protocol==='https:'),'falta procedencia del resultado');
      settled.add(event.forecast_id);
    }
    previous=event_sha256;
  }
  return events;
}

export function readJournal(filename){
  let content;
  try{
    need(statSync(filename).size<=MAX_JOURNAL_BYTES,'diario excede 8 MiB');
    content=readFileSync(filename,'utf8');
  }catch(error){if(error.code==='ENOENT')return [];throw error}
  need(!content||content.endsWith('\n'),'diario incompleto: falta cierre de linea');
  return validateJournal(content.split('\n').filter(Boolean).map((line,index)=>{
    try{return JSON.parse(line)}catch{throw new Error('JSON de diario invalido en '+(index+1))}
  }));
}

function append(events,payload){
  need(events.length<MAX_EVENTS,'diario excede '+MAX_EVENTS+' eventos');
  const body={schema:SCHEMA,sequence:events.length+1,previous_sha256:events.at(-1)?.event_sha256??ZERO,
    recorded_at:new Date().toISOString(),...payload};
  const event={...body,event_sha256:digest(JSON.stringify(body))};events.push(event);return event;
}

function transaction(filename,operation){
  const path=resolve(filename);mkdirSync(dirname(path),{recursive:true});
  const lock=path+'.lock';
  let lockFd;
  try{lockFd=openSync(lock,'wx',0o600)}catch(error){
    if(error.code==='EEXIST')throw new Error('registro ocupado: '+lock);throw error;
  }
  let temporary=null;
  try{
    const events=readJournal(path),count=events.length;
    const result=operation(events);validateJournal(events);
    if(events.length!==count){
      const content=events.map(event=>JSON.stringify(event)).join('\n')+'\n';
      need(Buffer.byteLength(content)<=MAX_JOURNAL_BYTES,'diario excede 8 MiB');
      temporary=path+'.'+randomUUID()+'.tmp';
      const fd=openSync(temporary,'wx',0o600);
      try{writeFileSync(fd,content);fsyncSync(fd)}finally{closeSync(fd)}
      renameSync(temporary,path);temporary=null;
    }
    return result;
  }finally{
    if(temporary)try{unlinkSync(temporary)}catch{}
    closeSync(lockFd);unlinkSync(lock);
  }
}

export function registerForecast(filename,rawForecast){
  checkForecast(rawForecast);
  return transaction(filename,events=>{
    const id=queryId(rawForecast),existing=events.find(event=>event.type==='forecast'&&event.forecast_id===id);
    if(existing)return {status:'ya_registrado',event:existing};
    let forecast=rawForecast;
    const prior=new Map(events.filter(event=>event.type==='forecast').map(event=>[event.forecast_id,event]));
    const refutation=events.find(event=>{
      if(event.type!=='observation'||event.known_at>forecast.cutoff||event.pattern_id!==forecast.pattern.id)return false;
      const old=prior.get(event.forecast_id)?.forecast.results.deterministic;
      return old&&(old.value===0||old.value===1)&&old.model_xi_sha256===forecast.results.deterministic.model_xi_sha256&&old.value!==event.y;
    });
    if(refutation&&forecast.results.deterministic.value!==null){
      const exact={...forecast.results.deterministic,status:'ley_refutada_en_patron',
        calculated_value:forecast.results.deterministic.value,value:null,refutation_event:refutation.event_sha256};
      const {forecast_sha256,...body}=forecast;
      body.results={...forecast.results,deterministic:exact};
      body.comparison=compareOutputs(exact,forecast.results.probabilistic);
      forecast={...body,forecast_sha256:digest(JSON.stringify(body))};
    }
    return {status:'registrado',event:append(events,{type:'forecast',forecast_id:id,pattern_id:forecast.pattern.id,forecast})};
  });
}

export function reconcileJournal(filename,rawRecords,cutoff){
  const records=canonicalLedger([...rawRecords]),when=timestamp(cutoff,'observation cutoff');
  return transaction(filename,events=>{
    const observed=new Set(events.filter(event=>event.type==='observation').map(event=>event.forecast_id));
    const issued=events.filter(event=>event.type==='forecast');
    const appended=[];
    for(const event of issued){
      const f=event.forecast;
      if(observed.has(event.forecast_id)||f.due_at>when)continue;
      const found=marketObservation(records,f.objective,f.cutoff,when);
      if(!found)continue;
      const urls=found.price_ids.map(id=>records.find(record=>record.id===id).source_url);
      appended.push(append(events,{type:'observation',forecast_id:event.forecast_id,pattern_id:event.pattern_id,
        observed_at:f.due_at,known_at:found.target_known_at,y:found.y,
        net_return_bps:found.net_return_bps,price_ids:found.price_ids,source_urls:urls}));
    }
    return {status:'contrastado',observations_added:appended.length,events:appended};
  });
}

export function registerRealities(filename,forecastId,analysis){
  return transaction(filename,events=>{
    const issued=events.find(event=>event.type==='forecast'&&event.forecast_id===forecastId);
    need(issued,'registrar primero el pronostico dual');
    const existing=events.find(event=>event.type==='analysis'&&event.forecast_id===forecastId&&
      event.analysis.analysis_sha256===analysis.analysis_sha256);
    if(existing)return {status:'ya_registrado',event:existing};
    return {status:'analisis_registrado',event:append(events,{type:'analysis',forecast_id:forecastId,
      pattern_id:issued.pattern_id,analysis})};
  });
}

export function patternResults(events){
  validateJournal(events);
  const observations=new Map(events.filter(event=>event.type==='observation').map(event=>[event.forecast_id,event]));
  const analyses=new Map();
  for(const event of events)if(event.type==='analysis'){
    if(!analyses.has(event.forecast_id))analyses.set(event.forecast_id,[]);
    analyses.get(event.forecast_id).push(event.analysis);
  }
  const groups=new Map();
  for(const event of events){
    if(event.type!=='forecast')continue;
    const f=event.forecast;
    if(!groups.has(event.pattern_id))groups.set(event.pattern_id,{pattern_id:event.pattern_id,
      definition:f.pattern.definition,forecasts:[],metrics:{issued:0,paired_outputs:0,observed:0,
        deterministic_evaluated:0,deterministic_hits:0,deterministic_refutations:0,
        probabilistic_evaluated:0,brier_sum:0,different_directions:0,simulation_runs:0,max_simulated_active_qubits:0}});
    const group=groups.get(event.pattern_id),m=group.metrics,actual=observations.get(event.forecast_id);
    const exact=f.results.deterministic.value,p=f.results.probabilistic.probability;
    m.issued++;if(f.comparison.two_results)m.paired_outputs++;
    if(f.comparison.different_directions)m.different_directions++;
    if(actual){
      m.observed++;
      if(exact!==null){m.deterministic_evaluated++;if(exact===actual.y)m.deterministic_hits++;else m.deterministic_refutations++}
      if(p!==null){m.probabilistic_evaluated++;m.brier_sum+=(p-actual.y)**2}
    }
    const runs=analyses.get(event.forecast_id)??[];
    m.simulation_runs+=runs.length;
    for(const run of runs)m.max_simulated_active_qubits=Math.max(m.max_simulated_active_qubits,run.native.active_qubits);
    group.forecasts.push({forecast_id:event.forecast_id,cutoff:f.cutoff,due_at:f.due_at,
      model_sha256:f.model_sha256,results:f.results,comparison:f.comparison,
      observed:actual?{y:actual.y,known_at:actual.known_at,price_ids:actual.price_ids}:null,analyses:runs});
  }
  const patterns=[...groups.values()].sort((a,b)=>a.pattern_id.localeCompare(b.pattern_id));
  for(const group of patterns){
    const m=group.metrics;
    m.pending=m.issued-m.observed;
    m.deterministic_accuracy=m.deterministic_evaluated?m.deterministic_hits/m.deterministic_evaluated:null;
    m.brier=m.probabilistic_evaluated?m.brier_sum/m.probabilistic_evaluated:null;
    m.deterministic_coverage=m.observed?m.deterministic_evaluated/m.observed:null;
    m.probabilistic_coverage=m.observed?m.probabilistic_evaluated/m.observed:null;
  }
  return {schema:'laplace-pattern-results-v1',events:events.length,
    journal_tip_sha256:events.at(-1)?.event_sha256??ZERO,patterns};
}

export function provePattern(binary,events,patternId){
  const registry=patternResults(events),pattern=registry.patterns.find(item=>item.pattern_id===patternId);
  need(pattern,'patron no encontrado');
  // Keep both numerical results and outcomes, plus the hash of the complete
  // archive. Verbose explanations stay in the journal rather than being
  // duplicated for each occurrence inside this bounded native projection.
  const projection={journal_tip_sha256:registry.journal_tip_sha256,pattern_id:patternId,
    definition:pattern.definition,metrics:pattern.metrics,
    results:pattern.forecasts.map(row=>({forecast_id:row.forecast_id,cutoff:row.cutoff,
      model_sha256:row.model_sha256,
      deterministic:{status:row.results.deterministic.status,value:row.results.deterministic.value},
      probabilistic:{status:row.results.probabilistic.status,probability:row.results.probabilistic.probability},
      observed:row.observed,analyses:row.analyses.map(run=>({analysis_sha256:run.analysis_sha256,
        scenario_count:run.scenario_count,positive_mass:run.positive_mass,negative_mass:run.negative_mass,
        positive_probability:run.positive_probability,native:run.native}))}))};
  const stored=storeObject(binary,projection);
  return {status:'PATRON_XI_VERIFICADO',pattern_id:patternId,
    projection:'dos_resultados_y_observaciones_con_hash_del_archivo_completo',...stored};
}
