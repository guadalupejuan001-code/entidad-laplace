import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {serieId,estadoDeCaptura,prepararHistoria,extraerSeries} from '../demonio/series.mjs';
import {aprenderNucleoEF004} from '../demonio/finanzas-ef004.mjs';

const START=Date.parse('2026-09-01T00:00:00.000Z');
const HOUR=3600000;
const iso=t=>new Date(t).toISOString();
const URLS=['https://example.org/market','https://example.org/commodities',
  'https://example.org/financial'];
function synthetic(n=100){
  const captures=[];let a=80,b=100,c=120,prevDa=0;
  for(let i=0;i<n;i++){
    const da=0.028*Math.sin(1.73*i)+0.017*Math.cos(0.81*i);
    const db=i?1.65*prevDa+0.0012*Math.sin(i*3.17):0;
    const dc=0.012*Math.sin(2.4*i)+0.018*Math.cos(1.9*i);
    a*=Math.exp(da);b*=Math.exp(db);c*=Math.exp(dc);
    prevDa=da;
    const time=iso(START+6*HOUR*i);
    const data=[
      {id:'market-A-'+i,domain:'mercado_global',variable:'A_close',
        value:a,unit:'USD',observed_at:time,known_at:time,source_url:URLS[0]},
      {id:'commodity-B-'+i,domain:'futuros_commodities',variable:'B_close',
        value:b,unit:'USD',observed_at:time,known_at:time,source_url:URLS[1]},
      {id:'financial-C-'+i,domain:'cripto_global',variable:'C_price',
        value:c,unit:'USD',observed_at:time,known_at:time,source_url:URLS[2]}
    ];
    captures.push(sellarCaptura({schema:'laplace-universo-global-u003-v4',at:time,
      universal_state:universeSnapshot(data,{cutoff:time}),
      source_status:URLS.map((u,j)=>({name:'sample-'+j,status:'observed',
        signals:1,url:u})),
      coverage:{known_signals:3,complete_world:false},
      prediction_inputs_enabled:false,automatic_trading:false}));
  }
  return captures;
}
test('EF004 un archivo o un snapshot nunca significa aprendizaje mundial',()=>{
  const one=synthetic(1);
  const model=aprenderNucleoEF004(one);
  assert.equal(model.status,'abstained');
  assert.equal(model.reason,'insufficient_independent_capture_history');
  assert.equal(model.minimum_captures,48);
  assert.equal(model.production_activation_allowed,false);
  assert.deepEqual(model.trajectory,[]);
});
test('EF004 identifica series estables por dominio, variable, unidad y proveedor',()=>{
  const snapshots=synthetic(65);
  const panel=prepararHistoria(snapshots);
  assert.equal(panel.contiguous_captures,65);
  assert.equal(panel.discarded_due_to_gap,0);
  const choose=extraerSeries(panel,{selectionEnd:40});
  assert.equal(choose.total_eligible,3);
  assert.equal(choose.heldout_not_used_for_selection,true);
  const a=snapshots[0].universal_state.states[0];
  const b=snapshots[1].universal_state.states[0];
  assert.equal(serieId(a),serieId(b));
  assert.equal(estadoDeCaptura(snapshots[0]).state.size,3);
});
test('EF004 entrena dependencia lagged y actualiza en simultáneo tres dominios',()=>{
  const data=synthetic(110);
  const result=aprenderNucleoEF004(data);
  assert.equal(result.status,'experimental_model_frozen');
  assert.equal(result.consecutive_captures,110);
  assert.equal(result.trajectory.length,4);
  assert.equal(result.model.train_pairs>20,true);
  assert.equal(result.model.validation_pairs>=8,true);
  assert.equal(result.model.holdout_pairs>=8,true);
  assert.ok(result.model.selected_series.length>=3);
  assert.ok(result.model.models.some(m=>m.status==='experimental_model'));
  assert.ok(result.model.edges.length>0);
  const b=result.model.models.find(x=>x.variable==='B_close');
  assert.ok(b,'El objetivo B debe haber sido elegido');
  assert.equal(b.model?.kind,'joint');
  assert.ok(b.model?.features.some(x=>x!==b.key));
  assert.equal(b.validation.independent_prospective_validation,false);
  assert.equal(b.holdout.independent_prospective_validation,false);
  assert.equal(result.trajectory.every(x=>x.simultaneous_update),true);
  assert.equal(result.trajectory[0].states.length,3);
  assert.equal(result.model.selected_by_future_holdout,undefined);
  assert.equal(result.automatic_trading,false);
  assert.equal(result.production_activation_allowed,false);
});
test('EF004 el test reservado NO cambia entrenamiento, selección ni hash del modelo',()=>{
  const captures=synthetic(110);
  const original=aprenderNucleoEF004(captures);
  const changed=captures.map(x=>structuredClone(x));
  for(let i=88;i<changed.length;i++){
    const x=changed[i],rows=x.universal_state.states.map(row=>({
      ...row,value:row.value*(row.variable==='B_close'?1.35:1)}));
    changed[i]=sellarCaptura({...x,
      universal_state:universeSnapshot(rows,{cutoff:x.at})});
  }
  const after=aprenderNucleoEF004(changed);
  assert.equal(after.status,'experimental_model_frozen');
  assert.equal(after.model_sha256,original.model_sha256);
  assert.deepEqual(after.model.models.map(m=>m.model),original.model.models.map(m=>m.model));
  assert.deepEqual(after.model.models.map(m=>m.validation),
    original.model.models.map(m=>m.validation));
  assert.notDeepEqual(after.model.models.map(m=>m.holdout),
    original.model.models.map(m=>m.holdout));
});
test('EF004 ausencias del futuro no se convierten en valores cero',()=>{
  const snapshots=synthetic(100);
  const last=snapshots.at(-1);
  const states=last.universal_state.states.filter(x=>x.variable!=='B_close');
  snapshots[snapshots.length-1]=sellarCaptura({...last,
    universal_state:universeSnapshot(states,{cutoff:last.at})});
  const result=aprenderNucleoEF004(snapshots);
  assert.equal(result.status,'experimental_model_frozen');
  const b=result.trajectory[0].states.find(x=>x.variable==='B_close'||x.key===
    result.model.models.find(m=>m.variable==='B_close').key);
  assert.equal(b.status,'abstained');
  assert.equal(result.production_activation_allowed,false);
});
test('EF004 las capturas saltadas cortan la serie continua en lugar de interpolar',()=>{
  const caps=synthetic(60).filter((x,i)=>i!==48);
  const panel=prepararHistoria(caps);
  assert.ok(panel.discarded_due_to_gap>0);
  const x=aprenderNucleoEF004(caps);
  assert.equal(x.status,'abstained');
  assert.equal(x.reason,'insufficient_independent_capture_history');
});
test('EF004 rechaza capturas duplicadas, sellos corruptos y fechas adelantadas',()=>{
  const caps=synthetic(2);
  assert.throws(()=>prepararHistoria([caps[0],caps[0]]),/misma hora/);
  const invalid=structuredClone(caps[0]);
  invalid.universal_state.states[0].value=1e20;
  assert.throws(()=>estadoDeCaptura(invalid),/modificada|sello/);
  const invalid2=structuredClone(caps[0]);
  invalid2.universal_state.states[0].known_at=iso(START+3*HOUR);
  assert.throws(()=>estadoDeCaptura(invalid2),/modificada|sello/);
});
test('EF004 un reporte macro trimestral repetido no es un objetivo intradía',()=>{
  const caps=synthetic(60);
  const historic=iso(START-50*24*HOUR);
  for(let i=0;i<caps.length;i++){
    const c=caps[i];
    caps[i]=sellarCaptura({...c,universal_state:universeSnapshot([
      ...c.universal_state.states,
      {id:'quarter-2026-Q2',domain:'banca_bis_locacional',variable:'CREDIT_Q2',
        value:1000,unit:'USD_million',observed_at:historic,
        known_at:c.at,source_url:'https://data.bis.org/api/v2'}
    ],{cutoff:c.at})});
  }
  const panel=prepararHistoria(caps);
  const selected=extraerSeries(panel,{selectionEnd:40});
  assert.equal(selected.total_eligible,3);
  assert.ok(selected.excluded.some(x=>x.reason==='insufficient_training_updates'));
  assert.equal(aprenderNucleoEF004(caps).model.selected_series.some(s=>
    s.variable==='CREDIT_Q2'),false);
});
