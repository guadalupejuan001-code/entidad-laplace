/* U001 — adaptador de lectura multiescala para BTC. Mide sin ejecutar trades.
 * Precio/tiempo 15m: reutiliza I015. Libro, operaciones y activos vinculados
 * se capturan como estados contemporaneos, NO se incorporan al predictor sin
 * un entrenamiento historico verificable de estas variables.
 */
import {createHash} from 'node:crypto';
import {observeAndProject15m} from '../bitcoin/intradia15.mjs';
import {universeSnapshot,utcTime} from './estados.mjs';
import {fetchKp} from './geomagnetismo.mjs';
import {sellarCaptura} from './integridad.mjs';
const ROOT='https://api.exchange.coinbase.com/products/';
export const U001_VERSION='laplace-universo-btc-u001-v1';
export const URLS=Object.freeze({
  book:ROOT+'BTC-USD/book?level=2',
  trades:ROOT+'BTC-USD/trades',
  eth:ROOT+'ETH-USD/ticker',
  euro:ROOT+'BTC-EUR/ticker'
});
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const rounded=x=>Number(x.toFixed(8));
function decimal(s,{zero=false}={}){
  need((typeof s==='string'||typeof s==='number')&&
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,12})?$/.test(String(s)),'decimal de mercado invalido');
  const num=Number(s);need(Number.isFinite(num)&&(zero?num>=0:num>0),'decimal negativo o cero');
  return num;
}
const ob=(id,domain,variable,value,unit,when,url)=>({
  id,domain,variable,value,unit,observed_at:when,known_at:when,source_url:url
});
export function measureBook(raw,{at,levels=10}={}){
  const when=utcTime(at);
  need(raw&&Array.isArray(raw.bids)&&Array.isArray(raw.asks)&&
    raw.bids.length>0&&raw.asks.length>0&&raw.bids.length<=60000&&raw.asks.length<=60000,
    'libro de ordenes no valido');
  const sides={};
  for(const side of ['bids','asks']){
    need(raw[side].length>=levels,'niveles L2 insuficientes');
    // El contrato Coinbase L2 entrega bids/asks ordenados. Validamos el
    // prefijo que efectivamente usamos: O(10), sin copiar ~20000 niveles.
    const pairs=raw[side].slice(0,levels).map(row=>{
      need(Array.isArray(row)&&(row.length===2||row.length===3),'nivel L2 invalido');
      const price=decimal(row[0]),size=decimal(row[1],{zero:true});
      return {price,size};
    });
    for(let i=1;i<pairs.length;i++){
      need(side==='bids'?pairs[i-1].price>=pairs[i].price:
        pairs[i-1].price<=pairs[i].price,'niveles de ordenes desordenados');
    }
    sides[side]=pairs;
  }
  const bestBid=sides.bids[0].price,bestAsk=sides.asks[0].price;
  need(bestBid<bestAsk,'libro cruzado o bloque de subasta');
  const bidUsd=sides.bids.reduce((s,row)=>s+row.price*row.size,0);
  const askUsd=sides.asks.reduce((s,row)=>s+row.price*row.size,0);
  const depth=bidUsd+askUsd;
  need(depth>0,'profundidad nula');
  const mid=(bestBid+bestAsk)/2;
  return {captured_at:when,best_bid_usd:bestBid,best_ask_usd:bestAsk,
    spread_bps:rounded((bestAsk-bestBid)/mid*1e4),
    bid_depth_usd_top10:rounded(bidUsd),ask_depth_usd_top10:rounded(askUsd),
    top10_notional_imbalance:rounded((bidUsd-askUsd)/depth),
    levels_used:levels,source_level_counts:{bids:raw.bids.length,asks:raw.asks.length},source:URLS.book,
    semantics:'fotografia L2; ordenes pueden cancelarse; profundidad no equivale a ejecuciones'};
}
export function measureTrades(raw,{at,windowSeconds=900}={}){
  const when=utcTime(at);
  need(Array.isArray(raw)&&raw.length<=1000,'formato operaciones invalido');
  const start=Date.parse(when)-windowSeconds*1000;
  const included=[],ids=new Set();
  for(const row of raw){
    need(row&&typeof row==='object'&&['buy','sell'].includes(row.side),
      'lado maker no valido');
    need(typeof row.trade_id==='number'&&Number.isSafeInteger(row.trade_id)&&row.trade_id>=0,
      'id de trade no valido');
    need(!ids.has(row.trade_id),'trade duplicado');ids.add(row.trade_id);
    const whenTrade=Date.parse(row.time);
    need(Number.isFinite(whenTrade)&&whenTrade<=Date.parse(when)+5000,
      'trade con fecha futura');
    if(whenTrade<start)continue;
    const size=decimal(row.size),price=decimal(row.price);
    included.push({maker_side:row.side,notional_usd:size*price});
  }
  const makerBuy=included.filter(x=>x.maker_side==='buy').reduce((s,x)=>s+x.notional_usd,0);
  const makerSell=included.filter(x=>x.maker_side==='sell').reduce((s,x)=>s+x.notional_usd,0);
  const denom=makerBuy+makerSell;
  return {captured_at:when,observed_trade_count:included.length,
    maker_buy_notional_usd:rounded(makerBuy),maker_sell_notional_usd:rounded(makerSell),
    reported_maker_imbalance:denom?rounded((makerBuy-makerSell)/denom):null,
    window_seconds:windowSeconds,
    sample_complete:false,source:URLS.trades,
    semantics:'Solo ultimas operaciones REST, lado reportado maker; no representa flujo total ni identifica intención'};
}
export function measureTicker(ticker,{at,product,source}={}){
  const when=utcTime(at);
  need(['ETH-USD','BTC-EUR'].includes(product),'par no admitido');
  const observed=utcTime(new Date(Date.parse(ticker?.time)).toISOString());
  need(Date.parse(observed)<=Date.parse(when)+5000&&
    Date.parse(when)-Date.parse(observed)<=180000,'ticker vinculado vencido');
  return {asset:product,price:decimal(ticker.price),
    observed_at:observed,captured_at:when,source};
}
async function readJSON(url,fetchImpl,timeoutMs){
  const res=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-U001/1.0'}});
  need(res.ok,'HTTP '+res.status);
  const data=await res.text();
  need(data.length<=1500000,'lectura de mercado excede 1.5 MiB');
  return JSON.parse(data);
}
export async function observeUniverseBTC({
  fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=9000,
  additionalObservations=[]
}={}){
  // La falta de cotizacion principal invalida el calculo (fail-closed).
  const instrument=await observeAndProject15m({fetchImpl,now,timeoutMs});
  const frames=[{name:'book',url:URLS.book,calc:(raw,at)=>measureBook(raw,{at})},
    {name:'trades',url:URLS.trades,calc:(raw,at)=>measureTrades(raw,{at})},
    {name:'eth',url:URLS.eth,calc:(raw,at)=>measureTicker(raw,{at,product:'ETH-USD',source:URLS.eth})},
    {name:'euro',url:URLS.euro,calc:(raw,at)=>measureTicker(raw,{at,product:'BTC-EUR',source:URLS.euro})}];
  const physicalPromise=fetchKp({fetchImpl,now,timeoutMs}).then(data=>({status:'observed',data}))
    .catch(error=>({status:'unavailable',reason:String(error.message).slice(0,160)}));
  const tasks=await Promise.all(frames.map(async entry=>{
    try{
      const result=await readJSON(entry.url,fetchImpl,timeoutMs),at=now();
      return {name:entry.name,status:'observed',data:entry.calc(result,at),captured_at:at};
    }catch(error){return {name:entry.name,status:'unavailable',reason:String(error.message).slice(0,160)}}
  }));
  const physical=await physicalPromise;
  const captured=utcTime(now()),observations=[...additionalObservations];
  // Observacion principal conocida al recibir la respuesta original.
  const primaryKnown=utcTime(instrument.known_at),rootId='btc-price-'+primaryKnown;
  observations.push({id:rootId,domain:'mercado',variable:'BTC_USD_spot',
    observed_at:utcTime(instrument.observed_at),known_at:primaryKnown,
    value:instrument.observed_price_usd,unit:'USD',
    source_url:instrument.source.quote_url});
  const links=[];
  const add=(name,domain,variable,value,unit,at,url)=>{
    if(!Number.isFinite(value))return;
    const id=name+'-'+at+'-'+variable;
    observations.push(ob(id,domain,variable,value,unit,utcTime(at),url));
    // Relacion explicitamente hipotetica, no aprendida.
    links.push({id:'hyp-'+id,from:id,to:rootId,type:'hipotesis',label:'relacion_a_probar'});
  };
  const book=tasks.find(t=>t.name==='book');
  if(book.status==='observed'){
    const b=book.data;
    add('book','liquidez','spread_bps',b.spread_bps,'bps',b.captured_at,URLS.book);
    add('book','liquidez','depth_imbalance_top10',b.top10_notional_imbalance,'ratio',b.captured_at,URLS.book);
    add('book','liquidez','bid_depth_top10_usd',b.bid_depth_usd_top10,'USD',b.captured_at,URLS.book);
    add('book','liquidez','ask_depth_top10_usd',b.ask_depth_usd_top10,'USD',b.captured_at,URLS.book);
  }
  const trades=tasks.find(t=>t.name==='trades');
  if(trades.status==='observed'){
    const t=trades.data;
    add('trades','flujo','reported_maker_buy_usd',t.maker_buy_notional_usd,'USD',t.captured_at,URLS.trades);
    add('trades','flujo','reported_maker_sell_usd',t.maker_sell_notional_usd,'USD',t.captured_at,URLS.trades);
    add('trades','flujo','count',t.observed_trade_count,'trades',t.captured_at,URLS.trades);
  }
  for(const key of ['eth','euro']){
    const task=tasks.find(t=>t.name===key);
    if(task.status==='observed'){
      const t=task.data;
      add(key,'mercados_vinculados',t.asset.replace('-','_')+'_spot',
        t.price,t.asset.endsWith('USD')?'USD':'EUR',t.captured_at,t.source);
    }
  }
  if(physical.status==='observed'){
    const {domain,variable,value,unit,observed_at,known_at,source_url}=physical.data;
    observations.push({id:'noaa-kp-'+observed_at,domain,variable,value,unit,observed_at,known_at,source_url});
    // No creamos una arista Kp -> BTC sin evidencia de conexion.
  }
  // Valor total del universo NO fue observado; se conoce solo su cobertura.
  const graph=universeSnapshot(observations,{cutoff:captured,hypotheses:links});
  return sellarCaptura({schema:U001_VERSION,at:captured,
    instrument_15m:instrument,
    measured_market:tasks,
    measured_space_weather:physical,
    universal_state:graph,
    model_modules:[{domain:'fisica',module:'fisica/',status:'simulacion_no_observacion'},
      {domain:'cosmos',module:'cosmos/',status:'simulacion_no_observacion'},
      {domain:'economia_global',status:'sin_captura_punto_en_tiempo'},
      {domain:'informacion_global',status:'sin_captura_punto_en_tiempo'}],
    source_count:tasks.filter(x=>x.status==='observed').length+1+Number(physical.status==='observed'),
    unknown_drivers:'Flujo global, bancos centrales, otras bolsas, decisiones futuras y condiciones fisicas no medidos',
    causal_certification:false,full_universe_observed:false,
    augmented_prediction_enabled:false,
    projected_price_usd:instrument.projected_price_usd,
    projection_is_from:'I015 sin fusion estadistica no validada con nuevas variables',
    execution_orders:0,deterministic_math:true,
    input_hash_sha256:sha(JSON.stringify({primary:instrument.input_sha256,
      market:tasks,physical,extra:additionalObservations}))});
}
