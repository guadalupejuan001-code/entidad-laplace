/* M003 · Observatorio de la Marea
 * Investiga QUÉ información OHLCV precede a retornos futuros, no causas
 * demostradas. No modifica M001/X002/F001/F002 y no emite órdenes ni precios
 * de producción. No suma señales distintas ni reconstruye información futura.
 *
 * Diseño preregistrado: grupos de hipótesis fijos, train/validación interna,
 * test secuencial purgado, referencias persistencia e inercia, placebos,
 * ablación por grupo, estabilidad entre cortes y régimen de volatilidad.
 */
import {createHash} from 'node:crypto';
import {validarVelas} from '../seguimiento/modelo.mjs';
export const MAREA_SCHEMA='laplace-marea-m003-discovery-v1';
export const STEP_SECONDS=300;
export const MAREA_GROUPS=Object.freeze({
  inercia:['retorno_1','retorno_3','retorno_12'],
  agitacion:['volatilidad_6','volatilidad_24','rango_actual'],
  participacion:['volumen_sorpresa','volumen_z24'],
  geometria:['cuerpo_vela','posicion_cierre']
});
export const MAREA_PLAN=Object.freeze({
  horizons_bars:[1,3,12],train_days_first:14,validation_days:3,
  test_days:4,folds:3,step_seconds:STEP_SECONDS,lookback_bars:25,
  ridge_lambda:32,validation_min_relative_gain:0.02,
  max_abs_predicted_log_return:0.12,
  independently_nonoverlapping_test_labels:true,
  historical_availability:'close_time_assumed_no_intraday_vintage_attestation',
  no_execution_or_trading:true
});
const GROUPS=Object.keys(MAREA_GROUPS);
const NAMES=GROUPS.flatMap(g=>MAREA_GROUPS[g]);
const OFFSET=Object.fromEntries(NAMES.map((x,i)=>[x,i]));
const need=(condition,message)=>{if(!condition)throw Error(message)};
const mean=x=>x.length?x.reduce((s,y)=>s+y,0)/x.length:null;
const round=(x,n=8)=>x===null||!Number.isFinite(x)?null:Number(x.toFixed(n));
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const ms=n=>new Date(n*1000).toISOString();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const median=raw=>{if(!raw.length)return null;
  const sorted=[...raw].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2};
