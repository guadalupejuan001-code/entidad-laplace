/* EF004: aprendizaje estadístico de transiciones financieras conjuntas.
 * Regularización ridge sobre diferencias asinh; aristas solo estadísticas.
 * El holdout nunca selecciona modelos. La evolución de todas las variables
 * se calcula sincrónicamente, sin trading ni causalidad afirmada.
 */
import {createHash} from 'node:crypto';
import {prepararHistoria,extraerSeries} from './series.mjs';
export const EF004_VERSION='laplace-demonio-financiero-ef004-v1';
const need=(x,m)=>{if(!x)throw Error(m)};
const hash=x=>createHash('sha256').update(x).digest('hex');
function stable(x){
  if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
  if(x&&typeof x==='object')return '{'+Object.keys(x).sort()
    .map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
  need(x!==undefined&&typeof x!=='bigint'&&
    (typeof x!=='number'||Number.isFinite(x)),'dato no finito en modelo');
  return JSON.stringify(x);
}
const sum=a=>a.reduce((n,x)=>n+x,0);
const mean=a=>a.length?sum(a)/a.length:0;
const std=a=>a.length?Math.sqrt(mean(a.map(x=>(x-mean(a))**2))):0;
const round=x=>Number(x.toPrecision(12));
function median(a){const x=[...a].sort((a,b)=>a-b),n=x.length;
  return n? n%2?x[(n-1)/2]:(x[n/2-1]+x[n/2])/2:0}
function corr(a,b){
  const ma=mean(a),mb=mean(b),da=std(a),db=std(b);
  return da<1e-12||db<1e-12?0:mean(a.map((x,i)=>
    (x-ma)*(b[i]-mb)))/(da*db);
}
function solve(A,b){
  const n=b.length,aug=A.map((r,i)=>[...r,b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(aug[i][k])>Math.abs(aug[pivot][k]))pivot=i;
    if(Math.abs(aug[pivot][k])<1e-12)return null;
    [aug[k],aug[pivot]]=[aug[pivot],aug[k]];
    const p=aug[k][k];
    for(let j=k;j<=n;j++)aug[k][j]/=p;
    for(let i=0;i<n;i++)if(i!==k){
      const v=aug[i][k];for(let j=k;j<=n;j++)aug[i][j]-=v*aug[k][j];
    }
  }
  return aug.map(r=>r[n]);
}
function fitRidge(X,y,features,lambda){
  const N=X.length,n=features.length;
  need(N===y.length&&N>=20,'aprendizaje insuficiente');
  const means=Array.from({length:n},(_,j)=>mean(X.map(x=>x[j])));
  const devs=Array.from({length:n},(_,j)=>Math.max(1e-9,std(X.map(x=>x[j]))));
  const x=X.map(r=>r.map((v,j)=>(v-means[j])/devs[j]));
  const ym=mean(y);
  const A=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>
    sum(x.map(r=>r[i]*r[j]))+(i===j?lambda:0)));
  const rhs=Array.from({length:n},(_,i)=>sum(x.map((r,k)=>r[i]*(y[k]-ym))));
  const coef=solve(A,rhs);if(!coef)return null;
  const residuals=x.map((r,i)=>y[i]-(ym+sum(r.map((v,j)=>v*coef[j]))));
  return {features,intercept:ym,coefficients:coef,means,devs,lambda,
    train_sigma:Math.max(1e-8,Math.sqrt(mean(residuals.map(v=>v*v)))),
    trained_pairs:N};
}
function deltaEstimate(m,delta){
  const x=m.features.map((key,j)=>{
    const v=delta.get(key);
    return v==null?null:(v-m.means[j])/m.devs[j];
  });
  if(x.some(v=>v===null))return null;
  const d=m.intercept+sum(x.map((v,j)=>v*m.coefficients[j]));
  return Number.isFinite(d)?Math.max(-1.5,Math.min(1.5,d)):null;
}
function inverse(scale,z){const v=scale*Math.sinh(z);
  return Number.isFinite(v)&&Math.abs(v)<=1e30?v:null}
