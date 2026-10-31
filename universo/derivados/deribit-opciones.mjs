/* Deribit option chain: get_instruments + get_book_summary_by_currency.
 * Match exact instrument names; expiry/strike/side come from instrument metadata.
 * Option OI is in underlying base units, not contract counts or USD notional.
 */
import {D001_ROOTS,boundedJSON,instrumentId,number,numericRecord,sourceStatus,utc} from './contrato.mjs';
export const DERIBIT_CURRENCIES=Object.freeze(['BTC','ETH']);
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
export function optionUrls(currency){
  need(DERIBIT_CURRENCIES.includes(currency),'Deribit moneda fuera de catálogo');
  const root=D001_ROOTS.deribit+'/api/v2/public/';
  return {
    instruments:root+'get_instruments?currency='+currency+'&kind=option&expired=false',
    summary:root+'get_book_summary_by_currency?currency='+currency+'&kind=option'
  };
}
function unwrap(raw){
  need(raw?.jsonrpc==='2.0'&&raw.error==null&&Array.isArray(raw.result),
    'Deribit JSON-RPC no devolvió lista de mercado');
  need(raw.result.length<=15000,'Deribit: presupuesto de contratos excedido');
  return raw.result;
}
export function parseDeribitOptions({instruments,summary}, {currency,knownAt,
  maxContracts=24,sourceUrl}={}){
  need(DERIBIT_CURRENCIES.includes(currency),'Deribit moneda no admitida');
  need(Number.isInteger(maxContracts)&&maxContracts>=1&&maxContracts<=48,
    'Deribit número de contratos fuera de límite');
  const at=utc(knownAt),items=unwrap(instruments),quotes=unwrap(summary);
  const byName=new Map();
  for(const q of quotes){
    need(typeof q.instrument_name==='string'&&q.instrument_name.length<=80,
      'Deribit nombre inválido');
    need(!byName.has(q.instrument_name),'Deribit resumen de contrato duplicado');
    byName.set(q.instrument_name,q);
  }
  const eligible=[];
  for(const item of items){
    if(item?.kind!=='option'||item.is_active!==true||
       item.base_currency!==currency)continue;
    need(typeof item.instrument_name==='string'&&/^[A-Z0-9-]{5,80}$/.test(item.instrument_name),
      'Deribit símbolo de opción inválido');
    need(['call','put'].includes(item.option_type),'Deribit option_type inválido');
    const expiryMs=item.expiration_timestamp;
    need(typeof expiryMs==='number'&&Number.isSafeInteger(expiryMs)&&expiryMs>0,
      'Deribit vencimiento no verificable');
    if(expiryMs<=Date.parse(at))continue; // Ya vencidos no son cartera viva.
    const strike=number(item.strike,{name:'strike',min:0.000001,max:1e15});
    const size=number(item.contract_size,{name:'contract_size',min:0.000001,max:1e15});
    const q=byName.get(item.instrument_name);
    if(!q)continue;
    need(q.base_currency===currency,'Deribit resumen de otro activo');
    eligible.push({item,q,expiryMs,strike,size});
  }
  eligible.sort((a,b)=>a.expiryMs-b.expiryMs||
    a.strike-b.strike||a.item.instrument_name.localeCompare(b.item.instrument_name));
  const requested=eligible.slice(0,maxContracts),rows=[],contracts=[];
  for(const {item,q,expiryMs,strike,size} of requested){
    const expiry=new Date(expiryMs).toISOString();
    const settlement=item.settlement_currency;
    need(typeof settlement==='string'&&/^[A-Z0-9]{2,12}$/.test(settlement),
      'Deribit opción sin moneda de liquidación');
    const contract=instrumentId({venue:'deribit',kind:'option',symbol:item.instrument_name,
      settlement,expiry,side:item.option_type,strike});
    const signals=[
      ['open_interest_base',q.open_interest,currency,0,1e18],
      ['mark_implied_volatility',q.mark_iv,'pct',0,1000],
      ['volume_24h_usd',q.volume_usd,'USD',0,1e24]
    ];
    let count=0;
    for(const [metric,value,unit,min,max] of signals){
      if(value===null||value===undefined||value==='')continue;
      rows.push(numericRecord({contract,metric,value:number(value,{name:metric,min,max}),
        unit,observedAt:at,knownAt:at,sourceUrl}));count++;
    }
    if(count===0)continue;
    contracts.push({...contract,contract_size:size,contract_size_unit:item.base_currency,
      base_currency:currency,quote_currency:item.quote_currency??null,
      first_seen_at:at,exchange_timestamp_provided:false,
      oi_unit:currency,implied_volatility_unit:'percent_as_reported',
      selection_policy:'nearest unexpired expiry then ascending strike',
      contract_metadata_verified:true});
  }
  return {observations:rows,contracts,coverage:{
    currency,active_with_summary:eligible.length,selected:requested.length,
    with_any_signal:contracts.length,truncated:eligible.length>maxContracts,
    full_market_coverage:false,
    strategy:'earliest_unexpired_then_strike_not_a_representative_aggregate'},
    validation:'raw provider contracts and values; no options delta/gamma inferred',
    prediction_inputs_enabled:false,automatic_trading:false};
}
export async function observeDeribitOptions({currencies=DERIBIT_CURRENCIES,
  maxContracts=24,fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=16000}={}){
  need(Array.isArray(currencies)&&currencies.length>=1&&currencies.length<=2&&
    currencies.every(x=>DERIBIT_CURRENCIES.includes(x))&&
    new Set(currencies).size===currencies.length,'Deribit currencies inválidas');
  const data=await Promise.all(currencies.map(async currency=>{
    const urls=optionUrls(currency);
    // Both requests run at once. Never combine a partial chain with a fake OI.
    const [meta,summary]=await Promise.allSettled([
      boundedJSON(urls.instruments,{fetchImpl,timeoutMs,maxBytes:15000000}),
      boundedJSON(urls.summary,{fetchImpl,timeoutMs,maxBytes:15000000})
    ]);
    const at=utc(now()),sources=[];
    for(const [name,result] of [['instruments',meta],['summary',summary]]){
      sources.push(sourceStatus({name:'Deribit-'+currency+'-'+name,url:urls[name],
        knownAt:at,status:result.status==='fulfilled'?'observed':'unavailable',
        count:result.status==='fulfilled'?1:0,hash:result.status==='fulfilled'?result.value.sha256:null,
        error:result.status==='rejected'?result.reason:null,
        notes:'JSON-RPC public option market; source response not per-contract timestamped'}));
    }
    if(meta.status==='rejected'||summary.status==='rejected')
      return {currency,observations:[],contracts:[],coverage:null,sources};
    try{
      const parsed=parseDeribitOptions({instruments:meta.value.value,summary:summary.value.value},
        {currency,knownAt:at,sourceUrl:urls.summary,maxContracts});
      if(parsed.observations.length===0)
        return {currency,observations:[],contracts:[],coverage:parsed.coverage,sources:sources.map(x=>({...x,
          status:'unavailable',reason:'No active matched contracts with numeric option signals'}))};
      return {...parsed,currency,sources};
    }catch(error){return {currency,observations:[],contracts:[],coverage:null,
      sources:sources.map(x=>({...x,status:'unavailable',reason:String(error.message).slice(0,180)}))}}
  }));
  return {group:'derivatives_deribit_options',observations:data.flatMap(x=>x.observations),
    contracts:data.flatMap(x=>x.contracts),coverage:data.map(x=>x.coverage),
    sources:data.flatMap(x=>x.sources),prediction_inputs_enabled:false,automatic_trading:false};
}
