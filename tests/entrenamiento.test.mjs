import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TRAINING_PLAN,partitionPlan,horizonRows,sampleTraining,trainExperiment,verifyTrainingReport} from '../experimentos/entrenamiento-x002.mjs';
import {nativeRun,nativeProgram} from '../experimentos/mercado-xi-x001.mjs';
import {collectTrainingBars,replayTrainingBars} from '../tools/entrenar.mjs';
const binary=process.env.LAPLACE_TEMPORAL,native={skip:binary?false:'requiere ejecutor temporal nativo'};
const start=Date.parse('2026-01-01T00:00:00Z'),cutoff=new Date(start+26*86400000).toISOString();
function synthetic(){
  let p=100;return Array.from({length:26*288},(_,i)=>{
    const o=p;p*=Math.exp((i%12<6?1:-1)*0.001);
    return [start/1000+i*300,Math.min(o,p)*0.9999,Math.max(o,p)*1.0001,o,p,i%12===0?40:20];
  });
}
test('X002 declara cuatro particiones y parámetros que afectan a la emisión direccional',()=>{
  const p=partitionPlan(cutoff);assert.equal(p.training[1],p.validation[0]);
  assert.equal(p.validation[1],p.calibration[0]);assert.equal(p.calibration[1],p.test[0]);
  assert.equal(p.test[1],cutoff);assert.deepEqual(TRAINING_PLAN.horizons_minutes,[15,30,60,240,1440]);
  assert.throws(()=>partitionPlan('invalido'),/Corte/);
});
test('las etiquetas terminan dentro de su partición y no solapan por horizonte',()=>{
  const b=synthetic(),p=partitionPlan(cutoff);
  for(const h of TRAINING_PLAN.horizons_minutes){
    const rows=horizonRows(b,h,...p.test);assert.ok(rows.length);
    for(let i=0;i<rows.length;i++){
      assert.ok(rows[i].decision_at>=Date.parse(p.test[0]));assert.ok(rows[i].due_at<=Date.parse(p.test[1]));
      if(i)assert.ok(rows[i].decision_at>=rows[i-1].due_at);
    }
  }
});
test('las discontinuidades del histórico eliminan etiquetas sin inventar cierres',()=>{
  const b=synthetic(),p=partitionPlan(cutoff),rows=horizonRows(b,15,...p.test);
  const removed=b.filter((_,i)=>i!==rows[0].index+1),after=horizonRows(removed,15,...p.test);
  assert.ok(after.length<rows.length);assert.ok(!after.some(r=>r.decision_at===rows[0].decision_at));
});
test('el muestreo de entrenamiento es determinista, ordenado y conserva los extremos',()=>{
  const rows=Array.from({length:999},(_,i)=>({index:i})),a=sampleTraining(rows);
  assert.equal(a.length,256);assert.equal(a[0].index,0);assert.equal(a.at(-1).index,998);
  assert.deepEqual(a,sampleTraining(rows));assert.equal(new Set(a.map(x=>x.index)).size,256);
  assert.deepEqual(sampleTraining(rows,1),[{index:0}]);assert.throws(()=>sampleTraining(rows,257),/Presupuesto/);
});
test('la entrada nativa rechaza coerción de etiquetas, enlaces futuros y regularización inválida',()=>{
  assert.throws(()=>nativeProgram([{mask:0,y:null,link:false}],[],0),/Etiqueta/);
  assert.throws(()=>nativeProgram([{mask:0,y:1,link:true}],[],0),/Enlace/);
  assert.throws(()=>nativeProgram([{mask:0,y:1,link:false}],[],0,65),/Regularización/);
  assert.throws(()=>nativeProgram([{mask:0,y:1,link:false}],[{mask:'0',steps:0}],0),/Consultas/);
});
test('alpha no ajusta la emisión de paso cero; prior_strength sí cambia la probabilidad',native,()=>{
  const rows=Array.from({length:30},(_,i)=>({mask:i<10?0:1,y:i<10?1:0,link:false})),q=[{mask:0,steps:0}];
  const a=nativeRun(binary,rows,q,0,1),b=nativeRun(binary,rows,q,16,1),c=nativeRun(binary,rows,q,0,64);
  assert.equal(a.forecasts[0].trace[0].probability,b.forecasts[0].trace[0].probability);
  assert.notEqual(a.forecasts[0].trace[0].probability,c.forecasts[0].trace[0].probability);
});
test('entrena cinco horizontes en Ether y no recalibra con tres observaciones diarias',native,()=>{
  const r=trainExperiment(binary,synthetic(),{cutoff,compareM001:false});assert.ok(verifyTrainingReport(r));
  assert.equal(r.horizons.length,5);assert.equal(r.production_changed,false);
  for(const h of r.horizons){
    assert.equal(h.native_proof.backend,'original-inverse-ether-memory');
    assert.equal(h.native_proof.active_qubits,0);assert.ok(h.native.count>0);
    assert.equal(h.forecasts.length,h.observations.length);assert.ok(h.frozen.xi.includes('laplace_fit'));
  }
  assert.equal(r.horizons.at(-1).calibration_count,3);assert.equal(r.horizons.at(-1).calibrator.lambda,1);
  const changed=structuredClone(r);changed.horizons[0].forecasts[0].probability=0;
  assert.throws(()=>verifyTrainingReport(changed),/alterado/);
});
test('precios reservados no cambian selección, calibración ni el primer pronóstico de cada horizonte',native,()=>{
  const b=synthetic(),a=trainExperiment(binary,b,{cutoff,compareM001:false}),boundary=Date.parse(a.partitions.test[0]);
  const changed=b.map(row=>{const r=[...row];if((r[0]+300)*1000>boundary)for(let i=1;i<=4;i++)r[i]*=1.2;return r});
  const c=trainExperiment(binary,changed,{cutoff,compareM001:false});
  for(let i=0;i<5;i++){
    assert.equal(c.horizons[i].frozen_sha256,a.horizons[i].frozen_sha256);
    assert.deepEqual(c.horizons[i].forecasts[0],a.horizons[i].forecasts[0]);
  }
});
test('la captura archiva respuestas, registra recepción real y reproduce exactamente las velas',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'laplace-x002-'));
  try{
    const b=synthetic(),received='2026-01-28T00:00:00Z';
    const fetchImpl=async raw=>{
      const u=new URL(raw),first=Date.parse(u.searchParams.get('start')),last=Date.parse(u.searchParams.get('end'));
      return new Response(JSON.stringify(b.filter(r=>r[0]*1000>=first&&r[0]*1000<=last).reverse()));
    };
    const r=await collectTrainingBars(directory,{fetchImpl,now:()=>received,cutoff});
    assert.equal(r.sources.length,26);assert.equal(r.received_at,received);
    assert.deepEqual(replayTrainingBars(directory,r),r.rows);
    assert.equal(JSON.parse(readFileSync(join(directory,'plan.json'))).selection_before_download,true);
    const altered=structuredClone(r);altered.rows[0][4]=999;
    assert.throws(()=>replayTrainingBars(directory,altered),/diferente/);
  }finally{rmSync(directory,{recursive:true,force:true})}
});