const indexes=groups=>groups.flatMap(g=>MAREA_GROUPS[g].map(f=>OFFSET[f]));
const plus=a=>a.reduce((s,v)=>s+v,0);
const rms=a=>Math.sqrt(plus(a.map(x=>x*x))/a.length);
function safeStd(arr,avg){
  return Math.sqrt(plus(arr.map(v=>(v-avg)**2))/arr.length);
}
export function prepararVelasMarea(raw,{cutoff,granularity=STEP_SECONDS}={}){
  need(granularity===300,'M003 se limita a velas verificadas de cinco minutos');
  need(typeof cutoff==='string'&&Number.isFinite(Date.parse(cutoff)),'corte UTC obligatorio');
  need(Array.isArray(raw)&&raw.length>=300&&raw.length<=30000,'historial OHLCV insuficiente o excedido');
  const received=validarVelas(raw,{corte:cutoff,segundos:granularity,maximo:30000});
  need(received.length===raw.length,
    'no se usan velas abiertas, duplicadas ni fuera de la fecha de corte');
  // Validar no solapamiento, no solo el orden en que el proveedor respondió.
  const prefix=[0];let gaps=0;
  for(let i=1;i<received.length;i++){
    const distance=received[i][0]-received[i-1][0];
    need(distance>=granularity,'OHLCV con marcas repetidas');
    gaps+=Number(distance!==granularity);
    prefix.push(gaps);
  }
  need((received.at(-1)[0]+granularity)*1000<=Date.parse(cutoff),
    'no incluir el futuro');
  return {bars:received,gapPrefix:prefix,gaps,
    rows_sha256:sha(received),
    latest_closed_at:ms(received.at(-1)[0]+granularity),
    historical_reference_availability_not_attested:true};
}
const contiguous=(prefix,a,b)=>a>=0&&b<prefix.length&&prefix[b]===prefix[a];
function valoresEnCorte(rows,i){
  const last=rows[i],now=last[4],r=j=>Math.log(rows[j][4]/rows[j-1][4]);
  const recent6=Array.from({length:6},(_,k)=>r(i-k));
  const recent24=Array.from({length:24},(_,k)=>r(i-k));
  const volumeHistory=Array.from({length:24},(_,k)=>Math.log1p(rows[i-1-k][5]));
  const vAvg=mean(volumeHistory),vStd=safeStd(volumeHistory,vAvg);
  const currentVolume=Math.log1p(last[5]);
  const candleRange=last[2]-last[1];
  const vector=[
    r(i),Math.log(now/rows[i-3][4]),Math.log(now/rows[i-12][4]),
    rms(recent6),rms(recent24),candleRange/now,
    currentVolume-mean(volumeHistory.slice(0,12)),
    vStd>1e-10?(currentVolume-vAvg)/vStd:0,
    (last[4]-last[3])/last[3],
    candleRange>0?2*(last[4]-last[1])/candleRange-1:0
  ];
  need(vector.every(Number.isFinite),'vector OHLCV no finito');
  return vector;
}
export function muestrasMarea(prepared,horizonBars){
  need(MAREA_PLAN.horizons_bars.includes(horizonBars),'horizonte no preregistrado');
  const {bars,gapPrefix}=prepared,rows=[];
  for(let i=MAREA_PLAN.lookback_bars;i+horizonBars<bars.length;i++){
    // Un único target por bloque; los índices de muestras no se superponen.
    if(i%horizonBars!==0||
       !contiguous(gapPrefix,i-MAREA_PLAN.lookback_bars,i+horizonBars))continue;
    const x=valoresEnCorte(bars,i),y=Math.log(bars[i+horizonBars][4]/bars[i][4]);
    if(!Number.isFinite(y))continue;
    rows.push({index:i,due_index:i+horizonBars,
      decision_at:ms(bars[i][0]+300),due_at:ms(bars[i+horizonBars][0]+300),
      price_at_decision:bars[i][4],price_at_outcome:bars[i+horizonBars][4],
      features:x,actual_log_return:y});
  }
  return rows;
}
function linearSolve(matrix,rhs){
  const n=rhs.length,x=matrix.map((r,i)=>[...r,rhs[i]]);
  for(let j=0;j<n;j++){
    let pivot=j;
    for(let k=j+1;k<n;k++)if(Math.abs(x[k][j])>Math.abs(x[pivot][j]))pivot=k;
    need(Math.abs(x[pivot][j])>1e-14,'matriz de modelo singular');
    [x[j],x[pivot]]=[x[pivot],x[j]];
    const div=x[j][j];for(let k=j;k<=n;k++)x[j][k]/=div;
    for(let i=0;i<n;i++)if(i!==j){
      const coeff=x[i][j];if(coeff===0)continue;
      for(let k=j;k<=n;k++)x[i][k]-=coeff*x[j][k];
    }
  }
  return x.map(r=>r[n]);
}
export function ajustarMarea(samples,featureIndexes,{lambda=MAREA_PLAN.ridge_lambda}={}){
  need(Array.isArray(samples)&&samples.length>=48,'faltan muestras para entrenar');
  need(Array.isArray(featureIndexes)&&featureIndexes.length>0&&
    featureIndexes.every(x=>Number.isInteger(x)&&x>=0&&x<NAMES.length)&&
    new Set(featureIndexes).size===featureIndexes.length,'índices de características inválidos');
  need(Number.isFinite(lambda)&&lambda>0,'regularización positiva requerida');
  const n=featureIndexes.length,yAvg=mean(samples.map(s=>s.actual_log_return));
  const averages=featureIndexes.map(i=>mean(samples.map(s=>s.features[i])));
  const scales=featureIndexes.map((i,j)=>Math.max(1e-8,
    safeStd(samples.map(s=>s.features[i]),averages[j])));
  const A=Array.from({length:n},(_,j)=>Array.from({length:n},(_,k)=>
    j===k?lambda:0)),b=Array(n).fill(0);
  for(const sample of samples){
    const xs=featureIndexes.map((col,i)=>(sample.features[col]-averages[i])/scales[i]);
    for(let j=0;j<n;j++){
      b[j]+=xs[j]*(sample.actual_log_return-yAvg);
      for(let k=0;k<n;k++)A[j][k]+=xs[j]*xs[k];
    }
  }
  const beta=linearSolve(A,b);
  need(beta.every(Number.isFinite),'modelo devuelve parámetros no finitos');
  return {method:'standardized_ridge',feature_indexes:featureIndexes,
    feature_names:featureIndexes.map(i=>NAMES[i]),lambda,
    averages,scales,intercept:yAvg,coefficients:beta,
    trained_samples:samples.length,
    max_due_at:samples.at(-1).due_at,
    model_sha256:sha({features:featureIndexes,lambda,averages,scales,intercept:yAvg,beta})};
}
export function estimarMarea(model,vector){
  need(Array.isArray(vector)&&vector.length===NAMES.length&&vector.every(Number.isFinite),
    'rasgos incompletos');
  return clamp(model.intercept+model.feature_indexes.reduce((s,key,j)=>
    s+(vector[key]-model.averages[j])/model.scales[j]*model.coefficients[j],0),
  -MAREA_PLAN.max_abs_predicted_log_return,MAREA_PLAN.max_abs_predicted_log_return);
}
function errorBps(estimate,truth){return Math.abs(Math.exp(estimate)-Math.exp(truth))*10000}
function scorePreds(samples,predictor){
  const errors=samples.map(row=>errorBps(predictor(row),row.actual_log_return));
  return mean(errors);
}
function modelsOfSubsets(samples){
  const fitted=new Map();
  for(let mask=1;mask<1<<GROUPS.length;mask++){
    const groupNames=GROUPS.filter((_,i)=>mask&(1<<i));
    fitted.set(mask,{groupNames,model:ajustarMarea(samples,indexes(groupNames))});
  }
  return fitted;
}
function bestOnValidation(models,validation){
  const base=scorePreds(validation,()=>0);
  const scores=[...models].map(([mask,v])=>({
    mask,groups:v.groupNames,mae_bps:scorePreds(validation,r=>estimarMarea(v.model,r.features))
  })).sort((a,b)=>a.mae_bps-b.mae_bps||a.groups.length-b.groups.length||a.mask-b.mask);
  const best=scores[0];
  return {selected_groups:best.mae_bps<base*(1-MAREA_PLAN.validation_min_relative_gain)?
    best.groups:[],best_validation_mae_bps:best.mae_bps,
    persistence_validation_mae_bps:base,chosen_from_holdout:false,
    registered_candidates:scores.length,choice:best.mask};
}
function scoreCases(cases,key){
  return {n:cases.length,mae_bps:round(mean(cases.map(x=>errorBps(x[key],x.actual_log_return)))),
    rms_bps:round(rms(cases.map(x=>errorBps(x[key],x.actual_log_return))))};
}
function byRegime(cases,threshold){
  return ['alta_volatilidad','baja_volatilidad'].map(name=>{
    const rows=cases.filter(x=>(x.volatility24>=threshold)===
      (name==='alta_volatilidad'));
    return {regime:name,examples:rows.length,
      selection:rows.length?scoreCases(rows,'selected'):null,
      persistence:rows.length?scoreCases(rows,'persistence'):null};
  });
}
function foldMarea(samples,{horizon,from,to,validationBars,plan}){
  const valStart=from-validationBars;
  const fit=samples.filter(s=>s.index<valStart&&s.due_index<valStart);
  const val=samples.filter(s=>s.index>=valStart&&s.due_index<from);
  const refit=samples.filter(s=>s.index<from&&s.due_index<from);
  const hold=samples.filter(s=>s.index>=from&&s.due_index<to);
  if(fit.length<60||val.length<24||refit.length<90||hold.length<24)
    return {status:'abstained',reason:'insufficient_nonoverlapping_temporal_labels',
      count_fit:fit.length,count_validation:val.length,count_test:hold.length};
  const selection=bestOnValidation(modelsOfSubsets(fit),val);
  const selected=selection.selected_groups.length?
    ajustarMarea(refit,indexes(selection.selected_groups)):null;
  const full=ajustarMarea(refit,indexes(GROUPS));
  const inertia=ajustarMarea(refit,indexes(['inercia']));
  const ablation=Object.fromEntries(GROUPS.map(g=>[g,
    ajustarMarea(refit,indexes(GROUPS.filter(x=>x!==g)))]));
  const shift=Math.max(25,Math.floor(refit.length*.23));
  const placeboFit=refit.map((x,i)=>({...x,
    actual_log_return:refit[(i+shift)%refit.length].actual_log_return}));
  const placebo=ajustarMarea(placeboFit,indexes(GROUPS));
  const threshold=median(refit.map(r=>r.features[OFFSET.volatilidad_24]));
  const cases=hold.map(r=>{
    const selectedPrediction=selected?estimarMarea(selected,r.features):0;
    const fullPrediction=estimarMarea(full,r.features);
    return {decision_at:r.decision_at,due_at:r.due_at,
      price_at_decision:r.price_at_decision,actual_price:r.price_at_outcome,
      actual_log_return:r.actual_log_return,persistence:0,
      selected:selectedPrediction,full:fullPrediction,
      inertia:estimarMarea(inertia,r.features),
      placebo:estimarMarea(placebo,r.features),
      volatility24:r.features[OFFSET.volatilidad_24],
      without:Object.fromEntries(GROUPS.map(g=>[g,estimarMarea(ablation[g],r.features)]))};
  });
  const scores={
    persistence:scoreCases(cases,'persistence'),
    selected:scoreCases(cases,'selected'),
    all_features:scoreCases(cases,'full'),
    inertia_only:scoreCases(cases,'inertia'),
    shifted_label_placebo:scoreCases(cases,'placebo')
  };
  const groupAblations=Object.fromEntries(GROUPS.map(g=>{
    const absent=mean(cases.map(x=>errorBps(x.without[g],x.actual_log_return)));
    return [g,{without_group_mae_bps:round(absent),
      all_features_mae_bps:scores.all_features.mae_bps,
      incremental_group_value_bps:round(absent-scores.all_features.mae_bps),
      interpretation:'paired_association_not_causality'}];
  }));
  return {status:'retrospective_research_only',test_start:ms(plan.bars[from][0]),
    test_end_exclusive:ms(plan.bars[to-1][0]+300),
    counts:{fit:fit.length,validation:val.length,refit:refit.length,
      test:hold.length},validation:selection,training:{
      selected_model_sha256:selected?.model_sha256??null,
      full_model_sha256:full.model_sha256,
      inertia_model_sha256:inertia.model_sha256,
      last_training_label_at:refit.at(-1).due_at,
      last_validation_label_at:val.at(-1).due_at,
      purge_confirmed:refit.every(r=>r.due_index<from)&&
        val.every(r=>r.due_index<from)&&fit.every(r=>r.due_index<valStart),
      placebo_label_shift:shift},
    regime_threshold_from_training:threshold,
    regimes:byRegime(cases,threshold),scores,group_ablations:groupAblations,
    cases,production_activation_allowed:false};
}
export function investigarMarea(raw,{cutoff,horizons=MAREA_PLAN.horizons_bars}={}){
  need(Array.isArray(horizons)&&horizons.length>0&&horizons.length<=3&&
    horizons.every(x=>MAREA_PLAN.horizons_bars.includes(x))&&
    new Set(horizons).size===horizons.length,'horizontes no preregistrados');
  const history=prepararVelasMarea(raw,{cutoff}),bars=history.bars;
  const perDay=86400/STEP_SECONDS,all=[];
  for(const h of horizons){
    const samples=muestrasMarea(history,h),folds=[];
    for(let k=0;k<MAREA_PLAN.folds;k++){
      const from=(MAREA_PLAN.train_days_first+k*MAREA_PLAN.test_days)*perDay;
      const to=from+MAREA_PLAN.test_days*perDay;
      if(to>bars.length)folds.push({status:'abstained',reason:'short_history',
        required_bars:to,available_bars:bars.length});
      else folds.push(foldMarea(samples,{horizon:h,from,to,
        validationBars:MAREA_PLAN.validation_days*perDay,plan:history}));
    }
    const passed=folds.filter(x=>x.status==='retrospective_research_only');
    const cases=passed.flatMap(f=>f.cases);
    const scored={
      persistence:cases.length?scoreCases(cases,'persistence'):null,
      selected:cases.length?scoreCases(cases,'selected'):null,
      inertia_only:cases.length?scoreCases(cases,'inertia'):null,
      all_features:cases.length?scoreCases(cases,'full'):null,
      placebo:cases.length?scoreCases(cases,'placebo'):null
    };
    const winCount=(name)=>passed.filter(f=>
      f.scores.selected.mae_bps<f.scores[name].mae_bps).length;
    const stability={folds_evaluated:passed.length,
      beat_persistence_folds:winCount('persistence'),
      beat_inertia_only_folds:winCount('inertia_only'),
      beat_placebo_folds:winCount('shifted_label_placebo'),
      selected_feature_groups:passed.map(f=>f.validation.selected_groups)};
    const seemsStable=passed.length===3&&stability.beat_persistence_folds>=2&&
      stability.beat_inertia_only_folds>=2&&stability.beat_placebo_folds>=2&&
      scored.selected.mae_bps<scored.persistence.mae_bps*.98&&
      scored.selected.mae_bps<scored.inertia_only.mae_bps*.98;
    all.push({horizon_minutes:h*5,status:passed.length===MAREA_PLAN.folds?
      (seemsStable?'retrospective_hypothesis_candidate':'no_reproducible_edge_detected'):
      'insufficient_independent_evidence',
      analyzed_nonoverlapping_outcomes:cases.length,stability,
      evaluation:scored,folds,signal_causality_proven:false,
      can_promote_to_price_engine:false});
  }
  return {schema:MAREA_SCHEMA,asset:'BTC-USD',
    granularity_seconds:STEP_SECONDS,observed_candles:bars.length,
    observed_start:ms(bars[0][0]),observed_end:history.latest_closed_at,
    gaps:history.gaps,input_rows_sha256:history.rows_sha256,
    plan:MAREA_PLAN,feature_hypotheses:MAREA_GROUPS,
    experiments:all,
    reference_availability:'historical_close_known_only_by_assumption',
    out_of_sample_type:'chronological_retrospective_no_prospective_execution',
    future_results_not_causation:true,does_not_use_world_sources_without_point_in_time_history:true,
    production_activation_allowed:false,automatic_trading:false};
}
