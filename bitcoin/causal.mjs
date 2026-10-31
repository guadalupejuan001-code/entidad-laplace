/* LaPlaceDIG — capa observacional de trayectorias causales para BTC.
 * No sustituye el motor XI/Ether, no demuestra causalidad ni emite ordenes.
 * Todo pronostico se calcula con hechos conocidos en su corte UTC.
 */
import {timestamp,canonicalLedger,ledgerHash} from '../historia/contrato.mjs';
import {historicalView,MODES} from './calibracion.mjs';

const HOUR=3600000, DAY=24*HOUR;
const requireTrue=(ok,message)=>{if(!ok)throw Error(message)};
export const CAUSAL_VERSION='laplace-btc-causal-trajectory-v1';
const keyOf=event=>event.kind+'|'+event.event_code;
const iso=ms=>new Date(ms).toISOString();
const probability=(successes,total)=>(successes+1)/(total+2);
const round=(value,digits=6)=>Number(value.toFixed(digits));
const isEvent=e=>e.kind==='geopolitica'||e.kind==='humanitaria';
const range=(value,min,max,name)=>{
  requireTrue(Number.isSafeInteger(value)&&value>=min&&value<=max,name+' fuera de rango');
  return value;
};
function options(config={}){
  const asset=config.asset??'BTC-USD';
  requireTrue(asset==='BTC-USD','Esta etapa opera SOLO BTC-USD');
  return {asset,horizon_hours:range(config.horizonHours??24,1,168,'horizonHours'),
    lookback_hours:range(config.lookbackHours??72,1,24*30,'lookbackHours'),
    min_samples:range(config.minSamples??8,4,1000,'minSamples')};
}
function knownEvents(ledger,decision,lookback){
  const end=Date.parse(decision),begin=end-lookback*HOUR;
  return ledger.filter(row=>isEvent(row)&&Date.parse(row.known_at)<=end&&
    Date.parse(row.known_at)>begin&&Date.parse(row.observed_at)<=end);
}
function priceTimeline(ledger,asset,cutoff){
  // Observaciones diarias coherentes; las cotizaciones spot solo aparecen como
  // ultima referencia, no se confunden con un cierre diario.
  const allowed=ledger.filter(row=>row.kind==='precio'&&row.asset===asset&&row.known_at<=cutoff);
  const close=allowed.filter(row=>row.price_basis==='raw_close').sort((a,b)=>
    a.observed_at.localeCompare(b.observed_at)||a.known_at.localeCompare(b.known_at));
  const unique=new Map();
  for(const row of close)unique.set(row.observed_at,row);
  const prices=[...unique.values()];
  const last=[...allowed].sort((a,b)=>
    a.observed_at.localeCompare(b.observed_at)||a.known_at.localeCompare(b.known_at)).at(-1)??null;
  return {prices,last};
}
function trainingSamples(known,cutoff,opts){
  const {prices}=priceTimeline(known,opts.asset,cutoff);
  const indexed=new Map(prices.map(row=>[row.observed_at,row]));
  const samples=[];
  for(const first of prices){
    // Se exige que el cierre inicial estuviese disponible en el propio corte.
    if(first.known_at>first.observed_at)continue;
    const due=iso(Date.parse(first.observed_at)+opts.horizon_hours*HOUR);
    const last=indexed.get(due);
    if(!last||last.known_at>cutoff)continue;
    const a=Number(first.value),b=Number(last.value);
    if(!(a>0&&b>0))continue;
    const events=knownEvents(known,first.observed_at,opts.lookback_hours);
    samples.push({decision_at:first.observed_at,due_at:due,
      net_return_pct:(b/a-1)*100,positive:Number(b>a),
      exposure:[...new Set(events.map(keyOf))]});
  }
  return samples;
}
function wilson(successes,n){
  if(!n)return null;
  const z=1.96,p=successes/n,d=1+z*z/n;
  const center=(p+z*z/(2*n))/d;
  const half=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;
  return [round(Math.max(0,center-half)),round(Math.min(1,center+half))];
}
function sumGroup(rows){
  const count=rows.length,positives=rows.reduce((s,row)=>s+row.positive,0);
  const mean_return_pct=count?round(rows.reduce((s,row)=>s+row.net_return_pct,0)/count):null;
  return {count,positive_count:positives,p_up_smoothed:count?round(probability(positives,count)):null,
    positive_rate_95pct_wilson:wilson(positives,count),mean_return_pct};
}
function at(ledger,cutoff,opts){
  const observed=ledger.filter(row=>row.known_at<=cutoff);
  const {last}=priceTimeline(observed,opts.asset,cutoff);
  const events=knownEvents(observed,cutoff,opts.lookback_hours);
  // Numero total de registros conocidos del tipo, no de causas fisicas
  // independientes: varias fuentes pueden describir el mismo suceso.
  const historicalTotals=new Map();
  for(const event of observed.filter(isEvent)){
    const key=keyOf(event);
    historicalTotals.set(key,(historicalTotals.get(key)??0)+1);
  }
  const counts=new Map();
  for(const event of events){
    const key=keyOf(event),old=counts.get(key)??{code:key,repetitions:0,first_known_at:event.known_at,last_known_at:event.known_at};
    old.repetitions++;old.last_known_at=event.known_at;counts.set(key,old);
  }
  const samples=trainingSamples(observed,cutoff,opts),baseline=sumGroup(samples);
  const effects=[...counts.values()].sort((a,b)=>a.code.localeCompare(b.code)).map(item=>{
    const exposed=samples.filter(sample=>sample.exposure.includes(item.code));
    const controls=samples.filter(sample=>!sample.exposure.includes(item.code));
    const yes=sumGroup(exposed),no=sumGroup(controls);
    const sufficient=yes.count>=opts.min_samples&&no.count>=opts.min_samples;
    return {...item,reportes_historicos_totales:historicalTotals.get(item.code)??0,event_windows:yes,control_windows:no,
      difference_mean_return_pct:sufficient?round(yes.mean_return_pct-no.mean_return_pct):null,
      difference_probability_up:sufficient?round(yes.p_up_smoothed-no.p_up_smoothed):null,
      usable:sufficient};
  });
  const supported=effects.filter(item=>item.usable);
  const recent=last&&Date.parse(cutoff)-Date.parse(last.observed_at)<=7*DAY;
  const status=!recent?'sin_precio_reciente':
    baseline.count<opts.min_samples?'historia_insuficiente':
    effects.length===0?'solo_referencia':
    supported.length===1&&effects.length===1?'asociacion_observacional':
    supported.length>1?'eventos_solapados_sin_identificacion':
    'efecto_no_estimable';
  // NO fusionar impactos correlacionados como si fueran causas independientes.
  const p=status==='asociacion_observacional'?supported[0].event_windows.p_up_smoothed:
    status==='solo_referencia'?baseline.p_up_smoothed:null;
  return {schema:CAUSAL_VERSION,asset:opts.asset,cutoff,horizon_hours:opts.horizon_hours,
    due_at:iso(Date.parse(cutoff)+opts.horizon_hours*HOUR),
    lookback_hours:opts.lookback_hours,min_samples:opts.min_samples,status,
    price:last?{value:last.value,observed_at:last.observed_at,known_at:last.known_at,basis:last.price_basis}:null,
    past_events:effects,training_windows:samples.length,baseline,
    probability_up:p,events_seen:events.length,
    live_activation:false,orders_executed:0,causality_proven:false,
    interpretation:'Asociacion retrospectiva condicional; no identifica causas ni garantiza capacidad predictiva.'};
}
function verified(history,mode){
  requireTrue(MODES.includes(mode),'modo historico desconocido');
  return historicalView(history,mode);
}
export function causalSnapshot(history,{cutoff,mode='strict',...config}={}){
  const opts=options(config),ledger=verified(history,mode);
  const instant=timestamp(cutoff,'cutoff');
  const result=at(ledger,instant,opts);
  return {...result,mode,source_ledger_sha256:history.ledger_sha256,
    original_vintages_verified:history.price_source?.original_vintages_verified===true,
    certified_point_in_time:false,
    availability_assumption:mode==='strict'?null:'Cierres diarios asumidos disponibles al cierre, sin verificar vintages originales.'};
}
export function causalWalkForward(history,{mode='strict',limit=1000,...config}={}){
  const opts=options(config),ledger=verified(history,mode);
  range(limit,1,10000,'limit');
  const starts=priceTimeline(ledger,opts.asset,'9999-12-31T23:59:59.000Z').prices;
  const map=new Map(starts.map(row=>[row.observed_at,row]));
  const reports=[];
  for(const start of starts){
    if(reports.length>=limit)break;
    if(start.known_at>start.observed_at)continue;
    const due=iso(Date.parse(start.observed_at)+opts.horizon_hours*HOUR);
    const target=map.get(due);
    if(!target)continue;
    const forecast=at(ledger,start.observed_at,opts);
    // Se evalua la etiqueta solo DESPUES de congelar el corte y el pronostico.
    const y=Number(Number(target.value)>Number(start.value));
    reports.push({decision_at:start.observed_at,due_at:due,
      probability_up:forecast.probability_up,baseline_probability:forecast.baseline.p_up_smoothed,
      status:forecast.status,actual_up:y});
  }
  const predicted=reports.filter(r=>r.probability_up!==null&&r.baseline_probability!==null);
  const brier=field=>predicted.length?round(predicted.reduce((s,r)=>s+(r[field]-r.actual_up)**2,0)/predicted.length):null;
  return {schema:'laplace-btc-causal-replay-v1',mode,source_ledger_sha256:history.ledger_sha256,
    attempted:reports.length,scored:predicted.length,abstained:reports.length-predicted.length,
    brier:brier('probability_up'),baseline_brier:brier('baseline_probability'),
    score_improves_reference:predicted.length?brier('probability_up')<brier('baseline_probability'):null,
    certified_point_in_time:false,live_activation:false,orders_executed:0,
    rows:reports,warning:'Evaluacion retrospectiva observacional; vintages no certificados. No usar para operar.'};
}
