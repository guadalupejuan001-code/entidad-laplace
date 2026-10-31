/* O001 — volumen Reg SHO diario reportado a FINRA (no interés en corto).
 * Los informes CNMS y FORF son universos distintos: jamás sumar dos veces
 * un agregado CNMS con sus TRF componentes. No identifica participantes.
 * Se exige fecha explícita y se conserva el primer conocimiento real.
 */
import {createHash} from 'node:crypto';
import {observation,utcTime} from '../estados.mjs';
import {MARKET_SYMBOLS} from '../catalogo-global.mjs';

export const REGSHO_SCHEMA='laplace-finra-regsho-o001-v1';
export const FACILITIES=Object.freeze({CNMS:'listed_off_exchange',FORF:'unlisted_otc'});
export const SOURCE_ROOT='https://cdn.finra.org/equity/regsho/daily/';
export const DEFAULT_TRACKED=Object.freeze(MARKET_SYMBOLS.filter(s=>/^[A-Z]{1,8}$/.test(s)));
const need=(yes,why)=>{if(!yes)throw Error(why)};
const sha256=raw=>createHash('sha256').update(raw).digest('hex');
const DATE=/^\d{8}$/;
const SYMBOL=/^[A-Za-z0-9.^$/-]{1,14}$/;
const MAX_BYTES=6_000_000,MAX_ROWS=50_000,MAX_TRACKED=64;
const HEAD='Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market';
function validateDate(value){
  need(typeof value==='string'&&DATE.test(value),'Fecha FINRA debe ser YYYYMMDD');
  const s=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);
  need(new Date(s+'T00:00:00.000Z').toISOString().slice(0,10)===s,'Día FINRA inexistente');
  return s;
}
export function urlRegSho({tradeDate,facility='CNMS'}){
  validateDate(tradeDate);
  need(Object.hasOwn(FACILITIES,facility),'Centro FINRA no admitido');
  return SOURCE_ROOT+facility+'shvol'+tradeDate+'.txt';
}
function shares(raw){
  need(typeof raw==='string'&&/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(raw),
    'Volumen FINRA fuera de formato');
  const [head,tail='']=raw.split('.');
  return BigInt(head)*1_000_000n+BigInt(tail.padEnd(6,'0'));
}
function asNumber(value){
  // Mantener enteros exactos durante validación y ratios; la salida JSON
  // usa la escala numérica de UniverseSnapshot.
  return Number(value)/1e6;
}
function tickers(wanted=DEFAULT_TRACKED){
  need(Array.isArray(wanted)&&wanted.length>=1&&wanted.length<=MAX_TRACKED,'Lista FINRA de 1 a 64 símbolos');
  const out=wanted.map(s=>{need(typeof s==='string'&&SYMBOL.test(s),'Ticker FINRA inválido');return s.toUpperCase()});
  need(new Set(out).size===out.length,'Ticker FINRA repetido');
  return out;
}
export function parseRegSho(text,{tradeDate,facility='CNMS'}){
  const date=validateDate(tradeDate);
  urlRegSho({tradeDate,facility});
  need(typeof text==='string'&&Buffer.byteLength(text,'utf8')<=MAX_BYTES,'Archivo FINRA demasiado grande');
  const lines=text.replace(/\r\n?/g,'\n').trim().split('\n');
  need(lines.length>=2&&lines.length<=MAX_ROWS+2,'FINRA sin cabecera/tráiler o con demasiadas filas');
  const header=lines[0].replace(/\s+/g,'');
  need(header===HEAD,'Cabecera FINRA distinta a la versión admitida');
  const trailer=lines.at(-1).trim();
  need(/^\d{1,6}$/.test(trailer),'FINRA sin tráiler de conteo');
  const n=Number(trailer);
  need(n===lines.length-2,'FINRA con recuento truncado o inconsistente');
  const records=[],keys=new Set();
  for(const line of lines.slice(1,-1)){
    const row=line.split('|');
    need(row.length===6,'Fila FINRA truncada');
    const [d,symbol,sv,sev,tv,market]=row;
    need(d===tradeDate&&SYMBOL.test(symbol),
      'Fecha/símbolo FINRA incoherente (fila '+(records.length+2)+', fecha='+d+
      ', símbolo='+JSON.stringify(symbol.slice(0,24))+', formato='+String(SYMBOL.test(symbol))+')');
    need((facility==='FORF'?/^(?:O(?:,O)*)?$/:/^(?:[NBQD](?:,[NBQD])*)?$/).test(market),
      'Código de centro FINRA desconocido para '+facility);
    const short=shares(sv),exempt=shares(sev),total=shares(tv);
    need(exempt<=short&&short<=total&&total>0n,'Volumen FINRA incoherente');
    const key=symbol.toUpperCase()+'|'+market;
    need(!keys.has(key),'Duplicado FINRA: '+key);keys.add(key);
    records.push({symbol:symbol.toUpperCase(),market,
      short,exempt,total});
  }
  need(records.length===n,'Recuento FINRA distinto del tráiler');
  return {schema:REGSHO_SCHEMA,facility,trade_date:date,raw_records:n,
    records,raw_sha256:sha256(text)};
}
export function summarizeRegSho(parsed,{capturedAt,sourceUrl,symbols=DEFAULT_TRACKED}){
  const at=utcTime(capturedAt),tracked=tickers(symbols);
  need(parsed.schema===REGSHO_SCHEMA,'FINRA parse incompleto');
  need(at>=parsed.trade_date+'T00:00:00.000Z','FINRA aún no se había observado');
  need(sourceUrl===urlRegSho({tradeDate:parsed.trade_date.replace(/-/g,''),facility:parsed.facility}),
    'Fuente FINRA distinta a la autorizada');
  const found=new Map(),duplicates=[];
  for(const r of parsed.records){
    if(!tracked.includes(r.symbol))continue;
    if(found.has(r.symbol)){duplicates.push(r.symbol);continue}
    found.set(r.symbol,r);
  }
  need(duplicates.length===0,'Múltiples agregados incompatibles por símbolo');
  const observations=[];
  const domain=parsed.facility==='CNMS'?'operaciones_fuera_bolsa':'mercado_otc_no_listado';
  const observed=parsed.trade_date+'T00:00:00.000Z';
  for(const name of tracked){
    const x=found.get(name);if(!x)continue;
    const base='FINRA_'+parsed.facility+'_'+name;
    const rows=[
      ['short_sale_shares',asNumber(x.short),'shares'],
      ['short_exempt_shares',asNumber(x.exempt),'shares'],
      ['total_reported_shares',asNumber(x.total),'shares'],
      ['short_sale_share_ratio',Number(x.short)/Number(x.total),'ratio']
    ];
    for(const [name,value,unit] of rows){
      need(Number.isFinite(value),'FINRA valor fuera de rango');
      observations.push(observation({id:'finra-'+parsed.facility+'-'+x.symbol+'-'+name+'-'+parsed.trade_date,
        domain,variable:base+'_'+name,value,unit,observed_at:observed,known_at:at,source_url:sourceUrl}));
    }
  }
  return {schema:REGSHO_SCHEMA,facility:parsed.facility,trade_date:parsed.trade_date,
    captured_at:at,source_url:sourceUrl,source_sha256:parsed.raw_sha256,
    raw_records:parsed.raw_records,tracked_symbols:tracked,matched_symbols:[...found.keys()],
    missing_symbols:tracked.filter(x=>!found.has(x)),observations,
    observed_date_precision:'day',publication_time_verified:false,
    backtest_intraday_eligible:false,
    scope:parsed.facility==='CNMS'?'FINRA reported listed equity off-exchange executions':
      'FINRA ORF reported unlisted OTC executions',
    semantics:'Daily executed short-sale volume. Not short interest, short ownership, hidden orders, total exchange volume or identifiable counterparty.',
    accuracy_status:'aggregated_observation_only',prediction_inputs_enabled:false,
    automatic_trading:false};
}
async function readBounded(url,{fetchImpl=fetch,timeoutMs=15000}={}){
  const response=await fetchImpl(url,{cache:'no-store',redirect:'error',
    signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'text/plain','User-Agent':'LaPlaceDIG-O001/1.0'}});
  need(response.ok,'HTTP '+response.status+' FINRA (no disponibilidad no equivale a volumen cero)');
  const length=Number(response.headers?.get('content-length')??0);
  need(!length||length<=MAX_BYTES,'FINRA excedió tamaño anunciado');
  if(!response.body?.getReader){
    const data=await response.text();need(Buffer.byteLength(data,'utf8')<=MAX_BYTES,'FINRA excedió límite');
    return data;
  }
  const reader=response.body.getReader(),parts=[];let lengthRead=0;
  try{
    for(;;){const x=await reader.read();if(x.done)break;lengthRead+=x.value.byteLength;
      need(lengthRead<=MAX_BYTES,'FINRA excedió límite');
      parts.push(Buffer.from(x.value));}
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  return Buffer.concat(parts).toString('utf8');
}
export async function fetchRegSho({tradeDate,facility='CNMS',symbols=DEFAULT_TRACKED,
  fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,archiveResponse}={}){
  const url=urlRegSho({tradeDate,facility}),captured=utcTime(now());
  try{
    const raw=await readBounded(url,{fetchImpl,timeoutMs});
    const parsed=parseRegSho(raw,{tradeDate,facility});
    const result=summarizeRegSho(parsed,{capturedAt:utcTime(now()),sourceUrl:url,symbols});
    const archive=archiveResponse?await archiveResponse({source:'FINRA-'+facility,
      url,received_at:result.captured_at,body_sha256:parsed.raw_sha256,text:raw}):null;
    return {observations:result.observations,source:{
      name:'FINRA-RegSHO-'+facility,status:'observed',signals:result.observations.length,
      url,received_at:result.captured_at,trade_date:result.trade_date,raw_records:parsed.raw_records,
      tracked_symbols:result.tracked_symbols.length,matched_symbols:result.matched_symbols.length,
      missing_symbols:result.missing_symbols,body_sha256:result.source_sha256,
      raw_response_archived:Boolean(archive),archive_ref:archive??null,
      availability:'capture-time only',historical_intraday_eligible:false,
      meaning:'off-exchange short sale flow, not short interest or identity',
      prediction_inputs_enabled:false}};
  }catch(error){
    return {observations:[],source:{name:'FINRA-RegSHO-'+facility,
      status:'unavailable',signals:0,url,trade_date:validateDate(tradeDate),
      received_at:utcTime(now()),reason:String(error.message).slice(0,220),
      absent_is_zero:false,prediction_inputs_enabled:false}};
  }
}
export async function observeFinraOffExchange({tradeDate,symbols=DEFAULT_TRACKED,
  fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,archiveResponse}={}){
  need(typeof tradeDate==='string','FINRA requiere día de mercado explícito');
  const facilities=Object.keys(FACILITIES);
  const settled=await Promise.all(facilities.map(facility=>fetchRegSho({
    tradeDate,facility,symbols,fetchImpl,now,timeoutMs,archiveResponse})));
  return {group:'off_exchange_finra',captured_at:utcTime(now()),
    observations:settled.flatMap(x=>x.observations),sources:settled.map(x=>x.source),
    trade_date:validateDate(tradeDate),facilities,
    availability:'requested_day_not_guaranteed_published',
    prediction_inputs_enabled:false,anonymous_counterparties_not_identified:true};
}