function score(m,series,target,first,end){
  const t=series.get(target),actual=[],pred=[],baseline=[],errors=[];
  for(let i=first;i<end;i++){
    const a=i+1,b=i+2;
    if(t.values[a]===null||t.values[b]===null||
      t.observed_times[b]<=t.observed_times[a])continue;
    const input=new Map([...series].map(([key,s])=>[key,s.deltas[i]]));
    const d=m?deltaEstimate(m,input):0;
    if(d===null)continue;
    const v=inverse(t.scale,t.z[a]+d);
    if(v===null)continue;
    const err=Math.abs(v-t.values[b])/Math.max(t.scale,1e-9),
      ref=Math.abs(t.values[a]-t.values[b])/Math.max(t.scale,1e-9);
    actual.push(t.values[b]);pred.push(err);baseline.push(ref);errors.push(ref-err);
  }
  const denom=mean(baseline);
  return {attempted:end-first,evaluated:pred.length,
    coverage:round(pred.length/Math.max(1,end-first)),
    normalized_mae:pred.length?round(mean(pred)):null,
    baseline_mae:pred.length?round(denom):null,
    improvement_vs_persistence:denom>0?round(1-mean(pred)/denom):null,
    mean_paired_error_difference:pred.length?round(mean(errors)):null,
    independent_prospective_validation:false};
}
function targetOrder(series,maxTargets){
  const rank=[...series.values()].sort((a,b)=>b.changes-a.changes||
    a.key.localeCompare(b.key));
  const chosen=[],groups=new Set();
  for(const s of rank)if(!groups.has(s.domain)&&chosen.length<maxTargets){
    chosen.push(s);groups.add(s.domain);
  }
  for(const s of rank)if(chosen.length<maxTargets&&!chosen.includes(s))chosen.push(s);
  return chosen;
}
function abstain(reason,details={}){
  return {schema:EF004_VERSION,status:'abstained',reason,model_ready:false,
    production_activation_allowed:false,automatic_trading:false,
    trajectory:[],...details};
}
export function aprenderNucleoEF004(captures,{
  cadenceHours=6,toleranceHours=2.75,minCaptures=48,
  maxSignals=16,maxTargets=6,maxPeers=3,maxSteps=4,
  minimumValidation=8,minimumHoldout=8
}={}){
  need(Number.isInteger(minCaptures)&&minCaptures>=30&&minCaptures<=2000,
    'mínimo de capturas inválido');
  need(Number.isInteger(maxSignals)&&maxSignals>=2&&maxSignals<=48,
    'número de señales inválido');
  need(Number.isInteger(maxTargets)&&maxTargets>=1&&maxTargets<=12,
    'número de objetivos inválido');
  need(Number.isInteger(maxPeers)&&maxPeers>=0&&maxPeers<=6,
    'número de relaciones inválido');
  need(Number.isInteger(maxSteps)&&maxSteps>=1&&maxSteps<=8,
    'horizonte inválido');
  const panel=prepararHistoria(captures,{cadenceHours,toleranceHours});
  const N=panel.contiguous_captures,P=N-2,trainEnd=Math.floor(P*.60),
    valEnd=trainEnd+Math.floor(P*.20);
  if(N<minCaptures||trainEnd<20||valEnd-trainEnd<minimumValidation||
    P-valEnd<minimumHoldout)
    return abstain('insufficient_independent_capture_history',{
      captures_seen:panel.all_captures,contiguous_captures:N,
      minimum_captures:minCaptures,discarded_due_to_gap:panel.discarded_due_to_gap,
      as_of:panel.as_of,note:'Una captura no permite aprender transiciones'});
  const trainingSnapshots=trainEnd+2;
  const select=extraerSeries(panel,{minChanges:4,maxSeries:maxSignals,
    selectionEnd:trainingSnapshots});
  if(select.eligible.length<2)
    return abstain('insufficient_multivariate_observable_transitions',{
      captures_seen:N,available_series:select.total_unique,
      eligible_series:select.total_eligible,as_of:panel.as_of});
  const series=new Map();
  for(const s of select.eligible){
    const scale=Math.max(1e-9,median(s.values.slice(0,trainingSnapshots)
      .filter(x=>x!==null).map(Math.abs))||1);
    const z=s.values.map(v=>v===null?null:Math.asinh(v/scale));
    const deltas=z.slice(1).map((v,i)=>v===null||z[i]===null?null:v-z[i]);
    series.set(s.key,{...s,scale,z,deltas});
  }
  const targets=targetOrder(series,Math.min(maxTargets,series.size));
  const specs=[],edges=[];
  for(const target of targets){
    const y=Array.from({length:trainEnd},(_,i)=>target.deltas[i+1]);
    const peers=[...series.values()].filter(s=>s.key!==target.key)
      .map(s=>({key:s.key,correlation:corr(s.deltas.slice(0,trainEnd),y)}))
      .filter(p=>Math.abs(p.correlation)>=.15)
      .sort((a,b)=>Math.abs(b.correlation)-Math.abs(a.correlation)||
        a.key.localeCompare(b.key)).slice(0,maxPeers);
    const variants=[{kind:'self',keys:[target.key]}];
    if(peers.length)variants.push({kind:'joint',keys:[target.key,...peers.map(p=>p.key)]});
    const candidates=[];
    for(const option of variants)for(const lambda of [.1,1,10]){
      const X=Array.from({length:trainEnd},(_,i)=>option.keys.map(k=>series.get(k).deltas[i]));
      const fitted=fitRidge(X,y,option.keys,lambda);
      if(!fitted)continue;
      const val=score(fitted,series,target.key,trainEnd,valEnd);
      if(val.evaluated>=minimumValidation)
        candidates.push({kind:option.kind,...fitted,validation:val});
    }
    candidates.sort((a,b)=>a.validation.normalized_mae-b.validation.normalized_mae||
      a.features.length-b.features.length||a.lambda-b.lambda);
    const persistenceVal=score(null,series,target.key,trainEnd,valEnd);
    const winning=candidates.find(c=>persistenceVal.normalized_mae!==null&&
      c.validation.normalized_mae<persistenceVal.normalized_mae*.98)??null;
    const holdout=score(winning,series,target.key,valEnd,P);
    const model=winning?{
      kind:winning.kind,features:winning.features,
      intercept:round(winning.intercept),coefficients:winning.coefficients.map(round),
      means:winning.means.map(round),devs:winning.devs.map(round),
      lambda:winning.lambda,train_sigma:round(winning.train_sigma),
      trained_pairs:winning.trained_pairs
    }:null;
    const spec={key:target.key,domain:target.domain,variable:target.variable,
      unit:target.unit,source_url:target.source_url,
      scale:round(target.scale),status:model?'experimental_model':'persistence_only',
      model,validation:winning?.validation??persistenceVal,holdout,
      candidates_tested:candidates.length,model_selected_using_holdout:false};
    specs.push(spec);
    if(winning)for(const p of peers.filter(p=>winning.features.includes(p.key)))
      edges.push({from:p.key,to:target.key,lag_snapshots:1,
        training_lagged_correlation:round(p.correlation),
        coefficient:round(winning.coefficients[winning.features.indexOf(p.key)]),
        relationship:'statistical_association_not_causal_proof'});
  }
  const modelInfo={algorithm:'regularized_sparse_VAR1_on_asinh_changes',
    train_pairs:trainEnd,validation_pairs:valEnd-trainEnd,holdout_pairs:P-valEnd,
    trained_through:panel.snapshots[trainEnd+1].at,
    validation_through:panel.snapshots[valEnd+1].at,
    holdout_through:panel.as_of,
    selected_series:[...series.values()].map(s=>({
      key:s.key,domain:s.domain,variable:s.variable,unit:s.unit,
      scale:round(s.scale),training_changes:s.changes})),
    models:specs,edges,selection_policy:'train_for_peers_validation_for_model_never_holdout',
    training_capture_sha256:panel.provenance.slice(0,trainingSnapshots)
      .map(s=>s.capture_sha256),
    causal_model_proven:false,prospective_advantage_proven:false,
    automatic_trading:false};
  // El hash del MODELO debe quedar congelado sin ningún número del holdout.
  // El holdout se evalúa después y pertenece al reporte, no a los parámetros.
  const {holdout_through,...beforeHoldout}=modelInfo;
  const frozenModel={...beforeHoldout,
    models:specs.map(({holdout,...trained})=>trained)};
  const model_sha256=hash(stable(frozenModel));
  let z=new Map([...series].map(([k,s])=>[k,s.z.at(-1)])),
    changes=new Map([...series].map(([k,s])=>[k,s.deltas.at(-1)]));
  const path=[];
  for(let step=1;step<=maxSteps;step++){
    const nextZ=new Map(z),nextChanges=new Map([...z].map(([key])=>[key,0]));
    const states=[];
    for(const spec of specs){
      const s=series.get(spec.key),cur=z.get(spec.key);
      const fresh=step!==1||s.observed_times.at(-1)>s.observed_times.at(-2);
      const delta=spec.model?deltaEstimate(spec.model,changes):0;
      if(cur===null||!fresh||delta===null){
        states.push({key:spec.key,status:'abstained',
          reason:!fresh?'stale_last_observation':delta===null?
            'missing_peer_lag':'state_absent'});continue;
      }
      const origin=inverse(s.scale,cur),value=inverse(s.scale,cur+delta);
      if(origin===null||value===null){
        states.push({key:spec.key,status:'abstained',reason:'overflow'});continue}
      nextZ.set(spec.key,cur+delta);nextChanges.set(spec.key,delta);
      const sigma=spec.model?.train_sigma??0,band=1.96*sigma*Math.sqrt(step);
      const low=inverse(s.scale,cur+delta-band),high=inverse(s.scale,cur+delta+band);
      states.push({key:spec.key,domain:spec.domain,variable:spec.variable,
        unit:spec.unit,origin_value:round(origin),estimated_value:round(value),
        status:spec.model?'experimental_estimate':'persistence',
        exploratory_low:low==null?null:round(low),
        exploratory_high:high==null?null:round(high),
        uncertainty_calibrated:false});
    }
    // Un paso por simultaneidad: ningún estado de este paso influye en
    // la predicción de otro durante el mismo paso.
    z=nextZ;changes=nextChanges;
    path.push({step,target_at:new Date(Date.parse(panel.as_of)+
      step*cadenceHours*3600000).toISOString(),
      states,simultaneous_update:true,unobserved_future:true});
  }
  const body={schema:EF004_VERSION,status:'experimental_model_frozen',
    model_sha256,
    input_capture_sha256:panel.snapshots.at(-1).capture_sha256,
    input_snapshot_sha256:panel.snapshots.at(-1).snapshot_sha256,
    decision_at:panel.as_of,first_target_at:path[0].target_at,
    cadence_hours:cadenceHours,consecutive_captures:N,
    total_archived_captures:panel.all_captures,
    selected_targets:specs.length,lagged_relationships:edges.length,
    model:modelInfo,trajectory:path,
    excluded_raw_signals_from_model:Math.max(0,
      panel.snapshots.at(-1).state.size-series.size),
    all_raw_states_remain_archived:true,
    derived_future_not_observed:true,automatic_trading:false,
    production_activation_allowed:false,independent_prospective_validation:false};
  return {...body,forecast_sha256:hash(stable(body))};
}
