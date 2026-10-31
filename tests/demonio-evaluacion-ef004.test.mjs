import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {aprenderNucleoEF004} from '../demonio/finanzas-ef004.mjs';
import {evaluarPronosticoEF004,verificarPronosticoEF004}
  from '../demonio/evaluacion-ef004.mjs';
const ORIGIN=Date.parse('2026-09-01T00:00:00.000Z'),H=3600000;
function history(n){
  let first=10,second=20,prev=0;
  const archives=[];
  for(let i=0;i<n;i++){
    const d=.025*Math.sin(1.81*i)+.012*Math.cos(2.17*i);
    const e=1.6*prev+.0007*Math.cos(i*1.35);
    first*=Math.exp(d);second*=Math.exp(e);prev=d;
    const at=new Date(ORIGIN+i*6*H).toISOString();
    const rows=[{id:'market-'+i,domain:'mercado_global',variable:'A_close',
      value:first,unit:'USD',observed_at:at,known_at:at,
      source_url:'https://example.org/market'},
    {id:'crypto-'+i,domain:'cripto_global',variable:'B_close',
      value:second,unit:'USD',observed_at:at,known_at:at,
      source_url:'https://example.org/crypto'}];
    archives.push(sellarCaptura({
      schema:'laplace-universo-global-u003-v4',at,
      universal_state:universeSnapshot(rows,{cutoff:at}),
      source_status:rows.map(x=>({name:x.id,status:'observed',signals:1})),
      coverage:{known_signals:rows.length},
      automatic_trading:false,prediction_inputs_enabled:false}));
  }
  return archives;
}
test('EF004 mide una predicción ya congelada con una captura posterior verificable',()=>{
  const captures=history(105);
  const model=aprenderNucleoEF004(captures.slice(0,104));
  assert.equal(model.status,'experimental_model_frozen');
  assert.equal(verificarPronosticoEF004(model),true);
  const before=evaluarPronosticoEF004(model,captures.slice(0,104));
  assert.equal(before.status,'waiting_for_outcome');
  const after=evaluarPronosticoEF004(model,captures);
  assert.equal(after.status,'prospective_outcomes_measured');
  assert.ok(after.pairs_evaluated>=1);
  assert.equal(after.outcome_capture_sha256,captures.at(-1).capture_sha256);
  assert.equal(after.automatic_trading,false);
  assert.ok(after.comparisons.some(x=>x.model_kind==='candidate'));
  assert.equal(after.confidence_not_certified,true);
  assert.match(after.evaluation_sha256,/^[a-f0-9]{64}$/);
});
test('EF004 un informe cambiado o resultado sin período comparable no obtiene puntuación',()=>{
  const captures=history(105);
  const model=aprenderNucleoEF004(captures.slice(0,104));
  const modified=structuredClone(model);modified.trajectory[0].states[0].estimated_value=9999999;
  assert.throws(()=>evaluarPronosticoEF004(modified,captures),/modificado/);
  const later=history(106).filter((_,i)=>i!==104);
  const report=evaluarPronosticoEF004(model,later);
  assert.equal(report.status,'unscorable_missed_capture_window');
  assert.equal(report.evaluated,0);
  assert.equal(report.missing_is_not_zero,true);
});
test('EF004 no puntúa noticias o series antiguas repetidas como resultado realizado',()=>{
  const captures=history(105);
  const model=aprenderNucleoEF004(captures.slice(0,104));
  const latest=captures.at(-1);
  const old=latest.universal_state.states.map(x=>({
    ...x,observed_at:model.decision_at
  }));
  const modified=sellarCaptura({...latest,
    universal_state:universeSnapshot(old,{cutoff:latest.at})});
  const result=evaluarPronosticoEF004(model,[...captures.slice(0,104),modified]);
  assert.equal(result.status,'no_comparable_learned_outcomes');
  assert.equal(result.pairs_evaluated,0);
  assert.ok(result.excluded.length>0);
});
