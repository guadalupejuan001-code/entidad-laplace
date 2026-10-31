import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {leerDiario,resumir} from '../seguimiento/diario.mjs';
import {universeSnapshot,observation} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {auditarMatrizFuentes,auditarCapturaMundial,
  validarDisponibilidadDeFeatures,CATALOG} from '../validacion/cobertura-v001.mjs';
import {evaluarJournalM001,compararAblacionesPareadas,V001_EVALUATION}
  from '../validacion/predicciones-v001.mjs';

const asOf='2026-10-31T09:30:00.000Z';
const evidence=new URL('../evidencia/entrenamiento-x002-20261030/m001-prospectivo/',import.meta.url);
function archivalDiary(){
  const v=JSON.parse(readFileSync(new URL('verificacion.json',evidence),'utf8'));
  const saved=JSON.parse(readFileSync(new URL('resumen-original.json',evidence),'utf8'));
  const original=gunzipSync(Buffer.from(
    readFileSync(new URL('diario.jsonl.gz.b64',evidence),'utf8').trim(),'base64'));
  assert.equal(createHash('sha256').update(original).digest('hex'),v.journal_sha256);
  const dir=mkdtempSync(join(tmpdir(),'laplace-v001-test-'));
  try{
    writeFileSync(join(dir,'diario.jsonl'),original);
    const events=leerDiario(dir);
    assert.deepEqual(resumir(events,saved.actualizado_en),saved);
    return {events,v,saved};
  }finally{rmSync(dir,{recursive:true,force:true})}
}
const world=new URL('../evidencia/continuidad-u003-20261030/captura-integrada.json',import.meta.url);
const feature=(id,known_at='2026-10-29T13:00:00.000Z')=>({
  id,status:'observed',known_at,observed_at:'2026-10-29T12:00:00.000Z',value:100
});
const pair=(i,more={})=>({
  forecast_id:'pair-'+i,decision_at:'2026-10-29T12:00:00.000Z',
  target_at:'2026-10-30T12:00:00.000Z',
  target_known_at:'2026-10-30T12:01:00.000Z',
  features_known_at:'2026-10-29T11:00:00.000Z',
  models_frozen_at:'2026-10-28T12:00:00.000Z',
  held_out:true,world_family:'K001',baseline_model_hash:'a'.repeat(64),
  world_model_hash:'b'.repeat(64),price_without_world:100,price_with_world:101,
  actual_price:102,...more
});
test('V001 catálogo: ningún conector equivale a cobertura completa o precio mejorado',()=>{
  const x=auditarMatrizFuentes(undefined,{auditedAt:asOf});
  assert.equal(x.total_modules,CATALOG.length);
  assert.ok(x.needs_live_capture.includes('C001'));
  assert.ok(x.needs_live_capture.includes('O001_B'));
  assert.equal(x.prediction_effect_identified,false);
  assert.equal(x.complete_world_data,false);
  assert.ok(x.modules.every(x=>!x.predictor_center_affected));
  assert.throws(()=>auditarMatrizFuentes([CATALOG[0],CATALOG[0]]),/duplicada/);
});
test('V001 snapshot U003 archivado: seal y as-of comprobados',()=>{
  const data=JSON.parse(readFileSync(world,'utf8'));
  const x=auditarCapturaMundial(data);
  assert.equal(x.known_states,data.universal_state.known_states);
  assert.ok(x.known_states>500);
  assert.equal(x.usable_for_forecasts_before_capture,false);
  assert.equal(x.historical_release_times_proven,false);
});
test('V001 cambiar snapshot auténtico rompe hash',()=>{
  const data=JSON.parse(readFileSync(world,'utf8'));
  data.universal_state.states[0].value++;
  assert.throws(()=>auditarCapturaMundial(data),/sello|modificada/);
});
test('V001 corte mundial no se puede mover después de sellar',()=>{
  const at='2026-10-30T13:00:00.000Z';
  const state=universeSnapshot([observation({id:'one',domain:'btc',variable:'btc_price',
    value:24,unit:'USD',source_url:'https://example.org/btc',
    observed_at:'2026-10-30T12:00:00.000Z',
    known_at:'2026-10-30T12:01:00.000Z'})],{cutoff:at});
  assert.equal(auditarCapturaMundial(sellarCaptura({
    schema:'laplace-universo-global-test',at,universal_state:state,
    source_status:[{status:'observed'}]})).known_states,1);
  assert.throws(()=>auditarCapturaMundial(sellarCaptura({
    schema:'laplace-universo-global-test',at,
    universal_state:{...state,cutoff:'2026-10-30T14:00:00.000Z'},
    source_status:[]})),/corte/);
});
test('V001 disponibilidad: known_at, no observed_at, evita mirar futuro',()=>{
  const r=validarDisponibilidadDeFeatures([
    feature('late','2026-10-30T13:00:00.000Z'),
    feature('valid'),
    {id:'missing',status:'unavailable'}
  ],{decisionAt:'2026-10-30T12:00:00.000Z'});
  assert.equal(r.late,1);assert.equal(r.usable,1);
  assert.equal(r.missing,1);assert.equal(r.safe_for_this_decision,false);
  assert.equal(r.status,'lookahead_detected');
});
test('V001 ausencia o falta de fecha no genera cero',()=>{
  const r=validarDisponibilidadDeFeatures([
    {id:'na',status:'observed',observed_at:'2026-10-28T00:00:00.000Z',known_at:null,value:5},
    {id:'restricted',status:'restricted'},
    feature('known')
  ],{decisionAt:'2026-10-30T00:00:00.000Z'});
  assert.equal(r.unsupported,1);assert.equal(r.missing,1);
  assert.equal(r.usable,1);assert.equal(r.safe_for_this_decision,false);
});
test('V001 diario M001 histórico se reproduce desde gzip con hash y resumen exactos',()=>{
  const {events,v,saved}=archivalDiary();
  assert.equal(events.length,26);assert.equal(v.forecasts,15);
  assert.equal(saved.evaluados,8);
});
test('V001 calcula 8 resultados reales y no otorga ventaja mundial',()=>{
  const {events,v}=archivalDiary();
  const r=evaluarJournalM001(events,{asOf});
  assert.equal(r.schema,V001_EVALUATION);
  assert.equal(r.emitted,v.forecasts);assert.equal(r.evaluated,v.evaluated);
  assert.equal(r.pooled_descriptive_only.direction_hits,v.direction_hits);
  assert.equal(r.pooled_descriptive_only.price_hits_10bp,v.price_hits);
  assert.equal(r.audit_status,'insufficient_sample');
  assert.equal(r.by_horizon.length,5);
  assert.equal(r.production_activation_allowed,false);
});
test('V001 as-of temprano no incluye resultados conocidos después',()=>{
  const {events}=archivalDiary();
  const before=evaluarJournalM001(events,{asOf:'2026-10-30T07:00:00.000Z'});
  const after=evaluarJournalM001(events,{asOf});
  assert.ok(before.evaluated<=after.evaluated);
  assert.ok(before.emitted<=after.emitted);
});
test('V001 resultado histórico manipulado se rechaza',()=>{
  const {events}=archivalDiary();
  const c=structuredClone(events);c.find(x=>x.tipo==='resultado').datos.precio_observado++;
  assert.throws(()=>evaluarJournalM001(c,{asOf}),/alterado/);
});
test('V001 sin ablaciones realmente congeladas: abstención, no mejora',()=>{
  const r=compararAblacionesPareadas([],{asOf});
  assert.equal(r.status,'no_frozen_world_forecasts');
  assert.equal(r.paired,0);assert.equal(r.improvement,null);
  assert.equal(r.production_activation_allowed,false);
});
test('V001 bloquea features futuras, target futuro, holdout falso',()=>{
  assert.throws(()=>compararAblacionesPareadas([pair(1,{
    features_known_at:'2026-10-29T13:00:00.000Z'})],{asOf}),/fuga temporal/);
  assert.throws(()=>compararAblacionesPareadas([pair(1,{
    target_known_at:'2026-10-30T11:00:00.000Z'})],{asOf}),/fuga temporal/);
  assert.throws(()=>compararAblacionesPareadas([pair(1,{held_out:false})],{asOf}),/fuga temporal/);
});
test('V001 duplicados, sha falso, precios no finitos se rechazan',()=>{
  assert.throws(()=>compararAblacionesPareadas([pair(1),pair(1)],{asOf}),/duplicado/);
  assert.throws(()=>compararAblacionesPareadas([pair(1,{world_model_hash:'fake'})],{asOf}),/hashes/);
  assert.throws(()=>compararAblacionesPareadas([pair(1,{price_with_world:NaN})],{asOf}),/price|precio/);
});
test('V001 12 pares sintéticos no certifican estadística aunque ganaran',()=>{
  const r=compararAblacionesPareadas(Array.from({length:12},(_,i)=>pair(i)),{asOf});
  assert.equal(r.status,'insufficient_independent_holdout');
  assert.equal(r.paired,12);assert.equal(r.significance_proven,false);
  assert.equal(r.production_activation_allowed,false);
});
test('V001 F001: contexto no altera precio central ni habilita órdenes',()=>{
  const src=readFileSync(new URL('../prediccion/fusion-temporal.mjs',import.meta.url),'utf8');
  assert.match(src,/uncertainty_multiplier/);
  assert.match(src,/no predicción central/);
  const script=readFileSync(new URL('../tools/validar-v001.mjs',import.meta.url),'utf8');
  assert.match(script,/NO_GO_MODEL_PRODUCTION/);
  assert.match(script,/ready_for_financial_trading:false/);
});
