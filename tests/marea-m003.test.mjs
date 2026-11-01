import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararVelasMarea,muestrasMarea,investigarMarea,ajustarMarea,estimarMarea,
  MAREA_GROUPS,MAREA_PLAN,MAREA_SCHEMA
} from '../experimentos/marea-m003.mjs';
const PERIOD=300,DAY=288,START=Date.parse('2026-09-01T00:00:00Z')/1000;
function candles(days=26){
  let p=10000,prior=0;
  return Array.from({length:days*DAY},(_,i)=>{
    const t=START+i*PERIOD,open=p,
      signal=Math.sin(.03*i)+.45*Math.cos(.013*i),
      value=.0007*prior+.00065*signal+.00025*Math.cos(i*.41);
    p*=Math.exp(value);prior=value;
    const low=Math.min(p,open)*.9997,high=Math.max(p,open)*1.0003,
      volume=50+10*(1+Math.sin(.13*i))+4*Math.abs(signal);
    return [t,low,high,open,p,volume];
  });
}
const cutoff=rows=>new Date((rows.at(-1)[0]+300)*1000).toISOString();

test('M003 exige velas cerradas, proveedor verificable y horas coherentes',()=>{
  const rows=candles(2),cut=cutoff(rows);
  const parsed=prepararVelasMarea(rows,{cutoff:cut});
  assert.equal(parsed.bars.length,576);
  assert.equal(parsed.gaps,0);
  assert.match(parsed.rows_sha256,/^[a-f0-9]{64}$/);
  assert.equal(parsed.historical_reference_availability_not_attested,true);
  const duplicated=[...rows,rows[0]];
  assert.throws(()=>prepararVelasMarea(duplicated,{cutoff:cut}),/duplicadas/);
  const extra=[...rows,[rows.at(-1)[0]+300,...rows.at(-1).slice(1)]];
  assert.throws(()=>prepararVelasMarea(extra,{cutoff:cut}),/abiertas/);
  const bad=structuredClone(rows);bad[12][3]=bad[12][2]*2;
  assert.throws(()=>prepararVelasMarea(bad,{cutoff:cut}),/incoherente/);
  assert.throws(()=>prepararVelasMarea(rows,{cutoff:cut,granularity:60}),/cinco minutos/);
});
test('M003 produce rasgos de pasado y etiquetas que nunca atraviesan huecos',()=>{
  const source=candles(5),p=prepararVelasMarea(source,{cutoff:cutoff(source)});
  const without=source.filter((_,i)=>i!==210);
  const missing=prepararVelasMarea(without,{cutoff:cutoff(source)});
  assert.equal(missing.gaps,1);
  const samples=muestrasMarea(missing,12);
  assert.ok(samples.length>0);
  assert.ok(samples.every(s=>missing.gapPrefix[s.index+12]===
    missing.gapPrefix[s.index-25]));
  assert.ok(samples.every(s=>Date.parse(s.due_at)>Date.parse(s.decision_at)));
  assert.ok(samples.every(s=>s.features.length===10&&s.features.every(Number.isFinite)));
  assert.ok(samples.length<muestrasMarea(p,12).length);
});
test('M003 registra hipótesis, placebo, ablaciones y tres folds verdaderos sin trading',()=>{
  const rows=candles(),result=investigarMarea(rows,{cutoff:cutoff(rows)});
  assert.equal(result.schema,MAREA_SCHEMA);
  assert.equal(result.observed_candles,7488);
  assert.equal(result.gaps,0);
  assert.equal(result.production_activation_allowed,false);
  assert.equal(result.automatic_trading,false);
  assert.equal(result.future_results_not_causation,true);
  assert.equal(Object.keys(MAREA_GROUPS).length,4);
  assert.equal(MAREA_PLAN.folds,3);
  for(const horizon of result.experiments){
    assert.equal(horizon.folds.length,3);
    assert.equal(horizon.stability.folds_evaluated,3);
    assert.ok(horizon.analyzed_nonoverlapping_outcomes>100);
    assert.equal(horizon.signal_causality_proven,false);
    assert.equal(horizon.can_promote_to_price_engine,false);
    for(const fold of horizon.folds){
      assert.equal(fold.status,'retrospective_research_only');
      assert.equal(fold.training.purge_confirmed,true);
      // La última vela del train puede cerrar exactamente cuando abre el test.
      assert.ok(fold.validation.registered_candidates===15);
      assert.equal(fold.validation.chosen_from_holdout,false);
      assert.ok(fold.training.last_training_label_at<=fold.test_start);
      assert.ok(fold.training.last_validation_label_at<=fold.test_start);
      assert.ok(fold.regime_threshold_from_training>=0);
      assert.equal(Object.keys(fold.group_ablations).length,4);
      assert.ok(fold.scores.selected.mae_bps>=0);
      assert.ok(fold.scores.persistence.mae_bps>=0);
      assert.ok(fold.scores.shifted_label_placebo.mae_bps>=0);
      assert.ok(fold.cases.every(x=>Date.parse(x.due_at)>Date.parse(x.decision_at)));
      const times=fold.cases.map(x=>Date.parse(x.due_at));
      assert.ok(times.every((x,i)=>i===0||x-times[i-1]>=horizon.horizon_minutes*60000));
      assert.equal(fold.production_activation_allowed,false);
    }
  }
});
test('cambiar datos futuros no puede alterar entrenamiento ni predicción del primer fold',()=>{
  const original=candles(),mutated=structuredClone(original);
  for(let i=22*DAY;i<mutated.length;i++){
    const row=mutated[i],open=row[3],close=row[4]*1.018;
    mutated[i]=[row[0],Math.min(row[1],open,close)*.9999,
      Math.max(row[2],open,close)*1.0001,open,close,row[5]];
  }
  const before=investigarMarea(original,{cutoff:cutoff(original),horizons:[3]});
  const after=investigarMarea(mutated,{cutoff:cutoff(mutated),horizons:[3]});
  const a=before.experiments[0].folds[0],b=after.experiments[0].folds[0];
  assert.equal(a.training.full_model_sha256,b.training.full_model_sha256);
  assert.equal(a.training.inertia_model_sha256,b.training.inertia_model_sha256);
  assert.deepEqual(a.validation,b.validation);
  assert.deepEqual(a.cases,b.cases);
  assert.notEqual(before.input_rows_sha256,after.input_rows_sha256);
});
test('si la historia no contiene los cortes requeridos, M003 se abstiene',()=>{
  const rows=candles(8),report=investigarMarea(rows,{cutoff:cutoff(rows)});
  assert.ok(report.experiments.every(e=>e.status==='insufficient_independent_evidence'));
  assert.ok(report.experiments.every(e=>e.folds.every(x=>x.status==='abstained')));
});
test('un hueco de velas no desplaza las fechas UTC de entrenar ni los 3 tests',()=>{
  const original=candles(),broken=original.filter((_,i)=>i!==500);
  const before=investigarMarea(original,{cutoff:cutoff(original),horizons:[12]});
  const after=investigarMarea(broken,{cutoff:cutoff(original),horizons:[12]});
  const base=before.experiments[0].folds,missing=after.experiments[0].folds;
  assert.equal(after.gaps,1);
  assert.equal(base.length,3);
  assert.deepEqual(base.map(x=>x.test_start),missing.map(x=>x.test_start));
  assert.deepEqual(base.map(x=>x.test_end_exclusive),missing.map(x=>x.test_end_exclusive));
  assert.ok(missing.every(x=>x.status==='retrospective_research_only'));
});
test('no aceptar etiquetas, índices o proyecciones ajenas al modelo',()=>{
  const rows=candles(2),p=prepararVelasMarea(rows,{cutoff:cutoff(rows)});
  const samples=muestrasMarea(p,1),indexes=[0,1,2];
  const model=ajustarMarea(samples.slice(0,60),indexes);
  assert.equal(model.trained_samples,60);
  assert.ok(Number.isFinite(estimarMarea(model,samples[75].features)));
  assert.throws(()=>ajustarMarea(samples.slice(0,10),indexes),/faltan muestras/);
  assert.throws(()=>ajustarMarea(samples.slice(0,60),[2,2]),/índices/);
  assert.throws(()=>muestrasMarea(p,5),/horizonte/);
  assert.throws(()=>estimarMarea(model,[1]),/rasgos/);
});
