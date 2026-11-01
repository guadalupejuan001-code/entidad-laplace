/* F002: predictor experimental de precio a partir de TODAS las familias
 * públicas EF002 con evidencia temporal. Las familias ausentes no son cero.
 * Ningún dato futuro participa en rasgos, regularización o selección.
 * La validación retrospectiva se separa de la prospectiva y de producción.
 */
import {createHash} from 'node:crypto';
import {estadoDeCaptura} from '../demonio/series.mjs';
export const F002_SCHEMA='laplace-f002-joint-archive-v1';
export const F002_GROUPS=Object.freeze(['mercados','banca_tasas','flujos_derivados',
  'economia_real','eventos_ambiente','otros']);
export const F002_FEATURE_NAMES=Object.freeze(F002_GROUPS.flatMap(x=>
  [x+'_shock',x+'_presencia']).concat('btc_momento_anterior'));
const HOUR=3600000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const iso=ms=>new Date(ms).toISOString();
const sha=x=>createHash('sha256').update(x).digest('hex');
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':
  x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>
    JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':
  JSON.stringify(x);
const digest=x=>sha(stable(x));
const median=a=>{
  if(!a.length)return 0;
  const x=[...a].sort((a,b)=>a-b),mid=Math.floor(x.length/2);
  return x.length%2?x[mid]:(x[mid-1]+x[mid])/2;
};
export function grupoF002(domain){
  const d=String(domain??'').toLowerCase();
  if(/cripto_global|mercado_global|bolsas|mercados|fx|tasas_mercado/.test(d))return 'mercados';
  if(/banca|bis|liquidez|curva_tesoro|tasas_|bonos|interest/.test(d))return 'banca_tasas';
  if(/posicion|derivad|swap|etf|fondos|finra|off.exchange|otc|blockchain|defi|cripto_onchain|opciones/.test(d))
    return 'flujos_derivados';
  if(/macro|empleo|electric|energia|commodity|commodities|maritim|futuros_con_vencimiento|transporte|inflacion/.test(d))
    return 'economia_real';
  if(/clima|sismo|geo|noticia|conflicto|desastre|atmosfer|trafico_aereo|air/.test(d))
    return 'eventos_ambiente';
  return 'otros';
}
function btc(s){
  let best=null;
  for(const x of s.state.values()){
    if(x.domain!=='cripto_global'||x.variable!=='BTC_USD_spot'||x.unit!=='USD'||
       !/coinbase\.com$/i.test(new URL(x.source_url).hostname)||
       !finite(x.value)||x.value<=0)continue;
    const time=Date.parse(x.observed_at),known=Date.parse(x.known_at),at=Date.parse(s.at);
    if(known>at||time>at||at-time>30*60000||known<time)continue;
    if(!best||time>Date.parse(best.observed_at))best=x;
  }
  return best;
}
function snapshotList(captures){
  need(Array.isArray(captures),'se requieren capturas EF002 verificables');
  const all=captures.map(estadoDeCaptura).sort((a,b)=>a.at.localeCompare(b.at));
  const times=new Set(),hashes=new Set();
  for(const x of all){
    need(!times.has(x.at)&&!hashes.has(x.capture_sha256),'capturas duplicadas');
    times.add(x.at);hashes.add(x.capture_sha256);
  }
  return all;
}
/* Cada serie se compara sólo consigo misma (dominio, variable, unidad y
 * proveedor). El resultado adimensional NO suma USD con tasas o conteos.
 * Se agregan medianas de cambios *observados*, nunca valores crudos.
 */
