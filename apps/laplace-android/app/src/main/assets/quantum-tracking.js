/* Immutable LQT forecasts and evaluation; the learner runs only in native XI. */
(function(root){
'use strict';
const E=root.LaplaceMath??(typeof require==='function'?require('./engine.js'):null);
const M=root.LaplaceMarkets??(typeof require==='function'?require('./market-universe.js'):null);
const need=(ok,why)=>{if(!ok)throw Error(why);},finite=Number.isFinite;
const names=['price','volatility','volume'];
function validate(f,now=Date.now()/1000){
 need(f?.schema==='laplace-lqt-record-v1'&&typeof f.id==='string'&&f.id.length>0&&f.id.length<=160&&
  E.ALLOWED_ASSETS.includes(f.asset)&&f.market===(M.isEquity(f.asset)?'equity':'crypto')&&
  ['pending','verified'].includes(f.status),'Registro LQT inválido.');
 need(E.selectResolution(f.minutes,f.asset)===f.granularity&&f.horizonBars===f.minutes*60/f.granularity&&
  Number.isSafeInteger(f.originTime)&&f.originTime>0&&f.originTime%f.granularity===0&&
  f.sourceCloseAt===f.originTime+f.granularity&&finite(f.issuedAt)&&f.sourceCloseAt<=f.issuedAt&&f.issuedAt<=now&&
  finite(f.reference)&&f.reference>0,'Fechas o referencia LQT inválidas.');
 need(f.sourceCloseAt+f.horizonBars*f.granularity>f.issuedAt,'El período no era futuro al emitirlo.');
 need(f.market==='equity'?f.targetCloseAt===null:f.targetCloseAt===f.sourceCloseAt+f.horizonBars*f.granularity,
  'Objetivo LQT contradictorio.');
 need(typeof f.checkpointSHA256==='string'&&/^[a-f0-9]{64}$/.test(f.checkpointSHA256)&&
  typeof f.kernelSHA256==='string'&&/^[a-f0-9]{64}$/.test(f.kernelSHA256)&&
  finite(f.probabilityUp)&&f.probabilityUp>0&&f.probabilityUp<1,'Modelo LQT inválido.');
 need(Array.isArray(f.outputs)&&f.outputs.length===3&&f.outputs.every(x=>x&&
  ['predicted','baseline','lower','upper'].every(k=>finite(x[k])&&x[k]>=0)&&x.lower<=x.upper),
  'Predicciones LQT inválidas.');
 const tr=f.training,te=tr?.test;
 need(tr&&Number.isSafeInteger(tr.updates)&&tr.updates>0&&tr.updates<=10000000&&
  Number.isSafeInteger(tr.onlineUpdates)&&tr.onlineUpdates>=0&&tr.onlineUpdates<=tr.updates&&
  [0,3,12].includes(tr.selectedTemporalLag)&&finite(tr.initialTestThrough)&&tr.initialTestThrough<=f.issuedAt&&
  tr.updatedRotations===1000&&[1795,2735,2780].includes(tr.graphEdges)&&
  Number.isSafeInteger(tr.calibrationCases)&&tr.calibrationCases>=12&&tr.calibrationCases<=64&&
  finite(tr.nativeMilliseconds)&&tr.nativeMilliseconds>=0&&
  te&&Number.isSafeInteger(te.cases)&&te.cases>=8&&te.cases<=64&&
  Number.isSafeInteger(te.directionCorrect)&&te.directionCorrect>=0&&te.directionCorrect<=te.cases&&
  finite(te.brier)&&te.brier>=0&&te.brier<=1&&Array.isArray(te.outputs)&&te.outputs.length===3&&te.outputs.every(x=>
   x&&finite(x.mae)&&x.mae>=0&&finite(x.baselineMAE)&&x.baselineMAE>=0&&finite(x.intervalCoverage)&&
   x.intervalCoverage>=0&&x.intervalCoverage<=1.000000001),'Entrenamiento LQT inválido.');
 if(f.status==='verified')need(Array.isArray(f.measurement)&&f.measurement.length===3&&
  f.measurement.every(x=>x&&finite(x.actual)&&x.actual>=0)&&f.measurement[0].actual>0&&
  finite(f.observedCloseAt)&&f.observedCloseAt>f.issuedAt&&f.observedCloseAt<=now&&
  (f.market==='equity'||f.observedCloseAt===f.targetCloseAt),'Resultados LQT inválidos.');
 return f;
}
function freeze(result,{issuedAt=Date.now()/1000,id=null}={}){
 need(result?.schema==='laplace-lqt1000-v1'&&result.quantum===true&&result.qubits===1000&&
  result.components===1&&result.updatedRotations===1000&&result.checkpointSaved===true,
  'El núcleo no devolvió un aprendizaje LQT guardado y verificable.');
 const f={schema:'laplace-lqt-record-v1',id:id??root.crypto?.randomUUID?.()??String(Date.now()),status:'pending',
  asset:result.asset,market:result.market,minutes:result.minutes,granularity:result.granularity,
  horizonBars:result.horizonBars,originTime:result.originTime,sourceCloseAt:result.sourceCloseAt,
  issuedAt,targetCloseAt:result.targetCloseAt,reference:result.reference,outputs:result.outputs,
  probabilityUp:result.probabilityUp,checkpointSHA256:result.checkpointSHA256,kernelSHA256:result.kernelSHA256,
  training:{updates:result.updates,onlineUpdates:result.onlineUpdates,selectedTemporalLag:result.selectedTemporalLag,
   initialTestThrough:result.initialTestThrough,test:result.test,nativeMilliseconds:result.nativeMilliseconds,
   updatedRotations:result.updatedRotations,graphEdges:result.graphEdges,calibrationCases:result.calibrationCases}};
 validate(f,issuedAt);return JSON.parse(JSON.stringify(f));
}
function measure(f,actual){return actual.map((value,i)=>({actual:value,error:Math.abs(f.outputs[i].predicted-value),
 baselineError:Math.abs(f.outputs[i].baseline-value),insideInterval:value>=f.outputs[i].lower&&value<=f.outputs[i].upper}));}
function continuous(a,b,g,asset){return b.time-a.time===g||(M.isEquity(asset)&&b.time>a.time&&
 (g===86400?b.time-a.time<10*86400:b.time-a.time<5*86400&&
  new Date(a.time*1000).toLocaleDateString('en-CA',{timeZone:'America/New_York'})!==
  new Date(b.time*1000).toLocaleDateString('en-CA',{timeZone:'America/New_York'})));}
function evaluate(records,raw,{asset,granularity,now=Date.now()/1000}){
 const bars=E.candlesFromCoinbase(raw,granularity).filter(b=>b.time+granularity<=now);let evaluated=0;
 const updated=records.map(f=>{
  if(f.status!=='pending'||f.asset!==asset||f.granularity!==granularity)return f;
  const i=bars.findIndex(b=>b.time===f.originTime),end=i+f.horizonBars;
  if(i<0||end>=bars.length)return f;
  let squared=0,volume=0;
  for(let j=i+1;j<=end;j++){
   if(!continuous(bars[j-1],bars[j],granularity,asset))return f;
   squared+=Math.log(bars[j].close/bars[j-1].close)**2;volume+=bars[j].volume;
  }
  const closeAt=bars[end].time+granularity;
  if(closeAt<=f.issuedAt||closeAt>now||(f.market==='crypto'&&closeAt!==f.targetCloseAt))return f;
  evaluated++;return {...f,status:'verified',observedCloseAt:closeAt,checkedAt:now,
   measurement:measure(f,[bars[end].close,100*Math.sqrt(squared),volume])};
 });return {records:updated,evaluated};
}
function summarize(records,s){
 const cohort=records.filter(f=>f.asset===s.asset&&f.minutes===s.minutes&&f.granularity===s.granularity),
  done=cohort.filter(f=>f.status==='verified');
 return {cases:done.length,pending:cohort.length-done.length,
  mae:names.map((_,i)=>done.length?done.reduce((t,f)=>t+f.measurement[i].error/done.length,0):null),
  baselineMAE:names.map((_,i)=>done.length?done.reduce((t,f)=>t+f.measurement[i].baselineError/done.length,0):null),
  directionCases:done.filter(f=>f.measurement[0].actual!==f.reference).length,
  directionCorrect:done.filter(f=>Math.sign(f.outputs[0].predicted-f.reference)===Math.sign(f.measurement[0].actual-f.reference)&&
   f.measurement[0].actual!==f.reference).length,
  brier:done.length?done.reduce((t,f)=>t+(f.probabilityUp-Number(f.measurement[0].actual>f.reference))**2/done.length,0):null};
}
function importEvidence(current,text,{now=Date.now()/1000}={}){
 need(typeof text==='string'&&new TextEncoder().encode(text).length<=8*1024*1024,'Respaldo de hasta 8 MiB.');
 const data=JSON.parse(text);need(data?.schema==='laplace-lqt-backup-v1'&&Array.isArray(data.records)&&data.records.length<=20000,
  'Selecciona un respaldo LQT de Laplace.');
 const ids=new Set(current.map(x=>x.id)),incoming=new Set(),added=[];let duplicates=0;
 for(const input of data.records){
  const f=JSON.parse(JSON.stringify(validate(input,now)));need(!incoming.has(f.id),'Identificador duplicado dentro del archivo.');incoming.add(f.id);
  if(ids.has(f.id)){duplicates++;continue;}
  if(f.status==='verified')f.measurement=measure(f,f.measurement.map(x=>x.actual));
  f.importedFromFile=true;added.push(f);
 }
 return {records:[...current,...added],added:added.length,duplicates,model:data.model??null};
}
root.LaplaceQuantumTracking={freeze,validate,evaluate,summarize,importEvidence,names};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LaplaceQuantumTracking;
})(typeof window!=='undefined'?window:globalThis);
