/* C03 conecta las series individuales al cálculo conjunto existente F002.
 * Los niveles conservan su unidad y proveedor; no se promedian por familia.
 * El circuito XI/Ether permanece como referencia independiente. Este modelo
 * contextual no se fusiona con C02 sin una comparación prospectiva emparejada.
 */
import {createHash} from 'node:crypto';
import {estadoDeCaptura} from '../demonio/series.mjs';
import {CAPABILITY_CATALOG} from '../nucleo/registro-capacidades.mjs';
import {prepararSerie} from './fusion-temporal.mjs';
import {prepararPanelF002,ajustarRidgeConjunto,predecirRidgeConjunto,
  medirRidgeConjunto} from './conjunta-f002.mjs';

export const C03_SCHEMA='laplace-joint-individual-series-c03-v1';
const HOUR=3600000,need=(ok,m)=>{if(!ok)throw Error(m)};
const finite=Number.isFinite,mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const version=r=>JSON.stringify([r.observed_at,r.value]);

export function componenteDeSerieC03(domain){
  const d=String(domain).toLowerCase();
  if(/bis|banca/.test(d))return 'B001';
  if(/etf|fondos/.test(d))return 'C001';
  if(/finra|off.exchange|ats/.test(d))return 'O001';
  if(/derivad|swap|opciones|funding|futuros/.test(d))return 'D001_D002';
  if(/blockchain|defi|onchain/.test(d))return 'K001';
  if(/liquidez|microestructura|order|libro|^flujo$/.test(d))return 'ORDER_FLOW';
  if(/clima|noaa|sismo|atmosfer|geomag/.test(d))return 'NOAA_EUR';
  if(/geo|noticia|conflicto|social|narrativa/.test(d))return 'CAUSAL';
  if(/bolsas|mercado_global/.test(d))return 'EQUITIES';
  return 'WORLD';
}

function snapshots(captures,asOf){
  need(Array.isArray(captures),'C03 requiere capturas verificables');
  const cut=Date.parse(asOf);need(finite(cut),'C03 requiere corte UTC');
  const pairs=captures.map(c=>({raw:c,s:estadoDeCaptura(c)}))
    .filter(x=>Date.parse(x.s.at)<=cut).sort((a,b)=>a.s.at.localeCompare(b.s.at));
  const times=new Set(),hashes=new Set();
  for(const {s}of pairs){need(!times.has(s.at)&&!hashes.has(s.capture_sha256),
    'C03: captura duplicada');times.add(s.at);hashes.add(s.capture_sha256)}
  return pairs;
}

// Los veinte componentes tienen un papel explícito. Un catálogo no afirma
// que un ejecutor, escenario o experimento haya corrido cuando sólo hay datos.
function manifest(series,{trained=false}={}){
  const counts=new Map();for(const s of series)counts.set(s.component,(counts.get(s.component)??0)+1);
  const roles={XN01:'native_baseline',XN01_RAW:'native_provenance',X002:'temporal_fit_and_calibration',
    XG01:'heldout_sensitivity',M001_DIARY:'prospective_scoring',U002_XI:'native_execution',
    EF001_EF005:'verified_bitemporal_input',EF003:'conditional_scenarios',
    EF004:'separate_joint_evolution',RAW_V001:'unrounded_contribution_trace'};
  return CAPABILITY_CATALOG.map(c=>({id:c.id,key:c.key,title:c.title,
    role:roles[c.key]??'individual_numeric_features',series:counts.get(c.key)??0,
    status:counts.has(c.key)?(trained?'used_in_fitted_features':'observed_waiting_for_outcomes'):
      c.key==='EF001_EF005'?'capture_hashes_and_cutoffs_checked':
      c.key==='X002'&&trained?'executed_temporal_splits':
      c.key==='XG01'&&trained?'executed_holdout_sensitivity':
      c.key==='RAW_V001'&&trained?'individual_contributions_emitted':'not_supplied_to_c03'}));
}

