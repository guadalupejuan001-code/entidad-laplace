/* K001 public blockchain + DeFi orchestration.
 * Independent I/O; partial failures stay missing, never become zero.
 * No private keys, exchange-account credentials, orders or wallet tracing.
 */
import {K001_SCHEMA,K001_RULES,K001_LIMITS} from './catalogo-k001.mjs';
import {k001Time} from './red-publica.mjs';
import {observeBitcoin} from './bitcoin-publico.mjs';
import {observeEthereum} from './ethereum-publico.mjs';
import {observeDefiLlama} from './defi-publico.mjs';

export async function observeBlockchainDeFi({fetchImpl=fetch,
  now=()=>new Date().toISOString(),timeoutMs=K001_LIMITS.timeoutMs,
  groups=['bitcoin','ethereum','defi']}={}){
  const collectors={
    bitcoin:()=>observeBitcoin({fetchImpl,now,timeoutMs}),
    ethereum:()=>observeEthereum({fetchImpl,now,timeoutMs}),
    defi:()=>observeDefiLlama({fetchImpl,now,timeoutMs})
  };
  if(!Array.isArray(groups)||groups.length<1||groups.length>3||
    groups.some(x=>!Object.hasOwn(collectors,x))||
    new Set(groups).size!==groups.length)throw Error('K001 grupos no admitidos');
  const started=k001Time(now());
  const results=await Promise.all(groups.map(async name=>{
    try{return {name,status:'fulfilled',report:await collectors[name]()}}
    catch(error){return {name,status:'unavailable',
      error:String(error?.message??error).slice(0,200)}}
  }));
  const observations=[],sources=[],metadata={},coverage=[];
  for(const item of results){
    if(item.status==='fulfilled'){
      const data=item.report;
      observations.push(...data.observations);
      sources.push(...data.sources.map(s=>({...s,group:item.name})));
      metadata[item.name]=data.metadata??null;
      coverage.push({group:item.name,observations:data.observations.length,
        observed_sources:data.sources.filter(s=>s.status==='observed').length,
        unavailable_sources:data.sources.filter(s=>s.status!=='observed').length});
    }else{
      sources.push({name:'K001-'+item.name,group:item.name,status:'unavailable',
        received_at:k001Time(now()),signals:0,
        missing_is_zero:false,error:item.error});
      coverage.push({group:item.name,observations:0,observed_sources:0,
        unavailable_sources:1});
      metadata[item.name]=null;
    }
  }
  if(observations.length>K001_LIMITS.maxSignals)
    throw Error('K001 necesita partición al superar 40 señales');
  const ids=new Set();
  for(const item of observations){
    if(ids.has(item.id))throw Error('K001 observación duplicada');
    ids.add(item.id);
  }
  return {schema:K001_SCHEMA,group:'blockchain_defi_k001',started_at:started,
    at:k001Time(now()),observations,sources,metadata,
    coverage:{groups:coverage,observations:observations.length,
      observed_sources:sources.filter(s=>s.status==='observed').length,
      missing_sources:sources.filter(s=>s.status!=='observed').length,
      financial_coverage_complete:false},
    rules:K001_RULES,
    live_bridge_feed_connected:false,
    privacy_preserving_aggregate_only:true,
    true_global_capital_flows_measured:false,
    historical_publication_times_verified:false,
    prediction_inputs_enabled:false,automatic_trading:false};
}
