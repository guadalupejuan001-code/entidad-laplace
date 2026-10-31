import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {prepararMemoriaNativaEF004,verificarMemoriaNativaEF004}
  from '../demonio/puente-xi-ef004.mjs';
const at='2026-10-31T15:27:12.324Z';
const capture=(n)=>sellarCaptura({
  schema:'laplace-universo-global-u003-v4',at,
  universal_state:universeSnapshot(Array.from({length:n},(_,i)=>({
    id:'state-'+i,domain:'mercado_global',variable:'asset_'+i+'_close',
    observed_at:at,known_at:at,value:100+i*0.25,unit:'USD',
    source_url:'https://example.org/market'
  })),{cutoff:at}),
  source_status:[{name:'synthetic',status:'observed',signals:n}],
  coverage:{known_signals:n},automatic_trading:false
});
test('EF004 mantiene 1025 observaciones reales en dos lotes XI de <= 1024',()=>{
  const c=capture(1025),p=prepararMemoriaNativaEF004(c);
  assert.equal(p.raw_states,1025);
  assert.equal(p.projected,1025);
  assert.equal(p.batches.length,2);
  assert.deepEqual(p.batches.map(x=>x.records),[1024,1]);
  assert.ok(p.batches.every(x=>x.materialized_bytes<=32784));
  assert.equal(p.financial_prediction_generated,false);
  assert.equal(p.no_new_qubits,true);
});
test('EF004 no proyecta captura corrupta o sin sello',()=>{
  const c=capture(2);c.universal_state.states[0].value=200;
  assert.throws(()=>prepararMemoriaNativaEF004(c),/modificada|sello/);
});
test('EF004 prueba de memoria XI/Ether REAL para un lote mínimo',
  {skip:!process.env.MUNDO_X_QUANTUM},()=>{
  const c=capture(3),p=verificarMemoriaNativaEF004(process.env.MUNDO_X_QUANTUM,c);
  assert.equal(p.roundtrip_verificado,true);
  assert.equal(p.projected,3);
  assert.equal(p.checks[0].active_qubits,0);
  assert.equal(p.forecasts_generated,0);
});


test('EF005 sin límite mundial 4096: 4101 observaciones se particionan para XI original',()=>{
  const c=capture(4101),p=prepararMemoriaNativaEF004(c);
  assert.equal(p.raw_states,4101);
  assert.equal(p.projected,4101);
  assert.equal(p.batches.length,5);
  assert.equal(p.batches.reduce((n,b)=>n+b.records,0),4101);
  assert.ok(p.batches.every(x=>x.materialized_bytes<=32784));
});