export function cambiosF002(previous,current,{freshnessHours=48}={}){
  need(finite(freshnessHours)&&freshnessHours>0,'frescura inválida');
  const groups=new Map(F002_GROUPS.map(x=>[x,{group:x,shocks:[],fresh:0,
    repeated:0,missing:0,stale:0,seen:0}]));
  const cut=Date.parse(current.at),prevCut=Date.parse(previous.at);
  for(const [key,cur] of current.state){
    const group=groups.get(grupoF002(cur.domain));
    group.seen++;
    const pre=previous.state.get(key);
    if(!pre){group.missing++;continue}
    if(Date.parse(cur.known_at)>cut||Date.parse(cur.observed_at)>cut||
       Date.parse(pre.known_at)>prevCut){group.missing++;continue}
    if(Date.parse(cur.observed_at)<=Date.parse(pre.observed_at)){
      group.repeated++;continue;
    }
    if(cut-Date.parse(cur.observed_at)>freshnessHours*HOUR){
      group.stale++;continue;
    }
    if(!finite(cur.value)||!finite(pre.value)){group.missing++;continue}
    // Relación simétrica de un mismo indicador; el denominador siempre es positivo.
    const shock=clamp(2*(cur.value-pre.value)/
      Math.max(1e-12,Math.abs(cur.value)+Math.abs(pre.value)), -2,2);
    group.shocks.push(shock);
    group.fresh++;
  }
  const one=btc(previous),two=btc(current);
  const momentum=one&&two&&Date.parse(two.observed_at)>Date.parse(one.observed_at)?
    Math.log(two.value/one.value):null;
  const features=F002_GROUPS.flatMap(id=>{
    const g=groups.get(id);
    return [g.fresh?median(g.shocks):0,Math.min(1,g.fresh/8)];
  }).concat(momentum??0);
  need(features.length===F002_FEATURE_NAMES.length&&features.every(finite),
    'rasgos F002 inválidos');
  const accounting=[...groups.values()].map(g=>({
    group:g.group,seen:g.seen,fresh:g.fresh,repeated:g.repeated,
    missing:g.missing,stale:g.stale,
    status:g.fresh?'new_data':g.seen?'no_new_verified_values':'not_observed'
  }));
  return {features,accounting,
    matched_price_momentum:momentum!==null,
    signal_values_summed_across_units:false,
    missing_encoded_with_explicit_presence:true};
}
export function prepararPanelF002(captures,{
  horizonHours=6,toleranceHours=2,freshnessHours=48
}={}){
  need([horizonHours,toleranceHours,freshnessHours].every(finite)&&
    horizonHours>0&&toleranceHours>=0&&toleranceHours<horizonHours&&freshnessHours>0,
    'horizonte/tolerancia inválidos');
  const list=snapshotList(captures),samples=[];
  let matched=0,missed=0,skippedOverlapping=0;
  let lastIndependentDecision=-Infinity;
  const usedOutcomeCaptures=new Set();
  for(let i=1;i<list.length;i++){
    const previous=list[i-1],now=list[i],ref=btc(now);
    const input=cambiosF002(previous,now,{freshnessHours});
    if(!ref){missed++;continue}
    const decision=Date.parse(now.at),target=decision+horizonHours*HOUR;
    // Cortes repetidos dentro de una ventana no son experimentos independientes.
    // El futuro usado como etiqueta se reserva para una única decisión.
    if(decision-lastIndependentDecision<horizonHours*HOUR*.85){
      skippedOverlapping++;continue;
    }
    // El precio objetivo debe existir en un archivo FUTURO, nunca ser rellenado.
    const candidates=list.slice(i+1).map(s=>({s,price:btc(s)})).filter(x=>
      x.price&&Date.parse(x.price.observed_at)>decision&&
      Math.abs(Date.parse(x.s.at)-target)<=toleranceHours*HOUR);
    candidates.sort((a,b)=>
      Math.abs(Date.parse(a.s.at)-target)-Math.abs(Date.parse(b.s.at)-target)||
      a.s.at.localeCompare(b.s.at));
    const independent=candidates.find(x=>!usedOutcomeCaptures.has(x.s.capture_sha256));
    if(!independent){skippedOverlapping++;continue}
    if(!candidates.length){missed++;continue}
    const {s,price}=independent;
    const y=Math.log(price.value/ref.value);
    if(!finite(y)||Math.abs(y)>1){missed++;continue}
    samples.push({decision_at:now.at,decision_sha256:now.capture_sha256,
      origin_price:ref.value,origin_observed_at:ref.observed_at,
      origin_known_at:ref.known_at,target_at:iso(target),
      outcome_capture_at:s.at,outcome_observed_at:price.observed_at,
      outcome_capture_sha256:s.capture_sha256,
      actual_price:price.value,actual_log_return:y,
      features:input.features,accounting:input.accounting});
    usedOutcomeCaptures.add(s.capture_sha256);
    lastIndependentDecision=decision;
    matched++;
  }
  const latest=list.length>=2?cambiosF002(list.at(-2),list.at(-1),
    {freshnessHours}):null;
  const final=list.at(-1)??null,spot=final?btc(final):null;
  const catalog=new Map();
  for(const snapshot of list)for(const row of snapshot.state.values()){
    const group=grupoF002(row.domain);
    const key=row.domain+'|'+row.variable+'|'+row.unit+'|'+new URL(row.source_url).hostname;
    if(!catalog.has(key))catalog.set(key,{group,domain:row.domain,
      variable:row.variable,unit:row.unit});
  }
  const sourceGroups=new Map();
  for(const x of captures.at(-1)?.source_status??[]){
    const key=String(x.group??'other'),g=sourceGroups.get(key)??{
      group:key,observed:0,restricted:0,failed:0};
    if(x.status==='observed')g.observed++;
    else if(/license|credential|restricted|contact/.test(String(x.status)))g.restricted++;
    else g.failed++;
    sourceGroups.set(key,g);
  }
  return {schema:F002_SCHEMA,archive_count:list.length,
    latest_capture_at:final?.at??null,
    latest_capture_sha256:final?.capture_sha256??null,
    asset:'BTC-USD',target_horizon_hours:horizonHours,tolerance_hours:toleranceHours,
    matched_outcomes:matched,unmatched_decisions:missed,
    skipped_correlated_decisions:skippedOverlapping,
    historical_pairs:samples,latest_input:latest,
    latest_spot:spot?{price:spot.value,observed_at:spot.observed_at,
      known_at:spot.known_at,source_url:spot.source_url}:null,
    distinct_source_series:catalog.size,
    all_archived_observed_series_considered:true,
    domains:[...new Set([...catalog.values()].map(x=>x.domain))].sort(),
    source_groups:[...sourceGroups.values()].sort((a,b)=>a.group.localeCompare(b.group)),
    historical_input_groups:latest?.accounting??[],
    provenance:list.map(x=>({at:x.at,capture_sha256:x.capture_sha256,
      snapshot_sha256:x.snapshot_sha256})),
    missing_inputs_not_market_zero:true};
}
/* Auditoría ORIGINAL sin descartar ni redondear las señales individuales.
 * El modelo reducido nunca reemplaza este registro de medidas crudas.
 * No se incluyen URLs con query strings que pudieran revelar credenciales.
 */
