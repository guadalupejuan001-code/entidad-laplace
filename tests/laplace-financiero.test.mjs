import test from 'node:test';
import assert from 'node:assert/strict';
import {resolverLaplaceGrafo} from '../ecuacion/laplace-grafo.mjs';
import {auditarUniversoLaplace,aplicarLaplaceAHorizontes} from '../ecuacion/laplace-financiero.mjs';
const mk=arr=>arr.map(([minutes,price_candidate])=>({minutes,price_candidate,asset:'BTC-USD'}));
test('interpolación de dos fronteras F001 por Laplaciano real',()=>{
 const r=aplicarLaplaceAHorizontes(mk([[5,100],[15,null],[30,null],[60,106],[120,null]]),{
   quotePrice:100,solver:resolverLaplaceGrafo});
 assert.equal(r.status,'calculated');assert.equal(r.available_candidate_anchors,2);
 assert.equal(r.interpolated_horizons,2);
 assert.ok(r.field[1].laplace_return>0&&r.field[1].laplace_return<Math.log(1.06));
 assert.equal(r.field[4].laplace_return,null);
 assert.equal(r.field[4].field_status,'outside_interpolation_domain');
 assert.equal(r.field[1].laplace_price_for_trading,null);
 assert.equal(r.candidate_prices_unchanged,true);
});
test('sin incógnitas: informa inconsistencia de candidatos, no altera precios',()=>{
 const arr=mk([[5,101],[15,104],[30,103],[60,105]]);
 const r=aplicarLaplaceAHorizontes(arr,{quotePrice:100,solver:resolverLaplaceGrafo});
 assert.equal(r.status,'calculated');assert.equal(r.interpolated_horizons,0);
 assert.ok(r.max_anchor_inconsistency>0);
 assert.deepEqual(r.field.map(x=>x.candidate_price),arr.map(x=>x.price_candidate));
 assert.equal(r.model_advantage_proven,false);
});
test('una sola frontera: abstenerse; no declarar solución',()=>{
 const r=aplicarLaplaceAHorizontes(mk([[5,null],[15,105],[30,null]]),{
  quotePrice:100,solver:resolverLaplaceGrafo});
 assert.equal(r.status,'abstained');assert.equal(r.available_candidate_anchors,1);
});
test('bloquea mezclar activos o tiempos duplicados o infinito',()=>{
 assert.throws(()=>aplicarLaplaceAHorizontes(mk([[5,101],[5,102]]),{
  quotePrice:100,solver:resolverLaplaceGrafo}),/duplicados/);
 assert.throws(()=>aplicarLaplaceAHorizontes([
  {minutes:5,price_candidate:101,asset:'BTC-USD'},
  {minutes:15,price_candidate:102,asset:'ETH-USD'}],{
  quotePrice:100,solver:resolverLaplaceGrafo}),/mezclar/);
 assert.throws(()=>aplicarLaplaceAHorizontes(mk([[5,101],[15,NaN]]),{
  quotePrice:100,solver:resolverLaplaceGrafo}),/no finito/);
});
test('corte temporal real excluye estados futuros y no suma unidades distintas',()=>{
 const t='2026-10-31T17:00:00Z';
 const row=(id,val,unit,known='2026-10-31T16:00:00Z')=>({
  id,domain:'mercado_global',variable:id,unit,known_at:known,
  observed_at:'2026-10-31T15:00:00Z',source_url:'https://example.org/data',value:val});
 const world={states:[row('btc',100,'USD'),row('heat',20,'C'),
   row('future',5,'USD','2026-11-01T00:00:00Z')],
   groups:[{group:'etf_fund_flows_c001',status:'not_attempted',signals:0}]};
 const r=auditarUniversoLaplace(world,{asOf:t});
 assert.equal(r.archived_states,3);assert.equal(r.valid_at_cut,2);
 assert.equal(r.rejected.future_known,1);
 assert.equal(r.distinct_domain_unit_pairs,2);
 assert.equal(r.etf_fund_flow_status,'not_attempted');
 assert.equal(r.applied_to_central_forecast,false);
});
