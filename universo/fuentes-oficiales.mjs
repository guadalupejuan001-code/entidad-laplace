/* Ampliación U003: fuentes primarias públicas. El host valida y fecha;
 * los estados siguen usando el contrato y el transporte XI/Ether originales. */
import {createHash} from 'node:crypto';
import {observation,utcTime} from './estados.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message)};
export function numeric(value){
  if(typeof value!=='number'&&typeof value!=='string')return NaN;
  const s=String(value).trim();
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s))return NaN;
  const n=Number(s);return Number.isFinite(n)?n:NaN;
}
const sha=text=>createHash('sha256').update(text).digest('hex');
export function dateOnly(value){
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'fecha de referencia inválida');
  return utcTime(value+'T00:00:00.000Z');
}
const row=(key,domain,variable,value,unit,observed,received,url)=>observation({
  id:key+'-'+observed,domain,variable,value,unit,
  observed_at:observed,known_at:utcTime(received),source_url:url
});
const latest=items=>items.sort((a,b)=>b.at.localeCompare(a.at))[0];
function eligibleDate(date,capturedAt){
  try{const at=dateOnly(date);return at<=utcTime(capturedAt)?at:null}catch{return null}
}
export function csvRows(text){
  const rows=[];let record=[],cell='',quoted=false;
  for(let i=0;i<=text.length;i++){
    const c=text[i]??'\n';
    if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}
    else if(c==='"')quoted=true;
    else if(c===','){record.push(cell);cell=''}
    else if(c==='\n'){record.push(cell.replace(/\r$/,''));if(record.some(Boolean))rows.push(record);record=[];cell=''}
    else cell+=c;
  }
  need(!quoted,'CSV con comillas sin cerrar');return rows;
}
export const OFFICIAL_URLS=Object.freeze({
  canada:'https://www.bankofcanada.ca/valet/observations/V39079/json?recent=20',
  ecb:'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=20&format=csvdata',
  twse:'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK',
  b3:'https://cotacao.b3.com.br/mds/api/v1/InstrumentPriceFluctuation/ibov',
  moexFutures:'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.meta=off&iss.only=securities,marketdata'
});
export function brazilPolicyUrl(at){
  const end=utcTime(at),start=new Date(Date.parse(end)-30*86400000).toISOString();
  const br=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
  const u=new URL('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados');
  u.searchParams.set('formato','json');u.searchParams.set('dataInicial',br(start));u.searchParams.set('dataFinal',br(end));return u.toString();
}
export function moexIndexUrl(at){
  const u=new URL('https://iss.moex.com/iss/engines/stock/markets/index/securities/IMOEX/candles.json');
  u.searchParams.set('from',new Date(Date.parse(utcTime(at))-14*86400000).toISOString().slice(0,10));
  u.searchParams.set('till',at.slice(0,10));u.searchParams.set('interval','24');u.searchParams.set('iss.meta','off');
  u.searchParams.set('candles.columns','begin,end,close,volume');return u.toString();
}
export function parseCanadaPolicy(raw,{capturedAt,url=OFFICIAL_URLS.canada}={}){
  need(Array.isArray(raw?.observations),'Bank of Canada sin observaciones');
  const items=raw.observations.map(x=>({at:eligibleDate(x.d,capturedAt),value:numeric(x.V39079?.v)}))
    .filter(x=>x.at&&Number.isFinite(x.value));
  const x=latest(items);need(x,'Bank of Canada sin tasa anterior al corte');
  return [row('boc-V39079','tasas_oficiales_directas','CA_overnight_target',x.value,'pct',x.at,capturedAt,url)];
}
export function parseBrazilPolicy(raw,{capturedAt,url}={}){
  need(Array.isArray(raw),'BCB formato inválido');
  const items=raw.map(x=>{
    const d=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(x.data));
    return {at:d?eligibleDate(d[3]+'-'+d[2]+'-'+d[1],capturedAt):null,value:numeric(x.valor)};
  }).filter(x=>x.at&&Number.isFinite(x.value));
  const x=latest(items);need(x,'BCB sin tasa anterior al corte');
  return [row('bcb-432','tasas_oficiales_directas','BR_selic_target',x.value,'pct',x.at,capturedAt,url)];
}
export function parseEcbPolicy(text,{capturedAt,url=OFFICIAL_URLS.ecb}={}){
  const table=csvRows(text),header=table.shift()??[],i=header.indexOf('TIME_PERIOD'),j=header.indexOf('OBS_VALUE');
  const key=header.indexOf('KEY');need(i>=0&&j>=0&&key>=0,'ECB CSV sin identidad de serie');
  const items=table.filter(x=>x[key]==='FM.D.U2.EUR.4F.KR.DFR.LEV')
    .map(x=>({at:eligibleDate(x[i],capturedAt),value:numeric(x[j])})).filter(x=>x.at&&Number.isFinite(x.value));
  const x=latest(items);need(x,'ECB sin tasa anterior al corte');
  return [row('ecb-DFR','tasas_oficiales_directas','EA_deposit_facility_rate',x.value,'pct',x.at,capturedAt,url)];
}
export function parseTwse(raw,{capturedAt,url=OFFICIAL_URLS.twse}={}){
  need(Array.isArray(raw),'TWSE formato inválido');
  const items=raw.map(x=>{
    const d=/^(\d{3})(\d{2})(\d{2})$/.exec(String(x.Date));
    const at=d?eligibleDate(String(Number(d[1])+1911)+'-'+d[2]+'-'+d[3],capturedAt):null;
    // Cierre regular 13:30 Asia/Taipei. Solo días ya cerrados.
    return {x,at:at?new Date(Date.parse(at)+5.5*3600000).toISOString():null};
  }).filter(x=>x.at&&x.at<=utcTime(capturedAt)&&numeric(x.x.TAIEX)>0);
  const record=latest(items);need(record,'TWSE sin sesión cerrada válida');
  const fields=[['TAIEX','TWSE_TAIEX_close','index'],['TradeVolume','TWSE_shares_traded','shares'],
    ['TradeValue','TWSE_turnover','TWD'],['Transaction','TWSE_transactions','count']];
  return fields.flatMap(([field,name,unit])=>{
    const n=numeric(record.x[field]);return Number.isFinite(n)&&n>=0?[row('twse-'+field,'bolsas_directas',name,n,unit,record.at,capturedAt,url)]:[];
  });
}
function localStamp(value,offset){
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value),'timestamp local inválido');
  dateOnly(value.slice(0,10));
  need(Number(value.slice(11,13))<24&&Number(value.slice(14,16))<60&&Number(value.slice(17,19))<60,'hora local inválida');
  return new Date(Date.parse(value.replace(' ','T')+offset)).toISOString();
}
export function parseB3Public(raw,{capturedAt,url=OFFICIAL_URLS.b3}={}){
  need(raw?.BizSts?.cd==='OK','B3 respuesta no válida');
  const at=localStamp(raw.Msg?.dtTm,'-03:00');need(at<=utcTime(capturedAt),'B3 respuesta futura');
  need(Date.parse(capturedAt)-Date.parse(at)<=7*86400000,'B3 respuesta anticuada');
  const out=[],seen=new Set();
  for(const x of [...(raw.SctyHghstIncrLst??[]),...(raw.SctyHghstDrpLst??[])]){
    if(!/^[A-Z0-9]{4,12}$/.test(x?.symb)||seen.has(x.symb))continue;seen.add(x.symb);
    const price=numeric(x.SctyQtn?.curPrc),move=numeric(x.SctyQtn?.prcFlcn);
    if(price>0)out.push(row('b3-'+x.symb,'bolsas_directas','B3_'+x.symb+'_last',price,'BRL',at,capturedAt,url));
    if(Number.isFinite(move))out.push(row('b3-'+x.symb+'-change','bolsas_directas','B3_'+x.symb+'_change',move,'pct',at,capturedAt,url));
  }
  need(out.length,'B3 sin precios públicos válidos');return out;
}
function issTable(raw,key){
  const table=raw?.[key];need(Array.isArray(table?.columns)&&Array.isArray(table?.data),'MOEX sin tabla '+key);
  need(table.data.length<=20000,'MOEX tabla excesiva');
  return table.data.map(values=>Object.fromEntries(table.columns.map((name,i)=>[name,values[i]])));
}
export function parseMoexIndex(raw,{capturedAt,url}={}){
  const items=issTable(raw,'candles').flatMap(x=>{
    try{const at=localStamp(x.end,'+03:00'),value=numeric(x.close);
      return at<=utcTime(capturedAt)&&value>0?[{at,value}]:[];
    }catch{return []}
  });
  const x=latest(items);need(x,'MOEX sin vela cerrada anterior al corte');
  return [row('moex-IMOEX','bolsas_directas','MOEX_IMOEX_close',x.value,'index',x.at,capturedAt,url)];
}
const COMMODITY_ASSETS=new Set(['BR','GOLD','SILV','NG','PLT','PLD','COPPER','WHEAT','GAS','SUGAR','ALUMINUM']);
export function parseMoexDatedFutures(raw,{capturedAt,url=OFFICIAL_URLS.moexFutures,maxContracts=12}={}){
  const securities=issTable(raw,'securities'),quotes=new Map(issTable(raw,'marketdata').map(x=>[x.SECID,x]));
  const out=[],contracts=[];
  for(const sec of securities.sort((a,b)=>String(a.LASTTRADEDATE).localeCompare(String(b.LASTTRADEDATE))||String(a.SECID).localeCompare(String(b.SECID)))){
    if(contracts.length>=maxContracts)break;
    if(!COMMODITY_ASSETS.has(sec.ASSETCODE)||!/^[A-Za-z0-9_-]{1,24}$/.test(sec.SECID))continue;
    let expiry;try{expiry=dateOnly(sec.LASTTRADEDATE)}catch{continue}
    if(expiry.slice(0,10)<capturedAt.slice(0,10))continue;
    const q=quotes.get(sec.SECID),price=numeric(q?.LAST);if(!(price>0))continue;
    let at;try{at=localStamp(q.SYSTIME,'+03:00')}catch{continue}
    if(at>utcTime(capturedAt)||Date.parse(capturedAt)-Date.parse(at)>3*86400000)continue;
    const variable='MOEX_'+sec.SECID+'_last';
    out.push(row('moex-fut-'+sec.SECID,'futuros_con_vencimiento',variable,price,'native_quote',at,capturedAt,url));
    contracts.push({variable,contract_id:sec.SECID,short_name:sec.SHORTNAME,asset_code:sec.ASSETCODE,
      exchange:'MOEX',last_trade_date:sec.LASTTRADEDATE,price_kind:'last',continuous:false,
      quote_unit:sec.QUOTED_UNIT??null,currency:sec.CURRENCYID??null,
      unit_verified:false,quote_timestamp_kind:'exchange_snapshot_time',
      note:'Precio en la unidad nativa del contrato; no convertir a USD ni tratar como settlement.'});
  }
  need(out.length,'MOEX sin contratos de commodities cotizados válidos');return {observations:out,contracts};
}
async function bodyText(response,maxBytes){
  const length=numeric(response.headers?.get?.('content-length'));
  need(!Number.isFinite(length)||length<=maxBytes,'respuesta oficial excede presupuesto');
  if(!response.body?.getReader){const text=await response.text();need(Buffer.byteLength(text)<=maxBytes,'respuesta oficial excesiva');return text}
  const reader=response.body.getReader(),parts=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;need(count<=maxBytes,'respuesta oficial excesiva');parts.push(Buffer.from(value))}}
  catch(error){await reader.cancel().catch(()=>{});throw error}
  return Buffer.concat(parts).toString('utf8');
}
async function collect(definitions,{fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,archiveResponse}={}){
  const results=await Promise.all(definitions.map(async def=>{
    const url=typeof def.url==='function'?def.url(utcTime(now())):def.url;
    try{
      const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
        headers:{Accept:def.csv?'text/csv':'application/json','User-Agent':'LaPlaceDIG-U003-official/1.0'}});
      need(response.ok,'HTTP '+response.status);
      const text=await bodyText(response,8_000_000),received=utcTime(now());
      const parsed=def.parse(def.csv?text:JSON.parse(text),{capturedAt:received,url});
      const rows=Array.isArray(parsed)?parsed:parsed.observations;
      need(rows.length>0,'fuente sin observaciones válidas');
      const bodyHash=sha(text),archiveRef=archiveResponse?await archiveResponse({
        source:def.name,url,received_at:received,body_sha256:bodyHash,text}):null;
      return {observations:rows,contracts:parsed.contracts??[],source:{name:def.name,status:'observed',
        signals:rows.length,url,received_at:received,body_sha256:bodyHash,primary_source:true,
        raw_response_archived:Boolean(archiveRef),archive_ref:archiveRef??null,
        reference_precision:def.precision??'date',exact_publication_time:false,...def.metadata}};
    }catch(error){return {observations:[],contracts:[],source:{name:def.name,status:'unavailable',signals:0,url,
      primary_source:true,reason:String(error.message).slice(0,180)}}}
  }));
  return {captured_at:utcTime(now()),observations:results.flatMap(x=>x.observations),
    sources:results.map(x=>x.source),contracts:results.flatMap(x=>x.contracts)};
}
export function fetchOfficialCentralBanks(options={}){
  return collect([
    {name:'Bank-of-Canada-V39079',url:OFFICIAL_URLS.canada,parse:parseCanadaPolicy},
    {name:'BCB-SGS-432',url:brazilPolicyUrl,parse:parseBrazilPolicy},
    {name:'ECB-deposit-facility',url:OFFICIAL_URLS.ecb,csv:true,parse:parseEcbPolicy}
  ],options);
}
export function fetchPublicDirectExchanges(options={}){
  return collect([
    {name:'TWSE-public-daily',url:OFFICIAL_URLS.twse,parse:parseTwse,metadata:{region:'Asia',direct_exchange:true,coverage:'daily_market_aggregate'}},
    {name:'B3-public-movers',url:OFFICIAL_URLS.b3,parse:parseB3Public,precision:'second',metadata:{region:'LatAm',direct_exchange:true,coverage:'top_movers_sample',delay_seconds:null,full_market_feed:false}},
    {name:'MOEX-public-index',url:moexIndexUrl,parse:parseMoexIndex,precision:'second',metadata:{region:'Europe',country:'RU',direct_exchange:true,coverage:'IMOEX_daily_closed_bars'}}
  ],options);
}
export function fetchDatedCommodityContracts(options={}){
  return collect([{name:'MOEX-public-dated-commodities',url:OFFICIAL_URLS.moexFutures,parse:parseMoexDatedFutures,
    precision:'second',metadata:{direct_exchange:true,continuous:false,full_market_feed:false}}],options);
}
