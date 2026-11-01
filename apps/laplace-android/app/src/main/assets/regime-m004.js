/* M004 - Estados financieros adaptativos y validación de magnitud.
 * El estado se obtiene EXCLUSIVAMENTE de velas cerradas conocidas al corte.
 * Etiquetas fuera de muestra / holdout nunca entrenan umbrales ni variantes.
 * No altera F001, F002, M001, M003, XI/Ether ni ejecuta órdenes.
 */
(function(root){
'use strict';
const SCHEMA='laplace-m004-regime-learning-v1';
const VERSION='2026-11-01-m004-research';
const HORIZONS=[5,15,30,60,120,240,300,480,720,1440,2880,4320,10080,20160,43200,129600];
const PLAN=Object.freeze({
  lookback:25,volWindow:24,trendWindow:12,
  folds:3,validationFraction:.12,minTraining:48,minValidation:18,
  minHoldout:18,minBucket:14,minGainOnValidation:.02,
  minimumStableFolds:2,minimumOverallGain:.02,
  foldStarts:[.70,.80,.90],foldEndFractions:[.80,.90,1],
  candidates:['volatility','volatility_trend','volatility_activity'],
  score:'MAE of absolute log returns, basis points',
  training:'chronological; targets must mature before each cut',
  knowledge:'historical_candle_close_assumption_not_attested',
  automatic_trading:false
});
const need=(p,m)=>{if(!p)throw Error(m)};
const finite=Number.isFinite;
const mean=x=>x.length?x.reduce((s,v)=>s+v,0)/x.length:null;
const round=(x,d=6)=>finite(x)?Number(x.toFixed(d)):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const quantile=(arr,p)=>{
  if(!arr.length)return null;
  const s=[...arr].sort((a,b)=>a-b),pos=p*(s.length-1),lo=Math.floor(pos),hi=Math.ceil(pos);
  return s[lo]+(s[hi]-s[lo])*(pos-lo);
};
const median=x=>quantile(x,.5);
const iso=t=>new Date(t*1000).toISOString();
const dateUtc=t=>new Date(t*1000).toISOString().slice(0,10);
const labelVol=v=>v==='high'?'Alta':v==='low'?'Baja':'Media';
const labelTrend=t=>t==='up'?'Alcista':t==='down'?'Bajista':'Sin tendencia definida';
function normalize(raw,{granularity=300,equity=false,cutoff=null}={}){
  need([300,3600,86400].includes(granularity),'resolución no soportada');
  need(Array.isArray(raw),'se necesita un historial de velas');
  const cut=cutoff===null?Infinity:Date.parse(cutoff)/1000;
  need(cutoff===null||finite(cut),'corte temporal inválido');
  const bars=[];
  for(const x of raw){
    const r=Array.isArray(x)?x:[x?.time,x?.low,x?.high,x?.open,x?.close,x?.volume];
    need(Array.isArray(r)&&r.length===6,'vela OHLCV incompleta');
    const [t,low,high,open,close,vol]=r.map(Number);
    need(Number.isSafeInteger(t)&&t>0&&t%granularity===0&&
      [low,high,open,close,vol].every(finite)&&low>0&&vol>=0&&
      high>=low&&open>=low-1e-5&&open<=high+1e-5&&
      close>=low-1e-5&&close<=high+1e-5,
      'vela OHLCV inválida');
    need(t+granularity<=cut,'vela abierta o del futuro no permitida');
    if(bars.length)need(t>bars.at(-1).time,'velas repetidas o desordenadas');
    bars.push({time:t,low,high,open,close,volume:vol});
  }
  return bars;
}
function consecutive(prev,current,g,equity){
  const diff=current.time-prev.time;
  if(diff===g)return true;
  if(!equity)return false;
  if(g===86400)return diff>0&&diff<=10*86400;
  return diff>0&&diff<=5*86400&&dateUtc(current.time)!==dateUtc(prev.time);
}
function prefixGaps(bars,g,equity){
  const gaps=[0];
  for(let i=1;i<bars.length;i++)
    gaps.push(gaps.at(-1)+Number(!consecutive(bars[i-1],bars[i],g,equity)));
  return gaps;
}
function numericFeatures(rows,i){
  const ret=k=>Math.log(rows[k].close/rows[k-1].close);
  let sum=0,sq=0,volSum=0,volSq=0;
  for(let k=i-23;k<=i;k++){
    const v=ret(k);sum+=v;sq+=v*v;
    const volume=Math.log1p(rows[k-1].volume);
    volSum+=volume;volSq+=volume*volume;
  }
  const volatility=Math.sqrt(sq/24);
  const momentum=Math.log(rows[i].close/rows[i-12].close);
  const volMean=volSum/24,volSd=Math.sqrt(Math.max(0,volSq/24-volMean**2));
  const volZ=volSd>1e-8?(Math.log1p(rows[i].volume)-volMean)/volSd:0;
  return {volatility,trendStrength:momentum/
    Math.max(volatility*Math.sqrt(12),1e-10),
    momentum12:momentum,volumeZ:clamp(volZ,-8,8)};
}
function featuresAt(rows,i,gaps,minimum=PLAN.lookback){
  if(i<minimum||gaps[i]!==gaps[i-minimum])return null;
  return numericFeatures(rows,i);
}
function thresholdsFrom(examples){
  need(examples.length>=PLAN.minTraining,'umbrales: historia independiente insuficiente');
  const vol=examples.map(x=>x.features.volatility);
  return {volatility_low:quantile(vol,.33),volatility_high:quantile(vol,.67),
    trend_standardized_threshold:1.25,activity_z_threshold:1,
    trained_rows:examples.length};
}
function classify(x,thresholds){
  const vol=x.volatility>thresholds.volatility_high?'high':
    x.volatility<thresholds.volatility_low?'low':'normal';
  const trend=x.trendStrength>=thresholds.trend_standardized_threshold?'up':
    x.trendStrength<=-thresholds.trend_standardized_threshold?'down':'range';
  const activity=x.volumeZ>=thresholds.activity_z_threshold?'high':'normal';
  return {volatility:vol,trend,activity};
}
function groupOf(model,state){
  return model==='volatility'?state.volatility:
    model==='volatility_trend'?state.volatility+'|'+state.trend:
    model==='volatility_activity'?state.volatility+'|'+state.activity:'all';
}
function rowsWithLabels(raw,{granularity=300,equity=false,horizonMinutes=15,cutoff=null}={}){
  need(HORIZONS.includes(horizonMinutes),'horizonte de cálculo desconocido');
  need(horizonMinutes*60%granularity===0,
    'horizonte no múltiplo de la resolución');
  const horizonBars=horizonMinutes*60/granularity;
  const bars=normalize(raw,{granularity,equity,cutoff});
  need(bars.length>=160,'M004 necesita al menos 160 velas cerradas');
  const gaps=prefixGaps(bars,granularity,equity);
  const samples=[];
  for(let i=PLAN.lookback;i+horizonBars<bars.length;i++){
    // No se reutiliza la misma trayectoria para varias etiquetas.
    if(i%horizonBars!==0||gaps[i+horizonBars]!==gaps[i-PLAN.lookback])continue;
    const features=featuresAt(bars,i,gaps);if(!features)continue;
    const y=Math.log(bars[i+horizonBars].close/bars[i].close);
    if(!finite(y))continue;
    samples.push({index:i,decisionAt:bars[i].time+granularity,
      dueAt:bars[i+horizonBars].time+granularity,
      absReturn:Math.abs(y),returnLog:y,features});
  }
  return {samples,bars,gaps,horizonBars,granularity,equity};
}
function baseline(training){
  const magnitudes=training.map(x=>x.absReturn);
  return {median:median(magnitudes),p80:quantile(magnitudes,.8),
    positiveFrequency:mean(training.map(x=>Number(x.returnLog>0))),
    samples:training.length};
}
function fit(samples,variant){
  need(samples.length>=PLAN.minTraining,'muestras insuficientes para ajustar');
  const thresholds=thresholdsFrom(samples);
  const all=baseline(samples);
  const bins=new Map();
  for(const item of samples){
    const state=classify(item.features,thresholds),key=groupOf(variant,state);
    const group=bins.get(key)??[];group.push(item);bins.set(key,group);
  }
  const groups=Object.fromEntries([...bins].map(([k,x])=>
    [k,{...baseline(x),fallback:x.length<PLAN.minBucket}]));
  return {variant,thresholds,unconditional:all,buckets:groups,
    total_trained:samples.length,trained_last_due_at:iso(samples.at(-1).dueAt),
    model_kind:'conditional_empirical_abs_log_return',
    production_activation_allowed:false};
}
function estimate(model,features){
  const state=classify(features,model.thresholds),key=groupOf(model.variant,state);
  const bucket=model.buckets[key];
  if(!bucket||bucket.fallback)return {value:model.unconditional.median,
    p80:model.unconditional.p80,source:'unconditional_fallback',
    bucketSupport:bucket?.samples??0,state};
  return {value:bucket.median,p80:bucket.p80,
    source:'regime_history',bucketSupport:bucket.samples,state};
}
function errorScore(samples,predictor){
  if(!samples.length)return null;
  return mean(samples.map(x=>Math.abs(predictor(x)-x.absReturn)))*10000;
}
function thresholdWalkFold(samples,{begin,end,validationStart}){
  const training=samples.filter(x=>x.dueAt<validationStart);
  const validation=samples.filter(x=>x.decisionAt>=validationStart&&x.dueAt<begin);
  const refit=samples.filter(x=>x.dueAt<begin);
  const held=samples.filter(x=>x.decisionAt>=begin&&x.dueAt<end);
  const counts={training:training.length,validation:validation.length,
    refit:refit.length,holdout:held.length};
  if(training.length<PLAN.minTraining||validation.length<PLAN.minValidation||
    held.length<PLAN.minHoldout||refit.length<PLAN.minTraining)
    return {status:'abstained',reason:'insufficient_nonoverlapping_labels',counts,
      training_and_test_separated:true};
  const reference=baseline(training),baseMAE=errorScore(validation,()=>reference.median);
  const validations=PLAN.candidates.map(variant=>{
    const model=fit(training,variant);
    const mae=errorScore(validation,x=>estimate(model,x.features).value);
    return {variant,mae_bps:round(mae),compared_to_baseline_bps:round(baseMAE)};
  }).sort((a,b)=>a.mae_bps-b.mae_bps||
    PLAN.candidates.indexOf(a.variant)-PLAN.candidates.indexOf(b.variant));
  const gain=baseMAE>0?1-validations[0].mae_bps/baseMAE:0;
  const variant=gain>=PLAN.minGainOnValidation?validations[0].variant:'unconditional';
  const fitted=fit(refit,variant);
  const forecast=(x)=>estimate(fitted,x.features).value;
  const unconditioned=baseline(refit);
  const cases=held.map(x=>{
    const pred=estimate(fitted,x.features),abs=x.absReturn;
    return {decision_at:iso(x.decisionAt),outcome_at:iso(x.dueAt),
      regime:pred.state,conditional_source:pred.source,
      bucket_support:pred.bucketSupport,
      observed_abs_bps:round(abs*1e4),predicted_abs_bps:round(pred.value*1e4),
      baseline_abs_bps:round(unconditioned.median*1e4),
      p80_exploratory_abs_bps:round(pred.p80*1e4),
      actual_return_positive:x.returnLog>0};
  });
  const selectedMAE=errorScore(held,forecast);
  const baselineMAE=errorScore(held,()=>unconditioned.median);
  const zeroMAE=errorScore(held,()=>0);
  const covered=mean(held.map(x=>
    Number(x.absReturn<=estimate(fitted,x.features).p80)));
  return {status:'retrospective_measured',counts,
    train_cutoff:iso(begin),holdout_until:iso(end),selected:variant,
    selection_from:'validation_only',validation_best_gain:round(gain),
    holdout_not_used_for_selection:true,
    last_refit_label_at:fit(refit,variant).trained_last_due_at,
    label_purge_verified:training.every(x=>x.dueAt<validationStart)&&
      validation.every(x=>x.dueAt<begin)&&refit.every(x=>x.dueAt<begin)&&
      held.every(x=>x.decisionAt>=begin&&x.dueAt<end),
    validation_candidates:validations,
    holdout:{selected_mae_bps:round(selectedMAE),
      baseline_mae_bps:round(baselineMAE),
      zero_move_mae_bps:round(zeroMAE),
      improvement_vs_baseline:round(baselineMAE>0?1-selectedMAE/baselineMAE:0),
      exploratory_p80_coverage:round(covered)},
    test_cases:cases,production_activation_allowed:false};
}
function evaluateRegimes(raw,{granularity=300,equity=false,horizonMinutes=15,cutoff=null}={}){
  const {samples,bars,gaps,horizonBars}=rowsWithLabels(raw,
    {granularity,equity,horizonMinutes,cutoff});
  const first=bars[0].time+granularity,last=bars.at(-1).time+granularity;
  const duration=last-first,folds=[];
  for(let i=0;i<PLAN.folds;i++){
    const from=first+duration*PLAN.foldStarts[i];
    const until=first+duration*PLAN.foldEndFractions[i]+1;
    const valStart=from-duration*PLAN.validationFraction;
    folds.push(thresholdWalkFold(samples,{begin:from,end:until,
      validationStart:valStart}));
  }
  const tested=folds.filter(x=>x.status==='retrospective_measured');
  const cases=tested.flatMap(f=>f.test_cases);
  const errors=cases.map(c=>Math.abs(c.predicted_abs_bps-c.observed_abs_bps));
  const baselineErrors=cases.map(c=>Math.abs(c.baseline_abs_bps-c.observed_abs_bps));
  const modelMAE=mean(errors),baseMAE=mean(baselineErrors);
  const improving=tested.filter(x=>x.holdout.improvement_vs_baseline>0).length;
  const gain=baseMAE>0?1-modelMAE/baseMAE:null;
  const sufficient=tested.length===PLAN.folds&&cases.length>=PLAN.minHoldout*3;
  const consistent=sufficient&&improving>=PLAN.minimumStableFolds&&
    gain!==null&&gain>=PLAN.minimumOverallGain;
  return {schema:SCHEMA,horizon_minutes:horizonMinutes,asset_market:equity?'equity':'crypto',
    granularity,raw_bars:bars.length,gap_events:gaps.at(-1),
    outcome_pairs:samples.length,independent_test_cases:cases.length,
    status:!sufficient?'insufficient_holdout_evidence':
      consistent?'retrospective_candidate_only':'no_stable_incremental_edge',
    aggregate:{model_mae_bps:round(modelMAE),unconditional_mae_bps:round(baseMAE),
      relative_gain:round(gain),folds_with_improvement:improving,
      folds_evaluated:tested.length},
    folds,validation_is_retrospective:true,prospective_validated:false,
    financial_advantage_demonstrated:false,
    never_changes_original_price:true,automatic_trading:false,
    production_activation_allowed:false};
}
function currentRegime(raw,{granularity=300,equity=false,cutoff=null}={}){
  let bars;
  try{bars=normalize(raw,{granularity,equity,cutoff})}
  catch(e){return {schema:'laplace-m004-current-v1',status:'abstained',reason:e.message,
    can_predict:false,automatic_trading:false}}
  if(bars.length<100)return {schema:'laplace-m004-current-v1',
    status:'abstained',reason:'historia_inferior_a_100_velas',
    can_predict:false,automatic_trading:false};
  const gaps=prefixGaps(bars,granularity,equity),lastIndex=bars.length-1;
  const latest=featuresAt(bars,lastIndex,gaps);
  if(!latest)return {schema:'laplace-m004-current-v1',
    status:'abstained',reason:'ultimas_25_velas_incompletas',
    can_predict:false,automatic_trading:false};
  const hist=[];
  for(let i=PLAN.lookback;i<lastIndex;i++){
    const f=featuresAt(bars,i,gaps);
    if(f)hist.push({features:f});
  }
  if(hist.length<PLAN.minTraining)return {schema:'laplace-m004-current-v1',
    status:'abstained',reason:'umbrales_historicos_insuficientes',
    can_predict:false,automatic_trading:false};
  const thresholds=thresholdsFrom(hist),state=classify(latest,thresholds);
  return {schema:'laplace-m004-current-v1',status:'observed_regime',
    observed_last_close_at:iso(bars.at(-1).time+granularity),
    market:equity?'equity':'crypto',granularity,
    regime:{...state,volatility_label:labelVol(state.volatility),
      trend_label:labelTrend(state.trend)},
    features:{volatility_rms_24:latest.volatility,
      trend_strength:latest.trendStrength,
      momentum_12:latest.momentum12,volume_z:latest.volumeZ},
    thresholds,thresholds_learned_only_from_past:true,
    labels_are_statistical_not_causes:true,
    directional_forecast:null,magnitude_forecast:null,
    can_predict:false,prospectively_validated:false,automatic_trading:false};
}
const api={SCHEMA,VERSION,PLAN,HORIZONS,normalize,
  rowsWithLabels,thresholdsFrom,classify,fit,estimate,
  currentRegime,evaluateRegimes};
root.LaplaceRegime=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
