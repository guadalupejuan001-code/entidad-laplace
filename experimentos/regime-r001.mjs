/* R001 · Auditoria independiente de cambios de regimen de BTC.
 * Tres regímenes de volatilidad sobre velas cerradas. Los umbrales de la
 * decisión t solo consultan volatilidades observadas ANTES de t.
 * Los cambios t -> t+1 se evalúan DESPUÉS de conocer t+1.
 * Es diagnóstico retrospectivo; no sustituye el motor M004 del Android.
 */
export const REGIME_SCHEMA='laplace-regime-r001-v2';
export const REGIME_AUDIT_SCHEMA='laplace-regime-r001-transition-audit-v1';
export const REGIMES=Object.freeze(['low_volatility','normal_volatility','high_volatility']);
export const R001_POLICY=Object.freeze({
  granularity_seconds:300,lookback:24,baseline:288,
  min_threshold_samples:192,minimum_train_transitions:300,
  minimum_test_transitions:30,holdout_starts:[.70,.80,.90],
  holdout_ends:[.80,.90,1],smoothing:1,
  history_close_assumption:'historical_candle_close_not_attested',
  no_automatic_trading:true
});
const required=(x,msg)=>{if(!x)throw Error(msg)};
const finite=Number.isFinite;
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const q=(a,p)=>{required(a.length>0,'no existe distribución de referencia');
 const sorted=[...a].sort((x,y)=>x-y),at=p*(sorted.length-1),
  lo=Math.floor(at),hi=Math.ceil(at);
 return sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo)};
const round=(x,d=8)=>x==null||!finite(x)?null:Number(x.toFixed(d));
const toISO=t=>new Date(t*1000).toISOString();
function validate(raw,{granularity,cutoff}){
 required(granularity===300,'R001 auditado solo para velas BTC de cinco minutos');
 required(Array.isArray(raw)&&raw.length>=R001_POLICY.baseline+R001_POLICY.lookback+2&&raw.length<=30000,
  'Historia insuficiente para el detector R001');
 const ms=cutoff==null?Infinity:Date.parse(cutoff);
 required(cutoff==null||finite(ms),'corte temporal inválido');
 let last=-1,gaps=0;
 const bars=[];
 for(const row of raw){
  required(Array.isArray(row)&&row.length===6&&row.every(finite),
    'vela OHLCV no finita o incompleta');
  const [t,low,high,open,close,volume]=row;
  required(Number.isSafeInteger(t)&&t>0&&t%granularity===0&&
    t>last&&low>0&&high>=low&&open>=low&&open<=high&&
    close>=low&&close<=high&&volume>=0,'vela OHLCV inválida, duplicada o desordenada');
  required((t+granularity)*1000<=ms,'vela futura o aún abierta');
  if(last!==-1&&t!==last+granularity)gaps++;
  last=t;bars.push(row);
 }
 return {bars,gaps};
}
function descriptors(bars,lookback){
 const out=Array(bars.length).fill(null),gaps=[0];
 for(let i=1;i<bars.length;i++)
  gaps.push(gaps.at(-1)+Number(bars[i][0]!==bars[i-1][0]+300));
 for(let i=lookback;i<bars.length;i++){
  if(gaps[i]!==gaps[i-lookback])continue;
  let squared=0;
  for(let j=i-lookback+1;j<=i;j++){
   const delta=Math.log(bars[j][4]/bars[j-1][4]);
   squared+=delta*delta;
  }
  const rms=Math.sqrt(squared/lookback);
  const trendLog=Math.log(bars[i][4]/bars[i-lookback][4]);
  out[i]={rms,trendLog,price:bars[i][4],time:bars[i][0],
    next_available:false,volObservedAt:toISO(bars[i][0]+300)};
 }
 return out;
}
/* State at close t. A historical distribution excludes t, and never
 * crosses a gap. An unavailable window is null, NEVER low volatility.
 */