export function trazaOriginalF002(captures){
  const ordered=snapshotList(captures);
  if(!ordered.length)return {schema:'laplace-f002-raw-state-trace-v1',
    status:'no_archive',signals:[],observed_states:0};
  const now=ordered.at(-1),previous=ordered.length>1?ordered.at(-2):null;
  const keys=new Set([...now.state.keys(),...(previous?.state.keys()??[])]);
  const rows=[];
  for(const key of [...keys].sort()){
    const cur=now.state.get(key)??null,pre=previous?.state.get(key)??null,
      selected=cur??pre,group=grupoF002(selected.domain);
    const observed=cur?Date.parse(cur.observed_at):null;
    const older=pre?Date.parse(pre.observed_at):null;
    let status,normalized=null;
    if(!cur)status='not_in_latest_capture';
    else if(!pre)status='new_series_without_previous';
    else if(observed<=older)status='observation_not_new';
    else{
      status='new_verified_observation';
      normalized=clamp(2*(cur.value-pre.value)/
        Math.max(1e-12,Math.abs(cur.value)+Math.abs(pre.value)),-2,2);
    }
    rows.push({series_key:key,group,domain:selected.domain,
      variable:selected.variable,unit:selected.unit,
      source_hostname:new URL(selected.source_url).hostname,
      status,previous_value:pre?.value??null,
      current_value:cur?.value??null,
      previous_observed_at:pre?.observed_at??null,
      current_observed_at:cur?.observed_at??null,
      current_known_at:cur?.known_at??null,
      normalized_change:normalized});
  }
  const body={schema:'laplace-f002-raw-state-trace-v1',
    at:now.at,capture_sha256:now.capture_sha256,
    previous_capture_sha256:previous?.capture_sha256??null,
    source_series_all_latest_or_previous:rows.length,
    observed_states:now.state.size,
    unrounded_original_values_retained:true,
    missing_is_not_zero:true,
    signals:rows};
  return {...body,trace_sha256:digest(body)};
}
function solve(A,b){
  const n=b.length,rows=A.map((x,i)=>[...x,b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    if(Math.abs(rows[pivot][k])<1e-11)return null;
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];
    const den=rows[k][k];
    for(let j=k;j<=n;j++)rows[k][j]/=den;
    for(let i=0;i<n;i++)if(i!==k){
      const n=rows[i][k];
      for(let j=k;j<=n;j++)rows[i][j]-=n*rows[k][j];
    }
  }
  return rows.map(x=>x[n]);
}
function train(rows,lambda){
  const n=F002_FEATURE_NAMES.length,means=Array.from({length:n},(_,j)=>
    mean(rows.map(r=>r.features[j])));
  const scales=Array.from({length:n},(_,j)=>
    Math.max(1e-5,Math.sqrt(mean(rows.map(r=>
      (r.features[j]-means[j])**2)))));
  const X=rows.map(r=>r.features.map((v,j)=>(v-means[j])/scales[j]));
  const yMean=mean(rows.map(r=>r.actual_log_return));
  const A=Array.from({length:n},(_,j)=>Array.from({length:n},(_,k)=>
    X.reduce((sum,row)=>sum+row[j]*row[k],0)+(j===k?lambda:0)));
  const b=Array.from({length:n},(_,j)=>X.reduce((sum,row,i)=>
    sum+row[j]*(rows[i].actual_log_return-yMean),0));
  const coefficients=solve(A,b);
  need(coefficients&&coefficients.every(finite),'regresión inestable');
  return {kind:'ridge_on_verified_joint_shocks',feature_names:F002_FEATURE_NAMES,
    means,scales,intercept:yMean,coefficients,lambda,
    trained_rows:rows.length,training_cutoff:rows.at(-1).decision_at,
    training_last_outcome:rows.at(-1).outcome_capture_at};
}
function predict(model,features){
  need(features?.length===model.coefficients.length&&features.every(finite),
    'vector de predicción incompatible');
  return clamp(model.intercept+features.reduce((sum,v,j)=>
    sum+(v-model.means[j])/model.scales[j]*model.coefficients[j],0),-0.25,0.25);
}
function metrics(model,rows){
  const details=rows.map(r=>{
    const proposed=predict(model,r.features),actual=r.actual_log_return;
    const modelError=Math.abs(Math.exp(proposed)-Math.exp(actual))*100;
    const baselineError=Math.abs(1-Math.exp(actual))*100;
    return {decision_at:r.decision_at,target_at:r.outcome_capture_at,
      model_error_pct:modelError,baseline_error_pct:baselineError,
      proposed_return:proposed,actual_return:actual};
  });
  const base=mean(details.map(d=>d.baseline_error_pct));
  const err=mean(details.map(d=>d.model_error_pct));
  return {count:details.length,model_mae_pct:err,
    persistence_mae_pct:base,
    relative_improvement:base>0?1-err/base:null,
    paired_wins:details.filter(d=>d.model_error_pct<d.baseline_error_pct).length,
    details,
    prospectively_verified:false};
}
const abstain=(panel,reason,extra={})=>({schema:F002_SCHEMA,
  status:'abstained',reason,model_ready:false,archive_count:panel.archive_count,
  distinct_source_series:panel.distinct_source_series,
  observed_domains:panel.domains.length,source_groups:panel.source_groups,
  input_coverage:panel.historical_input_groups,
  matched_outcomes:panel.matched_outcomes,
  skipped_correlated_decisions:panel.skipped_correlated_decisions,
  required_training_pairs:24,required_validation_pairs:8,required_holdout_pairs:8,
  production_activation_allowed:false,prospectively_validated:false,
  central_f001_price_modified:false,automatic_trading:false,...extra});
