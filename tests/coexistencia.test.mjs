import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digest} from '../inteligencia/laplace.mjs';
import {trainDual,predictDual,compareOutputs,restoreDual} from '../coexistencia/modelo.mjs';
import {closedNarrativeData} from '../coexistencia/experimento.mjs';
import {syntheticNarrativeData} from '../narrativa/experimento.mjs';
import {registerForecast,reconcileJournal,readJournal,patternResults,provePattern} from '../coexistencia/patrones.mjs';
import {restoreObject} from '../coexistencia/estado-xi.mjs';

const binary=process.env.MUNDO_X_QUANTUM;
const native={skip:binary?false:'requires original pinned Mundo X executable from CI'};
const closed=closedNarrativeData();
let learned;
const trained=()=>learned??=trainDual(binary,closed.records,closed.config);
function temporary(run){
  const directory=mkdtempSync(join(tmpdir(),'laplace-dual-'));
  try{return run(join(directory,'patrones.jsonl'),directory)}finally{rmSync(directory,{recursive:true,force:true})}
}
const objective={asset:'BTC-USD',currency:'USD',price_basis:'raw_close',horizon_hours:24,cost_bps:10,
  definition:'return_after_assumed_cost_positive'};
function forecast(day=1,value=1,p=0.2,law='law-1'){
  const cutoff=new Date(Date.UTC(2020,0,day)).toISOString();
  const definition={objective,extractor_sha256:digest('synthetic-extractor'),lookback_hours:24,
    atoms:['AID_BLOCKED','CONFLICT_ESCALATION'],sequences:[['CONFLICT_ESCALATION','AID_BLOCKED']]};
  const deterministic={status:'consecuencia_condicional',value,model_xi_sha256:digest(law)};
  const probabilistic={status:'probabilidad_narrativa',probability:p,reference_probability:0.5};
  const body={schema:'laplace-dual-forecast-v1',cutoff,
    due_at:new Date(Date.parse(cutoff)+86400000).toISOString(),objective,
    model_sha256:digest(law+'-model'),pattern:{id:digest(JSON.stringify(definition)),definition},
    narrative_state_sha256:digest('state-'+day),narrative_sources:[],
    results:{deterministic,probabilistic},comparison:compareOutputs(deterministic,probabilistic)};
  return {...body,forecast_sha256:digest(JSON.stringify(body))};
}
function prices(knownEnd='2020-01-03T00:00:00Z'){
  return [
    {id:'start',observed_at:'2020-01-01T00:00:00Z',known_at:'2020-01-01T00:00:00Z',value:'100'},
    {id:'end',observed_at:'2020-01-02T00:00:00Z',known_at:knownEnd,value:'99'}
  ].map(row=>({...row,kind:'precio',asset:'BTC-USD',currency:'USD',price_basis:'raw_close',
    source_url:'https://example.org/synthetic-dual-price/'+row.id}));
}

test('both outputs remain distinct when their preferred directions disagree',()=>{
  const value=forecast();
  assert.equal(value.comparison.two_results,true);
  assert.equal(value.comparison.different_directions,true);
  assert.equal(value.comparison.probability_assigned_to_calculated_result,0.2);
  assert.equal(value.comparison.combined_result,null);
  assert.equal(compareOutputs({value:1},{probability:0.5}).probability_favored_value,null);
});

test('the journal preserves two results, deduplicates requests and groups repeated dates by pattern',()=>temporary(path=>{
  const first=registerForecast(path,forecast());
  assert.equal(first.status,'registrado');
  const bytes=readFileSync(path,'utf8');
  assert.equal(registerForecast(path,forecast()).status,'ya_registrado');
  assert.equal(readFileSync(path,'utf8'),bytes);
  registerForecast(path,forecast(5));
  const registry=patternResults(readJournal(path));
  assert.equal(registry.patterns.length,1);
  assert.equal(registry.patterns[0].metrics.issued,2);
  assert.equal(registry.patterns[0].metrics.paired_outputs,2);
  assert.equal(registry.patterns[0].forecasts[0].results.deterministic.value,1);
  assert.equal(registry.patterns[0].forecasts[0].results.probabilistic.probability,0.2);
}));

test('outcomes wait for availability and never rewrite sealed forecasts',()=>temporary(path=>{
  const issued=registerForecast(path,forecast()).event;
  assert.equal(reconcileJournal(path,prices(),'2020-01-02T00:00:00Z').observations_added,0);
  assert.equal(reconcileJournal(path,[],'2020-01-04T00:00:00Z').observations_added,0);
  assert.equal(reconcileJournal(path,prices(),'2020-01-03T00:00:00Z').observations_added,1);
  assert.equal(reconcileJournal(path,prices(),'2020-01-04T00:00:00Z').observations_added,0);
  const events=readJournal(path);
  assert.deepEqual(events[0],issued);
  const group=patternResults(events).patterns[0];
  assert.equal(group.metrics.deterministic_refutations,1);
  assert.ok(Math.abs(group.metrics.brier-0.04)<1e-12);
  assert.equal(group.forecasts[0].observed.y,0);
}));

