import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digest} from '../inteligencia/laplace.mjs';
import {closedNarrativeData} from '../coexistencia/experimento.mjs';
import {trainDual,predictDual} from '../coexistencia/modelo.mjs';
import {simulateRealities} from '../coexistencia/realidades.mjs';
import {registerForecast,registerRealities,readJournal,patternResults} from '../coexistencia/patrones.mjs';

const binary=process.env.MUNDO_X_QUANTUM,native={skip:binary?false:'requires original pinned Mundo X executable from CI'};
const data=closedNarrativeData();
let model;
const checkpoint=()=>model??=trainDual(binary,data.records,data.config).checkpoint;
const scenarios=[{id:'positive',input:'00',weight:9},{id:'negative',input:'10',weight:1},
  {id:'uncertain',input:'??',weight:1}];
function temporary(run){
  const directory=mkdtempSync(join(tmpdir(),'laplace-realities-'));
  try{return run(directory)}finally{rmSync(directory,{recursive:true,force:true})}
}

test('native weighted mass differs from unweighted counting, and uncertain counts are expectations',native,()=>{
  const {analysis}=simulateRealities(binary,checkpoint(),scenarios);
  assert.equal(analysis.known_positive_scenarios,1);
  assert.equal(analysis.known_negative_scenarios,1);
  assert.equal(analysis.uncertain_scenarios,1);
  assert.equal(analysis.expected_positive_count,1.5);
  assert.equal(analysis.positive_mass,9.5);assert.equal(analysis.negative_mass,1.5);
  assert.equal(analysis.positive_probability,9.5/11);
  assert.equal(analysis.random_samples_drawn,0);
  assert.equal(analysis.positive_probability+analysis.negative_probability,1);
});

test('512 small native circuits run with more than 1000 actual active qubits without enumerating a statevector',native,()=>{
  const inputs=Array.from({length:512},(_,i)=>({id:'s'+i,input:'??',weight:1}));
  const {analysis}=simulateRealities(binary,checkpoint(),inputs);
  assert.equal(analysis.native.active_qubits,1536);
  assert.equal(analysis.native.components,512);assert.equal(analysis.native.largest_component,3);
  assert.equal(analysis.expected_positive_count,256);assert.equal(analysis.expected_negative_count,256);
  assert.equal(analysis.positive_probability,0.5);
  assert.equal(analysis.exhaustive_state_enumeration,false);assert.equal(analysis.quantum_hardware,false);
});

test('scenario schema, duplicates, unsupported inputs and resource budgets are rejected',native,()=>{
  assert.throws(()=>simulateRealities(binary,checkpoint(),[{id:'bad',input:'??',weight:0}]),/peso/);
  assert.throws(()=>simulateRealities(binary,checkpoint(),[scenarios[0],scenarios[0]]),/duplicado/);
  assert.throws(()=>simulateRealities(binary,checkpoint(),[{id:'bad',input:'?',weight:1}]),/2 bits/);
  assert.throws(()=>simulateRealities(binary,checkpoint(),Array.from({length:1025},(_,i)=>({id:'s'+i,input:'??',weight:1}))),/1024/);
});

test('analyses attach to one pattern/forecast without replacing either output or inflating forecast counts',native,()=>temporary(directory=>{
  const path=join(directory,'patrones.jsonl');
  const forecast=predictDual(binary,checkpoint(),data.records,data.config.validation_end);
  const issued=registerForecast(path,forecast).event;
  const {analysis}=simulateRealities(binary,checkpoint(),scenarios);
  assert.equal(registerRealities(path,issued.forecast_id,analysis).status,'analisis_registrado');
  assert.equal(registerRealities(path,issued.forecast_id,analysis).status,'ya_registrado');
  const registry=patternResults(readJournal(path)),group=registry.patterns[0];
  assert.equal(group.metrics.issued,1);assert.equal(group.metrics.simulation_runs,1);
  assert.deepEqual(group.forecasts[0].results,forecast.results);
  assert.equal(group.forecasts[0].analyses[0].positive_probability,9.5/11);
  const before=readFileSync(path,'utf8');
  const {analysis_sha256,...body}=analysis;
  body.objective={...body.objective,cost_bps:999};
  assert.throws(()=>registerRealities(path,issued.forecast_id,{...body,analysis_sha256:digest(JSON.stringify(body))}),/objetivo/);
  assert.equal(readFileSync(path,'utf8'),before);
}));

test('realities CLI keeps its analysis alongside the original pair in a reusable journal',native,()=>temporary(directory=>{
  const modelFile=join(directory,'modelo.json'),facts=join(directory,'hechos.jsonl'),input=join(directory,'escenarios.json');
  const journal=join(directory,'patrones.jsonl');
  writeFileSync(modelFile,JSON.stringify(checkpoint()));
  writeFileSync(facts,data.records.map(row=>JSON.stringify(row)).join('\n'));
  writeFileSync(input,JSON.stringify(scenarios));
  const tool=fileURLToPath(new URL('../tools/laplace.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[tool,'analizar-realidades',modelFile,facts,data.config.validation_end,
    input,resolve(binary),journal],{encoding:'utf8',timeout:60000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(run.stdout).status,'analisis_registrado');
  const group=patternResults(readJournal(journal)).patterns[0];
  assert.equal(group.metrics.issued,1);
  assert.equal(group.forecasts[0].results.deterministic.value,0);
  assert.ok(Math.abs(group.forecasts[0].results.probabilistic.probability-0.1)<1e-12);
  assert.equal(group.forecasts[0].analyses[0].positive_probability,9.5/11);
}));
