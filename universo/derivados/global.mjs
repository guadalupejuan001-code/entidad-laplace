/* D001: launch publicly observable derivatives markets concurrently.
 * Per-venue instruments remain separate: no cross-venue OI sum, no trading.
 */
import {utc,D001_SCHEMA} from './contrato.mjs';
import {observeUSDm} from './binance-usdm.mjs';
import {observeHyperliquid} from './hyperliquid.mjs';
import {observeDeribitOptions} from './deribit-opciones.mjs';

export async function observeDerivatives({fetchImpl=fetch,
  now=()=>new Date().toISOString(),timeoutMs=14000,
  groups=['binance_usdm','hyperliquid','deribit_options'],
  binanceSymbols=['BTCUSDT','ETHUSDT'],hyperliquidCoins=['BTC','ETH'],
  deribitCurrencies=['BTC','ETH'],maxOptionContracts=24}={}){
  const tasks={
    binance_usdm:()=>observeUSDm({symbols:binanceSymbols,fetchImpl,now,timeoutMs}),
    hyperliquid:()=>observeHyperliquid({coins:hyperliquidCoins,fetchImpl,now,timeoutMs}),
    deribit_options:()=>observeDeribitOptions({currencies:deribitCurrencies,
      maxContracts:maxOptionContracts,fetchImpl,now,timeoutMs})
  };
  if(!Array.isArray(groups)||!groups.length||groups.length>3||new Set(groups).size!==groups.length||
     !groups.every(g=>Object.hasOwn(tasks,g)))throw Error('D001 grupos no permitidos');
  const started=utc(now()),settled=await Promise.all(groups.map(async name=>{
    try{return {name,result:await tasks[name](),status:'fulfilled'}}
    catch(error){return {name,error:String(error.message).slice(0,180),status:'rejected'}}
  }));
  const observations=[],sources=[],contracts=[],coverage=[];
  for(const g of settled){
    if(g.status==='fulfilled'){
      observations.push(...g.result.observations);
      sources.push(...g.result.sources.map(x=>({...x,group:g.name})));
      contracts.push(...(g.result.contracts??[]));
      coverage.push({group:g.name,observations:g.result.observations.length,
        observed_sources:g.result.sources.filter(x=>x.status==='observed').length,
        unavailable_sources:g.result.sources.filter(x=>x.status!=='observed').length});
    }else{
      sources.push({name:g.name,group:g.name,status:'unavailable',
        reason:g.error,received_at:utc(now()),signals:0});
      coverage.push({group:g.name,observations:0,observed_sources:0,unavailable_sources:1});
    }
  }
  const ids=new Set();
  for(const item of observations){if(ids.has(item.id))throw Error('D001 observación repetida: '+item.id);ids.add(item.id)}
  if(observations.length>800)throw Error('D001 presupuesto 800 señales; particionar');
  return {schema:D001_SCHEMA,started_at:started,at:utc(now()),
    group:'derivatives_d001',observations,sources,contracts,
    coverage:{groups:coverage,observations:observations.length,
      observed_sources:sources.filter(x=>x.status==='observed').length,
      unavailable_sources:sources.filter(x=>x.status!=='observed').length},
    semantical_policy:'Funding per venue and interval, option OI in base currency, USDM OI in base quantity. Never cross-sum venues/contracts or equate with directional positions.',
    observation_policy:'exchange timestamp when provided; otherwise collector first seen',
    liquidation_feed_connected:false,customer_identity_available:false,
    prediction_inputs_enabled:false,automatic_trading:false};
}