test('settlement depends on outcome prices, independently of narrative-window budgets',()=>temporary(path=>{
  registerForecast(path,forecast());
  const dense=Array.from({length:300},(_,i)=>({id:'dense-'+i,kind:'humanitaria',event_code:'TEXT_ONLY',
    summary:'Aid blocked '+i,region:'GLOBAL',observed_at:'2020-01-01T00:00:00Z',known_at:'2020-01-01T00:00:00Z',
    source_url:'https://example.org/synthetic-dense/'+i}));
  assert.equal(reconcileJournal(path,[...prices(),...dense],'2020-01-03T00:00:00Z').observations_added,1);
}));

test('a known refutation disables only that law/pattern, without using future observations',()=>temporary(path=>{
  registerForecast(path,forecast());
  reconcileJournal(path,prices(),'2020-01-03T00:00:00Z');
  const earlier=registerForecast(path,forecast(2)).event.forecast;
  assert.equal(earlier.results.deterministic.value,1); // label was not known yet
  const later=registerForecast(path,forecast(4)).event.forecast;
  assert.equal(later.results.deterministic.status,'ley_refutada_en_patron');
  assert.equal(later.results.deterministic.value,null);
  assert.equal(later.results.deterministic.calculated_value,1);
  assert.equal(later.results.probabilistic.probability,0.2);
  const other=registerForecast(path,forecast(5,1,0.2,'new-law')).event.forecast;
  assert.equal(other.results.deterministic.value,1);
}));

test('corrupt or incomplete archives fail without changing the existing file',()=>temporary(path=>{
  registerForecast(path,forecast());
  const original=readFileSync(path,'utf8');
  writeFileSync(path,original.replace('"probability":0.2','"probability":0.8'));
  assert.throws(()=>readJournal(path),/cadena/);
  const corrupt=readFileSync(path,'utf8');
  assert.throws(()=>registerForecast(path,forecast(2)),/cadena/);
  assert.equal(readFileSync(path,'utf8'),corrupt);
  assert.equal(existsSync(path+'.lock'),false);
  writeFileSync(path,original.trimEnd());
  assert.throws(()=>readJournal(path),/incompleto/);
}));

test('a competing writer lock is respected and never removed by another writer',()=>temporary(path=>{
  writeFileSync(path+'.lock','another writer');
  assert.throws(()=>registerForecast(path,forecast()),/ocupado/);
  assert.equal(readFileSync(path+'.lock','utf8'),'another writer');
  assert.equal(existsSync(path),false);
}));

test('forecast integrity and shared objective are validated before registration',()=>temporary(path=>{
  const value=forecast();
  assert.throws(()=>registerForecast(path,{...value,due_at:value.cutoff}),/hash/);
  assert.equal(existsSync(path),false);
}));

test('both native-backed routes predict the same held-out objective in a consistent closed world',native,()=>{
  const result=trained();
  assert.equal(result.deterministic.status,'ley_identificada');
  assert.equal(result.deterministic.selected_features.length,2);
  assert.equal(result.deterministic.samples,192);
  assert.equal(result.deterministic.representatives,4);
  const restored=restoreDual(binary,JSON.parse(JSON.stringify(result.checkpoint)));
  assert.equal(restored.context.objective.asset,'BTC-USD');
  const outcomes=[0,1,1,0];
  for(let day=0;day<4;day++){
    const when=new Date(Date.parse(closed.config.validation_end)+day*86400000).toISOString();
    const output=predictDual(binary,result.checkpoint,closed.records,when);
    assert.equal(output.comparison.two_results,true);
    assert.equal(output.results.deterministic.value,outcomes[day]);
    assert.equal(output.results.probabilistic.probability>0.5,outcomes[day]===1);
    assert.equal(output.objective.definition,'return_after_assumed_cost_positive');
  }
});

test('contradictory outcomes survive compression and leave the probabilistic route available',native,()=>{
  const noisy=syntheticNarrativeData(),result=trainDual(binary,noisy.records,noisy.config);
  assert.equal(result.deterministic.status,'ley_refutada');
  assert.equal(result.deterministic.representatives,8);
  const output=predictDual(binary,result.checkpoint,noisy.records,noisy.config.validation_end);
  assert.equal(output.results.deterministic.value,null);
  assert.equal(typeof output.results.probabilistic.probability,'number');
  assert.equal(output.comparison.two_results,false);
});