export function detectRegimes(raw,{lookback=R001_POLICY.lookback,
 baseline=R001_POLICY.baseline,granularity=300,cutoff=null}={}){
 required(Number.isInteger(lookback)&&lookback>=6&&lookback<=96,
   'lookback R001 fuera de contrato');
 required(Number.isInteger(baseline)&&baseline>=120&&baseline<=1440,
   'baseline R001 fuera de contrato');
 const {bars,gaps}=validate(raw,{granularity,cutoff});
 required(bars.length>=baseline+lookback+2,'Historia insuficiente');
 const descriptions=descriptors(bars,lookback),states=[];
 let abstained=0;
 const needed=Math.min(R001_POLICY.min_threshold_samples,Math.floor(baseline*.7));
 for(let i=baseline+lookback;i<bars.length;i++){
  const item=descriptions[i];
  if(!item){abstained++;continue}
  const past=descriptions.slice(i-baseline,i).filter(x=>x!==null).map(x=>x.rms);
  if(past.length<needed){abstained++;continue}
  const p25=q(past,.25),p75=q(past,.75);
  const regime=item.rms<p25?REGIMES[0]:item.rms>p75?REGIMES[2]:REGIMES[1];
  const trendThreshold=item.rms*Math.sqrt(lookback)*1.25;
  const trend=item.trendLog>trendThreshold?'up':
    item.trendLog< -trendThreshold?'down':'mixed';
  states.push({at:item.time,known_at:toISO(item.time+granularity),regime,trend,
    volatility:item.rms,trend_log:item.trendLog,
    threshold_low:p25,threshold_high:p75,
    baseline_samples:past.length,
    original_index:i,price:item.price,
    based_on_closed_bars_only:true,prospectively_validated:false});
 }
 return {schema:REGIME_SCHEMA,granularity_seconds:granularity,
  observations:states.length,observed_bars:bars.length,gaps,
  excluded_without_sufficient_past:abstained,states,
  threshold_source:'past_only_excludes_current_bar',
  status:states.length?'observed_statistical_states':'abstained',
  causal_claim:false,production_activation_allowed:false,
  automatic_trading:false};
}
function transitionPairs(states){
 const out=[];
 for(let i=0;i<states.length-1;i++){
  const a=states[i],b=states[i+1];
  if(b.at-a.at!==300||!REGIMES.includes(a.regime)||!REGIMES.includes(b.regime))continue;
  out.push({from:a.regime,to:b.regime,
   decided_at:a.known_at,realized_at:b.known_at,
   decided_index:a.original_index,realized_index:b.original_index,
   decision_volatility:a.volatility,
   observed_next_abs_log_return:Math.abs(Math.log(b.price/a.price))});
 }
 return out;
}
function probabilities(train){
 const alpha=R001_POLICY.smoothing,
  counts=Object.fromEntries(REGIMES.map(from=>[from,
   Object.fromEntries(REGIMES.map(to=>[to,0]))])),
  totals=Object.fromEntries(REGIMES.map(x=>[x,0]));
 const global=Object.fromEntries(REGIMES.map(x=>[x,0]));
 for(const x of train){counts[x.from][x.to]++;totals[x.from]++;global[x.to]++}
 const smoothed=Object.fromEntries(REGIMES.map(from=>[
   from,Object.fromEntries(REGIMES.map(to=>[to,
     (counts[from][to]+alpha)/(totals[from]+alpha*REGIMES.length)]))
 ]));
 const globalProb=Object.fromEntries(REGIMES.map(to=>[
  to,(global[to]+alpha)/(train.length+alpha*REGIMES.length)]));
 return {counts,totals,conditional:smoothed,global:globalProb,
  alpha,trained_transitions:train.length};
}
function magnitudeModel(train){
 const magnitude=arr=>arr.length?q(arr.map(x=>x.observed_next_abs_log_return),.5):null;
 const unconditional=magnitude(train),buckets={};
 for(const regime of REGIMES){
  const grouped=train.filter(x=>x.from===regime);
  buckets[regime]={support:grouped.length,
   median_abs_log_return:grouped.length>=30?magnitude(grouped):unconditional,
   fallback:grouped.length<30};
 }
 return {baseline_median_abs_log_return:unconditional,buckets,
  trained_labels:train.length,feature:'current_regime_only',
  no_future_labels_used:true};
}
/* Diagnóstico por bloques continuos: incertidumbre por autocorrelación.
 * No es certificación estadística ni prueba prospectiva.
 */
