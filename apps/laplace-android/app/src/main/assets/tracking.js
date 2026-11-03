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
    observationDelay:finite(f.targetAt)&&finite(f.observedCloseAt)?f.observedCloseAt-f.targetAt:null};
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
  const pairs=records.map(f=>({f,m:metrics(f)})).filter(x=>x.m),
    measured=pairs.map(x=>x.m),n=measured.length;
  const errors=measured.map(m=>m.errorPercent).sort((a,b)=>a-b);
  const average=values=>values.length?values.reduce((sum,x)=>sum+x/values.length,0):null;
  const median=values=>values.length?(values[Math.floor((values.length-1)/2)]+
    values[Math.ceil((values.length-1)/2)])/2:null;
  // Nearest-rank P90. Show it only with at least ten measured records.
  const p90=values=>values.length>=10?values[Math.ceil(values.length*.9)-1]:null;
  const homogeneous=n>0&&new Set(pairs.map(({f})=>groupKey(f))).size===1;
  const absolute=measured.map(m=>m.absoluteError).sort((a,b)=>a-b);
  const baselineMean=average(measured.map(m=>m.baselineErrorPercent));
  const mean=average(errors);
  const delayed=measured.map(m=>m.observationDelay).filter(x=>finite(x)&&x>=0);
  const worst=pairs.reduce((best,x)=>!best||x.m.errorPercent>best.m.errorPercent?x:best,null);
  return {total:records.length,evaluated:n,pending:records.filter(f=>f.status==='pending').length,
    correctDirections:measured.filter(m=>m.directionCorrect).length,
    near:measured.filter(m=>m.errorPercent<=tolerance).length,tolerance,
    meanErrorPercent:mean,medianErrorPercent:median(errors),p90ErrorPercent:p90(errors),
    maxErrorPercent:n?errors[n-1]:null,
    meanBaselineErrorPercent:baselineMean,
    improvementPercent:baselineMean>0?100*(1-mean/baselineMean):null,
    meanSignedErrorPercent:average(measured.map(m=>m.signedErrorPercent)),
    beatsBaseline:measured.filter(m=>m.improvement>0).length,
    imported:records.filter(f=>f.importedFromFile).length,
    exactTime:delayed.filter(x=>x===0).length,delayedTime:delayed.filter(x=>x>0).length,
    unknownTime:n-delayed.length,maxDelaySeconds:delayed.length?delayed.reduce((a,b)=>Math.max(a,b),0):null,
    worst:worst?{id:worst.f.id,asset:worst.f.asset,minutes:worst.f.minutes,
      absoluteError:worst.m.absoluteError,errorPercent:worst.m.errorPercent}:null,
    price:homogeneous?{asset:pairs[0].f.asset,minutes:pairs[0].f.minutes,market:pairs[0].f.market??'crypto',
      mean:absolute.length?average(absolute):null,median:median(absolute),p90:p90(absolute),
      max:absolute[n-1],baselineMean:average(measured.map(m=>m.baselineError)),
      improvementPercent:average(measured.map(m=>m.baselineError))>0?
        100*(1-average(absolute)/average(measured.map(m=>m.baselineError))):null,
      signedBias:average(measured.map(m=>m.signedError))}:null};
}
function groupKey(f){return JSON.stringify([f.asset,f.minutes,f.granularity,f.market??'crypto'])}
function groups(records,tolerance=.5){
  const by=new Map();
  for(const f of records){const key=groupKey(f);if(!by.has(key))by.set(key,[]);by.get(key).push(f)}
  return [...by.values()].sort((a,b)=>a[0].asset.localeCompare(b[0].asset)||
    a[0].minutes-b[0].minutes||a[0].granularity-b[0].granularity)
    .map(rows=>({asset:rows[0].asset,minutes:rows[0].minutes,
      granularity:rows[0].granularity,market:rows[0].market??'crypto',...summarize(rows,tolerance)}));
}
function importEvidence(current,text,{allowedAssets,now=Date.now()/1000,name='Registro JSON'}={}){
  const need=(ok,message)=>{if(!ok)throw Error(message)};
  need(typeof text==='string'&&new TextEncoder().encode(text).length<=8*1024*1024,
    'El archivo debe ser JSON de hasta 8 MiB.');
  let parsed;try{parsed=JSON.parse(text)}catch{throw Error('El archivo no contiene JSON válido.')}
  need(parsed&&['laplace-local-evidence-v3','laplace-local-evidence-v4'].includes(parsed.schema)&&
    Array.isArray(parsed.records),'Selecciona un registro JSON exportado por LAPLACE.');
  need(parsed.records.length<=20000,'Importa como máximo 20.000 registros por archivo.');
  // Validate the whole file before changing even one record. Never trust exported metrics.
  for(const [i,f]of parsed.records.entries()){
    need(f&&valid(f)&&f.id.length>0&&f.id.length<=160&&
      ['pending','verified'].includes(f.status)&&['crypto','equity'].includes(f.market)&&
      finite(f.minutes)&&f.minutes>0&&[300,3600,86400].includes(f.granularity)&&
      f.issuedAt>=0&&f.sourceTime>=0&&f.sourceTime<=f.issuedAt&&f.issuedAt<=now&&
      (!allowedAssets||allowedAssets.includes(f.asset)),
      'Registro '+(i+1)+': identidad, activo, fechas o precios inválidos.');
    if(f.market==='crypto')need(f.targetAt>f.issuedAt,'Registro '+(i+1)+': objetivo anterior a su emisión.');
    if(f.status==='verified')need(metrics(f)&&finite(f.observedCloseAt)&&
      f.observedCloseAt>f.issuedAt&&f.observedCloseAt<=now&&
      (f.market==='equity'||(f.observedCloseAt>=f.targetAt&&f.observedCloseAt<f.targetAt+f.granularity)),
      'Registro '+(i+1)+': cierre de evaluación inválido.');
  }
  const records=current.slice(),ids=new Set(current.map(f=>f.id));let duplicates=0;
  for(const f of parsed.records){
    if(ids.has(f.id)){duplicates++;continue}
    ids.add(f.id);records.push({...f,importedFromFile:{name:String(name).slice(0,160),at:now}});
  }
  return {records,added:records.length-current.length,duplicates};
}
const api={valid,metrics,evaluate,summarize,groups,importEvidence};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.LaplaceTracking=api;
})(typeof window!=='undefined'?window:globalThis);