function catalogAt(list,trainCut){
  const catalog=new Map();
  for(const {s} of list){if(Date.parse(s.at)>trainCut)break;
    for(const [id,r]of s.state){
      const c=catalog.get(id)??{id,component:componenteDeSerieC03(r.domain),
        domain:r.domain,variable:r.variable,unit:r.unit,
        source_hostname:new URL(r.source_url).hostname,values:[],releases:[],last:null};
      c.values.push(Math.abs(r.value));
      if(c.last!==version(r)){c.releases.push(Date.parse(s.at));c.last=version(r)}
      catalog.set(id,c);
    }
  }
  return [...catalog.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>({
    id:c.id,component:c.component,domain:c.domain,variable:c.variable,unit:c.unit,
    source_hostname:c.source_hostname,level_scale:Math.max(1e-9,median(c.values)||1),
    release_cadence_ms:Math.max(HOUR,median(c.releases.slice(1).map((x,i)=>x-c.releases[i]))||48*HOUR)
  }));
}

function featureViews(list){
  const seen=new Map(),out=new Map();
  for(const {s} of list){const values=new Map();
    for(const [id,r]of s.state){const old=seen.get(id),changed=old?.version!==version(r);
      const row={row:r,version:version(r),first_seen:changed?Date.parse(s.at):old.first_seen,
        shock:old&&changed?2*(r.value-old.row.value)/Math.max(1e-12,Math.abs(r.value)+Math.abs(old.row.value)):0};
      seen.set(id,row);values.set(id,row);
    }out.set(s.at,values);
  }return out;
}

function features(catalog,view,at){
  return catalog.flatMap(c=>{const x=view?.get(c.id);if(!x)return [0,0,0,0];
    return [Math.asinh(x.row.value/c.level_scale),clip(x.shock,-2,2),
      Math.exp(-Math.max(0,at-x.first_seen)/c.release_cadence_ms),1];
  });
}
const featureNames=catalog=>catalog.flatMap(c=>['level_asinh','new_release_shock','release_freshness','present'].map(x=>c.id+':'+x));
function withoutDetails(m){const {details,...rest}=m;return rest}

// Las capturas del mundo no llegan al segundo exacto del objetivo. El adaptador
// empareja cada decisión con una vela cerrada y un objetivo de cierre exacto,
// utilizando el mismo contrato OHLCV de F001. No rellena velas ausentes.
function candlePanel(list,targetCandles,horizonHours,asOf){
  const g=targetCandles.granularity,h=horizonHours*3600/g;
  need(Number.isSafeInteger(h)&&h>=1,'C03: plazo incompatible con velas');
  const prepared=prepararSerie(targetCandles.rows,{granularity:g,cutoff:asOf});
  const index=new Map(prepared.bars.map((r,i)=>[(r[0]+g)*1000,i]));
  const pairs=[];let lastTarget=-Infinity;
  for(const {s}of list){const cut=Date.parse(s.at),origin=Math.floor(cut/(g*1000))*g*1000;
    const target=origin+h*g*1000,i=index.get(origin),j=index.get(target);
    if(i===undefined||j===undefined||target<=cut||cut<lastTarget||prepared.gaps[i]!==prepared.gaps[j])continue;
    const reference=prepared.bars[i][4],actual=prepared.bars[j][4];
    pairs.push({decision_at:s.at,decision_sha256:s.capture_sha256,
      origin_price:reference,origin_observed_at:new Date(origin).toISOString(),
      target_at:new Date(target).toISOString(),outcome_capture_at:new Date(target).toISOString(),
      actual_price:actual,actual_log_return:Math.log(actual/reference)});
    lastTarget=target;
  }
  const latest=list.at(-1).s,origin=Math.floor(Date.parse(latest.at)/(g*1000))*g*1000;
  const i=index.get(origin);
  return {historical_pairs:pairs,latest_spot:i===undefined?null:{price:prepared.bars[i][4]},
    latest_target_at:origin+h*g*1000,
    label_kind:'retrospective_closed_OHLCV_not_prospective_or_vintage_certified'};
}

/** Los pesos y la selección sólo ven train/validation. Calibración y prueba
 * son bloques posteriores separados; el precio no observado nunca se rellena.
 */
