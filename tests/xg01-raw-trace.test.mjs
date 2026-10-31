import test from 'node:test';
import assert from 'node:assert/strict';
import {experimentOne} from '../experimentos/u002-predictive-xg01.mjs';
import {experimentOneRaw} from '../experimentos/xg01-raw-trace.mjs';
const plan={train:120,validation:40,test:40,strength:8,
  weights:[0,.25,.5,.75,1],min_global_coverage:28};
function samples(n=360){
  const t=Date.parse('2026-10-20T13:30:00Z')/1000;
  return Array.from({length:n},(_,i)=>({
    t:t+i*300,local:(i*7+Math.floor(i/13))%16,
    global:(i*5+Math.floor(i/9))%16,
    y:Number(Math.sin(i*.11)+Math.cos(i*.09)>.15)
  }));
}
test('Todas las decisiones de reserva, mismas métricas XG01, sin redondear',()=>{
 const cases=samples(),reference=experimentOne(cases,'SPY',{plan}),
   raw=experimentOneRaw(cases,'SPY',{plan});
 assert.deepEqual(raw.original_result,reference);
 assert.equal(raw.folds.length,reference.folds);
 assert.ok(raw.test_decisions>0);
 assert.equal(raw.test_decisions,raw.evaluated_decisions);
 assert.ok(raw.folds.every(f=>f.decisions.length===plan.test));
 for(const f of raw.folds)for(const d of f.decisions){
   assert.ok(d.fused_probability_ieee754_hex.startsWith('0x'));
   assert.ok(d.fused_probability>=0&&d.fused_probability<=1);
   assert.equal(d.price_prediction,null);
   assert.equal(Date.parse(d.target_close_at)-Date.parse(d.known_state_at),300000);
 }
 assert.equal(raw.original_model_unchanged,true);
 assert.equal(raw.financial_advantage_proven,false);
});
test('Datos ausentes: etiqueta exclusión, no inventa ni sustituye por prior',()=>{
 const cases=samples();cases[200].global=null;
 const raw=experimentOneRaw(cases,'AAPL',{plan});
 assert.ok(raw.folds.flatMap(x=>x.decisions).some(r=>
   !r.eligible&&r.fused_probability===null));
});
test('No altera los datos de entrada y rechaza etiquetas inválidas',()=>{
 const cases=samples(),before=JSON.stringify(cases);
 const r=experimentOneRaw(cases,'NVDA',{plan});assert.ok(r.folds.length);
 assert.equal(JSON.stringify(cases),before);
 cases[210].y=3;
 assert.throws(()=>experimentOneRaw(cases,'NVDA',{plan}),/Etiqueta de test|inválido/);
});
