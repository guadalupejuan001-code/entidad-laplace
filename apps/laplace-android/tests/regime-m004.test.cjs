const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const M=require('../app/src/main/assets/regime-m004.js');
const archive=path.resolve(__dirname,'../../../evidencia/entrenamiento-x002-20261030/velas.json');
const iso=t=>new Date(t*1000).toISOString();
const START=Date.parse('2026-09-01T00:00:00Z')/1000;
function candles(count=7200,g=300,{shock=false}={}){
  let p=50000;const rows=[];
  for(let i=0;i<count;i++){
    const old=p,regime=i%1300>650?.0018:.00024;
    const move=regime*Math.sin(i*.23)+regime*.6*Math.cos(i*.037);
    p*=Math.exp(move);
    rows.push([START+i*g,Math.min(old,p)*.998,
      Math.max(old,p)*1.002,old,p,40+3*Math.sin(i*.11)**2+(shock&&i>count*.85?45:0)]);
  }
  return rows;
}
const cutoff=r=>iso(r.at(-1)[0]+300);
test('M004 reconoce regímenes con umbrales provenientes del pasado y no declara causalidad',()=>{
 const c=candles(),current=M.currentRegime(c,{cutoff:cutoff(c)});
 assert.equal(current.schema,'laplace-m004-current-v1');
 assert.equal(current.status,'observed_regime');
 assert.ok(['low','normal','high'].includes(current.regime.volatility));
 assert.ok(['up','down','range'].includes(current.regime.trend));
 assert.ok(['high','normal'].includes(current.regime.activity));
 assert.ok(current.thresholds.trained_rows>100);
 assert.equal(current.directional_forecast,null);
 assert.equal(current.magnitude_forecast,null);
 assert.equal(current.can_predict,false);
 assert.equal(current.labels_are_statistical_not_causes,true);
 assert.equal(current.automatic_trading,false);
});
test('M004 rechaza velas abiertas, inválidas y duplicadas; no rellena silenciosamente',()=>{
 const rows=candles(600),cut=cutoff(rows);
 assert.equal(M.normalize(rows,{cutoff:cut}).length,rows.length);
 assert.throws(()=>M.normalize([...rows,rows.at(-1)],{cutoff:cut}),/repetidas/);
 assert.throws(()=>M.normalize([...rows,[rows.at(-1)[0]+300,...rows.at(-1).slice(1)]],
   {cutoff:cut}),/abierta|futuro/);
 const bad=structuredClone(rows);bad[20][1]=-1;
 assert.throws(()=>M.normalize(bad,{cutoff:cut}),/inválida/);
 assert.throws(()=>M.evaluateRegimes(rows,{horizonMinutes:13,cutoff:cut}),/desconocido/);
});
test('M004 no aprovecha una decisión cuyo resultado cruza un hueco temporal',()=>{
 const rows=candles(900),g=300;
 const complete=M.rowsWithLabels(rows,{horizonMinutes:15,cutoff:cutoff(rows)});
 const missing=rows.filter((_,i)=>i!==480);
 const partial=M.rowsWithLabels(missing,{horizonMinutes:15,cutoff:cutoff(rows)});
 assert.ok(partial.samples.length<complete.samples.length);
 assert.ok(partial.samples.every(x=>x.dueAt>x.decisionAt));
 const affected=partial.samples.filter(x=>x.index>=470&&x.index<=485);
 assert.equal(affected.length,0);
});
test('M004 compara 3 periodos separados y nunca selecciona con holdout futuro',()=>{
 const c=candles(7488),r=M.evaluateRegimes(c,{horizonMinutes:60,cutoff:cutoff(c)});
 assert.equal(r.schema,M.SCHEMA);
 assert.equal(r.raw_bars,7488);
 assert.equal(r.horizon_minutes,60);
 assert.equal(r.folds.length,3);
 assert.ok(r.independent_test_cases>=M.PLAN.minHoldout*3);
 for(const f of r.folds){
   assert.equal(f.status,'retrospective_measured');
   assert.equal(f.holdout_not_used_for_selection,true);
   assert.equal(f.selection_from,'validation_only');
   assert.equal(f.label_purge_verified,true);
   assert.ok(f.counts.training>f.counts.validation);
   assert.ok(f.test_cases.every(x=>Date.parse(x.outcome_at)>Date.parse(x.decision_at)));
   assert.ok(f.holdout.selected_mae_bps>=0);
   assert.ok(f.holdout.baseline_mae_bps>=0);
   assert.ok(f.holdout.exploratory_p80_coverage>=0&&
      f.holdout.exploratory_p80_coverage<=1);
   assert.equal(f.production_activation_allowed,false);
 }
 assert.equal(r.automatic_trading,false);
 assert.equal(r.never_changes_original_price,true);
 assert.equal(r.financial_advantage_demonstrated,false);
 assert.equal(r.prospective_validated,false);
});
test('cambiar solamente el futuro no altera decisiones o modelo en la primera ventana',()=>{
 const c=candles(7488),change=structuredClone(c);
 for(let i=6500;i<change.length;i++){
   const row=change[i],close=row[4]*1.2,open=row[3]*1.2;
   change[i]=[row[0],Math.min(open,close)*.997,Math.max(open,close)*1.003,
     open,close,row[5]];
 }
 const a=M.evaluateRegimes(c,{horizonMinutes:15,cutoff:cutoff(c)});
 const d=M.evaluateRegimes(change,{horizonMinutes:15,cutoff:cutoff(change)});
 assert.deepEqual(a.folds[0],d.folds[0]);
 assert.notDeepEqual(a.folds[2].test_cases,d.folds[2].test_cases);
});
test('horizonte largo sin etiquetas suficientes resulta abstención, no precio',()=>{
 const c=candles(600,86400);
 const r=M.evaluateRegimes(c,{granularity:86400,
   horizonMinutes:129600,cutoff:iso(c.at(-1)[0]+86400)});
 assert.equal(r.status,'insufficient_holdout_evidence');
 assert.equal(r.independent_test_cases,0);
 assert.equal(r.production_activation_allowed,false);
});
test('bolsa trata cambios de sesión y fines de semana como barras, sin exigir 24 horas',()=>{
 const base=START;const rows=[];let p=100;
 for(let day=0;day<55;day++){
   const dt=new Date((base+day*86400)*1000),dayOfWeek=dt.getUTCDay();
   if(dayOfWeek===0||dayOfWeek===6)continue;
   for(let k=0;k<78;k++){
     const time=base+day*86400+13*3600+30*60+k*300;
     const open=p;p*=Math.exp(.0006*Math.sin(rows.length*.06));
     rows.push([time,Math.min(open,p)*.999,Math.max(open,p)*1.001,open,p,20+k]);
   }
 }
 const c=M.currentRegime(rows,{granularity:300,equity:true,
   cutoff:iso(rows.at(-1)[0]+300)});
 assert.equal(c.status,'observed_regime');
 assert.equal(c.market,'equity');
 const data=M.rowsWithLabels(rows,{granularity:300,equity:true,
   horizonMinutes:60,cutoff:iso(rows.at(-1)[0]+300)});
 assert.ok(data.samples.length>120);
});
test('captura auténtica X002: registrar resultado sin afirmar precisión demostrada',()=>{
 const data=JSON.parse(fs.readFileSync(archive,'utf8'));
 const digest=crypto.createHash('sha256').update(JSON.stringify(data.rows)).digest('hex');
 assert.equal(digest,data.rows_sha256);
 assert.equal(data.reference_availability,'historical_candle_close_is_assumed_not_attested');
 const r=M.evaluateRegimes(data.rows,{horizonMinutes:15,cutoff:data.cutoff});
 assert.equal(r.raw_bars,7488);
 assert.equal(r.status!=='insufficient_holdout_evidence',true);
 assert.equal(r.automatic_trading,false);
 assert.equal(r.financial_advantage_demonstrated,false);
 assert.equal(r.never_changes_original_price,true);
 assert.equal(r.folds.filter(x=>x.status==='retrospective_measured').length,3);
});
