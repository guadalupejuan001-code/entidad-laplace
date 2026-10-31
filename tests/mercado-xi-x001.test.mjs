import test from 'node:test';
import assert from 'node:assert/strict';
import {stateAt,rowsFromBars,experiment,X001_SCHEMA} from '../experimentos/mercado-xi-x001.mjs';
const binary=process.env.LAPLACE_TEMPORAL,native={skip:binary?false:'requiere ejecutor temporal nativo'};
const STEP=300,start=Math.floor(Date.parse('2026-01-01T00:00:00Z')/1000);
function synthetic(n=900){
  const bars=[];let p=100,v=20;
  for(let i=0;i<n;i++){
    // Regímenes de 12 barras: seis al alza, seis a la baja. La dirección
    // inmediata queda reflejada en el estado compacto, pero el prior global ~50%.
    const phase=i%12,ret=phase<6?0.002:-0.002;
    const open=p;p*=Math.exp(ret);v=phase===0||phase===6?40:20;
    bars.push([start+i*STEP,Math.min(open,p)*0.9999,Math.max(open,p)*1.0001,open,p,v]);
  }
  return bars;
}
test('estado X001 usa solo seis barras pasadas y cabe exactamente en 4 bits',()=>{
  const b=synthetic(20);
  assert.equal(stateAt(b,5),null);
  for(let i=6;i<b.length;i++){const s=stateAt(b,i);assert.ok(Number.isInteger(s)&&s>=0&&s<16)}
  const rows=rowsFromBars(b,6,18);assert.ok(rows.length>0);
  assert.ok(rows.every(r=>r.mask>=0&&r.mask<16&&(r.y===0||r.y===1)));
});
test('cambiar una vela futura no cambia estados ya construidos',()=>{
  const a=synthetic(40),before=rowsFromBars(a,6,20);
  const b=a.map(x=>[...x]);b[30][4]*=3;b[30][2]=Math.max(b[30][2],b[30][4]);
  assert.deepEqual(rowsFromBars(b,6,20),before);
});
test('XI/Ether aprende y puntua la dirección en un conjunto reservado',native,()=>{
  const bars=synthetic(900),cutoff=new Date((bars.at(-1)[0]+300)*1000).toISOString();
  const r=experiment(binary,bars,{cutoff,folds:4});
  assert.equal(r.schema,X001_SCHEMA);assert.equal(r.production_changed,false);
  assert.equal(r.orders_executed,0);assert.ok(r.native.direction_count>80);
  assert.ok(r.native.brier<r.baseline.brier);
  assert.ok(r.native.accuracy>r.baseline.accuracy);
  assert.ok(r.folds===4);
  assert.equal(r.fold_results.length,4);assert.equal(r.alpha_selection_metric,'transition_log_loss');
  for(const f of r.fold_results){
    const selected=f.validation.find(x=>x.alpha===f.selected_alpha);
    assert.ok(f.validation.every(x=>selected.transition_log_loss<=x.transition_log_loss));
  }
});
