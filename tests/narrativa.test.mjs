import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalLedger,canonicalFact,ledgerHash} from '../historia/contrato.mjs';
import {proveWithOriginalEther} from '../historia/ether-xi.mjs';
import {narrativeState,enumeratePatterns,matches} from '../narrativa/espacio.mjs';
import {configuration,marketOutcome,trainNarrative,predictNarrative,evaluateNarrative,restoreNarrative,scores}
  from '../narrativa/modelo.mjs';
import {syntheticNarrativeData} from '../narrativa/experimento.mjs';
import {importReliefWeb,importGDELT} from '../narrativa/fuentes.mjs';

const binary=process.env.MUNDO_X_QUANTUM;
const native={skip:binary?false:'requires original pinned Mundo X executable from CI'};
const cutoff='2020-01-04T00:00:00Z';
function story(id,kind,summary,known='2020-01-03T12:00:00Z',extra={}){
  return {id,kind,summary,event_code:'TEXT_ONLY',region:'GLOBAL',
    observed_at:known,known_at:known,source_url:'https://example.org/synthetic-narrative/'+id,...extra};
}
const geo=story('geo','geopolitica','Military escalation and airstrike reported.');
const hum=story('hum','humanitaria','Aid blocked; humanitarian access denied.','2020-01-03T13:00:00Z');
const fixture=syntheticNarrativeData();
let trained;
const model=()=>trained??=(trainNarrative(binary,fixture.records,fixture.config));

test('humanitarian narratives have the same strict provenance/availability contract',()=>{
  assert.equal(canonicalFact(hum).kind,'humanitaria');
  assert.equal(canonicalLedger([geo,hum]).length,2);
  assert.throws(()=>canonicalFact({...hum,known_at:'2020-01-02T00:00:00Z'}),/before/);
  assert.throws(()=>canonicalFact({...hum,source_url:'http://example.org'}),/HTTPS/);
});

test('market labels use exact decimal comparisons at the declared cost threshold',()=>{
  assert.equal(marketOutcome('100','100.1',10).y,0);
  assert.equal(marketOutcome('100','100.10000001',10).y,1);
  assert.equal(marketOutcome('100','99',10).y,0);
  assert.equal(marketOutcome('99999999999999.00','99999999999999.00000001',0).y,1);
  assert.throws(()=>marketOutcome('1e2','101'),/decimal/);
  assert.throws(()=>marketOutcome('0','100'),/positivo/);
});

test('state contains only narrative facts known in the declared trailing window',()=>{
  const late=story('late','humanitaria','Famine reported.','2020-01-05T00:00:00Z',
    {observed_at:'2020-01-01T00:00:00Z'});
  const old=story('old','humanitaria','Disease outbreak reported.','2020-01-01T00:00:00Z');
  const data=fixture.records.filter(row=>['precio','economia'].includes(row.kind)).slice(0,8);
  const expected=narrativeState([geo,hum],cutoff,24);
  assert.deepEqual(narrativeState([geo,hum,late,old,...data],cutoff,24),expected);
  assert.ok(expected.atoms.includes('AID_BLOCKED'));
  assert.ok(!expected.atoms.includes('FOOD_INSECURITY'));
  assert.ok(!expected.atoms.includes('HEALTH_EMERGENCY'));
});

test('mixed reports retain both domains; local negation and unknown prose do not fabricate themes',()=>{
  const mixed=story('mixed','humanitaria','Military escalation; civilian deaths and famine reported.');
  const state=narrativeState([mixed],cutoff);
  assert.ok(state.atoms.includes('CONFLICT_ESCALATION'));
  assert.ok(state.atoms.includes('CIVILIAN_HARM'));
  const unknown=story('unknown','geopolitica','No ceasefire was reported; BTC price rose 50 percent.');
  assert.equal(narrativeState([unknown],cutoff).coverage.classified,0);
});

