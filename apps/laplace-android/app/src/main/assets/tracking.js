/* Registro prospectivo local. La cercanía de precio y el acierto de dirección
 * son métricas diferentes. Nunca evalúa con ticks ni con velas aún abiertas. */
(function(root){
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function valid(f){
  return f&&typeof f.id==='string'&&typeof f.asset==='string'&&
    finite(f.issuedAt)&&finite(f.sourceTime)&&finite(f.estimate)&&f.estimate>0&&
    finite(f.baseline)&&f.baseline>0&&finite(f.granularity)&&f.granularity>0&&
    (f.market==='equity'?Number.isSafeInteger(f.horizonBars)&&f.horizonBars>0:
      finite(f.targetAt)&&f.targetAt>0);
}
function metrics(f){
  if(f.status!=='verified'||!finite(f.actual)||f.actual<=0||
     !finite(f.estimate)||f.estimate<=0||!finite(f.baseline)||f.baseline<=0)return null;
  const signed=f.estimate-f.actual,absolute=Math.abs(signed);
  const baselineError=Math.abs(f.baseline-f.actual);
  const predictedDirection=Math.sign(f.estimate-f.baseline);
  const actualDirection=Math.sign(f.actual-f.baseline);
  return {signedError:signed,absoluteError:absolute,
    errorPercent:100*absolute/f.actual,signedErrorPercent:100*signed/f.actual,
    baselineError,baselineErrorPercent:100*baselineError/f.actual,
    improvement:baselineError-absolute,
    directionCorrect:predictedDirection===actualDirection,
    predictedDirection,actualDirection,
    inRange:finite(f.low)&&finite(f.high)?f.actual>=f.low&&f.actual<=f.high:null,
    observationDelay:finite(f.targetAt)?f.observedCloseAt-f.targetAt:null};
}
function evaluate(records,bars,{asset,granularity,now=Date.now()/1000}={}){
  const closed=bars.filter(b=>finite(b.time)&&finite(b.close)&&b.close>0&&
    b.time+granularity<=now).slice().sort((a,b)=>a.time-b.time);
  let evaluated=0;
  const updated=records.map(original=>{
    if(original.status!=='pending'||original.asset!==asset||
       original.granularity!==granularity||!valid(original))return original;
    const f={...original};let bar;
    if(f.market==='equity'){
      const origin=closed.findIndex(b=>b.time+granularity===f.sourceCloseAt);
      // Sin el origen no conocemos cuántas sesiones faltan: seguir pendiente.
      if(origin<0)return original;
      const target=origin+f.horizonBars;
      bar=closed[target];
      if(!bar)return original;
      for(let i=origin+1;i<=target;i++){
        const a=closed[i-1],b=closed[i],gap=b.time-a.time;
        const day=t=>new Date(t*1000).toLocaleDateString('en-CA',{
          timeZone:'America/New_York'});
        if(gap!==granularity&&!(granularity===86400?gap<10*86400:
          day(a.time)!==day(b.time)&&gap<5*86400))return original;
      }
    }else{
      if(now<f.targetAt)return original;
      bar=closed.find(b=>b.time+granularity>=f.targetAt&&
        b.time+granularity<f.targetAt+granularity);
      if(!bar)return original;
    }
    // No se puede llamar prospectivo a un objetivo conocido al emitirlo.
    if(bar.time+granularity<=f.issuedAt)return original;
    f.actual=bar.close;f.observedCloseAt=bar.time+granularity;
    f.checkedAt=now;f.resultSource=f.market==='equity'?
      'Yahoo Chart · cierre indicativo':'Coinbase Exchange · cierre OHLCV';
    f.status='verified';const m=metrics(f);
    f.modelError=m.absoluteError;f.baselineError=m.baselineError;
    evaluated++;return f;
  });
  return {records:updated,evaluated,pending:updated.filter(f=>f.status==='pending').length};
}
function summarize(records,tolerance=.5){
  const measured=records.map(metrics).filter(Boolean),n=measured.length;
  const errors=measured.map(m=>m.errorPercent).sort((a,b)=>a-b);
  return {total:records.length,evaluated:n,pending:records.filter(f=>f.status==='pending').length,
    correctDirections:measured.filter(m=>m.directionCorrect).length,
    near:measured.filter(m=>m.errorPercent<=tolerance).length,tolerance,
    meanErrorPercent:n?errors.reduce((a,b)=>a+b,0)/n:null,
    medianErrorPercent:n?(errors[Math.floor((n-1)/2)]+errors[Math.ceil((n-1)/2)])/2:null,
    beatsBaseline:measured.filter(m=>m.improvement>0).length};
}
const api={valid,metrics,evaluate,summarize};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.LaplaceTracking=api;
})(typeof window!=='undefined'?window:globalThis);
