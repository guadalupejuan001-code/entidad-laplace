/* Medidas U001 compartidas por Node y el worker Android, sin red. */
import {utcTime} from './estados.mjs';
export const CRYPTO_CONTEXT_ASSETS=Object.freeze(['BTC-USD','ETH-USD','SOL-USD']);
export const MARKET_ROOT='https://api.exchange.coinbase.com/products/';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const rounded=x=>Number(x.toFixed(8));
export function marketDecimal(s,{zero=false}={}){
  need((typeof s==='string'||typeof s==='number')&&
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,12})?$/.test(String(s)),'decimal de mercado invalido');
  const num=Number(s);need(Number.isFinite(num)&&(zero?num>=0:num>0),'decimal negativo o cero');
  return num;
}
export function measureBook(raw,{at,levels=10,product='BTC-USD'}={}){
  const when=utcTime(at);
  need(CRYPTO_CONTEXT_ASSETS.includes(product),'par no admitido');
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
      const price=marketDecimal(row[0]),size=marketDecimal(row[1],{zero:true});
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
    levels_used:levels,source_level_counts:{bids:raw.bids.length,asks:raw.asks.length},source:MARKET_ROOT+product+'/book?level=2',
    semantics:'fotografia L2; ordenes pueden cancelarse; profundidad no equivale a ejecuciones'};
}
export function measureTrades(raw,{at,windowSeconds=900,product='BTC-USD'}={}){
  const when=utcTime(at);
  need(CRYPTO_CONTEXT_ASSETS.includes(product),'par no admitido');
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
    const size=marketDecimal(row.size),price=marketDecimal(row.price);
    included.push({maker_side:row.side,notional_usd:size*price});
  }
  const makerBuy=included.filter(x=>x.maker_side==='buy').reduce((s,x)=>s+x.notional_usd,0);
  const makerSell=included.filter(x=>x.maker_side==='sell').reduce((s,x)=>s+x.notional_usd,0);
  const denom=makerBuy+makerSell;
  return {captured_at:when,observed_trade_count:included.length,
    maker_buy_notional_usd:rounded(makerBuy),maker_sell_notional_usd:rounded(makerSell),
    reported_maker_imbalance:denom?rounded((makerBuy-makerSell)/denom):null,
    window_seconds:windowSeconds,
    sample_complete:false,source:MARKET_ROOT+product+'/trades',
    semantics:'Solo ultimas operaciones REST, lado reportado maker; no representa flujo total ni identifica intención'};
}