test('deduplication removes tracking copies and exact reprints without merging query-based article IDs',()=>{
  const copy={...geo,id:'copy',source_url:geo.source_url+'?utm_source=reprint'};
  const reprint={...geo,id:'reprint',source_url:'https://another.example.org/reprint'};
  const duplicate=narrativeState([geo,copy,reprint],cutoff);
  assert.equal(duplicate.events.length,1);assert.equal(duplicate.coverage.duplicates,2);
  const first={...geo,id:'a',source_url:'https://example.org/article?id=a'};
  const second={...hum,id:'b',source_url:'https://example.org/article?id=b'};
  assert.equal(narrativeState([first,second],cutoff).events.length,2);
});

test('pattern grammar distinguishes coexistence from temporal order and ignores simultaneous order',()=>{
  const state=narrativeState([geo,hum],cutoff);
  const patterns=enumeratePatterns(state);
  assert.ok(patterns.some(p=>p.type==='pair'&&p.terms.includes('AID_BLOCKED')&&p.terms.includes('CONFLICT_ESCALATION')));
  const sequence={type:'sequence',terms:['CONFLICT_ESCALATION','AID_BLOCKED']};
  assert.equal(matches(sequence,state),true);
  assert.equal(matches({...sequence,terms:sequence.terms.slice().reverse()},state),false);
  const simultaneous=narrativeState([geo,{...hum,observed_at:geo.observed_at,known_at:geo.known_at}],cutoff);
  assert.equal(matches(sequence,simultaneous),false);
});

test('configuration prevents overlapping targets, undeclared covariates and invalid chronological partitions',()=>{
  assert.equal(configuration(fixture.config).asset,'BTC-USD');
  assert.throws(()=>configuration({...fixture.config,step_hours:1}),/solaparse/);
  assert.throws(()=>configuration({...fixture.config,volume_indicator:true}),/desconocido/);
  assert.throws(()=>configuration({...fixture.config,validation_end:fixture.config.start_at}),/cronologicos/);
  assert.throws(()=>configuration({...fixture.config,cost_bps:-1}),/coste/);
});

test('proper scores include abstentions through a frozen prior and report comparable conditional support',()=>{
  const result=scores([{probability:0.8,y:1},{probability:null,y:0}],0.5);
  assert.equal(result.count,2);assert.equal(result.coverage,0.5);
  assert.ok(Math.abs(result.brier-(0.04+0.25)/2)<1e-12);
  assert.equal(result.conditional_baseline_brier,0.25);
  assert.equal(result.calibration.reduce((sum,bin)=>sum+bin.count,0),2);
  assert.throws(()=>scores([{probability:undefined,y:1}],0.5),/probabilidad/);
});

test('ReliefWeb imports preserve capture/version times instead of backdating current content',()=>{
  const raw={captured_at:'2020-01-04T00:00:00Z',response:{data:[{id:'123',fields:{
    title:'Aid blocked; civilian casualties reported.',url:'https://reliefweb.int/node/123',
    primary_country:{iso3:'UKR'},body:'Humanitarian access denied.',
    date:{original:'2020-01-01T12:00:00+00:00',created:'2020-01-02T10:00:00Z',changed:'2020-01-03T13:00:00Z'}
  }}]}};
  const facts=importReliefWeb(raw);
  assert.equal(facts[0].known_at,'2020-01-04T00:00:00.000Z');
  assert.equal(narrativeState(facts,'2020-01-03T18:00:00Z').events.length,0);
  assert.ok(narrativeState(facts,cutoff).atoms.includes('AID_BLOCKED@UA'));
  assert.throws(()=>importReliefWeb({...raw,captured_at:'2020-01-02T00:00:00Z'}),/captura/);
  assert.throws(()=>importReliefWeb({response:raw.response}),/timestamp/);
});

