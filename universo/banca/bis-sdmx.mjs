/* B001: BIS SDMX CSV v2 parser for four explicitly whitelisted series.
 * Every numeric U001 observation is a quarterly STOCK, not a banking flow.
 * LBS and CBS have different consolidations and MUST NEVER be added.
 * Currency "USD_million" is the reporting unit, not USD absolute.
 */
import {createHash} from 'node:crypto';
import {observation,utcTime} from '../estados.mjs';
import {B001_SCHEMA,BIS_ROOT,BIS_SERIES,BIS_LIMITS,BIS_BANKING_RULES} from './catalogo-bis.mjs';

const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const checksum=s=>createHash('sha256').update(s).digest('hex');
const date=utcTime;
const LBSDIMS=Object.freeze(['FREQ','L_MEASURE','L_POSITION','L_INSTR',
  'L_DENOM','L_CURR_TYPE','L_PARENT_CTY','L_REP_BANK_TYPE','L_REP_CTY',
  'L_CP_SECTOR','L_CP_COUNTRY','L_POS_TYPE']);
const CBSDIMS=Object.freeze(['FREQ','L_MEASURE','L_REP_CTY','CBS_BANK_TYPE',
  'CBS_BASIS','L_POSITION','L_INSTR','REM_MATURITY','CURR_TYPE_BOOK',
  'L_CP_SECTOR','L_CP_COUNTRY']);