test('an identified law remains available when there is insufficient probabilistic supervision',native,()=>{
  const start=closed.config.start_at,trainEnd=new Date(Date.parse(start)+2*86400000).toISOString();
  const validationEnd=new Date(Date.parse(start)+3*86400000).toISOString();
  const short=trainDual(binary,closed.records,{...closed.config,train_end:trainEnd,validation_end:validationEnd});
  assert.equal(short.deterministic.status,'ley_identificada');
  assert.equal(short.probabilistic.status,'evidencia_insuficiente');
  const output=predictDual(binary,short.checkpoint,closed.records,validationEnd);
  assert.equal(output.results.deterministic.value,0);
  assert.equal(output.results.probabilistic.probability,null);
  temporary(path=>assert.equal(registerForecast(path,output).status,'registrado'));
});

test('unseen feature domains abstain, and prices/economics/future labels do not enter frozen outputs',native,()=>{
  const checkpoint=trained().checkpoint,cutoff=closed.config.validation_end;
  const original=predictDual(binary,checkpoint,closed.records,cutoff);
  const changed=closed.records.map(row=>row.kind==='precio'?{...row,value:'1'}:row);
  changed.push({id:'ignored-economy',kind:'economia',series_id:'IGNORED',unit:'index',value:'999999',
    observed_at:cutoff,known_at:cutoff,source_url:'https://example.org/synthetic-ignored-economy'});
  assert.equal(predictDual(binary,checkpoint,changed,cutoff).forecast_sha256,original.forecast_sha256);
  const onlyNarrative=closed.records.filter(row=>['geopolitica','humanitaria'].includes(row.kind));
  assert.equal(predictDual(binary,checkpoint,onlyNarrative,cutoff).forecast_sha256,original.forecast_sha256);
  const unfamiliar=[{id:'unseen',kind:'humanitaria',event_code:'TEXT_ONLY',summary:'Famine reported.',
    region:'GLOBAL',observed_at:cutoff,known_at:cutoff,source_url:'https://example.org/synthetic-unseen'}];
  const outside=predictDual(binary,checkpoint,unfamiliar,cutoff);
  assert.equal(outside.results.deterministic.status,'abstencion_fuera_del_dominio');
  assert.equal(outside.results.deterministic.value,null);
  assert.throws(()=>predictDual(binary,checkpoint,closed.records,closed.config.train_end),/posterior/);
  const future=closed.records.map(row=>row.kind==='precio'&&row.observed_at>cutoff?{...row,value:'2'}:row);
  assert.equal(trainDual(binary,future,closed.config).checkpoint.sha256,checkpoint.sha256);
});

test('pattern projection conserves both outputs and observations in the original Ether memory',native,()=>temporary(path=>{
  registerForecast(path,forecast());
  reconcileJournal(path,prices(),'2020-01-03T00:00:00Z');
  const events=readJournal(path),id=patternResults(events).patterns[0].pattern_id;
  const proof=provePattern(binary,events,id),value=restoreObject(binary,proof.checkpoint).value;
  assert.equal(proof.native.exact_roundtrip,true);
  assert.equal(value.results[0].deterministic.value,1);
  assert.equal(value.results[0].probabilistic.probability,0.2);
  assert.equal(value.results[0].observed.y,0);
  assert.equal(value.journal_tip_sha256,events.at(-1).event_sha256);
}));

test('dual CLI trains, registers, reconciles and groups results across processes',native,()=>temporary((path,directory)=>{
  const tool=fileURLToPath(new URL('../tools/laplace.mjs',import.meta.url));
  const cli=(...args)=>spawnSync(process.execPath,[tool,...args],{encoding:'utf8',timeout:60000});
  const data=join(directory,'hechos.jsonl'),config=join(directory,'config.json'),model=join(directory,'dual.json');
  writeFileSync(data,closed.records.map(row=>JSON.stringify(row)).join('\n'));
  writeFileSync(config,JSON.stringify(closed.config));
  const fit=cli('entrenar-dual',data,config,resolve(binary),model);
  assert.equal(fit.status,0,fit.stderr);
  const predict=cli('pronostico-dual',model,data,closed.config.validation_end,resolve(binary),path);
  assert.equal(predict.status,0,predict.stderr);
  assert.equal(JSON.parse(predict.stdout).event.forecast.comparison.two_results,true);
  const observed=cli('contrastar-dual',path,data,closed.test_end);
  assert.equal(observed.status,0,observed.stderr);
  assert.equal(JSON.parse(observed.stdout).observations_added,1);
  const grouped=cli('patrones',path);
  assert.equal(grouped.status,0,grouped.stderr);
  assert.equal(JSON.parse(grouped.stdout).patterns[0].metrics.observed,1);
}));
