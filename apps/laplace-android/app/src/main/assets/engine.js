/* LAPLACE Android v2 — M001 restaurado.
 * Port fiel del núcleo de analogos de seguimiento/modelo.mjs:
 * cinco rasgos, distancia normalizada, hasta 18 analogos separados,
 * promedio ponderado de retornos logaritmicos. Sin AR(1) ni fallback
 * de precio persistente disfrazado de candidato.
 * Datos reales obtenidos por HTTPS nativo (Coinbase). No opera dinero.
 */
(function(root){
'use strict';
const HORIZONS=Object.freeze([
  {minutes:15,label:'15 min'}, {minutes:30,label:'30 min'},
  {minutes:60,label:'1 hora'}, {minutes:240,label:'4 horas'},
  {minutes:300,label:'5 horas'}, {minutes:720,label:'12 horas'},
  {minutes:1440,label:'24 horas'}, {minutes:2880,label:'2 días'},
  {minutes:4320,label:'3 días'}, {minutes:10080,label:'7 días'},
  {minutes:20160,label:'14 días'}
]);
const ALLOWED_ASSETS=Object.freeze(['BTC-USD','ETH-USD','SOL-USD']);
const HISTORICAL_CONFIG=Object.freeze({
  300:Object.freeze({days:7,label:'5 min',expectedMax:2016}),
  3600:Object.freeze({days:50,label:'1 hora',expectedMax:1200}),
  86400:Object.freeze({days:300,label:'1 día',expectedMax:300})
});
const SCALES=Object.freeze([.007,.004,.004,.006,1.5]);
const MAX_ANALOGS=18,MIN_ANALOGS=8,FEATURE_BARS=6;
const check=(ok,message)=>{if(!ok)throw Error(message)};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function selectResolution(minutes){
  check(HORIZONS.some(h=>h.minutes===minutes),'Horizonte no admitido.');
  return minutes<=240?300:minutes<=1440?3600:86400;
}
function quantile(a,q){
  if(!a.length)return null;
  const xs=[...a].sort((a,b)=>a-b),pos=q*(xs.length-1);
  const lo=Math.floor(pos),hi=Math.ceil(pos);
  return xs[lo]+(xs[hi]-xs[lo])*(pos-lo);
}
function candlesFromCoinbase(input,granularity){
  check(Array.isArray(input),'La fuente no entregó velas.');
  check(Object.hasOwn(HISTORICAL_CONFIG,granularity),'Resolución no admitida.');
  const map=new Map();
  for(const v of input){
    const r=Array.isArray(v)?v:[v?.time,v?.low,v?.high,v?.open,v?.close,v?.volume];
    if(!r||r.length<6)continue;
    const [time,low,high,open,close,volume]=r.slice(0,6).map(Number);
    if(![time,low,high,open,close,volume].every(finite)||
      !Number.isSafeInteger(time)||time<=0||time%granularity!==0||
      low<=0||high<low||open<low||open>high||close<low||close>high||
      volume<0)continue;
    const item={time,low,high,open,close,volume};
    const previous=map.get(time);
    check(!previous||Object.keys(item).every(k=>item[k]===previous[k]),
      'Fuente devolvió velas contradictorias.');
    map.set(time,item);
  }
  const candles=[...map.values()].sort((a,b)=>a.time-b.time);
  check(candles.length>0,'Sin velas válidas; no inventar cotizaciones.');
  return candles;
}
function featureAt(bars,index,granularity){
  if(index<FEATURE_BARS)return null;
  for(let k=index-FEATURE_BARS+1;k<=index;k++)
    if(bars[k].time-bars[k-1].time!==granularity)return null;
  const returns=[];
  for(let k=index-FEATURE_BARS+1;k<=index;k++)
    returns.push(Math.log(bars[k].close/bars[k-1].close));
  const volume=mean(bars.slice(index-FEATURE_BARS+1,index+1).map(b=>b.volume));
  return [
    Math.log(bars[index].close/bars[index-3].close),
    Math.log(bars[index].close/bars[index-1].close),
    Math.sqrt(mean(returns.map(x=>x*x))),
    mean(bars.slice(index-2,index+1).map(b=>(b.high-b.low)/b.close)),
    volume>0?bars[index].volume/volume:1
  ];
}
function hasContinuousWindow(bars,start,end,granularity){
  for(let k=start+1;k<=end;k++)
    if(bars[k].time-bars[k-1].time!==granularity)return false;
  return true;
}
/* Solo ejemplos cuyo resultado era conocido en el instante anchor.
 * Compatible con los cinco rasgos y pesos inversos originales de M001.
 */
function analogsAt(bars,anchor,granularity,horizonBars,{limit=MAX_ANALOGS}={}){
  const current=featureAt(bars,anchor,granularity);
  if(!current)return {reason:'No hay seis velas consecutivas recientes.',analogs:[]};
  const scales=SCALES.map((s,i)=>i===4?s:s*Math.sqrt(granularity/300));
  const candidates=[];
  for(let i=FEATURE_BARS;i+horizonBars<anchor;i++){
    const previous=featureAt(bars,i,granularity);
    if(!previous||!hasContinuousWindow(bars,i,i+horizonBars,granularity))continue;
    const distance=Math.sqrt(mean(current.map((x,k)=>
      ((x-previous[k])/scales[k])**2)));
    const gain=Math.log(bars[i+horizonBars].close/bars[i].close);
    if(finite(distance)&&finite(gain))
      candidates.push({index:i,distance,returnLog:gain,
        start:bars[i].time,end:bars[i+horizonBars].time});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.index-b.index);
  const selected=[];
  for(const entry of candidates){
    if(selected.every(other=>Math.abs(other.index-entry.index)>=horizonBars))
      selected.push(entry);
    if(selected.length===limit)break;
  }
  if(selected.length<MIN_ANALOGS)
    return {reason:'Solo '+selected.length+' patrones independientes; se necesitan '+MIN_ANALOGS+'.',
      analogs:selected,features:current};
  const total=selected.reduce((sum,a)=>sum+1/(1+a.distance),0);
  const expected=selected.reduce((sum,a)=>sum+a.returnLog/(1+a.distance),0)/total;
  const returns=selected.map(a=>a.returnLog);
  return {reason:null,analogs:selected,features:current,
    returnLog:expected,
    lowerReturn:quantile(returns,.1),upperReturn:quantile(returns,.9),
    method:'M001_analogos_ponderados_v2',
    scales:scales,
    independentPatterns:selected.length};
}
function backtest(bars,granularity,horizonBars){
  const first=Math.max(FEATURE_BARS+2,Math.floor(bars.length*.75));
  let total=0,candidateErrors=0,referenceErrors=0,directions=0,correct=0;
  const results=[];
  for(let i=first;i+horizonBars<bars.length;i+=horizonBars){
    if(!hasContinuousWindow(bars,i,i+horizonBars,granularity))continue;
    const pred=analogsAt(bars,i,granularity,horizonBars);
    if(pred.reason!==null)continue;
    const initial=bars[i].close,actual=bars[i+horizonBars].close;
    const estimated=initial*Math.exp(pred.returnLog);
    if(![initial,actual,estimated].every(finite))continue;
    const e=Math.abs(estimated-actual),r=Math.abs(initial-actual);
    candidateErrors+=e;referenceErrors+=r;
    if(Math.sign(estimated-initial)===Math.sign(actual-initial))correct++;
    directions++;total++;
    results.push({decidedAt:bars[i].time,observedAt:bars[i+horizonBars].time,
      candidate:estimated,observed:actual,baseline:initial,error:e,baselineError:r});
  }
  const mae=total?candidateErrors/total:null,baselineMAE=total?referenceErrors/total:null;
  return {evaluated:total,candidateMAE:mae,baselineMAE,
    skill:baselineMAE>0?1-mae/baselineMAE:null,
    correctDirections:correct,validDirections:directions,
    independentProspectiveValidation:false,
    method:'walk_forward_chronological_non_overlapping_targets',
    ...{results:results.slice(-30)}};
}
function analyze(raw,{granularity,horizonMinutes,asset='BTC-USD'}={}){
  check(ALLOWED_ASSETS.includes(asset),'Activo no autorizado.');
  check(Object.hasOwn(HISTORICAL_CONFIG,granularity),'Granularidad inválida.');
  check(selectResolution(horizonMinutes)===granularity,
    'La resolución no corresponde al horizonte elegido.');
  const bars=candlesFromCoinbase(raw,granularity);
  const horizonBars=horizonMinutes*60/granularity;
  check(Number.isSafeInteger(horizonBars)&&horizonBars>=1,'Horizonte no múltiplo de la vela.');
  check(bars.length>=Math.max(70,horizonBars*MIN_ANALOGS+FEATURE_BARS+5),
    'Historial insuficiente para '+horizonMinutes+' minutos.');
  const last=bars.at(-1),current=analogsAt(bars,bars.length-1,granularity,horizonBars);
  const validation=backtest(bars,granularity,horizonBars);
  const ready=current.reason===null;
  return {asset,horizonMinutes,granularity,
    firstTime:bars[0].time,lastTime:last.time,observedLast:last.close,
    historyCount:bars.length,horizonBars,
    ready,reason:current.reason,features:current.features??null,
    examples:current.analogs.map(x=>({...x})),
    patterns:current.analogs.length,returnLog:ready?current.returnLog:null,
    lowerReturn:ready?current.lowerReturn:null,
    upperReturn:ready?current.upperReturn:null,
    validation,source:'Coinbase Exchange · OHLCV',
    algorithm:'M001_analogos_ponderados',noArtificialReturnFloor:true,
    worldwideSignalsUsedForModel:false,
    worldContextSeparate:true,automaticTrading:false,
    dataKnownThrough:last.time+granularity};
}
function forecast(model,{basePrice,sourceTime,sourceType='cierre de vela'}={}){
  check(model&&model.ready,'No hay modelo M001 con patrones suficientes.');
  check(finite(basePrice)&&basePrice>0,'Falta precio verificado.');
  check(finite(sourceTime)&&sourceTime>0,'Falta hora del precio.');
  const estimated=basePrice*Math.exp(model.returnLog);
  const a=basePrice*Math.exp(model.lowerReturn);
  const b=basePrice*Math.exp(model.upperReturn);
  check([estimated,a,b].every(finite)&&estimated>0&&a>0&&b>0,
    'Resultado numerico invalido.');
  return {asset:model.asset,minutes:model.horizonMinutes,
    fromPrice:basePrice,estimate:estimated,lower:Math.min(a,b),upper:Math.max(a,b),
    relativeChange:Math.exp(model.returnLog)-1,
    modelName:'M001 · análogos históricos',patterns:model.patterns,
    forecastTime:sourceTime+model.horizonMinutes*60,
    sourceTime,sourceType,baseline:basePrice,
    rangeLabel:'Cuantiles históricos exploratorios (NO probabilidades calibradas)',
    validation:model.validation,examples:model.examples,
    isGuarantee:false,automaticTrading:false,prospectivelyValidated:false};
}
const exported={HORIZONS,ALLOWED_ASSETS,HISTORICAL_CONFIG,SCALES,MAX_ANALOGS,
  selectResolution,candlesFromCoinbase,featureAt,analogsAt,backtest,analyze,forecast};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
root.LaplaceMath=exported;
})(typeof window!=='undefined'?window:globalThis);