function blockBootstrap(differences,{repetitions=300,blockSize=72}={}){
 const n=differences.length;
 if(n<30)return {status:'insufficient',lower_bps:null,upper_bps:null};
 let seed=0x9e3779b9;
 const next=()=>{
   seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
   return seed>>>0;
 };
 const results=[];
 for(let iteration=0;iteration<repetitions;iteration++){
   let total=0,drawn=0;
   while(drawn<n){
     const start=next()%n;
     for(let j=0;j<blockSize&&drawn<n;j++,drawn++)
       total+=differences[(start+j)%n];
   }
   results.push(total/n);
 }
 return {status:'exploratory_circular_block_resampling',
   block_size:Math.min(blockSize,n),repetitions,
   lower_bps:round(q(results,.025)),
   upper_bps:round(q(results,.975)),
   interpretation:'serially_correlated_retrospective_cases_not_prospective_certification'};
}
function magnitudeScore(test,model){
 const errors=test.map(x=>Math.abs(model.buckets[x.from].
  median_abs_log_return-x.observed_next_abs_log_return)*10000);
 const base=test.map(x=>Math.abs(model.baseline_median_abs_log_return-
  x.observed_next_abs_log_return)*10000);
 const differences=errors.map((e,i)=>base[i]-e);
 return {n:test.length,conditional_mae_bps:round(avg(errors)),
  unconditional_mae_bps:round(avg(base)),
  paired_wins:errors.filter((e,i)=>e<base[i]).length,
  mean_paired_improvement_bps:round(avg(differences)),
  bootstrap_interval: blockBootstrap(differences),
  relative_gain:avg(base)>0?round(1-avg(errors)/avg(base)):null};
}
function brier(pred,actual){
 return REGIMES.reduce((sum,regime)=>
  sum+(pred[regime]-Number(regime===actual))**2,0);
}
function errors(samples,model){
 const conditional=samples.map(x=>brier(model.conditional[x.from],x.to)),
  unconditional=samples.map(x=>brier(model.global,x.to));
 const sticky=samples.map(x=>Number(x.to!==x.from)*2);
 return {
  evaluated:samples.length,
  conditional_brier:round(avg(conditional)),
  unconditional_brier:round(avg(unconditional)),
  always_stay_brier:round(avg(sticky)),
  relative_gain_vs_unconditional:avg(unconditional)>0?
    round(1-avg(conditional)/avg(unconditional)):null,
  relative_gain_vs_always_stay:avg(sticky)>0?
    round(1-avg(conditional)/avg(sticky)):null,
  conditional_wins_vs_always_stay:samples.filter((x,i)=>conditional[i]<sticky[i]).length,
  conditional_wins:samples.filter((x,i)=>conditional[i]<unconditional[i]).length,
  realized_changes:samples.filter(x=>x.from!==x.to).length
 };
}
/* Refit train for each chronological fold; holdout transitions never
 * contribute to its probabilities. No model-selection on holdout.
 */
export function auditRegimeTransitions(raw,{cutoff=null}={}){
 const detector=detectRegimes(raw,{cutoff});
 const pairs=transitionPairs(detector.states),folds=[];
 for(let f=0;f<3;f++){
  const start=Math.floor(pairs.length*R001_POLICY.holdout_starts[f]);
  const end=Math.floor(pairs.length*R001_POLICY.holdout_ends[f]);
  const train=pairs.slice(0,start),test=pairs.slice(start,end);
  if(train.length<R001_POLICY.minimum_train_transitions||
    test.length<R001_POLICY.minimum_test_transitions){
   folds.push({status:'abstained',reason:'insufficient_chronological_transition_history',
     train:train.length,test:test.length});continue;
  }
  const model=probabilities(train),score=errors(test,model),
    amplitude=magnitudeModel(train),amplitude_score=magnitudeScore(test,amplitude);
  const lastTrain=train.at(-1),firstTest=test[0];
  required(lastTrain.realized_index<=firstTest.decided_index,
    'fuga temporal en transición R001');
  folds.push({status:'retrospective_evaluation_only',
    train_pairs:train.length,test_pairs:test.length,
    decision_cutoff:lastTrain.realized_at,
    holdout_start:firstTest.decided_at,holdout_end:test.at(-1).realized_at,
    model,score,magnitude_model:amplitude,magnitude_score:amplitude_score,
    first_holdout_prediction:model.conditional[firstTest.from],
    first_holdout_actual:firstTest.to,
    cases:test.map(x=>({from:x.from,to:x.to,decided_at:x.decided_at,
      realized_at:x.realized_at,
      conditional_brier:round(brier(model.conditional[x.from],x.to)),
      unconditional_brier:round(brier(model.global,x.to)),
      realized_abs_bps:round(x.observed_next_abs_log_return*10000),
      conditional_magnitude_bps:round(amplitude.buckets[x.from].median_abs_log_return*10000),
      unconditional_magnitude_bps:round(amplitude.baseline_median_abs_log_return*10000)})),
    no_holdout_selection:true,production_activation_allowed:false});
 }
 const evaluated=folds.filter(x=>x.status==='retrospective_evaluation_only'),
  total=evaluated.reduce((sum,f)=>sum+f.test_pairs,0);
 return {schema:REGIME_AUDIT_SCHEMA,status:evaluated.length===3?
  'retrospective_audit_completed':'abstained',
  asset:'BTC-USD',horizon_minutes:5,
  observations:detector.observations,
  gaps:detector.gaps,excluded_without_sufficient_past:
    detector.excluded_without_sufficient_past,
  valid_transition_pairs:pairs.length,
  holdout_transition_pairs:total,
  folds,source_historical_availability:'close_assumption_not_attested',
  hypothesis:'Does current volatility regime add next-regime information beyond unconditional rates?',
  next_regime_is_not_price_direction:true,
  no_causal_claim:true,prospectively_validated:false,
  production_activation_allowed:false,automatic_trading:false};
}