/* El holdout no elige regularización ni features. Los targets que atraviesan
 * los límites de train/validation se purgan, aunque haya menos muestras.
 */
export function ejecutarPrediccionF002(captures,options={}){
  const panel=prepararPanelF002(captures,options),rows=panel.historical_pairs;
  if(rows.length<42)return abstain(panel,'insufficient_verified_market_outcomes',
    {observed_training_pairs:0,observed_validation_pairs:0,
      observed_holdout_pairs:0});
  const trainEnd=Math.floor(rows.length*.6),validationEnd=Math.floor(rows.length*.8);
  const valStart=Date.parse(rows[trainEnd].decision_at);
  const holdStart=Date.parse(rows[validationEnd].decision_at);
  const fitRows=rows.slice(0,trainEnd).filter(x=>
    Date.parse(x.outcome_capture_at)<=valStart);
  const validateRows=rows.slice(trainEnd,validationEnd).filter(x=>
    Date.parse(x.outcome_capture_at)<=holdStart);
  const holdRows=rows.slice(validationEnd);
  const counts={observed_training_pairs:fitRows.length,
    observed_validation_pairs:validateRows.length,
    observed_holdout_pairs:holdRows.length};
  if(fitRows.length<24||validateRows.length<8||holdRows.length<8)
    return abstain(panel,'insufficient_nonoverlapping_train_validation_holdout',counts);
  const candidates=[1,10,100].map(lambda=>{
    const model=train(fitRows,lambda),validation=metrics(model,validateRows);
    return {model,validation};
  }).sort((a,b)=>a.validation.model_mae_pct-b.validation.model_mae_pct||
    a.model.lambda-b.model.lambda);
  const best=candidates[0],holdout=metrics(best.model,holdRows);
  const validation={...best.validation,details:undefined};
  const test={...holdout,details:undefined};
  const modelSha=digest(best.model);
  const audit={...counts,validation,holdout:test,selected_lambda:best.model.lambda,
    model_sha256:modelSha,
    selected_only_from_validation:true,
    holdout_not_used_for_selection:true,
    training_labels_do_not_cross_validation:true,
    validation_labels_do_not_cross_holdout:true,
    model_evaluation_is_retrospective:true};
  const valid=validation.relative_improvement>0&&test.relative_improvement>0;
  const latestAt=Date.parse(panel.latest_capture_at??'');
  const latest=panel.latest_spot,feat=panel.latest_input;
  const issuedAt=Date.parse(options.issuedAt??panel.latest_capture_at);
  const fresh=latest&&feat?.matched_price_momentum===true&&
    latestAt-Date.parse(latest.observed_at)<=30*60000;
  // Una ejecución diferida no debe reconstruir un pronóstico "emitido"
  // antes de conocer una vela futura. La emisión tiene hora real independiente.
  const publishedInTime=Number.isFinite(issuedAt)&&issuedAt>=latestAt&&
    issuedAt-latestAt<=30*60000&&
    issuedAt+60*60000<=latestAt+panel.target_horizon_hours*HOUR;
  if(!valid||!fresh||!publishedInTime)return abstain(panel,!valid?
    'no_confirmed_out_of_sample_advantage':!fresh?
    'latest_verified_price_unavailable':'snapshot_not_fresh_at_publication',{
      ...audit,model_ready:true,retrospective_candidate_only:true,
      publication_cutoff:iso(Number.isFinite(issuedAt)?issuedAt:latestAt)});
  const returnLog=predict(best.model,feat.features);
  const body={schema:'laplace-f002-shadow-forecast-v1',status:'shadow_forecast_frozen',
    asset:'BTC-USD',decision_at:panel.latest_capture_at,
    issued_at:iso(issuedAt),
    target_at:iso(latestAt+panel.target_horizon_hours*HOUR),
    tolerance_hours:panel.tolerance_hours,
    decision_capture_sha256:panel.latest_capture_sha256,
    reference_observed_at:latest.observed_at,
    reference_known_at:latest.known_at,reference_price:latest.price,
    estimated_return_log:returnLog,
    estimated_price_unrounded:latest.price*Math.exp(returnLog),
    model_sha256:modelSha,source_series_count:panel.distinct_source_series,
    feature_names:F002_FEATURE_NAMES,feature_values:feat.features,
    source_accounting:feat.accounting,
    validation_mae_pct:validation.model_mae_pct,
    holdout_mae_pct:test.model_mae_pct,
    baseline_holdout_mae_pct:test.persistence_mae_pct,
    retrospective_only:true,prospective_validated:false,
    automatic_trading:false,production_activation_allowed:false};
  const forecast={...body,forecast_sha256:digest(body)};
  return {schema:F002_SCHEMA,status:'experimental_shadow_frozen',reason:null,
    model_ready:true,forecast,training:audit,
    archive_count:panel.archive_count,distinct_source_series:panel.distinct_source_series,
    observed_domains:panel.domains.length,source_groups:panel.source_groups,
    input_coverage:panel.historical_input_groups,
    matched_outcomes:panel.matched_outcomes,
    retrospective_gain_seen:true,prospectively_validated:false,
    central_f001_price_modified:false,automatic_trading:false,
    production_activation_allowed:false};
}
export function verificarPronosticoF002(f){
  need(f?.schema==='laplace-f002-shadow-forecast-v1'&&
    f.status==='shadow_forecast_frozen'&&
    f.automatic_trading===false&&f.production_activation_allowed===false,
    'no es un pronóstico F002 experimental válido');
  const {forecast_sha256,...body}=f;
  need(/^[a-f0-9]{64}$/.test(forecast_sha256??'')&&
    digest(body)===forecast_sha256,'pronóstico F002 alterado');
  return true;
}
export function evaluarPronosticoF002(f,captures){
  verificarPronosticoF002(f);
  const list=snapshotList(captures);
  const target=Date.parse(f.target_at),decision=Date.parse(f.decision_at),
    issued=Date.parse(f.issued_at);
  need(Number.isFinite(issued)&&issued>=decision&&
    issued-decision<=30*60000&&target>issued+60*60000,
    'pronóstico emitido tarde o fuera del tiempo verificable');
  const eligible=list.filter(x=>Date.parse(x.at)>decision).map(s=>({s,price:btc(s)}))
    .filter(x=>x.price&&Date.parse(x.price.observed_at)>decision&&
      Math.abs(Date.parse(x.s.at)-target)<=f.tolerance_hours*HOUR)
    .sort((a,b)=>
      Math.abs(Date.parse(a.s.at)-target)-Math.abs(Date.parse(b.s.at)-target));
  if(!eligible.length){
    return {schema:'laplace-f002-prospective-v1',status:list.some(x=>
      Date.parse(x.at)>target+f.tolerance_hours*HOUR)?
      'unscorable_missed_target_window':'waiting_for_outcome',
      forecast_sha256:f.forecast_sha256,evaluated:0,
      no_fictitious_zero:true,automatic_trading:false};
  }
  const {s,price}=eligible[0];
  const modelError=Math.abs(f.estimated_price_unrounded-price.value)/f.reference_price*100;
  const baselineError=Math.abs(f.reference_price-price.value)/f.reference_price*100;
  const result={schema:'laplace-f002-prospective-v1',status:'prospective_outcome_measured',
    forecast_sha256:f.forecast_sha256,decision_at:f.decision_at,
    target_at:f.target_at,evaluated_at:s.at,outcome_capture_sha256:s.capture_sha256,
    actual_observed_at:price.observed_at,actual_known_at:price.known_at,
    actual_price:price.value,reference_price:f.reference_price,
    experimental_estimate:f.estimated_price_unrounded,
    model_abs_error_pct:modelError,baseline_abs_error_pct:baselineError,
    paired_improvement_pct:baselineError-modelError,
    prospectively_measured:true,automatic_trading:false,
    production_activation_allowed:false};
  return {...result,evaluation_sha256:digest(result)};
}
export function resumirValidacionProspectivaF002(evaluations=[]){
  const unique=new Map();
  for(const x of evaluations){
    if(x?.status!=='prospective_outcome_measured')continue;
    if(unique.has(x.forecast_sha256)){
      need(unique.get(x.forecast_sha256).evaluation_sha256===x.evaluation_sha256,
        'dos evaluaciones contradictorias del mismo pronóstico');
      continue;
    }
    const {evaluation_sha256,...body}=x;
    need(digest(body)===evaluation_sha256,'evaluación retrospectivamente modificada');
    unique.set(x.forecast_sha256,x);
  }
  const rows=[...unique.values()];
  const model=mean(rows.map(x=>x.model_abs_error_pct));
  const base=mean(rows.map(x=>x.baseline_abs_error_pct));
  return {schema:'laplace-f002-prospective-scorecard-v1',
    evaluated_forecasts:rows.length,
    model_mae_pct:rows.length?model:null,baseline_mae_pct:rows.length?base:null,
    positive_paired_differences:rows.filter(x=>x.paired_improvement_pct>0).length,
    status:rows.length<24?'insufficient_prospective_outcomes':
      model<base?'prospectively_better_on_sample':'no_prospective_advantage',
    prospective_advantage_proven:false,production_activation_allowed:false,
    automatic_trading:false};
}
