/* LAPLACE Mobile: motor exploratorio local, nunca promesa de precision bursatil.
 * Entrena una regresion AR(1) ridge solo con velas observadas, mantiene
 * test cronologico reservado y compara contra persistencia. El contexto
 * financiero mundial EF005 archivado NO se presenta como variable entrenada.
 */
(function(root){
'use strict';
const HORIZONS=Object.freeze([
  {hours:1,label:'1 hora'},{hours:5,label:'5 horas'},
  {hours:12,label:'12 horas'},{hours:24,label:'24 horas'},
  {hours:48,label:'2 días'},{hours:72,label:'3 días'},
  {hours:168,label:'7 días'},{hours:336,label:'14 días'}
]);
const ALLOWED_ASSETS=Object.freeze(['BTC-USD','ETH-USD','SOL-USD']);
function requireCondition(condition,message){if(!condition)throw new Error(message)}
function candlesFromCoinbase(input,granularity){
  requireCondition(Array.isArray(input),'La fuente no entregó velas.');
  requireCondition(granularity===3600||granularity===86400,'Resolución no admitida.');
  const byTime=new Map();
  for(const item of input){
    if(!Array.isArray(item)||item.length<6)continue;
    const [time,low,high,open,close,volume]=item.map(Number);
    if(![time,low,high,open,close,volume].every(Number.isFinite)||
      time<=0||low<=0||high<low||open<=0||close<=0||volume<0||
      close>high*1.001||close<low*.999)continue;
    byTime.set(time,{time,close,low,high,open,volume});
  }
  const out=[...byTime.values()].sort((a,b)=>a.time-b.time);
  requireCondition(out.length>0,'Sin velas válidas; no se inventaron valores.');
  return out;
}
function toReturns(candles){
  const out=[];
  for(let i=1;i<candles.length;i++){
    if(candles[i].time<=candles[i-1].time)continue;
    const r=Math.log(candles[i].close/candles[i-1].close);
    if(Number.isFinite(r))out.push(r);
  }
  return out;
}
function mean(xs){return xs.reduce((a,b)=>a+b,0)/xs.length}
function std(xs){const m=mean(xs);return Math.sqrt(mean(xs.map(v=>(v-m)*(v-m))))}
function fitAR1(rs,trainEnd){
  const x=[],y=[];
  for(let t=1;t<trainEnd;t++){x.push(rs[t-1]);y.push(rs[t])}
  requireCondition(x.length>=16,'Muy pocas transiciones para entrenar.');
  const mx=mean(x),my=mean(y),xx=x.reduce((s,v)=>s+(v-mx)**2,0);
  const xy=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0);
  const ridge=Math.max(1e-8,xx*.075);
  const beta=Math.max(-.95,Math.min(.95,xy/(xx+ridge)));
  return {intercept:my-beta*mx,beta,lambda:ridge,
    trainSigma:Math.max(1e-6,std(y)),transitions:x.length};
}
function analyze(candles,{intervalHours=1,asset='BTC-USD'}={}){
  requireCondition(ALLOWED_ASSETS.includes(asset),'Activo no autorizado.');
  requireCondition(intervalHours===1||intervalHours===24,'Resolución no compatible.');
  requireCondition(Array.isArray(candles),'No existen velas observadas.');
  const rows=candlesFromCoinbase(candles.map(c=>Array.isArray(c)?c:
    [c.time,c.low,c.high,c.open,c.close,c.volume]),intervalHours*3600);
  const returns=toReturns(rows);
  requireCondition(returns.length>=28,
    'Historial insuficiente para un test temporal; no se entrenó.');
  const trainEnd=Math.max(20,Math.floor(returns.length*.73));
  const fitted=fitAR1(returns,trainEnd);
  let sumCandidate=0,sumPersistence=0,pairs=0;
  for(let i=trainEnd;i<returns.length;i++){
    const actual=rows[i+1].close;
    const prior=rows[i].close;
    const next=Math.max(-.2,Math.min(.2,
      fitted.intercept+fitted.beta*returns[i-1]));
    const modeled=prior*Math.exp(next);
    if(!Number.isFinite(actual)||!Number.isFinite(modeled))continue;
    sumCandidate+=Math.abs(modeled-actual);
    sumPersistence+=Math.abs(prior-actual);
    pairs++;
  }
  requireCondition(pairs>=6,'No hay suficientes resultados reservados.');
  const modelMAE=sumCandidate/pairs,referenceMAE=sumPersistence/pairs;
  const skill=referenceMAE>0?1-modelMAE/referenceMAE:null;
  const selectsAR=skill!==null&&skill>.02;
  return Object.freeze({asset,intervalHours,granularity:intervalHours*3600,
    from:rows[0].time,to:rows[rows.length-1].time,
    lastPrice:rows[rows.length-1].close,latestTime:rows[rows.length-1].time,
    lastReturn:returns[returns.length-1],intercept:fitted.intercept,
    beta:fitted.beta,lambda:fitted.lambda,trainSigma:fitted.trainSigma,
    candlesUsed:rows.length,trainPairs:fitted.transitions,holdoutPairs:pairs,
    modelMAE,referenceMAE,skill,selected:selectsAR?'ar1_ridge':'persistence',
    description:selectsAR?'AR(1) ridge experimental':'Persistencia: no se demostró mejora del AR(1)',
    dataSource:'Coinbase Exchange · velas públicas',
    prospectiveValidation:false,intervalsCalibrated:false,
    worldwideFinancialModel:false,automaticTrading:false});
}
function forecast(model,horizonHours){
  requireCondition(HORIZONS.some(x=>x.hours===horizonHours),'Horizonte desconocido.');
  requireCondition(model&&[1,24].includes(model.intervalHours),'Entrena antes de calcular.');
  const steps=Math.ceil(horizonHours/model.intervalHours);
  let last=model.lastReturn,logChange=0;
  const trace=[];
  for(let i=0;i<steps;i++){
    const d=model.selected==='ar1_ridge'?
      Math.max(-.2,Math.min(.2,model.intercept+model.beta*last)):0;
    logChange+=d;last=d;
    trace.push({step:i+1,elapsedHours:Math.min(horizonHours,(i+1)*model.intervalHours),
      price:model.lastPrice*Math.exp(logChange)});
  }
  const estimate=model.lastPrice*Math.exp(logChange);
  const w=Math.min(5,1.96*model.trainSigma*Math.sqrt(steps));
  const lower=model.lastPrice*Math.exp(logChange-w);
  const upper=model.lastPrice*Math.exp(logChange+w);
  requireCondition([estimate,lower,upper].every(Number.isFinite),
    'Proyección numérica inválida; no se publicó.');
  return {hours:horizonHours,steps,fromPrice:model.lastPrice,estimate,
    lower,upper,trace,modelName:model.description,
    modelSelected:model.selected,sourceTime:model.latestTime,
    timeTarget:model.latestTime+horizonHours*3600,
    baseline:model.lastPrice,skill:model.skill,
    rangeLabel:'Rango exploratorio 95% NO calibrado',
    isGuarantee:false,isFinancialAdvice:false,automaticTrading:false,
    prospectivelyValidated:false};
}
function selectResolution(hours){return hours<=24?1:24}
const exported={HORIZONS,ALLOWED_ASSETS,candlesFromCoinbase,toReturns,
  analyze,forecast,selectResolution};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
root.LaplaceMath=exported;
})(typeof window!=='undefined'?window:globalThis);
