import test from 'node:test';
import assert from 'node:assert/strict';
import {sha} from '../input/contrato.mjs';
import {sumarDecimales,restarDecimales,multiplicarDecimales,dividirDecimales,
  sumaExacta,aplicarLeyContable,aplicarLeyInteresSimple,propagarTransferencias}
  from '../estado-financiero/leyes.mjs';

const BEFORE='2026-10-30T10:00:00.000Z';
const KNOWN='2026-10-30T12:00:00.000Z';
const DECIDE='2026-10-30T13:00:00.000Z';
const AFTER='2026-10-31T13:00:00.000Z';
const SCENARIO=sha('EF003 isolated hypothetical experiment');
const base=(id,amount,changes={})=>({
  subject_id:id,unit:'USD',currency:'USD',population_id:'ledger-company-A',
  value_text:amount,value_kind:'exact_decimal',value_status:'observed',
  observed_at:BEFORE,known_at:KNOWN,source_id:'fixture',...changes});
const flow=(id,direction,amount,changes={})=>({
  id,direction,amount_text:amount,unit:'USD',currency:'USD',
  population_id:'ledger-company-A',origin:'assumption',
  effective_at:AFTER,declared_at:DECIDE,...changes});
const args=()=>({base:base('bank', '100.125'),
  flows:[flow('funding','inflow','10'),flow('payment','outflow','2.125')],
  cutoff:DECIDE,target_at:AFTER,scenario_id:SCENARIO,
  complete_flow_scope:true});
test('EF003 exactitud decimal arbitraria sin coma flotante ni ceros fabricados',()=>{
  assert.equal(sumarDecimales('0.1','0.2'),'0.3');
  assert.equal(sumarDecimales('999999999999999999999.01','0.99'),'1000000000000000000000');
  assert.equal(restarDecimales('1','1.00000000000001'),'-0.00000000000001');
  assert.equal(multiplicarDecimales('1.25','0.02'),'0.025');
  assert.equal(dividirDecimales('1','2'),'0.5');
  assert.equal(dividirDecimales('1','8',{decimales:2}),'0.13');
  assert.equal(sumaExacta(['0.1','0.2','-0.3']),'0');
  assert.throws(()=>dividirDecimales('1','0'),/cero/);
});
test('EF003 ley contable conserva valor exacto solo con scope de flujo completo declarado',()=>{
  const out=aplicarLeyContable(args());
  assert.equal(out.status,'conditional_model_result');
  assert.equal(out.result.value_text,'108');
  assert.equal(out.trace.length,2);
  assert.equal(out.forecast_of_real_market,false);
  assert.equal(out.automatic_trading,false);
  assert.equal(aplicarLeyContable({...args(),complete_flow_scope:false}).status,'abstained');
  assert.equal(aplicarLeyContable({...args(),complete_flow_scope:false}).reason,
    'flujo_incompleto_no_equivale_a_cero');
});
test('EF003 rechaza informacion futura, moneda y poblacion incompatibles',()=>{
  assert.throws(()=>aplicarLeyContable({...args(),base:base('bank','100',{known_at:AFTER})}),
    /no conocida/);
  assert.throws(()=>aplicarLeyContable({...args(),flows:[flow('wrong','inflow','5',
    {currency:'EUR'})]}),/incompatible/);
  assert.throws(()=>aplicarLeyContable({...args(),flows:[flow('other','inflow','5',
    {population_id:'BIS_CBS'})]}),/incompatible/);
  assert.throws(()=>aplicarLeyContable({...args(),flows:[flow('future','inflow','5',
    {declared_at:AFTER})]}),/posterior/);
  assert.throws(()=>aplicarLeyContable({...args(),flows:[flow('real','inflow','5',
    {origin:'observation'})]}),/no son hechos observados/);
  assert.throws(()=>aplicarLeyContable({...args(),scenario_id:null}),/escenario/);
});
test('EF003 no supone crédito ilimitado y puede abstenerse',()=>{
  const x=aplicarLeyContable({...args(),base:base('bank','1'),
    flows:[flow('overdraw','outflow','10')]});
  assert.equal(x.status,'abstained');
  assert.equal(x.reason,'saldo_negativo_no_permitido');
});
test('EF003 interés simple condicional no inventa ruta de tasas futuras',()=>{
  const res=aplicarLeyInteresSimple({base:base('debt','1000'),rate:'0.02',
    periods:3,cutoff:DECIDE,target_at:AFTER,scenario_id:SCENARIO});
  assert.equal(res.interest_text,'60');
  assert.equal(res.result_text,'1060');
  assert.equal(res.real_rate_path_observed,false);
  assert.equal(res.forecast_of_real_market,false);
  assert.throws(()=>aplicarLeyInteresSimple({base:base('debt','1000'),
    rate:'0.02',periods:3651,cutoff:DECIDE,target_at:AFTER,
    scenario_id:SCENARIO}),/periodos/);
});
test('EF003 flujo contrafactual conserva suma en una red de tres entidades',()=>{
  const out=propagarTransferencias({
    balances:[base('a','200'),base('b','20'),base('c','0')],
    transfers:[{from:'a',to:'b',amount_text:'20',unit:'USD',
      currency:'USD',population_id:'ledger-company-A',
      origin:'assumption',effective_at:AFTER,declared_at:DECIDE},
      {from:'b',to:'c',amount_text:'25',unit:'USD',
        currency:'USD',population_id:'ledger-company-A',
        origin:'assumption',effective_at:AFTER,declared_at:DECIDE}],
    cutoff:DECIDE,target_at:AFTER,scenario_id:SCENARIO
  });
  assert.equal(out.status,'conditional_model_result');
  assert.equal(out.sum_before,'220');
  assert.equal(out.sum_after,'220');
  assert.deepEqual(out.balances.map(x=>[x.subject_id,x.value_text]),
    [['a','180'],['b','15'],['c','25']]);
  assert.equal(out.real_world_causality_not_demonstrated,true);
});
test('EF003 transferencia sin saldo y transferencias con nodos desconocidos se abstienen/rechazan',()=>{
  const template={balances:[base('a','1'),base('b','0')],
    cutoff:DECIDE,target_at:AFTER,scenario_id:SCENARIO};
  const large={from:'a',to:'b',amount_text:'5',unit:'USD',
    currency:'USD',population_id:'ledger-company-A',
    origin:'assumption',effective_at:AFTER,declared_at:DECIDE};
  assert.equal(propagarTransferencias({...template,transfers:[large]}).status,'abstained');
  assert.throws(()=>propagarTransferencias({...template,transfers:[
    {...large,to:'new-not-in-ledger'}]}),/entidades conocidas/);
  assert.throws(()=>propagarTransferencias({...template,transfers:[
    {...large,origin:'observed'}]}),/sin escenario/);
  assert.throws(()=>propagarTransferencias({...template,
    balances:[base('a','1'),base('b','2',{currency:'EUR'})],transfers:[]}),
    /incompatibles/);
});
test('EF003 no fuerza evolución exacta del mundo desde datos incompletos',()=>{
  assert.equal(aplicarLeyContable({...args(),flows:[]}).result.value_text,'100.125');
  assert.equal(aplicarLeyContable({...args(),flows:[],complete_flow_scope:false}).status,'abstained');
  const a=aplicarLeyContable(args()),b=aplicarLeyContable(args());
  assert.equal(a.result_sha256,b.result_sha256);
});
