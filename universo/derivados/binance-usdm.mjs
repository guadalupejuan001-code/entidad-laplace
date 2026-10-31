/* D001 Binance USD-M perpetuals: public mark, OI and settled funding.
 * Funding printed by premiumIndex is NOT necessarily a settled payment.
 * OI is base quantity for USD-M, not USD notional or long minus short.
 */
import {D001_ROOTS,boundedJSON,instrumentId,number,numericRecord,
  sourceStatus,timestampMillis,utc} from './contrato.mjs';
export const USD_M_SYMBOLS=Object.freeze(['BTCUSDT','ETHUSDT']);
const need=(ok,message)=>{if(!ok)throw Error(message)};
const NAME=/^[A-Z0-9]{5,20}$/;
export function urlsUSDm(symbol){
  need(typeof symbol==='string'&&NAME.test(symbol)&&USD_M_SYMBOLS.includes(symbol),'Contrato USD-M fuera de catálogo');
  const root=D001_ROOTS.binance;
  return {
    mark:root+'/fapi/v1/premiumIndex?symbol='+encodeURIComponent(symbol),
    oi:root+'/fapi/v1/openInterest?symbol='+encodeURIComponent(symbol),
    settled:root+'/fapi/v1/fundingRate?symbol='+encodeURIComponent(symbol)+'&limit=1'
  };
}
const marketContract=(symbol)=>instrumentId({venue:'binance',kind:'perpetual',symbol,settlement:'USDT'});
export function parsePremiumUSDm(raw,{symbol,knownAt,sourceUrl}){
  const at=utc(knownAt);
  need(raw?.symbol===symbol,'Binance mark: contrato distinto');
  const ts=timestampMillis(raw.time,{cutoff:at,ageMs:300000});
  const mark=number(raw.markPrice,{name:'markPrice',min:0.000001,max:1e15});
  const index=number(raw.indexPrice,{name:'indexPrice',min:0.000001,max:1e15});
  const funding=number(raw.lastFundingRate,{name:'lastFundingRate',min:-1,max:1});
  const contract=marketContract(symbol);
  return {observations:[
    numericRecord({contract,metric:'mark_price',value:mark,unit:'USDT',observedAt:ts,knownAt:at,sourceUrl}),
    numericRecord({contract,metric:'index_price',value:index,unit:'USDT',observedAt:ts,knownAt:at,sourceUrl}),
    numericRecord({contract,metric:'displayed_funding_rate',value:funding,unit:'ratio',observedAt:ts,knownAt:at,sourceUrl}),
    numericRecord({contract,metric:'mark_index_basis',value:mark/index-1,unit:'ratio',observedAt:ts,knownAt:at,sourceUrl})
  ],metadata:{exchange:'Binance USD-M',symbol,kind:'perpetual',
    mark_currency:'USDT',funding_type:'reported_snapshot_not_confirmed_settlement',
    source_observation_at:ts,contract_multiplier_verified:false}};
}
export function parseOIUSDm(raw,{symbol,knownAt,sourceUrl}){
  const at=utc(knownAt);
  need(raw?.symbol===symbol,'Binance open interest: contrato distinto');
  const observed=timestampMillis(raw.time,{cutoff:at,ageMs:300000});
  const quantity=number(raw.openInterest,{name:'openInterest',min:0,max:1e18});
  const contract=marketContract(symbol);
  return {observations:[numericRecord({contract,metric:'open_interest_base',
    value:quantity,unit:symbol.replace(/USDT$/,''),
    observedAt:observed,knownAt:at,sourceUrl})],
    metadata:{exchange:'Binance USD-M',symbol,open_interest_unit:'base_asset',
      unit_provenance:'USD-M public open interest ticker; notional not computed'}};
}
export function parseSettledUSDm(raw,{symbol,knownAt,sourceUrl}){
  const at=utc(knownAt);
  need(Array.isArray(raw)&&raw.length===1,'Binance: exige una liquidación de funding');
  const item=raw[0];
  need(item?.symbol===symbol,'Binance funding de contrato distinto');
  const ts=timestampMillis(item.fundingTime,{cutoff:at,ageMs:14*86400000});
  const funding=number(item.fundingRate,{name:'settled funding',min:-1,max:1});
  const contract=marketContract(symbol);
  return {observations:[numericRecord({contract,metric:'settled_funding_rate',
    value:funding,unit:'ratio',observedAt:ts,knownAt:at,sourceUrl})],
    metadata:{symbol,funding_time:ts,kind:'observed_historical_funding',
      funding_interval_hours:null,settlement_statement:'historical rate; payment amount not observed'}};
}
export async function observeUSDm({symbols=USD_M_SYMBOLS,
  fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  need(Array.isArray(symbols)&&symbols.length>0&&symbols.length<=2&&
    symbols.every(x=>USD_M_SYMBOLS.includes(x))&&new Set(symbols).size===symbols.length,
    'Binance USD-M: lista de símbolos inválida');
  const jobs=symbols.flatMap(symbol=>{
    const paths=urlsUSDm(symbol);
    return ['mark','oi','settled'].map(kind=>({symbol,kind,url:paths[kind]}));
  });
  const settled=await Promise.all(jobs.map(async x=>{
    try{
      const fetched=await boundedJSON(x.url,{fetchImpl,timeoutMs,maxBytes:80000});
      const captured=utc(now());
      const fn={mark:parsePremiumUSDm,oi:parseOIUSDm,settled:parseSettledUSDm}[x.kind];
      const parsed=fn(fetched.value,{symbol:x.symbol,knownAt:captured,sourceUrl:x.url});
      return {observations:parsed.observations,metadata:parsed.metadata,
        source:sourceStatus({name:'Binance-USDm-'+x.symbol+'-'+x.kind,
          url:x.url,knownAt:captured,count:parsed.observations.length,
          hash:fetched.sha256,notes:parsed.metadata.kind??parsed.metadata.funding_type??null})};
    }catch(error){
      return {observations:[],metadata:null,
        source:sourceStatus({name:'Binance-USDm-'+x.symbol+'-'+x.kind,
          url:x.url,status:'unavailable',knownAt:now(),error})};
    }
  }));
  return {group:'derivatives_binance_usdm',observations:settled.flatMap(x=>x.observations),
    sources:settled.map(x=>x.source),contracts:settled.filter(x=>x.metadata).map(x=>x.metadata),
    venue:'binance',kind:'perpetual',prediction_inputs_enabled:false,automatic_trading:false};
}
