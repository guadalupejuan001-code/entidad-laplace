/* DeFiLlama public aggregates: chain TVL and USD-pegged token circulating.
 * Price-driven TVL changes do not prove deposits. Wrapped/bridged assets
 * can appear on multiple chains; never sum per-chain TVL as new capital.
 */
import {K001_URLS,K001_LIMITS,K001_TVL_CHAINS,K001_STABLECOINS}
  from './catalogo-k001.mjs';
import {exactNumber,k001Observation,k001Time,readPublic,source} from './red-publica.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
export function parseChainTvl(data,{knownAt,url=K001_URLS.chainTvl}={}){
  need(url===K001_URLS.chainTvl,'DefiLlama TVL URL no admitida');
  const at=k001Time(knownAt);
  need(Array.isArray(data)&&data.length>=3&&data.length<=2000,'DefiLlama chain TVL JSON inválido');
  const names=new Map(),observations=[],missing=[];
  for(const row of data){
    need(row&&typeof row==='object'&&!Array.isArray(row)&&
      typeof row.name==='string'&&row.name.length<=100,'TVL chain record inválido');
    if(!K001_TVL_CHAINS.includes(row.name))continue;
    need(!names.has(row.name),'DefiLlama cadena duplicada');names.set(row.name,row);
  }
  for(const chain of K001_TVL_CHAINS){
    const item=names.get(chain);
    if(!item){missing.push(chain);continue}
    const value=exactNumber(item.tvl,'TVL '+chain,{min:1,max:1e16});
    observations.push(k001Observation({
      id:'k001-defi-chain-'+chain+'-'+at.replace(/[^0-9]/g,''),
      domain:'defi_tvl_por_cadena',metric:'DeFi_'+chain+'_tvl_usd',
      value,unit:'USD',observedAt:at,knownAt:at,url
    }));
  }
  need(observations.length>0,'DefiLlama sin cadenas solicitadas');
  return {observations,metadata:{
    chains_observed:[...names.keys()],chains_missing:missing,
    valuation:'USD_TVL_provider_estimate',
    source_timestamp_available:false,observed_at_basis:'collector_first_seen',
    sum_across_chains_is_not_unique_capital:true,
    price_changes_not_net_deposits:true,protocol_identity_not_personal_identity:true}};
}
export function parseStablecoinSupply(data,{knownAt,url=K001_URLS.stablecoins}={}){
  need(url===K001_URLS.stablecoins,'DefiLlama stablecoin URL no admitida');
  const at=k001Time(knownAt);
  const rows=data?.peggedAssets;
  need(Array.isArray(rows)&&rows.length>0&&rows.length<=3000,
    'DefiLlama stablecoin schema inválido');
  const found=new Map(),missing=[],observations=[],metadata=[];
  for(const item of rows){
    if(!item||typeof item!=='object'||!K001_STABLECOINS.some(x=>x.symbol===item.symbol))continue;
    const known=K001_STABLECOINS.find(x=>x.symbol===item.symbol&&x.name===item.name&&
      x.pegType===item.pegType);
    if(!known)continue; // Do not conflate bridged clones with issuer token.
    need(!found.has(item.symbol),'DefiLlama token issuer duplicate');
    found.set(item.symbol,item);
  }
  for(const coin of K001_STABLECOINS){
    const item=found.get(coin.symbol);
    if(!item){missing.push(coin.symbol);continue}
    const total=exactNumber(item.circulating?.peggedUSD,'circulating '+coin.symbol,
      {min:1,max:1e16});
    observations.push(k001Observation({
      id:'k001-stablecoin-'+coin.symbol+'-'+at.replace(/[^0-9]/g,''),
      domain:'stablecoins_suministro_publico',
      metric:'stablecoin_'+coin.symbol+'_circulating_tokens',
      value:total,unit:'tokens',observedAt:at,knownAt:at,url
    }));
    metadata.push({symbol:coin.symbol,issuer_name:coin.name,provider_id:String(item.id??''),
      circulating_units:'token_units_for_USD_peg_not_usd_net_inflow',
      network_breakdown_summed:false,mint_burn_flow_verified:false});
  }
  need(observations.length>0,'DefiLlama stablecoin issuer not found');
  return {observations,metadata:{
    tokens_observed:metadata,tokens_missing:missing,
    source_timestamp_available:false,observed_at_basis:'collector_first_seen',
    circulating_supply_not_verified_mint_or_burn:true,
    interchain_bridge_supply_not_additional_global_supply:true,
    stablecoin_price_and_peg_deviation_not_claimed:true}};
}
export async function observeDefiLlama({fetchImpl=fetch,
  now=()=>new Date().toISOString(),timeoutMs=K001_LIMITS.timeoutMs}={}){
  const tasks=[
    {name:'DefiLlama-chain-TVL',url:K001_URLS.chainTvl,
      limit:K001_LIMITS.tvlBytes,parse:parseChainTvl},
    {name:'DefiLlama-stablecoin-supply',url:K001_URLS.stablecoins,
      limit:K001_LIMITS.stablecoinsBytes,parse:parseStablecoinSupply}
  ];
  const results=await Promise.all(tasks.map(async x=>{
    try{
      const payload=await readPublic(x.url,{fetchImpl,timeoutMs,maxBytes:x.limit});
      const parsed=x.parse(payload.data,{knownAt:now(),url:x.url});
      return {observations:parsed.observations,metadata:parsed.metadata,
        source:source({name:x.name,url:x.url,knownAt:now(),
          signals:parsed.observations.length,sha:payload.sha256,
          details:{data_is_aggregated:true,first_seen_only:true}})};
    }catch(error){
      return {observations:[],metadata:null,
        source:source({name:x.name,url:x.url,knownAt:now(),
          status:'unavailable',error})};
    }
  }));
  return {group:'defillama_public_aggregates',
    observations:results.flatMap(x=>x.observations),
    metadata:results.map((x,i)=>({name:tasks[i].name,details:x.metadata})),
    sources:results.map(x=>x.source),
    tvl_not_inflows:true,stablecoin_supply_not_verified_bridge_flow:true,
    prediction_inputs_enabled:false,automatic_trading:false};
}
