import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../input/almacen.mjs';
import {normalizarObservacion} from '../estado-financiero/modelo.mjs';
import {guardarObservacion,consultarCorte,consultarEstadosDispersos}
  from '../estado-financiero/repositorio.mjs';
import {ejecutarEscenarioEF003} from '../estado-financiero/ejecucion.mjs';

const T0='2026-10-30T10:00:00.000Z',T1='2026-10-30T12:00:00.000Z',
  T2='2026-10-30T13:00:00.000Z',T3='2026-10-31T13:00:00.000Z';
const raw=(id,amount)=>({family:'I001',domain:'contabilidad',subject_id:id,
  variable:'saldo',value_text:amount,value_kind:'exact_decimal',value_status:'observed',
  unit:'USD',currency:'USD',population_id:'closed-ledger-A',
  observed_at:T0,known_at:T1,source_id:'bank-fixture',
  source_url:'https://example.org/bank',source_record_id:'row-'+id});
async function db(){
  const s=await Store.open({embeddedDirectory:'memory://'});await s.migrate();return s;
}
const flow=(direction,amount)=>({direction,amount_text:amount,
  origin:'assumption',unit:'USD',currency:'USD',
  population_id:'closed-ledger-A',effective_at:T3});
test('EF003 almacena leyes, escenario y delta sin añadir hechos ni backdating',async()=>{
  const s=await db();
  try{
    const start=normalizarObservacion(raw('bank-A','100.25'));
    await s.transaction(async tx=>guardarObservacion(tx,raw('bank-A','100.25')));
    const before=(await consultarCorte(s,{asOf:T2})).states;
    assert.equal(before.length,1);
    const out=await ejecutarEscenarioEF003(s,{law:'accounting',
      source_assertion_sha:start.assertion_sha,
      complete_flow_scope:true,target_at:T3,
      assumptions:{future_cashflow:'hypothetical'},
      flows:[flow('inflow','3.5'),flow('outflow','0.75')]},{now:()=>T2});
    assert.equal(out.status,'conditional_model_result');
    assert.equal(out.result.result.value_text,'103');
    assert.equal(out.stored_sparse_deltas,1);
    const after=(await consultarCorte(s,{asOf:T2})).states;
    assert.equal(after.length,1);
    assert.equal(after[0].assertion_sha,start.assertion_sha);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_rules')).rows[0].n,1);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_scenarios')).rows[0].n,1);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_sparse_deltas')).rows[0].n,1);
    const state=await consultarEstadosDispersos(s,{asOf:T2,scenario_id:out.scenario_id});
    assert.equal(state.states[0].state_value,'103');
    assert.equal(state.states[0].scenario_id,out.scenario_id);
    assert.equal((await consultarEstadosDispersos(s,{asOf:T2})).states.length,0);
    await assert.rejects(()=>consultarEstadosDispersos(s,{asOf:T1,
      scenario_id:out.scenario_id}),/creado despues del corte/);
  }finally{await s.close()}
});
test('EF003 sin universo cerrado no registra escenario ni crea valores cero',async()=>{
  const s=await db();
  try{
    const start=normalizarObservacion(raw('bank-B','1'));
    await s.transaction(async tx=>guardarObservacion(tx,raw('bank-B','1')));
    const result=await ejecutarEscenarioEF003(s,{
      law:'accounting',source_assertion_sha:start.assertion_sha,target_at:T3,
      assumptions:{unknown:true},flows:[],complete_flow_scope:false},{now:()=>T2});
    assert.equal(result.status,'abstained');
    assert.equal(result.persisted,false);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_scenarios')).rows[0].n,0);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_sparse_deltas')).rows[0].n,0);
  }finally{await s.close()}
});
test('EF003 rehusa fuente nunca observada y objetivo anterior',async()=>{
  const s=await db();
  try{
    const bogus='f'.repeat(64);
    await assert.rejects(()=>ejecutarEscenarioEF003(s,{law:'simple_interest',
      source_assertion_sha:bogus,target_at:T3,
      assumptions:{rate_fixed:true},rate_per_period:'0.01',periods:2},
      {now:()=>T2}),/observacion original/);
    await assert.rejects(()=>ejecutarEscenarioEF003(s,{law:'simple_interest',
      source_assertion_sha:bogus,target_at:T0,
      assumptions:{rate_fixed:true},rate_per_period:'0.01',periods:2},
      {now:()=>T2}),/objetivo posterior/);
  }finally{await s.close()}
});
test('EF003 transferencia de dos sujetos importa exclusivamente dos saldos reales',async()=>{
  const s=await db();
  try{
    const A=normalizarObservacion(raw('A','100')),B=normalizarObservacion(raw('B','50'));
    await s.transaction(async tx=>{
      await guardarObservacion(tx,raw('A','100'));
      await guardarObservacion(tx,raw('B','50'));
    });
    const out=await ejecutarEscenarioEF003(s,{
      law:'transfers',source_assertion_shas:[A.assertion_sha,B.assertion_sha],
      target_at:T3,assumptions:{flow_scope:'closed-example'},
      transfers:[{from:'A',to:'B',amount_text:'10',unit:'USD',
        currency:'USD',population_id:'closed-ledger-A',
        effective_at:T3,origin:'assumption'}]},{now:()=>T2});
    assert.equal(out.result.sum_after,'150');
    assert.equal(out.stored_sparse_deltas,2);
    assert.equal((await consultarCorte(s,{asOf:T2})).states.length,2);
  }finally{await s.close()}
});