test('GDELT imports never confuse media source country with event geography or overwrite capture availability',()=>{
  const raw={captured_at:'2020-01-04T00:00:00Z',response:{articles:[{
    title:'Ceasefire and aid delivered',url:'https://example.org/synthetic-gdelt-story',
    seendate:'20200103T100000Z',sourcecountry:'United States'
  }]}};
  const facts=importGDELT(raw);
  assert.equal(facts[0].known_at,'2020-01-04T00:00:00.000Z');
  assert.equal(facts[0].region,'GLOBAL');
  assert.ok(narrativeState(facts,cutoff).atoms.includes('RELIEF_ACCESS'));
  assert.throws(()=>importGDELT({...raw,captured_at:'2020-01-02T00:00:00Z'}),/captura/);
});

test('humanitarian facts round-trip through the original Ether runtime',native,()=>{
  const result=proveWithOriginalEther(binary,[geo,hum],cutoff);
  assert.equal(result.observed_kinds.humanitaria,1);
  assert.equal(result.exact_roundtrip,true);assert.equal(result.active_qubits,0);
});

test('training estimates interaction probabilities and validates before a disjoint final evaluation',native,()=>{
  const learned=model();
  assert.equal(learned.status,'modelo_narrativo_entrenado');
  assert.equal(learned.training_samples,128);assert.equal(learned.validation_samples,64);
  assert.ok(learned.rules.some(rule=>rule.pattern.type==='pair'));
  assert.ok(learned.rules.some(rule=>rule.pattern.type==='sequence'));
  assert.equal(learned.pattern_audit.length,learned.candidates_generated);
  assert.equal(learned.pattern_audit.filter(rule=>rule.status==='seleccionado').length,learned.validated_rules);
  for(const rule of learned.rules){
    assert.ok(rule.count>=8&&rule.validation_count>=8);
    assert.equal(rule.probability,(rule.successes+8*learned.training_prior)/(rule.count+8));
  }
  const evaluation=evaluateNarrative(binary,learned.checkpoint,fixture.records,fixture.test_end);
  assert.equal(evaluation.metrics.count,64);
  assert.ok(evaluation.metrics.brier<evaluation.metrics.baseline_brier);
  assert.equal(evaluation.financial_edge_demonstrated,false);
  assert.equal(evaluation.paper_trading_orders,0);
  assert.equal(learned.native.active_qubits,0);assert.equal(learned.native.exact_roundtrip,true);
});

test('frozen inference is invariant to every price, economic value and future narrative',native,()=>{
  const checkpoint=model().checkpoint,when=fixture.config.validation_end;
  const original=predictNarrative(binary,checkpoint,fixture.records,when);
  const modified=fixture.records.map(row=>row.kind==='precio'?{...row,value:'1.00'}:row);
  modified.push({id:'macro-ignored',kind:'economia',series_id:'IGNORED',unit:'index',value:'999999',
    observed_at:when,known_at:when,source_url:'https://example.org/synthetic-macro'});
  modified.push(story('future-event','humanitaria','Famine and civilian deaths reported.',fixture.test_end,
    {observed_at:when}));
  const changed=predictNarrative(binary,checkpoint,modified,when);
  assert.equal(changed.forecast_sha256,original.forecast_sha256);
  const narratives=fixture.records.filter(row=>['geopolitica','humanitaria'].includes(row.kind));
  assert.equal(predictNarrative(binary,checkpoint,narratives,when).forecast_sha256,original.forecast_sha256);
  assert.throws(()=>predictNarrative(binary,checkpoint,fixture.records,fixture.config.train_end),/posterior/);
});

test('future test prices and later revisions cannot affect training or model selection',native,()=>{
  const modified=fixture.records.map(row=>row.kind==='precio'&&row.observed_at>fixture.config.validation_end
    ?{...row,value:'2.00'}:row);
  const old=fixture.records.find(row=>row.kind==='precio');
  modified.push({...old,id:'future-revision',value:'999999',known_at:fixture.test_end});
  const retrained=trainNarrative(binary,modified,fixture.config);
  assert.equal(retrained.checkpoint.state_sha256,model().checkpoint.state_sha256);
  assert.equal(retrained.checkpoint.xi_sha256,model().checkpoint.xi_sha256);
});

