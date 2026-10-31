/* LAPLACE I015: instrumento BTC-USD de horizonte exacto 15 minutos.
 * Proyeccion determinista por analogos historicos observados, sin Monte Carlo,
 * sin random(), sin ordendes, y sin inventar precio futuro.
 * El calculo de analogos ocurre en JS como capa de medida (no en XI).
 */
import {fetchQuote} from './agente.mjs';
import {createHash} from 'node:crypto';

export const INTRADAY_SCHEMA='laplace-btc-intradia-i015-v1';
export const CANDLES_URL='https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=300';
const STEP=300, HORIZON=3, HISTORY=6, DAY=86400;
const need=(condition,message)=>{if(!condition)throw Error(message)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const round=(x,d=6)=>Number(x.toFixed(d));
const average=x=>x.reduce((s,v)=>s+v,0)/x.length;
const count=({length})=>length;
const quantile=(list,q)=>{
  if(!list.length)return null;
  const sorted=[...list].sort((a,b)=>a-b),i=q*(sorted.length-1),lo=Math.floor(i),hi=Math.ceil(i);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
};
const utc=sec=>new Date(sec*1000).toISOString();
export function canonicalCandles(raw,{asOf,granularity=STEP}={}){
  const quoteTime=Date.parse(asOf);
  need(Number.isFinite(quoteTime),'timestamp de cotizacion requerido');
  need(Array.isArray(raw)&&raw.length>0&&raw.length<=500,'respuesta de velas invalidas, cantidad='+String(Array.isArray(raw)?raw.length:'no_array'));
  need(granularity===STEP,'LAPLACE I015 solo admite barras de cinco minutos');
  const seen=new Set(),bars=[];
  for(const row of raw){
    need(Array.isArray(row)&&row.length===6&&row.every(v=>typeof v==='number'&&Number.isFinite(v)),
      'vela invalida: [segundos, minimo, maximo, apertura, cierre, volumen]');
    const [time,low,high,open,close,volume]=row;
    need(Number.isSafeInteger(time)&&time%granularity===0&&time>=0,'periodo de vela invalido');
    need([low,high,open,close].every(v=>v>0)&&high>=low&&high>=open&&high>=close&&
      low<=open&&low<=close&&volume>=0,'OHLCV inconsistente');
    need(!seen.has(time),'vela duplicada');seen.add(time);
    // No consumir la barra de cinco minutos hasta que se haya cerrado.
    if(time*1000+granularity*1000>quoteTime)continue;
    bars.push({time,low,high,open,close,volume});
  }
  bars.sort((a,b)=>a.time-b.time);
  // Coinbase puede incluir mas barras que el maximo documentado en el limite.
  // La observacion utiliza solo las 300 mas recientes COMPLETAS.
  if(bars.length>300)bars.splice(0,bars.length-300);
  need(bars.length>=60,'menos de 60 barras completas: no extrapolar');
  need((quoteTime/1000-(bars.at(-1).time+granularity))<=2*granularity,
    'ultimo cierre muy antiguo para 15 minutos');
  return bars;
}
function usable(bars,a,b){
  for(let i=a+1;i<=b;i++)if(bars[i].time-bars[i-1].time!==STEP)return false;
  return true;
}
function feature(bars,i){
  if(i<HISTORY||!usable(bars,i-HISTORY,i))return null;
  const rs=[];
  for(let j=i-HISTORY+1;j<=i;j++)rs.push(Math.log(bars[j].close/bars[j-1].close));
  const volumes=bars.slice(i-HISTORY+1,i+1).map(b=>b.volume);
  const baselineVol=average(volumes);
  return [
    Math.log(bars[i].close/bars[i-3].close),
    Math.log(bars[i].close/bars[i-1].close),
    Math.sqrt(average(rs.map(r=>r*r))),
    average(bars.slice(i-2,i+1).map(b=>(b.high-b.low)/b.close)),
    baselineVol>0?bars[i].volume/baselineVol:1
  ];
}
const SCALE=[0.007,0.004,0.004,0.006,1.5];
function analog(bars,anchor,{limit=18}={}){
  const current=feature(bars,anchor);
  if(!current)return null;
  const examples=[];
  // Este limite exige que cada futuro de un candidato haya concluido ANTES
  // del ancla; ningun resultado futuro entra en la seleccion.
  for(let i=HISTORY;i+HORIZON<anchor;i++){
    if(!usable(bars,i,i+HORIZON))continue;
    const historical=feature(bars,i);if(!historical)continue;
    const distance=Math.sqrt(average(current.map((v,k)=>((v-historical[k])/SCALE[k])**2)));
    const result=Math.log(bars[i+HORIZON].close/bars[i].close);
    examples.push({index:i,distance,return15:result,decision_at:utc(bars[i].time+STEP),
      outcome_at:utc(bars[i+HORIZON].time+STEP)});
  }
  examples.sort((a,b)=>a.distance-b.distance||a.index-b.index);
  const selected=[];
  for(const item of examples){
    if(selected.every(s=>Math.abs(s.index-item.index)>=HORIZON)){
      selected.push(item);
      if(selected.length>=limit)break;
    }
  }
  if(selected.length<8)return null;
  const weights=selected.map(e=>1/(1+e.distance)),total=weights.reduce((a,b)=>a+b,0);
  const estimate=selected.reduce((s,e,k)=>s+weights[k]*e.return15,0)/total;
  const returns=selected.map(e=>e.return15);
  return {n:selected.length,estimate,low:quantile(returns,0.1),high:quantile(returns,0.9),
    distance_median:quantile(selected.map(e=>e.distance),0.5),
    latest_training_outcome_at:selected.reduce((s,e)=>e.outcome_at>s?e.outcome_at:s,''),
    independent_windows_rule:'candidatos elegidos al menos 3 barras separados',
    selected: selected.map(e=>({decision_at:e.decision_at,outcome_at:e.outcome_at,
      distance:round(e.distance),return15_pct:round(100*(Math.exp(e.return15)-1))}))};
}
export function backtestIntraday(bars,{last=48}={}){
  need(Array.isArray(bars)&&bars.length>=60,'faltan barras para retrospectiva');
  const results=[];
  const first=Math.max(52,bars.length-last-HORIZON);
  for(let i=first;i+HORIZON<bars.length;i++){
    if(!usable(bars,i,i+HORIZON))continue;
    const outcome=Math.log(bars[i+HORIZON].close/bars[i].close);
    const forecast=analog(bars,i);
    if(!forecast)continue;
    const delta=Math.exp(outcome)-1,pred=Math.exp(forecast.estimate)-1;
    results.push({at:utc(bars[i].time+STEP),actual_return:delta,
      predicted_return:pred,absolute_model_error:Math.abs(pred-delta),
      absolute_reference_error:Math.abs(delta)});
  }
  const n=results.length;
  const maeModel=n?average(results.map(x=>x.absolute_model_error)):null;
  const maeRef=n?average(results.map(x=>x.absolute_reference_error)):null;
  const improved=n>=20&&maeModel<maeRef;
  return {attempted:Math.max(0,bars.length-first-HORIZON),scored:n,
    model_mae_return_pct:maeModel===null?null:round(100*maeModel),
    reference_mae_return_pct:maeRef===null?null:round(100*maeRef),
    beats_persistence:n>=20?improved:null,
    qualification:n<20?'validacion_insuficiente':improved?'mejora_en_muestra_reciente':'sin_ventaja_demostrada',
    calibration_caution:'Una sola ventana de observacion y evaluacion; no es certificacion fuera de muestra.'};
}
export function project15m(candles,quote,{capturedAt=new Date().toISOString(),sourceUrl=CANDLES_URL}={}){
  need(quote?.asset==='BTC-USD'&&quote.price_basis==='spot_quote','cotizacion BTC-USD original requerida');
  need(typeof quote.value==='string'&&Number(quote.value)>0,'precio original invalido');
  const quoteTime=Date.parse(quote.observed_at),captureTime=Date.parse(capturedAt);
  need(Number.isFinite(quoteTime)&&Number.isFinite(captureTime)&&
    captureTime>=quoteTime&&captureTime-quoteTime<=180000,'cotizacion vencida (mas de 3 minutos)');
  const bars=canonicalCandles(candles,{asOf:quote.observed_at});
  const coverage=bars.length,missing=bars.reduce((n,b,i)=>n+(i&&b.time-bars[i-1].time!==STEP?1:0),0);
  const historyAt=bars.at(-1),forecast=analog(bars,bars.length-1),test=backtestIntraday(bars);
  const observed=Number(quote.value);
  // Si la analogia no aporta una mejora cuantificada, el valor central vuelve
  // al precio de referencia, aunque se conservan los escenarios de variacion.
  const promoted=Boolean(forecast&&test.beats_persistence===true&&missing<=5);
  const central=promoted?observed*Math.exp(forecast.estimate):observed;
  const lower=forecast?observed*Math.exp(forecast.low):null;
  const upper=forecast?observed*Math.exp(forecast.high):null;
  const status=missing>5?'barras_incompletas':
    !forecast?'evidencia_intradia_insuficiente':
    promoted?'modelo_condicional_exploratorio':'referencia_sin_ventaja_validada';
  const base={schema:INTRADAY_SCHEMA,asset:'BTC-USD',horizon_minutes:15,
    observed_price_usd:round(observed,2),observed_at:quote.observed_at,
    known_at:quote.known_at,calculated_at:capturedAt,
    target_at:new Date(quoteTime+15*60000).toISOString(),
    projected_price_usd:round(central,2),
    projected_change_pct:round(100*(central/observed-1)),
    scenario_interval_usd:lower===null?null:[round(lower,2),round(upper,2)],
    scenario_interval_meaning:'Percentiles empiricos 10-90 de analogos, NO intervalo de confianza validado.',
    status,model_selected:promoted?'analogia_historica_15m':'persistencia',
    model_candidate_price_usd:forecast?round(observed*Math.exp(forecast.estimate),2):null,
    feature_window_minutes:30,price_candles:coverage,missing_bars:missing,
    latest_completed_candle_at:utc(historyAt.time+STEP),
    // Datos historicos realmente descargados durante ESTA captura.
    // Su disponibilidad original en cada epoca no esta certificada.
    serie_cierres_5m:bars.slice(-72).map(b=>({fecha:utc(b.time+STEP),precio:round(b.close,2)})),
    analog_count:forecast?.n??0,causal_event_model:'C001 no se extrapola a 15 minutos sin noticias y ticks cronologicos',
    backtest:test,random_sampling:false,causality_proven:false,
    live_trading_enabled:false,orders_executed:0,
    warning:'Estimacion mecanica, no observacion del futuro ni promesa de beneficio.'};
  return {...base,input_sha256:sha(JSON.stringify({quote_time:quote.observed_at,
    price:quote.value,candles:bars.map(({time,close,volume})=>[time,close,volume])})),
    source:{quote_url:'https://api.exchange.coinbase.com/products/BTC-USD/ticker',candles_url:sourceUrl,
      candles_raw_sha256:sha(JSON.stringify(candles))},
    calculations:{formula:'P(t+15m)=P(t)*exp(r_analogo); sin mejora verificada r=0',
      candidate_log_return:forecast?round(forecast.estimate,9):null,
      similarity:'distancia normalizada en momentum15, momentum5, volatilidad30, rango15, volumen relativo',
      selected_analogues:forecast?.selected??[]}};
}
export async function observeAndProject15m({fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=10000}={}){
  // Dos lecturas, misma fuente. No reintentar ni sustituir por cifras arbitrarias.
  const quote=await fetchQuote({fetchImpl,now,timeoutMs});
  const response=await fetchImpl(CANDLES_URL,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-I015/1.0'}});
  need(response.ok,'fuente OHLCV HTTP '+response.status);
  const raw=await response.text();
  need(raw.length<131072,'fuente de velas demasiado grande');
  const data=JSON.parse(raw);
  return project15m(data,quote,{capturedAt:now(),sourceUrl:CANDLES_URL});
}
