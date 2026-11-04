/* M005: future realized volatility and traded volume, using M001's five
 * features and distance scales. Policies are selected before the test block. */
(function(root){
'use strict';
const E=root.LaplaceMath??(typeof require==='function'?require('./engine.js'):null);
const M=root.LaplaceMarkets??(typeof require==='function'?require('./market-universe.js'):null);
const KEY='laplace-activity-forecast-v1',LOOKBACK=24,MIN_CASES=8;
const finite=Number.isFinite,need=(ok,m)=>{if(!ok)throw Error(m)};
const mean=a=>a.length?a.reduce((s,x)=>s+x/a.length,0):null;
const blend=(base,analog,weight)=>base*(1-weight)+analog*weight;
function prepare(raw,{asset='BTC-USD',granularity=300,minutes=15,asOf=null}={}){
 need(E.ALLOWED_ASSETS.includes(asset),'Activo no autorizado.');
 need(E.selectResolution(minutes,asset)===granularity,'Resolución incompatible con el plazo.');
 const bars=E.candlesFromCoinbase(raw,granularity),h=minutes*60/granularity;
 need(Number.isSafeInteger(h)&&h>0,'Plazo inválido.');
 const market=M?.isEquity(asset)?'equity':'crypto';
 if(asOf!==null)need(finite(asOf)&&bars.every(b=>b.time+granularity<=asOf),'Se requieren velas cerradas al corte.');
 const squared=[0],volume=[0],gaps=[0],features=[];
 const day=t=>new Date(t*1000).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
 for(let i=0;i<bars.length;i++){
  volume.push(volume[i]+bars[i].volume);
  if(i){
   const gap=bars[i].time-bars[i-1].time;
   const continuous=gap===granularity||(market==='equity'&&gap>0&&
     (granularity===86400?gap<10*86400:gap<5*86400&&day(bars[i].time)!==day(bars[i-1].time)));
   gaps.push(gaps[i-1]+Number(!continuous));
   squared.push(squared[i-1]+Math.log(bars[i].close/bars[i-1].close)**2);
  }
  features.push(i>=LOOKBACK&&gaps[i]===gaps[i-LOOKBACK]?E.featureAt(bars,i,granularity,asset):null);
 }
 const target=i=>{
  if(i+h>=bars.length||gaps[i+h]!==gaps[i])return null;
  return {volatility:100*Math.sqrt(Math.max(0,squared[i+h]-squared[i])),
    volume:volume[i+h+1]-volume[i+1]};
 };
 const baseline=i=>({volatility:100*Math.sqrt(Math.max(0,(squared[i]-squared[i-LOOKBACK])/LOOKBACK*h)),
   volume:(volume[i+1]-volume[i+1-LOOKBACK])/LOOKBACK*h});
 const scales=E.SCALES.map((s,i)=>i===4?s:s*Math.sqrt(granularity/300));
 function at(i){
  if(!features[i])return null;
  const candidates=[];
  for(let j=LOOKBACK;j+h<i;j++){
   if(!features[j])continue;const observed=target(j);if(!observed)continue;
   const distance=Math.sqrt(mean(features[i].map((x,k)=>((x-features[j][k])/scales[k])**2)));
   if(finite(distance))candidates.push({index:j,distance,...observed});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.index-b.index);
  const selected=[];
  for(const c of candidates){if(selected.every(x=>Math.abs(x.index-c.index)>=h))selected.push(c);if(selected.length===18)break;}
  if(selected.length<MIN_CASES)return null;
  const weight=selected.reduce((s,x)=>s+1/(1+x.distance),0);
  return {baseline:baseline(i),analog:Object.fromEntries(['volatility','volume'].map(k=>[
   k,selected.reduce((s,x)=>s+x[k]/(1+x.distance)/weight,0)])),
   examples:selected.map(x=>({index:x.index,knownAt:bars[x.index+h].time+granularity,distance:x.distance}))};
 }
 return {bars,h,market,asset,granularity,minutes,at,target,gaps};
}
function score(cases,key,weight){
 const errors=cases.map(c=>Math.abs(blend(c.baseline[key],c.analog[key],weight)-c.actual[key]));
 const baseline=cases.map(c=>Math.abs(c.baseline[key]-c.actual[key]));
 const mae=mean(errors),reference=mean(baseline),actualSum=cases.reduce((s,c)=>s+c.actual[key],0);
 return {cases:cases.length,mae,baselineMAE:reference,skill:reference>0?1-mae/reference:null,
   wape:actualSum>0?100*errors.reduce((s,x)=>s+x,0)/actualSum:null};
}
function analyze(raw,options={}){
 const p=prepare(raw,options),n=p.bars.length;
 const trainEnd=Math.floor(n*.6),validationEnd=Math.floor(n*.8);
 const collect=(start,end)=>{
  const step=p.h*Math.max(1,Math.ceil((end-start)/(p.h*48))),out=[];
  for(let i=Math.max(LOOKBACK,start);i+p.h<end;i+=step){
   const model=p.at(i),actual=p.target(i);if(model&&actual)out.push({origin:p.bars[i].time,...model,actual});
  }return out;
 };
 const validation=collect(trainEnd,validationEnd);
 const base={schema:'laplace-activity-analysis-v1',asset:p.asset,market:p.market,
  minutes:p.minutes,granularity:p.granularity,horizonBars:p.h,
  dataKnownThrough:p.bars.at(-1).time+p.granularity,originTime:p.bars.at(-1).time,
  sourceRows:n,retrospective:true,prospectivelyValidated:false,automaticTrading:false,
  protocol:{lookback:LOOKBACK,minCases:MIN_CASES,trainEnd,validationEnd,
    candidateWeights:[0,.25,.5,.75,1],selection:'validation MAE only; per target',
    reference:'last 24 closed bars; RMS returns and mean volume, scaled to horizon'}};
 if(validation.length<MIN_CASES)return {...base,status:'abstained',reason:
  'Sólo '+validation.length+' casos de validación sin solapamiento para este plazo; se necesitan '+MIN_CASES+'.'};
 const weights={};
 for(const key of ['volatility','volume'])weights[key]=[0,.25,.5,.75,1].reduce((best,w)=>
  score(validation,key,w).mae<score(validation,key,best).mae-1e-12?w:best,0);
 const test=collect(validationEnd,n);
 if(test.length<MIN_CASES)return {...base,status:'abstained',weights,reason:
  'Sólo '+test.length+' casos posteriores de prueba; se necesitan '+MIN_CASES+'.'};
 const current=p.at(n-1);
 if(!current)return {...base,status:'abstained',reason:'Faltan ocho analogías conocidas o las últimas 24 velas cruzan un hueco.'};
 const outputs={};
 for(const key of ['volatility','volume'])outputs[key]={predicted:blend(current.baseline[key],current.analog[key],weights[key]),
  baseline:current.baseline[key],analog:current.analog[key],weight:weights[key],
  method:weights[key]===0?'recent_activity_reference':'M001_analogs_blended',
  validation:score(validation,key,weights[key]),test:score(test,key,weights[key])};
 return {...base,status:'forecast',weights,outputs,examples:current.examples,
  targetCloseAt:p.market==='crypto'?base.dataKnownThrough+p.h*p.granularity:null,
  evidence:test.map(c=>({origin:c.origin,actual:c.actual,baseline:c.baseline,
   predicted:Object.fromEntries(['volatility','volume'].map(k=>[k,blend(c.baseline[k],c.analog[k],weights[k])]))}))};
}
function freeze(result,{issuedAt=Date.now()/1000,id=null}={}){
 need(result?.status==='forecast','No hay pronóstico de actividad válido.');
 need(result.dataKnownThrough<=issuedAt,'El origen todavía no había cerrado.');
 need(result.market==='equity'||result.targetCloseAt>issuedAt,'El plazo ya pasó; actualiza las velas.');
 return {schema:KEY,id:id??(root.crypto?.randomUUID?.()??String(Date.now())),status:'pending',
  asset:result.asset,market:result.market,minutes:result.minutes,granularity:result.granularity,
  horizonBars:result.horizonBars,originTime:result.originTime,sourceCloseAt:result.dataKnownThrough,
  issuedAt,targetCloseAt:result.targetCloseAt,outputs:JSON.parse(JSON.stringify(result.outputs))};
}
function evaluate(records,raw,{asset,granularity,now=Date.now()/1000}={}){
 const cache=new Map();let evaluated=0;
 const updated=records.map(f=>{
  if(f.status!=='pending'||f.asset!==asset||f.granularity!==granularity)return f;
  if(!cache.has(f.minutes))cache.set(f.minutes,prepare(raw,{asset,granularity,minutes:f.minutes,asOf:now}));
  const p=cache.get(f.minutes),i=p.bars.findIndex(b=>b.time===f.originTime);
  if(i<0||i+p.h>=p.bars.length)return f;
  const actual=p.target(i),closeAt=p.bars[i+p.h].time+granularity;
  if(!actual||closeAt<=f.issuedAt||closeAt>now)return f;
  const measurement={};for(const key of ['volatility','volume'])measurement[key]={actual:actual[key],
    error:Math.abs(f.outputs[key].predicted-actual[key]),baselineError:Math.abs(f.outputs[key].baseline-actual[key])};
  evaluated++;return {...f,status:'verified',observedCloseAt:closeAt,checkedAt:now,measurement};
 });return {records:updated,evaluated};
}
function importEvidence(current,text,{now=Date.now()/1000}={}){
 need(typeof text==='string'&&new TextEncoder().encode(text).length<=8*1024*1024,'Archivo de hasta 8 MiB.');
 let input;try{input=JSON.parse(text)}catch{throw Error('JSON inválido.');}
 need(input?.schema==='laplace-activity-evidence-v1'&&Array.isArray(input.records)&&input.records.length<=20000,
  'Selecciona una exportación de actividad de LAPLACE.');
 for(const f of input.records){
  need(f?.schema===KEY&&typeof f.id==='string'&&f.id.length>0&&f.id.length<=160&&
   E.ALLOWED_ASSETS.includes(f.asset)&&f.market===(M?.isEquity(f.asset)?'equity':'crypto')&&
   ['pending','verified'].includes(f.status)&&finite(f.issuedAt)&&f.issuedAt<=now&&
   finite(f.sourceCloseAt)&&f.sourceCloseAt>0&&f.sourceCloseAt<=f.issuedAt&&Number.isSafeInteger(f.originTime)&&f.originTime%f.granularity===0&&
   f.sourceCloseAt===f.originTime+f.granularity&&
   E.selectResolution(f.minutes,f.asset)===f.granularity&&
   f.horizonBars===f.minutes*60/f.granularity,'Registro de actividad inválido.');
  if(f.market==='crypto')need(f.targetCloseAt===f.sourceCloseAt+f.horizonBars*f.granularity&&
    f.targetCloseAt>f.issuedAt,'Objetivo de actividad inválido.');
  for(const k of ['volatility','volume'])need(f.outputs?.[k]&&
    ['predicted','baseline'].every(v=>finite(f.outputs[k][v])&&f.outputs[k][v]>=0),'Previsión de actividad inválida.');
  if(f.status==='verified'){
   need(f.observedCloseAt>f.issuedAt&&f.observedCloseAt<=now&&
    (f.market==='equity'||f.observedCloseAt===f.targetCloseAt),'Cierre de actividad inválido.');
   for(const k of ['volatility','volume'])need(finite(f.measurement?.[k]?.actual)&&f.measurement[k].actual>=0,'Resultado de actividad inválido.');
  }
 }
 const records=current.slice(),ids=new Set(current.map(f=>f.id));let duplicates=0;
 for(const f of input.records){if(ids.has(f.id)){duplicates++;continue}ids.add(f.id);
  const copy=JSON.parse(JSON.stringify(f));copy.importedFromFile=true;
  if(copy.status==='verified')for(const k of ['volatility','volume']){
   const actual=copy.measurement[k].actual;copy.measurement[k]={actual,
    error:Math.abs(copy.outputs[k].predicted-actual),baselineError:Math.abs(copy.outputs[k].baseline-actual)};
  }records.push(copy);
 }return {records,added:records.length-current.length,duplicates};
}
const api={prepare,analyze,score,freeze,evaluate,importEvidence};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LaplaceActivity=api;
})(typeof window==='undefined'?globalThis:window);