function approveSeries(series){
  need(series&&BIS_SERIES.some(x=>x===series),'BIS referencia no está en catálogo');
  return series;
}
export function bisSdmxUrl(series){
  approveSeries(series);
  const url=BIS_ROOT+'/api/v2/data/dataflow/BIS/'+series.dataset+'/1.0/'+
    series.key+'?format=csv&labels=id&lastNObservations='+BIS_LIMITS.maxHistoryQuarters;
  return url;
}
function quarterEnd(period){
  need(/^\d{4}-Q[1-4]$/.test(period),'BIS periodo distinto de YYYY-Qn');
  const [yy,qq]=period.split('-Q');
  const y=Number(yy),q=Number(qq);
  need(y>=1970&&y<=2100,'BIS año fuera del horizonte');
  const instant=Date.UTC(y,q*3,0,23,59,59,999);
  return new Date(instant).toISOString();
}
function csvRows(raw){
  need(typeof raw==='string'&&Buffer.byteLength(raw,'utf8')<=BIS_LIMITS.maxDownloadBytes,
    'BIS CSV vacío o excede tamaño permitido');
  const rows=[],row=[];let value='',quoted=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(quoted){
      if(c==='"'){
        if(raw[i+1]==='"'){value+='"';i++}else quoted=false;
      }else{value+=c}
    }else if(c==='"'){
      need(value==='','BIS comillas CSV fuera de posición');quoted=true;
    }else if(c===','){row.push(value);value=''}
    else if(c==='\n'){row.push(value);value='';rows.push([...row]);row.length=0}
    else if(c==='\r'){need(raw[i+1]==='\n','BIS CR sin LF');}
    else value+=c;
    need(value.length<=BIS_LIMITS.maxFieldChars,'BIS CSV campo excesivo');
    need(rows.length<=BIS_LIMITS.maxRows+3,'BIS CSV demasiadas filas');
  }
  need(!quoted,'BIS CSV comillas abiertas');
  if(value!==''||row.length){row.push(value);rows.push([...row])}
  need(rows.length>=2&&rows.length<=BIS_LIMITS.maxRows+1,'BIS CSV vacío/truncado');
  need(rows.every(x=>x.length<=BIS_LIMITS.maxColumns),'BIS CSV demasiadas columnas');
  return rows;
}
const num=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function safeAmount(raw){
  if(raw===''||raw==='.'||raw==='NaN'||raw==='null'||raw==='N/A')return null;
  need(typeof raw==='string'&&num.test(raw),'BIS nivel inválido');
  const value=Number(raw);
  need(Number.isFinite(value)&&value>=0&&value<=1e18,
    'BIS stock fuera de rango numérico');
  return value;
}
function dimName(series){return series.kind==='LBS'?LBSDIMS:CBSDIMS}
export function parseBisSdmxCSV(raw,{series,knownAt,sourceUrl}={}){
  approveSeries(series);
  need(sourceUrl===bisSdmxUrl(series),'BIS URL de serie no coincide');
  const known=date(knownAt),rows=csvRows(raw),
    header=rows.shift().map((x,i)=>i===0?x.replace(/^\uFEFF/,''):x);
  need(new Set(header).size===header.length,'BIS columnas duplicadas');
  const get=(r,name)=>r[header.indexOf(name)];
  const dims=dimName(series),needCols=[...dims,'TIME_PERIOD','OBS_VALUE','UNIT_MEASURE','UNIT_MULT',
    'OBS_STATUS','OBS_CONF'];
  need(needCols.every(x=>header.includes(x)),'BIS encabezado SDMX sin columnas esperadas');
  const expected=series.key.split('.');
  need(expected.length===dims.length,'BIS metadata clave de serie inconsistente');
  const optional=['DATAFLOW','SERIES_KEY','OBS_PRE_BREAK'];
  const rejected=[],observations=[],flags=[],seen=new Set();
  for(const [ix,row] of rows.entries()){
    need(row.length===header.length,'BIS fila CSV cortada (índice '+ix+')');
    need(dims.every((key,j)=>get(row,key)===expected[j]),
      'BIS serie SDMX ajena a la clave solicitada');
    if(header.includes('SERIES_KEY'))need(get(row,'SERIES_KEY')===series.key,
      'BIS SERIES_KEY no coincide con filtros');
    if(header.includes('DATAFLOW')){
      const ref=get(row,'DATAFLOW');
      need(ref.includes(series.dataset),'BIS DATAFLOW incompatible');
    }
    need(get(row,'FREQ')==='Q'&&get(row,'L_MEASURE')==='S',
      'BIS no se puede convertir una variación/flujo en stock');
    need(get(row,'UNIT_MEASURE')==='USD'&&get(row,'UNIT_MULT')==='6',
      'BIS se requiere unidad USD y multiplicador 10^6 verificados');
    const period=get(row,'TIME_PERIOD'),reference=quarterEnd(period);
    need(!seen.has(period),'BIS periodo trimestral duplicado');seen.add(period);
    need(reference<=known,'BIS periodo de referencia posterior a la captura');
    const status=get(row,'OBS_STATUS');
    const conf=get(row,'OBS_CONF');
    const amount=safeAmount(get(row,'OBS_VALUE'));
    // En BIS: OBS_STATUS=B es un valor POST-break publicable, pero no comparable
    // con el periodo anterior sin el pre-break. OBS_CONF=N/C no es público.
    if(amount===null||!['A','B','E'].includes(status)||conf!=='F'){
      rejected.push({period,reason:amount===null?'missing_or_suppressed':
        conf!=='F'?'restricted_or_unverified_confidentiality':
        'flag_outside_approved_public_states',status,confidentiality:conf});
      continue;
    }
    const item=observation({
      id:'bis-b001-'+series.id+'-'+period,
      domain:series.kind==='LBS'?'banca_bis_locacional':'banca_bis_consolidada',
      variable:'B001_'+series.id,
      value:amount,unit:'USD_million',
      observed_at:reference,known_at:known,source_url:sourceUrl
    });
    observations.push(item);
    const preBreakValue=header.includes('OBS_PRE_BREAK')?get(row,'OBS_PRE_BREAK'):null;
    // Un pre-break numérico puede servir a futuros análisis de revisiones,
    // pero jamás entra automáticamente como segunda posición monetaria.
    const preBreak=preBreakValue!==null&&preBreakValue!==''?
      safeAmount(preBreakValue):null;
    flags.push({period,status,confidentiality:conf,
      estimated:status==='E',structural_break:status==='B',
      pre_break_value_million_usd:status==='B'?preBreak:null,
      quarter_on_same_basis_as_previous:status!=='B'});
  }
  need(observations.length>0||rejected.length>0,'BIS sin periodos reconocibles');
  observations.sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
  return {schema:B001_SCHEMA,series_id:series.id,kind:series.kind,
    dataset:series.dataset,key:series.key,known_at:known,source_url:sourceUrl,
    body_sha256:checksum(raw),
    observations,rejected_periods:rejected,observation_flags:flags,
    raw_row_count:rows.length,accepted_rows:observations.length,
    latest_period:observations.length?observations.at(-1).observed_at.slice(0,10):null,
    consolidation:series.population,measure:'quarter_end_stock',
    currency_unit:'millions_of_USD_10_pow_6_verified',
    public_bis_series:true,reporting_area:series.reporting_country,
    counterparty_area:series.counterparty_country,
    quarterly_release_time_certified:false,
    no_inferred_flow_from_stock_difference:true,
    prediction_inputs_enabled:false,automatic_trading:false};
}
async function boundedText(url,{fetchImpl=fetch,timeoutMs=BIS_LIMITS.timeoutMs}={}){
  need(BIS_SERIES.some(x=>bisSdmxUrl(x)===url),'BIS consulta no preaprobada');
  const response=await fetchImpl(url,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{Accept:'text/csv','User-Agent':'LaPlaceDIG-B001/1.0'},
    signal:AbortSignal.timeout(timeoutMs)
  });
  need(response?.ok,'BIS HTTP '+(response?.status??'sin_respuesta'));
  const size=Number(response.headers?.get?.('content-length')??0);
  need(!size||size<=BIS_LIMITS.maxDownloadBytes,'BIS contenido excesivo anunciado');
  const reader=response.body?.getReader?.();
  if(!reader){
    const text=await response.text();
    need(Buffer.byteLength(text)<=BIS_LIMITS.maxDownloadBytes,
      'BIS cuerpo CSV excesivo');
    return text;
  }
  const chunks=[];let bytes=0;
  try{for(;;){
    const x=await reader.read();if(x.done)break;
    bytes+=x.value.byteLength;need(bytes<=BIS_LIMITS.maxDownloadBytes,'BIS respuesta excesiva');
    chunks.push(Buffer.from(x.value));
  }}catch(error){await reader.cancel().catch(()=>{});throw error}
  return Buffer.concat(chunks).toString('utf8');
}
export async function observeBisBanking({series=BIS_SERIES,
  fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=BIS_LIMITS.timeoutMs,archiveResponse
}={}){
  need(Array.isArray(series)&&series.length>=1&&series.length<=BIS_LIMITS.maxSeries&&
    new Set(series).size===series.length&&series.every(x=>BIS_SERIES.includes(x)),
    'BIS lista de series inválida o duplicada');
  const started=date(now());
  const settled=await Promise.allSettled(series.map(async item=>{
    const url=bisSdmxUrl(item),raw=await boundedText(url,{fetchImpl,timeoutMs}),
      parsed=parseBisSdmxCSV(raw,{series:item,sourceUrl:url,knownAt:date(now())});
    const archive=archiveResponse?await archiveResponse({dataset:item.dataset,
      source_url:url,raw_text:raw,received_at:parsed.known_at,
      body_sha256:parsed.body_sha256}):null;
    return {...parsed,archive_ref:archive??null};
  }));
  const observations=[],sources=[],catalog=[];
  settled.forEach((result,i)=>{
    const item=series[i],url=bisSdmxUrl(item);
    if(result.status!=='fulfilled'){
      sources.push({name:'BIS-'+item.id,status:'unavailable',url,
        received_at:date(now()),signals:0,missing_is_zero:false,
        reason:String(result.reason?.message??result.reason).slice(0,210)});
      return;
    }
    const parsed=result.value;
    observations.push(...parsed.observations);
    sources.push({name:'BIS-'+item.id,
      status:parsed.observations.length?'observed':'not_reported',
      url,received_at:parsed.known_at,signals:parsed.observations.length,
      dataflow:item.dataset,source_sha256:parsed.body_sha256,
      rejected_periods:parsed.rejected_periods,
      latest_period:parsed.latest_period,
      note:'BIS quarterly stock, cannot sum LBS and CBS',
      publication_time_precision:'first_seen',raw_response_archived:Boolean(parsed.archive_ref),
      archive_ref:parsed.archive_ref,missing_is_zero:false});
    catalog.push({series_id:parsed.series_id,dataset:item.dataset,key:item.key,
      kind:item.kind,unit:parsed.currency_unit,
      measure:item.measure,reference:item.reference,population:item.population,
      reporting_country:item.reporting_country,counterparty_country:item.counterparty_country,
      currency:item.currency,portal:item.portal,observation_flags:parsed.observation_flags});
  });
  const ids=new Set();
  for(const item of observations){
    need(!ids.has(item.id),'BIS estado repetido');ids.add(item.id);
  }
  need(observations.length<=BIS_LIMITS.maxSeries*BIS_LIMITS.maxHistoryQuarters,
    'BIS presupuesto de datos trimestrales excedido');
  const at=date(now());
  return {schema:B001_SCHEMA,group:'bis_international_banking',
    started_at:started,at,observations,sources,catalog,
    coverage:{series_requested:series.length,
      series_observed:sources.filter(x=>x.status==='observed').length,
      series_missing:sources.filter(x=>x.status!=='observed').length,
      states_observed:observations.length,world_banking_complete:false},
    rules:BIS_BANKING_RULES,
    sample_scope:'four published BIS series, not all countries or private positions',
    liquidity_global_index:false,cross_border_flow_calculated:false,
    historical_publication_times_verified:false,
    prediction_inputs_enabled:false,automatic_trading:false};
}