export function ejecutarConjuntoC03(captures,{asOf=new Date().toISOString(),
  asset='BTC-USD',horizonHours=6,toleranceHours=0,nativeResult=null,targetCandles=null}={}){
  need(finite(horizonHours)&&horizonHours>0,'C03: horizonte inválido');
  const list=snapshots(captures,asOf),latest=list.at(-1)?.s;
  const observed=latest?[...latest.state.values()].map(r=>({component:componenteDeSerieC03(r.domain)})):[];
  const native=nativeResult?.nativeXI===true&&nativeResult?.qubits===1000;
  const base={schema:C03_SCHEMA,asset,horizon_hours:horizonHours,as_of:asOf,
    archive_count:list.length,latest_capture_at:latest?.at??null,
    status:'abstained',model_ready:false,components:manifest(observed),
    source_series:latest?.state.size??0,native_baseline_retained:true,
    native_lqt1000_result_available:native,
    central_price_modified:false,prospectively_validated:false,automatic_trading:false};
  if(asset!=='BTC-USD')return {...base,reason:'asset_has_no_verified_c03_target_adapter'};
  if(list.length<2)return {...base,reason:'independent_world_history_unavailable'};
  const panel=targetCandles?candlePanel(list,targetCandles,horizonHours,asOf):
    prepararPanelF002(list.map(x=>x.raw),{horizonHours,toleranceHours});
  const rows=panel.historical_pairs,n=rows.length;
  const a=Math.floor(n*.55),b=Math.floor(n*.70),c=Math.floor(n*.85);
  const before=(r,end)=>Date.parse(r.outcome_capture_at)<Date.parse(end.decision_at);
  const train=rows.slice(0,a).filter(r=>rows[a]&&before(r,rows[a]));
  const val=rows.slice(a,b).filter(r=>rows[b]&&before(r,rows[b]));
  const cal=rows.slice(b,c).filter(r=>rows[c]&&before(r,rows[c]));
  const test=rows.slice(c);
  const counts={matched_outcomes:n,training:train.length,validation:val.length,
    calibration:cal.length,test:test.length,required:{training:24,validation:8,calibration:8,test:8}};
  if(train.length<24||val.length<8||cal.length<8||test.length<8)
    return {...base,reason:'insufficient_purged_independent_outcomes',counts,
      label_kind:panel.label_kind??'verified_snapshot_prices_with_explicit_tolerance'};
  const catalog=catalogAt(list,Date.parse(train.at(-1).decision_at)),views=featureViews(list);
  need(catalog.length>0,'C03: no hay entradas numéricas entrenables');
  const names=featureNames(catalog);
  const convert=group=>group.map(r=>({...r,features:features(catalog,views.get(r.decision_at),Date.parse(r.decision_at))}));
  const tr=convert(train),va=convert(val),ca=convert(cal),te=convert(test);
  const options=[1,10,100].map(lambda=>{const model=ajustarRidgeConjunto(tr,lambda,names);
    return {model,validation:medirRidgeConjunto(model,va)}})
    .sort((x,y)=>x.validation.model_mae_pct-y.validation.model_mae_pct||x.model.lambda-y.model.lambda);
  const {model,validation}=options[0],holdout=medirRidgeConjunto(model,te);
  const residuals=ca.map(r=>r.actual_log_return-predecirRidgeConjunto(model,r.features)).sort((x,y)=>x-y);
  const quantile=p=>residuals[Math.min(residuals.length-1,Math.floor((residuals.length+1)*p))];
  const bounds=[quantile(.1),quantile(.9)],bins=[{up:0,n:0},{up:0,n:0}];
  for(const r of ca){const bin=bins[Number(predecirRidgeConjunto(model,r.features)>0)];bin.n++;bin.up+=r.actual_log_return>0}
  const probability=x=>{const bin=bins[Number(x>0)];return (bin.up+1)/(bin.n+2)};
  const brier=mean(te.map(r=>(probability(predecirRidgeConjunto(model,r.features))-Number(r.actual_log_return>0))**2));
  const coverage=mean(te.map(r=>{const p=predecirRidgeConjunto(model,r.features);return Number(r.actual_log_return>=p+bounds[0]&&r.actual_log_return<=p+bounds[1])}));
  const at=Date.parse(latest.at),input=features(catalog,views.get(latest.at),at),returnLog=predecirRidgeConjunto(model,input);
  const contributions=catalog.map((s,i)=>({...s,current_value:latest.state.get(s.id)?.value??null,
    current_observed_at:latest.state.get(s.id)?.observed_at??null,
    current_known_at:latest.state.get(s.id)?.known_at??null,present:input[i*4+3]===1,
    features:input.slice(i*4,i*4+4),coefficients:model.coefficients.slice(i*4,i*4+4),
    contribution_log_return:input.slice(i*4,i*4+4).reduce((sum,x,k)=>sum+
      (x-model.means[i*4+k])/model.scales[i*4+k]*model.coefficients[i*4+k],0)}));
  const sensitivity=[...new Set(catalog.map(x=>x.component))].map(component=>{
    const without={...model,coefficients:model.coefficients.map((x,i)=>catalog[Math.floor(i/4)].component===component?0:x)};
    const score=medirRidgeConjunto(without,te);
    return {component,without_component_mae_pct:score.model_mae_pct,
      difference_vs_full_pct:score.model_mae_pct-holdout.model_mae_pct,
      interpretation:'fixed_model_sensitivity_not_causal_or_retrained_ablation'};
  });
  const modelBody={model,catalog,bounds,bins},modelSHA256=hash(modelBody);
  const report={...base,model_ready:true,components:manifest(catalog,{trained:true}),counts,
    mathematical_method:'existing_F002_ridge_with_individual_series_and_release_clocks',
    feature_count:names.length,trained_series:catalog.length,model_sha256:modelSHA256,
    model:modelBody,selection:'validation_only',training_cutoff:train.at(-1).decision_at,
    labels_purged_at_every_boundary:true,holdout_used_for_fitting:false,
    calibration:{method:'direction_bins_laplace_smoothed',bins,interval_nominal_coverage:.8,
      calibration_cases:cal.length,coverage_is_not_guaranteed_under_shift:true},
    holdout:{...withoutDetails(holdout),brier,observed_interval_coverage:coverage},
    validation:withoutDetails(validation),sensitivity,contributions,
    split_boundaries:{training_last_label:train.at(-1).outcome_capture_at,
      validation_first_decision:val[0].decision_at,validation_last_label:val.at(-1).outcome_capture_at,
      calibration_first_decision:cal[0].decision_at,calibration_last_label:cal.at(-1).outcome_capture_at,
      test_first_decision:test[0].decision_at},
    label_kind:panel.label_kind??'verified_snapshot_prices_with_explicit_tolerance',
    unknown_latest_series:[...latest.state.keys()].filter(id=>!catalog.some(c=>c.id===id)),
    original_units_never_summed:true,forecast:null};
  const issued=Date.parse(asOf),spot=panel.latest_spot;
  const target=panel.latest_target_at??at+horizonHours*HOUR;
  if(!spot||issued<at||issued>=target||issued-at>Math.min(.5,horizonHours/2)*HOUR)
    return {...report,reason:'latest_world_capture_not_fresh_at_issue'};
  const body={schema:'laplace-c03-context-forecast-v1',asset,issued_at:asOf,decision_at:latest.at,
    target_at:new Date(target).toISOString(),model_sha256:modelSHA256,
    decision_capture_sha256:latest.capture_sha256,reference_price:spot.price,
    estimated_price:spot.price*Math.exp(returnLog),estimated_return_log:returnLog,
    probability_up:probability(returnLog),lower:spot.price*Math.exp(returnLog+bounds[0]),
    upper:spot.price*Math.exp(returnLog+bounds[1]),
    mode:'context_candidate_requires_paired_prospective_comparison_with_C02'};
  return {...report,status:'experimental_context_candidate',reason:null,
    forecast:{...body,forecast_sha256:hash(body)}};
}