test('prices whose outcomes were not yet available are excluded from supervision',native,()=>{
  const late=fixture.records.map(row=>row.kind==='precio'?{...row,known_at:fixture.test_end}:row);
  const result=trainNarrative(binary,late,fixture.config);
  assert.equal(result.status,'evidencia_insuficiente');assert.equal(result.checkpoint,null);
  assert.equal(result.training_samples,0);assert.equal(result.validation_samples,0);
});

test('the no-narrative control abstains; prices alone do not recover a hidden signal',native,()=>{
  const without=fixture.records.filter(row=>!['geopolitica','humanitaria'].includes(row.kind));
  const control=evaluateNarrative(binary,model().checkpoint,without,fixture.test_end);
  assert.equal(control.metrics.coverage,0);
  assert.equal(control.metrics.brier,control.metrics.baseline_brier);
  const noSignal=trainNarrative(binary,without,fixture.config);
  assert.equal(noSignal.status,'sin_senal_validada');assert.equal(noSignal.validated_rules,0);
  const probability=predictNarrative(binary,noSignal.checkpoint,without,fixture.config.validation_end);
  assert.equal(probability.probability,null);assert.equal(probability.support,null);
});

test('native checkpoint replay conserves statistics and rejects state/program corruption',native,()=>{
  const checkpoint=JSON.parse(JSON.stringify(model().checkpoint));
  assert.equal(Object.hasOwn(checkpoint,'rules'),false);
  const restored=restoreNarrative(binary,checkpoint);
  assert.equal(restored.model.rules.length,model().validated_rules);
  assert.equal(restored.model.inference_inputs.join(','),'geopolitica,humanitaria');
  assert.throws(()=>restoreNarrative(binary,{...checkpoint,xi:checkpoint.xi+'mem_read 0\n'}),/hash XI/);
  assert.throws(()=>restoreNarrative(binary,{...checkpoint,state_sha256:'0'.repeat(64)}),/hash del estado/);
  assert.equal(ledgerHash(fixture.records),ledgerHash([...fixture.records].reverse()));
});

test('narrative CLI trains, restores a probability and evaluates a frozen checkpoint in separate processes',native,()=>{
  const directory=mkdtempSync(join(tmpdir(),'laplace-narrative-cli-'));
  const tool=fileURLToPath(new URL('../tools/laplace.mjs',import.meta.url));
  const cli=(...args)=>spawnSync(process.execPath,[tool,...args],{encoding:'utf8',timeout:60000});
  try{
    const ledger=join(directory,'hechos.jsonl'),config=join(directory,'config.json'),checkpoint=join(directory,'modelo.json');
    writeFileSync(ledger,fixture.records.map(row=>JSON.stringify(row)).join('\n'));
    writeFileSync(config,JSON.stringify(fixture.config));
    const fit=cli('entrenar-narrativa',ledger,config,resolve(binary),checkpoint);
    assert.equal(fit.status,0,fit.stderr);assert.equal(JSON.parse(fit.stdout).validated_rules,8);
    const saved=readFileSync(checkpoint,'utf8');
    const predicted=cli('probabilidad-narrativa',checkpoint,ledger,fixture.config.validation_end,resolve(binary));
    assert.equal(predicted.status,0,predicted.stderr);
    assert.equal(JSON.parse(predicted.stdout).status,'probabilidad_narrativa');
    assert.ok(JSON.parse(predicted.stdout).probability>0&&JSON.parse(predicted.stdout).probability<1);
    const evaluated=cli('evaluar-narrativa',checkpoint,ledger,fixture.test_end,resolve(binary));
    assert.equal(evaluated.status,0,evaluated.stderr);assert.equal(JSON.parse(evaluated.stdout).metrics.count,64);
    assert.equal(readFileSync(checkpoint,'utf8'),saved);
  }finally{rmSync(directory,{recursive:true,force:true})}
});
