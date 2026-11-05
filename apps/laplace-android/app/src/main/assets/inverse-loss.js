/* Reverse loss exploration: fix an adverse closing price, then inspect
 * conditions preceding past losses. Observational candidates are not causes.
 * No position, order, stop execution or calibrated tail probability. */
(function(root){
'use strict';
const finite=Number.isFinite,need=(ok,why)=>{if(!ok)throw Error(why);};
const schema='laplace-inverse-loss-v1',minimumEvents=8;
const safe=x=>finite(x)?x:null;
const ratio=(a,b)=>b>0?safe(a/b):null;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
function targetFor(f,{lossPct=2,direction='down'}={}){
 need(f&&finite(f.reference)&&f.reference>0&&Number.isSafeInteger(f.horizonBars)&&f.horizonBars>0&&
  Number.isSafeInteger(f.granularity)&&f.granularity>0&&finite(f.sourceCloseAt)&&
  finite(f.issuedAt)&&f.sourceCloseAt<=f.issuedAt,'Inverso: pronóstico inválido.');
 need(finite(lossPct)&&lossPct>0&&lossPct<100&&['down','up'].includes(direction),
  'Inverso: indica un movimiento mayor que 0 y menor que 100 %.');
 const sign=direction==='down'?-1:1,price=f.reference*(1+sign*lossPct/100);
 const logReturn=Math.log(price/f.reference),minimumRV=100*Math.abs(logReturn)/Math.sqrt(f.horizonBars);
 need(finite(price)&&price>0&&finite(logReturn)&&finite(minimumRV),'Inverso: objetivo no representable.');
 return {lossPct,direction,outcome:'target_close',price,priceMove:price-f.reference,
  cumulativeLogReturn:logReturn,minimumCloseToCloseRVPct:minimumRV,
  minimumRVToReferenceRatio:ratio(minimumRV,f.outputs?.[1]?.baseline)};
}
function historyBefore(rows,f){
 need(Array.isArray(rows),'Inverso: historial inválido.');
 const closed=[];
 for(const input of rows){
  const r=Array.isArray(input)?input:[input.time,input.low,input.high,input.open,input.close,input.volume];
  need(finite(r[0]),'Inverso: fecha inválida.');
  if(r[0]+f.granularity>Math.min(f.sourceCloseAt,f.issuedAt))continue;
  need(r.length===6&&r.every(finite)&&Number.isSafeInteger(r[0])&&r[0]>0&&r[0]%f.granularity===0&&
   r[1]>0&&r[2]>=r[1]&&r[3]>=r[1]&&r[3]<=r[2]&&r[4]>=r[1]&&r[4]<=r[2]&&r[5]>=0,
   'Inverso: vela inválida.');
  closed.push(r.slice());
 }
 closed.sort((a,b)=>a[0]-b[0]);
 for(let i=1;i<closed.length;i++)need(closed[i][0]>closed[i-1][0],'Inverso: velas duplicadas.');
 return closed;
}
function features(rows,i,h){
 const returns=[];for(let j=i-29;j<=i;j++)returns.push(Math.log(rows[j][4])-Math.log(rows[j-1][4]));
 const pastRMS=Math.sqrt(mean(returns.slice(0,24).map(r=>r*r)));
 const fastRMS=Math.sqrt(mean(returns.slice(24).map(r=>r*r)));
 const pastVolume=mean(rows.slice(i-29,i-5).map(r=>r[5]));
 const fastVolume=mean(rows.slice(i-5,i+1).map(r=>r[5]));
 const recent=rows.slice(i-23,i+1),lo=Math.min(...recent.map(r=>r[1])),hi=Math.max(...recent.map(r=>r[2]));
 return {referenceVolatilityPct:100*Math.sqrt(mean(returns.slice(-24).map(r=>r*r))*h),
  referenceVolume:mean(recent.map(r=>r[5]))*h,
  momentum6Pct:safe(100*(rows[i][4]/rows[i-6][4]-1)),
  volumeRatio:ratio(fastVolume,pastVolume),volatilityRatio:ratio(fastRMS,pastRMS),
  rangeLocation:hi>lo?(rows[i][4]-lo)/(hi-lo):null};
}
function signals(x,direction){
 const down=direction==='down';return {
  adverse_momentum:finite(x.momentum6Pct)?(down?x.momentum6Pct<0:x.momentum6Pct>0):null,
  volume_expansion:finite(x.volumeRatio)?x.volumeRatio>=2:null,
  volatility_expansion:finite(x.volatilityRatio)?x.volatilityRatio>=2:null,
  adverse_range_edge:finite(x.rangeLocation)?(down?x.rangeLocation<=.2:x.rangeLocation>=.8):null};
}
const titles={adverse_momentum:'Movimiento reciente en dirección adversa',volume_expansion:'Volumen reciente duplicado',
 volatility_expansion:'Volatilidad reciente duplicada',adverse_range_edge:'Cierre junto al extremo adverso del rango'};
const keys=['referenceVolatilityPct','referenceVolume','momentum6Pct','volumeRatio','volatilityRatio','rangeLocation'];
const statusFor=(b,available)=>b.cases===0?'insufficient_history':b.lossCases<minimumEvents||b.otherCases<minimumEvents?
 'insufficient_event_history':available?'historical_candidates':'limited_current_context';
function analyze(f,{rows=[],lossPct=2,direction='down',mode='issued',historyAsset=f.asset,historyGranularity=f.granularity}={}){
 need(['issued','retrospective'].includes(mode)&&historyAsset===f.asset&&historyGranularity===f.granularity,
  'Inverso: contexto histórico incompatible.');
 const target=targetFor(f,{lossPct,direction}),bars=historyBefore(rows,f),h=f.horizonBars;
 const gaps=[0];for(let i=1;i<bars.length;i++)gaps[i]=gaps[i-1]+Number(bars[i][0]-bars[i-1][0]!==f.granularity);
 const continuous=(a,b)=>a>=0&&b<bars.length&&gaps[a]===gaps[b];
 const currentIndex=bars.length-1;
 const currentAvailable=currentIndex>=30&&continuous(currentIndex-30,currentIndex)&&
  bars[currentIndex][0]+f.granularity===f.sourceCloseAt&&bars[currentIndex][4]===f.reference;
 if(bars.length&&bars[currentIndex][0]+f.granularity===f.sourceCloseAt)
  need(bars[currentIndex][4]===f.reference,'Inverso: cierre de referencia incompatible.');
 const current=currentAvailable?features(bars,currentIndex,h):{
  referenceVolatilityPct:finite(f.outputs?.[1]?.baseline)?f.outputs[1].baseline:null,
  referenceVolume:finite(f.outputs?.[2]?.baseline)?f.outputs[2].baseline:null,
  momentum6Pct:null,volumeRatio:null,volatilityRatio:null,rangeLocation:null};
 const examples=[];
 // Complete target windows do not overlap. Input windows still can; their
 // non-overlap is not proof of statistical independence.
 for(let i=30;i+h<bars.length;i+=h){
  if(!continuous(i-30,i+h))continue;
  const origin=bars[i],end=bars[i+h],threshold=origin[4]*(1+(direction==='down'?-1:1)*lossPct/100);
  examples.push({originCloseAt:origin[0]+f.granularity,targetCloseAt:end[0]+f.granularity,
   reference:origin[4],actual:end[4],returnPct:100*(end[4]/origin[4]-1),
   event:direction==='down'?end[4]<=threshold:end[4]>=threshold,features:features(bars,i,h)});
 }
 const losses=examples.filter(e=>e.event),others=examples.length-losses.length,currentSignals=signals(current,direction);
 const drivers=Object.keys(titles).map(id=>{
  let eventsWithSignal=0,otherWithSignal=0;
  for(const e of examples)if(signals(e.features,direction)[id])e.event?eventsWithSignal++:otherWithSignal++;
  const shareAmongLosses=ratio(eventsWithSignal,losses.length),shareAmongOthers=ratio(otherWithSignal,others);
  return {id,title:titles[id],currentPresent:currentSignals[id],eventsWithSignal,otherWithSignal,
   shareAmongLosses,shareAmongOthers,contrast:shareAmongLosses!==null&&shareAmongOthers!==null?shareAmongLosses-shareAmongOthers:null,
   interpretation:'observational_association_not_cause'};
 }).sort((a,b)=>(b.contrast??-2)-(a.contrast??-2)||a.id.localeCompare(b.id));
 const scales={};for(const key of keys){const xs=examples.map(e=>e.features[key]).filter(finite),m=xs.length?mean(xs):0;
  scales[key]=xs.length?Math.max(1e-9,Math.sqrt(mean(xs.map(x=>(x-m)**2)))):1;}
 const known=keys.filter(k=>finite(current[k]));
 const candidates=losses.map(e=>({...e,distance:known.length?Math.sqrt(mean(known.map(k=>finite(e.features[k])?
  Math.min(100,Math.abs((e.features[k]-current[k])/scales[k]))**2:10000))):null}))
  .sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)||b.targetCloseAt-a.targetCloseAt).slice(0,3);
 const interval=f.outputs?.[0],outsideInterval=!!interval&&(target.price<interval.lower||target.price>interval.upper);
 const reviewReasons=[];
 if(outsideInterval)reviewReasons.push('scenario_outside_central_price_interval');
 if(losses.length<minimumEvents||others<minimumEvents)reviewReasons.push('insufficient_historical_event_comparison');
 if(!currentAvailable)reviewReasons.push('current_precursor_window_unavailable');
 if(drivers.some(d=>d.currentPresent))reviewReasons.push('candidate_precursors_currently_present');
 return {schema,policyVersion:1,asset:f.asset,granularity:f.granularity,horizonBars:h,mode,
  asOf:f.issuedAt,knownThrough:f.sourceCloseAt,target,currentFeatures:current,currentWindowAvailable:currentAvailable,
  history:{closedBars:bars.length,firstOpenAt:bars[0]?.[0]??null,lastCloseAt:bars.at(-1)?.[0]+f.granularity||null,
   cases:examples.length,lossCases:losses.length,otherCases:others,nonoverlappingTargets:true,independenceProven:false},
  status:statusFor({cases:examples.length,lossCases:losses.length,otherCases:others},currentAvailable),
  drivers,candidates,reviewReasons,inputProgramSHA256:f.programSHA256??null,
  probabilityOfLoss:null,causalStatus:'not_identified',predictiveValidation:'not_established',
  protection:{mode:'scenario_review_only',positionKnown:false,ordersAuthorized:false,
   lossUnit:'underlying_price_change_not_account_pnl',intraperiodLossesCovered:false}};
}
function validate(a,f){
 need(a?.schema===schema&&a.policyVersion===1&&a.asset===f.asset&&a.granularity===f.granularity&&
  a.horizonBars===f.horizonBars&&a.asOf===f.issuedAt&&a.knownThrough===f.sourceCloseAt&&
  ['issued','retrospective'].includes(a.mode)&&a.probabilityOfLoss===null&&a.causalStatus==='not_identified'&&
  a.predictiveValidation==='not_established'&&a.inputProgramSHA256===(f.programSHA256??null),
  'Inverso: informe inválido.');
 const target=targetFor(f,a.target);
 need(Object.keys(target).every(k=>a.target[k]===target[k]),'Inverso: objetivo contradictorio.');
 const b=a.history;
 need(b&&['closedBars','cases','lossCases','otherCases'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0)&&
  b.lossCases+b.otherCases===b.cases&&b.cases<=Math.max(0,Math.floor((b.closedBars-31)/f.horizonBars))&&
  b.nonoverlappingTargets===true&&b.independenceProven===false&&
  (b.closedBars===0?b.firstOpenAt===null&&b.lastCloseAt===null:
   finite(b.firstOpenAt)&&b.firstOpenAt>0&&finite(b.lastCloseAt)&&b.firstOpenAt<b.lastCloseAt&&b.lastCloseAt<=f.sourceCloseAt),
  'Inverso: historia o fechas contradictorias.');
 const validFeatures=x=>x&&keys.every(k=>Object.hasOwn(x,k)&&(x[k]===null||finite(x[k])))&&
  ['referenceVolatilityPct','referenceVolume','volumeRatio','volatilityRatio'].every(k=>x[k]===null||x[k]>=0)&&
  (x.rangeLocation===null||x.rangeLocation>=0&&x.rangeLocation<=1);
 need(validFeatures(a.currentFeatures)&&typeof a.currentWindowAvailable==='boolean'&&
  (!a.currentWindowAvailable||b.lastCloseAt===f.sourceCloseAt)&&a.status===statusFor(b,a.currentWindowAvailable),
  'Inverso: condiciones actuales contradictorias.');
 if(a.currentWindowAvailable&&f.riskDiagnostics){
  const window=f.riskDiagnostics.inputWindow;
  need(Array.isArray(window)&&window.length===31,'Inverso: falta la ventana de señales actual.');
  const expected=features(window,30,f.horizonBars);
  need(keys.every(k=>expected[k]===a.currentFeatures[k]),'Inverso: señales actuales no corresponden a la ventana guardada.');
 }
 const currentSignals=signals(a.currentFeatures,a.target.direction);
 need(Array.isArray(a.drivers)&&a.drivers.length===4&&new Set(a.drivers.map(d=>d.id)).size===4&&a.drivers.every(d=>
  Object.hasOwn(titles,d.id)&&d.title===titles[d.id]&&d.currentPresent===currentSignals[d.id]&&
  Number.isSafeInteger(d.eventsWithSignal)&&d.eventsWithSignal>=0&&d.eventsWithSignal<=b.lossCases&&
  Number.isSafeInteger(d.otherWithSignal)&&d.otherWithSignal>=0&&d.otherWithSignal<=b.otherCases&&
  d.shareAmongLosses===ratio(d.eventsWithSignal,b.lossCases)&&d.shareAmongOthers===ratio(d.otherWithSignal,b.otherCases)&&
  d.contrast===(d.shareAmongLosses!==null&&d.shareAmongOthers!==null?d.shareAmongLosses-d.shareAmongOthers:null)&&
  d.interpretation==='observational_association_not_cause'),'Inverso: condiciones contradictorias.');
 need(Array.isArray(a.candidates)&&a.candidates.length<=3&&a.candidates.length<=b.lossCases&&a.candidates.every(c=>
  finite(c.originCloseAt)&&c.originCloseAt>0&&c.targetCloseAt===c.originCloseAt+horizonSeconds(f)&&
  c.targetCloseAt<=f.sourceCloseAt&&finite(c.reference)&&c.reference>0&&finite(c.actual)&&c.actual>0&&
  c.event===true&&c.returnPct===100*(c.actual/c.reference-1)&&
  (a.target.direction==='down'?c.actual<=c.reference*(1-a.target.lossPct/100):c.actual>=c.reference*(1+a.target.lossPct/100))&&
  validFeatures(c.features)&&(c.distance===null||finite(c.distance)&&c.distance>=0)), 'Inverso: trayectoria o fecha contradictoria.');
 const reasons=[],interval=f.outputs?.[0];
 if(interval&&(a.target.price<interval.lower||a.target.price>interval.upper))reasons.push('scenario_outside_central_price_interval');
 if(b.lossCases<minimumEvents||b.otherCases<minimumEvents)reasons.push('insufficient_historical_event_comparison');
 if(!a.currentWindowAvailable)reasons.push('current_precursor_window_unavailable');
 if(a.drivers.some(d=>d.currentPresent))reasons.push('candidate_precursors_currently_present');
 need(Array.isArray(a.reviewReasons)&&JSON.stringify(a.reviewReasons)===JSON.stringify(reasons),'Inverso: revisión contradictoria.');
 need(a.protection?.mode==='scenario_review_only'&&a.protection.positionKnown===false&&a.protection.ordersAuthorized===false&&
  a.protection.lossUnit==='underlying_price_change_not_account_pnl'&&a.protection.intraperiodLossesCovered===false,
  'Inverso: protección no autorizada.');
 return a;
}
const horizonSeconds=f=>f.horizonBars*f.granularity;
root.LaplaceInverseLoss={analyze,validate,targetFor};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LaplaceInverseLoss;
})(typeof window!=='undefined'?window:globalThis);
