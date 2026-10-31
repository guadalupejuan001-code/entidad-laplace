/* D002: CFTC public Weekly Swaps Report, three SINGLE-COUNT cleared-status tables.
 * Stock notional, weekly transaction dollars and transaction counts are distinct
 * measures. Never add participant-type tables, which can double-count totals.
 * This parser does NOT access confidential Part 45 or customer records.
 */
import {createHash} from 'node:crypto';
import {observation,utcTime} from '../estados.mjs';

export const CFTC_D002_SCHEMA='laplace-swaps-cftc-d002-v1';
export const CFTC_TABLES=Object.freeze({
  gross_notional:{url:'https://www.cftc.gov/MarketReports/SwapsReports/L1GrossExpCS.html',
    title:/Gross Notional Outstanding by Cleared Status/i,unit:'million_usd',
    meaning:'weekly snapshot gross notional outstanding; single-count'},
  trade_dollars:{url:'https://www.cftc.gov/MarketReports/SwapsReports/L1TransDollarVolCS.html',
    title:/Transaction Dollar Volume by Cleared Status/i,unit:'million_usd',
    meaning:'weekly market-facing transaction notional volume; single-count'},
  trade_tickets:{url:'https://www.cftc.gov/MarketReports/SwapsReports/L1ActVolCS.html',
    title:/Transaction Ticket Volume by Cleared Status/i,unit:'count',
    meaning:'weekly number of market-facing new trade events; single-count'}
});
const need=(c,msg)=>{if(!c)throw Error(msg)};
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const TABLE_LIMIT=3000000;
const str=x=>String(x??'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;|&#xA0;/gi,' ')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/\s+/g,' ').trim();
const sha256=x=>createHash('sha256').update(x).digest('hex');
const isoDay=s=>{
  need(/^\d{4}-\d{2}-\d{2}$/.test(s),'Fecha CFTC no ISO');
  const n=Date.parse(s+'T00:00:00.000Z');
  need(Number.isFinite(n)&&new Date(n).toISOString().startsWith(s),'Fecha CFTC inexistente');
  return s+'T00:00:00.000Z';
};
function readRows(raw){
  const tables=[...raw.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
  need(tables.length>0&&tables.length<=120,'CFTC no contiene tablas HTML conocidas');
  return tables.map(([,body])=>[...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)]
    .map(([,row])=>[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)]
      .map(([,cell])=>str(cell)))
    .filter(cells=>cells.length>=2));
}
function label(x){
  const s=x.replace(/\*/g,'').trim().toLowerCase();
  if(/^total interest rate/.test(s))return 'interest_rate';
  if(/^total credit/.test(s))return 'credit';
  if(/^total fx/.test(s))return 'fx';
  if(s==='cleared')return 'cleared';
  if(s==='uncleared')return 'uncleared';
  if(s==='total')return 'all_asset_classes';
  return null;
}
function amount(s){
  need(/^(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)$/.test(s),
    'CFTC cantidad ausente, censurada o no numérica');
  const n=Number(s.replace(/,/g,''));
  need(Number.isSafeInteger(n)&&n>=0,'CFTC cantidad fuera de precisión');
  return n;
}
function parseTitleDate(raw,kind){
  const pattern=CFTC_TABLES[kind].title;
  const titles=[...raw.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)].map(([,c])=>str(c));
  const match=titles.find(x=>pattern.test(x)&&/(\d{1,2}\/\d{1,2}\/\d{4})/.test(x));
  need(match,'CFTC no tiene encabezado fechado de '+kind);
  const m=match.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const day=m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
  isoDay(day);
  return day;
}
function weeks(header,latest){
  need(header.length===6,'CFTC requiere cinco columnas semanales');
  const parsed=header.slice(1).map(x=>{
    const m=new RegExp('^('+MONTHS.join('|')+')\\s+(\\d{1,2})$','i').exec(x);
    need(m,'CFTC columna semanal distinta del contrato: '+x);
    return {month:MONTHS.findIndex(s=>s.toLowerCase()===m[1].toLowerCase())+1,day:Number(m[2])};
  });
  let year=Number(latest.slice(0,4)),lastMonth=parsed.at(-1).month;
  const dates=Array(5);
  for(let i=4;i>=0;i--){
    if(parsed[i].month>lastMonth)year--;
    lastMonth=parsed[i].month;
    const d=year+'-'+String(parsed[i].month).padStart(2,'0')+'-'+String(parsed[i].day).padStart(2,'0');
    isoDay(d);dates[i]=d;
  }
  need(dates[4]===latest,'CFTC encabezado y último viernes no coinciden');
  for(let i=1;i<dates.length;i++)
    need(Date.parse(dates[i]+'T00:00:00Z')-Date.parse(dates[i-1]+'T00:00:00Z')===7*86400000,
      'CFTC fechas no semanales');
  return dates;
}
function matrix(rows){
  const interesting=rows.filter(c=>c.length>=6);
  const ix=interesting.findIndex(c=>label(c[0])==='interest_rate');
  need(ix>0,'CFTC no tiene fila Total Interest Rate en una tabla válida');
  need(ix+9<interesting.length,'CFTC tabla de cleared status truncada');
  const header=interesting[ix-1],part=interesting.slice(ix,ix+10);
  const order=['interest_rate','cleared','uncleared','credit','cleared',
    'uncleared','fx','cleared','uncleared','all_asset_classes'];
  for(let i=0;i<order.length;i++)need(label(part[i][0])===order[i],
    'CFTC orden de assets/clearing cambió; requiere revisión');
  need(part.every(c=>c.length===6),'CFTC cifras o semanas incompletas');
  const data=part.map(c=>c.slice(1).map(amount));
  for(let col=0;col<5;col++){
    for(let i=0;i<=6;i+=3)
      need(Math.abs(data[i][col]-data[i+1][col]-data[i+2][col])<=2,
        'CFTC subcategorías cleared/uncleared incoherentes');
    need(Math.abs(data[9][col]-data[0][col]-data[3][col]-data[6][col])<=4,
      'CFTC total de clases incoherente');
  }
  return {header,data};
}
export function parseCftcWeeklyHtml(html,{kind,knownAt,sourceUrl=CFTC_TABLES[kind]?.url}={}){
  need(Object.hasOwn(CFTC_TABLES,kind),'CFTC tabla no declarada');
  need(sourceUrl===CFTC_TABLES[kind].url,'CFTC URL no autorizada');
  need(typeof html==='string'&&Buffer.byteLength(html)<=TABLE_LIMIT,
    'CFTC HTML ausente o excesivo');
  const at=utcTime(knownAt),latest=parseTitleDate(html,kind);
  need(latest+'T00:00:00.000Z'<=at,'CFTC referencia futura');
  const tables=readRows(html),matches=[];
  for(const rows of tables){
    try{matches.push(matrix(rows))}catch{}
  }
  need(matches.length===1,'CFTC no tiene tabla única reconocida (falta o formato cambió)');
  const dates=weeks(matches[0].header,latest),rows=matches[0].data;
  const observations=[];
  for(let col=0;col<5;col++){
    const dt=dates[col]+'T00:00:00.000Z';
    for(let i=0;i<10;i++){
      const group=i===9?'total':Math.floor(i/3);
      const asset=i===9?'all':(['interest_rate','credit','fx'][group]);
      const clearing=i===9?'all':(['total','cleared','uncleared'][i%3]);
      const variable='CFTC_'+kind+'_'+asset+'_'+clearing;
      observations.push(observation({
        id:'cftc-d002-'+kind+'-'+asset+'-'+clearing+'-'+dates[col],
        domain:'swaps_otc_agregados',variable,value:rows[i][col],
        unit:CFTC_TABLES[kind].unit,observed_at:dt,known_at:at,
        source_url:sourceUrl
      }));
    }
  }
  return {schema:CFTC_D002_SCHEMA,kind,observations,
    week_dates:dates,latest_week:latest,received_at:at,source_url:sourceUrl,
    body_sha256:sha256(html),metric:CFTC_TABLES[kind].meaning,
    observed_sources:1,raw_counterparties:false,financial_edge_demonstrated:false,
    historical_publication_time_certified:false,
    selected_tables:'only_single_count_cleared_status',
    participation_type_double_count_avoided:true,
    prediction_inputs_enabled:false,automatic_trading:false};
}
async function boundedHTML(url,{fetchImpl,timeoutMs=16000}){
  need(Object.values(CFTC_TABLES).some(x=>x.url===url),'CFTC URL no autorizada');
  const res=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),redirect:'error',
    cache:'no-store',headers:{Accept:'text/html','User-Agent':'LaPlaceDIG-D002/1.0'}});
  need(res?.ok,'CFTC HTTP '+(res?.status??'sin_respuesta'));
  const len=Number(res.headers?.get?.('content-length')??0);
  need(!len||len<=TABLE_LIMIT,'CFTC longitud excedida');
  const reader=res.body?.getReader?.();
  if(!reader){
    const body=await res.text();need(Buffer.byteLength(body)<=TABLE_LIMIT,'CFTC HTML excesivo');
    return body;
  }
  const parts=[];let bytes=0;
  try{for(;;){
    const p=await reader.read();if(p.done)break;
    bytes+=p.value.byteLength;need(bytes<=TABLE_LIMIT,'CFTC HTML excesivo');
    parts.push(Buffer.from(p.value));
  }}catch(error){await reader.cancel().catch(()=>{});throw error}
  return Buffer.concat(parts).toString('utf8');
}
export async function observeCftcWeekly({fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=16000,kinds=Object.keys(CFTC_TABLES)}={}){
  need(Array.isArray(kinds)&&kinds.length>=1&&kinds.length<=3&&
    kinds.every(k=>Object.hasOwn(CFTC_TABLES,k))&&new Set(kinds).size===kinds.length,
    'CFTC grupos de reporte no permitidos');
  const results=await Promise.all(kinds.map(async kind=>{
    const url=CFTC_TABLES[kind].url;
    try{
      const html=await boundedHTML(url,{fetchImpl,timeoutMs});
      const report=parseCftcWeeklyHtml(html,{kind,knownAt:now(),sourceUrl:url});
      return {kind,report,source:{name:'CFTC-'+kind,status:'observed',
        url,received_at:report.received_at,latest_week:report.latest_week,
        count:report.observations.length,body_sha256:report.body_sha256,
        unit:CFTC_TABLES[kind].unit}};
    }catch(error){
      return {kind,report:null,source:{name:'CFTC-'+kind,status:'unavailable',url,
        received_at:utcTime(now()),count:0,reason:String(error.message).slice(0,200),
        missing_is_zero:false}};
    }
  }));
  const observed=results.filter(x=>x.report);
  const latests=[...new Set(observed.map(x=>x.report.latest_week))];
  if(latests.length>1)return {schema:CFTC_D002_SCHEMA,observations:[],
    source_status:results.map(x=>x.source),coverage:{status:'incompatible_reference_weeks',
      latest_weeks:latests,observed_sources:observed.length},
    prediction_inputs_enabled:false,automatic_trading:false};
  return {schema:CFTC_D002_SCHEMA,observations:observed.flatMap(x=>x.report.observations),
    source_status:results.map(x=>x.source),
    coverage:{status:observed.length===kinds.length?'complete_requested':'partial',
      groups_requested:kinds,groups_observed:observed.map(x=>x.kind),
      observed_sources:observed.length,unavailable_sources:results.length-observed.length,
      observations:observed.reduce((a,x)=>a+x.report.observations.length,0),
      latest_week:latests[0]??null,all_world_swaps_covered:false},
    table_semantics:'single count by cleared status; metrics not additively interchangeable',
    publication_basis:'first received by Laplace; original release time not certified',
    reported_assets:['interest_rate','credit','fx'],
    additional_equity_commodity_swaps_not_represented:true,
    source_snapshot_type:'weekly_public_aggregate_not_part43_transactions',
    prediction_inputs_enabled:false,automatic_trading:false};
}
