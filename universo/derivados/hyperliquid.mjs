/* Hyperliquid native public perp universe + per-asset contexts.
 * Contexts align index-for-index with metadata. No private user endpoint.
 * The source has no per-record timestamp here: observed_at is first-seen.
 */
import {D001_ROOTS,boundedJSON,instrumentId,number,numericRecord,
  sourceStatus,utc} from './contrato.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
export const HYPERLIQUID_ASSETS=Object.freeze(['BTC','ETH']);
export const HYPERLIQUID_INFO=D001_ROOTS.hyperliquid+'/info';
export const HYPERLIQUID_BODY=JSON.stringify({type:'metaAndAssetCtxs',dex:''});
export function parseHyperliquid(raw,{coins=HYPERLIQUID_ASSETS,knownAt,
  sourceUrl=HYPERLIQUID_INFO}={}){
  const at=utc(knownAt);
  need(Array.isArray(raw)&&raw.length===2&&raw[0]&&Array.isArray(raw[0].universe)&&
    Array.isArray(raw[1])&&raw[0].universe.length===raw[1].length&&
    raw[1].length<=300,'Hyperliquid: metadatos/contextos no alineados');
  need(Array.isArray(coins)&&coins.length>=1&&coins.length<=2&&
    coins.every(x=>HYPERLIQUID_ASSETS.includes(x))&&new Set(coins).size===coins.length,
    'Hyperliquid: símbolos fuera de catálogo');
  const rows=[],contracts=[],missing=[];
  const seen=new Set();
  for(let i=0;i<raw[0].universe.length;i++){
    const meta=raw[0].universe[i],ctx=raw[1][i];
    if(!meta||typeof meta.name!=='string')throw Error('Hyperliquid: meta inválida');
    if(seen.has(meta.name))throw Error('Hyperliquid: contrato duplicado');
    seen.add(meta.name);
    if(!coins.includes(meta.name))continue;
    if(!ctx||typeof ctx!=='object'){missing.push(meta.name);continue}
    const contract=instrumentId({venue:'hyperliquid',kind:'perpetual',
      symbol:meta.name,settlement:'USDC'});
    const fields=[
      ['mark_price',ctx.markPx,'USDC',0.000001,1e15],
      ['oracle_price',ctx.oraclePx,'USDC',0.000001,1e15],
      ['hourly_funding_rate',ctx.funding,'ratio',-1,1],
      ['open_interest_base',ctx.openInterest,meta.name,0,1e18],
      ['day_notional_volume_native',ctx.dayNtlVlm,'USDC',0,1e25]
    ];
    const result=[];
    for(const [metric,value,unit,min,max] of fields){
      if(value===null||value===undefined||value==='')continue;
      result.push(numericRecord({contract,metric,value:number(value,{name:metric,min,max}),unit,
        observedAt:at,knownAt:at,sourceUrl}));
    }
    if(!result.some(x=>x.variable.endsWith('_mark_price'))||
       !result.some(x=>x.variable.endsWith('_open_interest_base'))){
      missing.push(meta.name);continue;
    }
    rows.push(...result);
    contracts.push({venue:'hyperliquid',symbol:meta.name,kind:'perpetual',
      settlement:'USDC',open_interest_unit:meta.name,
      source_first_seen_at:at,source_exchange_timestamp_provided:false,
      sz_decimals:meta.szDecimals??null,
      max_leverage:meta.maxLeverage??null});
  }
  return {observations:rows,contracts,missing,
    coverage:{requested:coins.length,matched:contracts.length,
      reporting_time:'collector_first_seen_not_exchange_timestamp'},
    prediction_inputs_enabled:false,automatic_trading:false};
}
export async function observeHyperliquid({coins=HYPERLIQUID_ASSETS,fetchImpl=fetch,
  now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  try{
    const response=await boundedJSON(HYPERLIQUID_INFO,{
      fetchImpl,timeoutMs,method:'POST',body:HYPERLIQUID_BODY,maxBytes:1000000});
    const captured=utc(now());
    const data=parseHyperliquid(response.value,{coins,knownAt:captured});
    need(data.observations.length>0,'Hyperliquid: activos requeridos no observados');
    return {group:'derivatives_hyperliquid',...data,sources:[
      sourceStatus({name:'Hyperliquid-metaAndAssetCtxs',url:HYPERLIQUID_INFO,
        knownAt:captured,count:data.observations.length,hash:response.sha256,
        notes:'First-seen, no individual exchange timestamp; venue-only OI'})]};
  }catch(error){
    return {group:'derivatives_hyperliquid',observations:[],contracts:[],missing:coins,
      sources:[sourceStatus({name:'Hyperliquid-metaAndAssetCtxs',url:HYPERLIQUID_INFO,
        knownAt:now(),status:'unavailable',error})],prediction_inputs_enabled:false,
      automatic_trading:false};
  }
}
