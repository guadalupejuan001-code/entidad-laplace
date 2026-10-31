/* U003 — colectores adicionales de mundo real.
 * Cada colector entrega observaciones con tiempo observado y tiempo conocido.
 * Fuentes con licencia/credenciales se consideran opcionales y nunca se
 * presentan como observadas cuando faltan credenciales.
 */
import {chartUrl,parseChart} from '../bolsa/mercado.mjs';
import {numeric,dateOnly} from './fuentes-oficiales.mjs';
import {fetchGdacs} from './noticias-oficiales.mjs';
import {
  REGIONAL_MARKET_SYMBOLS,COMMODITY_FUTURES,POLICY_AREAS,BLS_SERIES,
  FRED_PUBLIC_SERIES,NEWS_TOPICS,PORTWATCH_FIELDS,NESO_FIELDS,OPEN_SKY_REGIONS,EXACT_VINTAGE_SERIES
} from './catalogo-u003.mjs';

const need=(c,m)=>{if(!c)throw Error(m)};
const iso=x=>new Date(x).toISOString();
const safe=s=>String(s).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'X';
const obs=(id,domain,variable,value,unit,observedAt,knownAt,sourceUrl)=>({
  id,domain,variable,value,unit,observed_at:iso(observedAt),known_at:iso(knownAt),source_url:sourceUrl
});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function requestText(url,{fetchImpl=fetch,timeoutMs=15000,headers={},method='GET',body,retries=2}={}){
  let last;
  for(let attempt=0;attempt<=retries;attempt++){
    let r;
    try{
      r=await fetchImpl(url,{method,body,signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
        headers:{'User-Agent':'LaPlaceDIG-U003/1.0',...headers}});
    }catch(error){
      last=error;if(attempt===retries)throw error;await sleep(450*(2**attempt));continue;
    }
    if(r.ok){
      const text=await r.text();need(text.length<=8_000_000,'respuesta demasiado grande '+new URL(url).hostname);return text;
    }
    const retryable=r.status===429||r.status===502||r.status===503||r.status===504;
    last=Error('HTTP '+r.status+' '+new URL(url).hostname);
    if(!retryable||attempt===retries)throw last;
    const retryAfter=Number(r.headers?.get?.('retry-after'));
    const delay=Number.isFinite(retryAfter)&&retryAfter>=0?Math.min(8000,retryAfter*1000):450*(2**attempt);
    await sleep(delay);
  }
  throw last??Error('consulta fallida');
}
async function requestJson(url,options={}){
  return JSON.parse(await requestText(url,{...options,headers:{Accept:'application/json',...(options.headers??{})}}));
}
async function pool(items,limit,fn){
  const out=Array(items.length),cursor={i:0};
  async function worker(){for(;;){const i=cursor.i++;if(i>=items.length)return;try{out[i]={ok:true,value:await fn(items[i],i)}}catch(error){out[i]={ok:false,error}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
}
function marketSignals(parsed,capturedAt,url,domain){
  const cap=Date.parse(capturedAt)/1000,bars=parsed.bars.filter(b=>(b[0]+300)<=cap);
  need(bars.length>=7,'mercado sin 30 minutos cerrados '+parsed.symbol);
  const i=bars.length-1,last=bars[i],r5=Math.log(last[4]/bars[i-1][4]),r30=Math.log(last[4]/bars[i-6][4]);
  const meanVol=bars.slice(i-5,i+1).reduce((s,b)=>s+b[5],0)/6,rel=meanVol?last[5]/meanVol:1;
  const at=iso((last[0]+300)*1000),known=iso(capturedAt),key=safe(parsed.symbol),unit=safe(parsed.currency??'native');
  return [
    obs(domain+'-'+key+'-close-'+at,domain,key+'_close',last[4],unit,at,known,url),
    obs(domain+'-'+key+'-r5-'+at,domain,key+'_return_5m',r5,'ratio',at,known,url),
    obs(domain+'-'+key+'-r30-'+at,domain,key+'_return_30m',r30,'ratio',at,known,url),
    obs(domain+'-'+key+'-vol-'+at,domain,key+'_relative_volume_30m',rel,'ratio',at,known,url)
  ];
}
async function fetchMarketSet(symbols,domain,{fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  const settled=await pool(symbols,4,async symbol=>{
    const url=chartUrl(symbol,{range:'5d',interval:'5m'}),raw=await requestJson(url,{fetchImpl,timeoutMs});
    return {symbol,url,parsed:parseChart(raw,symbol)};
  });
  const captured=iso(now()),observations=[],sources=[];
  settled.forEach((r,i)=>{
    const name=symbols[i];
    if(!r.ok){sources.push({name,status:'unavailable',reason:String(r.error.message).slice(0,180)});return;}
    try{const rows=marketSignals(r.value.parsed,captured,r.value.url,domain);observations.push(...rows);sources.push({name,status:'observed',signals:rows.length,url:r.value.url});}
    catch(error){sources.push({name,status:'unavailable',reason:String(error.message).slice(0,180),url:r.value.url});}
  });
  return {captured_at:captured,observations,sources};
}
export const fetchRegionalMarkets=(options={})=>fetchMarketSet(REGIONAL_MARKET_SYMBOLS,'bolsas_regionales',options);
export async function fetchCommodityFutures(options={}){
  const result=await fetchMarketSet(COMMODITY_FUTURES,'futuros_commodities',options);
  result.sources=result.sources.map(x=>({...x,instrument_kind:'continuous_front_month',
    direct_exchange:false,contract_expiry:null,roll_adjustment_known:false}));
  return result;
}

function parseCsv(text){
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<=text.length;i++){
    const ch=text[i]??'\n';
    if(quote){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}
      else if(ch==='"')quote=false;
      else cell+=ch;
    }else if(ch==='"')quote=true;
    else if(ch===','){row.push(cell);cell=''}
    else if(ch==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}
    else cell+=ch;
  }
  return rows;
}
export function parseBisPolicyCsv(text,{capturedAt,url,areas=POLICY_AREAS}={}){
  const rows=parseCsv(text);need(rows.length>=2,'BIS CSV vacío');
  const head=rows[0].map(x=>x.trim().toUpperCase()),idx=n=>head.indexOf(n);
  const fi=idx('FREQ'),ai=idx('REF_AREA'),ti=idx('TIME_PERIOD'),vi=idx('OBS_VALUE');
  need([fi,ai,ti,vi].every(x=>x>=0),'BIS CSV sin columnas esperadas');
  const latest=new Map();
  for(const r of rows.slice(1)){
    const area=r[ai],freq=r[fi],period=r[ti],value=numeric(r[vi]);
    if(freq!=='M'||!areas.includes(area)||!Number.isFinite(value)||!/^\d{4}-\d{2}$/.test(period))continue;
    if(period+'-01'>iso(capturedAt).slice(0,10))continue;
    const old=latest.get(area);if(!old||period>old.period)latest.set(area,{period,value});
  }
  const known=iso(capturedAt),out=[];
  for(const area of areas){
    const x=latest.get(area);if(!x)continue;
    const observed=iso(x.period+'-01T00:00:00Z');
    out.push(obs('bis-policy-'+area+'-'+x.period,'tasas_bancos_centrales',area+'_policy_rate',x.value,'pct',observed,known,url));
  }
  return out;
}
export async function fetchPolicyRates({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,areas=POLICY_AREAS}={}){
  const captured=iso(now()),key='M.'+areas.join('+');
  const url='https://stats.bis.org/api/v1/data/WS_CBPOL/'+key+'/all?startPeriod=2025-01&format=csvfile';
  try{
    const text=await requestText(url,{fetchImpl,timeoutMs,headers:{Accept:'application/vnd.sdmx.data+csv;version=1.0.0'}});
    const observations=parseBisPolicyCsv(text,{capturedAt:now(),url,areas});
    need(observations.length>=Math.min(8,areas.length),'BIS devolvió cobertura de tasas insuficiente');
    return {captured_at:captured,observations,sources:[{name:'BIS-WS_CBPOL',status:'observed',signals:observations.length,url}]};
  }catch(error){return {captured_at:captured,observations:[],sources:[{name:'BIS-WS_CBPOL',status:'unavailable',reason:String(error.message).slice(0,180),url}]};}
}

export function parseBls(raw,{capturedAt,url}={}){
  need(raw?.status==='REQUEST_SUCCEEDED'&&Array.isArray(raw?.Results?.series),'BLS respuesta inválida');
  const known=iso(capturedAt),out=[];
  for(const s of raw.Results.series){
    const def=BLS_SERIES[s.seriesID];if(!def||!Array.isArray(s.data))continue;
    const rows=s.data.filter(x=>Number.isFinite(numeric(x.value))&&/^\d{4}$/.test(x.year)&&/^M(?:0[1-9]|1[0-2])$/.test(x.period)&&
      x.year+'-'+x.period.slice(1)+'-01'<=known.slice(0,10));
    rows.sort((a,b)=>(b.year+b.period).localeCompare(a.year+a.period));const x=rows[0];if(!x)continue;
    const month=Number(x.period.slice(1));if(month<1||month>12)continue;
    const observed=iso(Date.UTC(Number(x.year),month-1,1));
    out.push(obs('bls-'+s.seriesID+'-'+x.year+'-'+x.period,'empleo_macro',def.name,Number(String(x.value).replace(/,/g,'')),def.unit,observed,known,url));
  }
  return out;
}
export async function fetchBlsEmployment({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  const captured=iso(now()),url='https://api.bls.gov/publicAPI/v2/timeseries/data/';
  try{
    const year=new Date(captured).getUTCFullYear(),body=JSON.stringify({seriesid:Object.keys(BLS_SERIES),startyear:String(year-1),endyear:String(year)});
    const raw=await requestJson(url,{fetchImpl,timeoutMs,method:'POST',body,headers:{'Content-Type':'application/json'}});
    const observations=parseBls(raw,{capturedAt:now(),url});
    need(observations.length>=2,'BLS sin suficientes series');
    return {captured_at:captured,observations,sources:[{name:'BLS-public-api',status:'observed',signals:observations.length,url}]};
  }catch(error){return {captured_at:captured,observations:[],sources:[{name:'BLS-public-api',status:'unavailable',reason:String(error.message).slice(0,180),url}]};}
}
export function parseFredCsv(text,{series,capturedAt,url}={}){
  const def=FRED_PUBLIC_SERIES[series];need(def,'serie FRED no registrada');
  const rows=parseCsv(text);need(rows.length>=2,'FRED CSV vacío');
  let latest=null;
  for(const r of rows.slice(1)){
    const date=r[0],value=numeric(r[1]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value)||date>iso(capturedAt).slice(0,10))continue;
    try{dateOnly(date)}catch{continue}
    if(!latest||date>latest.date)latest={date,value};
  }
  need(latest,'FRED sin observación numérica');
  return obs('fred-'+series+'-'+latest.date,series==='DFF'?'tasas_mercado':'empleo_alta_frecuencia',def.name,latest.value,def.unit,
    latest.date+'T00:00:00.000Z',capturedAt,url);
}
export function parseFredInitialRelease(raw,{series,capturedAt,url}={}){
  return parseFredInitialReleaseVersion(raw,{series,capturedAt,url}).observation;
}
export function parseFredInitialReleaseVersion(raw,{series,capturedAt,url}={}){
  const def=EXACT_VINTAGE_SERIES[series];need(def,'serie vintage no registrada');
  need(Array.isArray(raw?.observations),'FRED vintage sin observaciones');
  const captureDay=iso(capturedAt).slice(0,10),rows=raw.observations.filter(x=>
    /^\d{4}-\d{2}-\d{2}$/.test(String(x.date??''))&&
    /^\d{4}-\d{2}-\d{2}$/.test(String(x.realtime_start??''))&&
    x.realtime_start<=captureDay&&x.date<=x.realtime_start&&Number.isFinite(numeric(x.value))
  );
  rows.sort((a,b)=>String(b.realtime_start).localeCompare(String(a.realtime_start))||String(b.date).localeCompare(String(a.date)));
  const x=rows[0];need(x,'FRED vintage sin release inicial anterior al corte');
  dateOnly(x.date);dateOnly(x.realtime_start);
  // ALFRED informa el DÍA del vintage, no la hora. No retrofechar a las 00:00.
  const clean=new URL(url);clean.searchParams.delete('api_key');
  const item=obs('alfred-'+series+'-'+x.date+'-'+x.realtime_start,'macro_vintage_dates',def.name,
    numeric(x.value),def.unit,x.date+'T00:00:00.000Z',capturedAt,clean.toString());
  return {observation:item,vintage:{series,reference_date:x.date,vintage_date:x.realtime_start,
    vintage_end:x.realtime_end??null,initial_release:true,value:item.value,
    publication_precision:'day',publication_at:null,received_at:iso(capturedAt),
    historical_intraday_eligible:false,source_url:clean.toString()}};
}
export async function fetchExactMacroVintages({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,apiKey=process.env.FRED_API_KEY}={}){
  const captured=iso(now()),base='https://api.stlouisfed.org/fred/series/observations';
  if(!apiKey)return {captured_at:captured,observations:[],sources:[{name:'FRED-ALFRED-vintages',status:'requires_credentials',signals:0,url:base,reason:'FRED_API_KEY requerido para output_type=4 / initial release'}]};
  const series=Object.keys(EXACT_VINTAGE_SERIES),settled=await pool(series,2,async id=>{
    const u=new URL(base);u.searchParams.set('series_id',id);u.searchParams.set('api_key',apiKey);u.searchParams.set('file_type','json');
    u.searchParams.set('output_type','4');u.searchParams.set('sort_order','desc');u.searchParams.set('limit','120');
    u.searchParams.set('realtime_start','1776-07-04');u.searchParams.set('realtime_end',captured.slice(0,10));
    const requestUrl=u.toString();u.searchParams.delete('api_key');const url=u.toString();
    const raw=await requestJson(requestUrl,{fetchImpl,timeoutMs});
    return {id,url,version:parseFredInitialReleaseVersion(raw,{series:id,capturedAt:now(),url})};
  });
  const observations=[],sources=[],vintages=[];
  settled.forEach((r,i)=>{const id=series[i];if(r.ok){observations.push(r.value.version.observation);vintages.push(r.value.version.vintage);
    sources.push({name:'ALFRED-'+id,status:'observed',signals:1,url:r.value.url,
      vintage_date_verified:true,exact_publication_time:false,historical_intraday_eligible:false})}
    else sources.push({name:'ALFRED-'+id,status:'unavailable',signals:0,reason:String(r.error.message).slice(0,180),exact_publication_time:false});});
  return {captured_at:iso(now()),observations,sources,vintages};
}

export async function fetchHighFrequencyLabour({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  const captured=iso(now()),observations=[],sources=[];
  const settled=await pool(Object.keys(FRED_PUBLIC_SERIES),2,async series=>{
    const url='https://fred.stlouisfed.org/graph/fredgraph.csv?id='+encodeURIComponent(series);
    const text=await requestText(url,{fetchImpl,timeoutMs,headers:{Accept:'text/csv'}});
    return {series,url,row:parseFredCsv(text,{series,capturedAt:now(),url})};
  });
  settled.forEach((r,i)=>{const name=Object.keys(FRED_PUBLIC_SERIES)[i];if(r.ok){observations.push(r.value.row);sources.push({name:'FRED-'+name,status:'observed',signals:1,url:r.value.url})}else sources.push({name:'FRED-'+name,status:'unavailable',reason:String(r.error.message).slice(0,180)})});
  return {captured_at:captured,observations,sources};
}

export const NESO_URL='https://api.neso.energy/api/3/action/datastore_search_sql';
function londonMidnight(day){
  const midnight=Date.parse(dateOnly(day));
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(midnight));
  return midnight-hour*3600000;
}
export function parseNeso(raw,{capturedAt,url}={}){
  need(raw?.success===true&&Array.isArray(raw?.result?.records)&&raw.result.records.length,'NESO respuesta inválida');
  const r=raw.result.records[0],date=String(r.SETTLEMENT_DATE??''),period=Number(r.SETTLEMENT_PERIOD);
  need(/^\d{4}-\d{2}-\d{2}/.test(date)&&Number.isInteger(period)&&period>=1&&period<=50,'NESO fecha/periodo inválido');
  need(r.FORECAST_ACTUAL_INDICATOR==='A','NESO no es observación actual');
  const start=londonMidnight(date.slice(0,10)),nextDay=iso(Date.parse(dateOnly(date.slice(0,10)))+86400000).slice(0,10);
  const periods=(londonMidnight(nextDay)-start)/1800000;
  need(period<=periods,'NESO periodo inexistente en día con cambio de horario');
  const observed=iso(start+(period-1)*1800000),known=iso(capturedAt),out=[];
  need(observed<=known,'NESO observación futura');
  for(const [field,name,unit] of NESO_FIELDS){const value=numeric(r[field]);if(Number.isFinite(value))out.push(obs('neso-'+field+'-'+observed,'energia_electrica',name,value,unit,observed,known,url));}
  return out;
}
export async function fetchElectricity({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  const captured=iso(now()),resource='177f6fa4-ae49-4182-81ea-0c6b35f26ca6';
  const sql="SELECT * FROM \""+resource+"\" WHERE \"FORECAST_ACTUAL_INDICATOR\" = 'A' ORDER BY \"SETTLEMENT_DATE\" DESC, \"SETTLEMENT_PERIOD\" DESC LIMIT 1";
  const url=NESO_URL+'?sql='+encodeURIComponent(sql);
  try{
    const raw=await requestJson(url,{fetchImpl,timeoutMs}),observations=parseNeso(raw,{capturedAt:now(),url});
    need(observations.length>=4,'NESO devolvió pocas señales');
    return {captured_at:captured,observations,sources:[{name:'NESO-demand-update',status:'observed',signals:observations.length,url}]};
  }catch(error){return {captured_at:captured,observations:[],sources:[{name:'NESO-demand-update',status:'unavailable',reason:String(error.message).slice(0,180),url}]};}
}

export const PORTWATCH_URL='https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query';
export function parsePortWatch(raw,{capturedAt,url}={}){
  need(Array.isArray(raw?.features)&&raw.features.length>=1,'PortWatch respuesta inválida');
  const a=raw.features[0].attributes??{},known=iso(capturedAt),rawDate=a.date;
  let time=Number(rawDate);if(!Number.isFinite(time)||time<=0){const d=String(rawDate??'').slice(0,10);time=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(d)?d+'T00:00:00Z':String(rawDate??''));}
  need(Number.isFinite(time),'PortWatch sin fecha');
  const observed=iso(time),out=[];
  need(observed<=known,'PortWatch observación futura');
  for(const [field,name,unit] of PORTWATCH_FIELDS){const value=numeric(a[field+'_sum']??a[field]);if(Number.isFinite(value))out.push(obs('portwatch-'+field+'-'+observed,'transporte_maritimo',name,value,unit,observed,known,url));}
  return out;
}
export async function fetchMaritime({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000}={}){
  const captured=iso(now()),stats=PORTWATCH_FIELDS.map(([field])=>({statisticType:'sum',onStatisticField:field,outStatisticFieldName:field+'_sum'}));
  const u=new URL(PORTWATCH_URL);u.searchParams.set('where','1=1');u.searchParams.set('outStatistics',JSON.stringify(stats));
  u.searchParams.set('groupByFieldsForStatistics','date');u.searchParams.set('orderByFields','date DESC');u.searchParams.set('resultRecordCount','1');u.searchParams.set('returnGeometry','false');u.searchParams.set('f','json');
  const url=u.toString();
  try{
    const raw=await requestJson(url,{fetchImpl,timeoutMs}),observations=parsePortWatch(raw,{capturedAt:now(),url});
    need(observations.length>=3,'PortWatch devolvió pocas señales');
    return {captured_at:captured,observations,sources:[{name:'IMF-PortWatch',status:'observed',signals:observations.length,url}]};
  }catch(error){return {captured_at:captured,observations:[],sources:[{name:'IMF-PortWatch',status:'unavailable',reason:String(error.message).slice(0,180),url}]};}
}

export function parseGdeltGeo(raw,{topic,capturedAt,url}={}){
  need(raw?.type==='FeatureCollection'&&Array.isArray(raw.features),'GDELT GeoJSON inválido');
  const points=raw.features.filter(f=>!f?.geometry?.type||f.geometry.type==='Point').map(f=>f?.geometry?.coordinates)
    .filter(c=>Array.isArray(c)&&Number.isFinite(numeric(c[0]))&&Number.isFinite(numeric(c[1]))&&Math.abs(numeric(c[0]))<=180&&Math.abs(numeric(c[1]))<=90)
    .map(c=>({lon:numeric(c[0]),lat:numeric(c[1])}));
  const known=iso(capturedAt),base='gdelt_'+String(topic).toLowerCase().replace(/[^a-z0-9]+/g,'_'),n=points.length;
  need(!raw.features.length||n>0,'GDELT devolvió elementos sin coordenadas válidas');
  const rows=[obs('gdelt-'+topic+'-count-'+known,'noticias_geolocalizadas',base+'_locations',n,'count',known,known,url)];
  if(n)rows.push(
    obs('gdelt-'+topic+'-north-'+known,'noticias_geolocalizadas',base+'_north_share',points.filter(p=>p.lat>=0).length/n,'ratio',known,known,url),
    obs('gdelt-'+topic+'-east-'+known,'noticias_geolocalizadas',base+'_east_share',points.filter(p=>p.lon>=0).length/n,'ratio',known,known,url));
  return rows;
}
export async function fetchGeoNews({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,topics=NEWS_TOPICS}={}){
  const official=fetchGdacs({fetchImpl,now,timeoutMs});
  const settled=await pool(topics,2,async topic=>{
    const v2=new URL('https://api.gdeltproject.org/api/v2/geo/geo');v2.searchParams.set('query',topic.query);v2.searchParams.set('mode','pointdata');v2.searchParams.set('format','geojson');v2.searchParams.set('timespan','1h');v2.searchParams.set('maxpoints','250');v2.searchParams.set('geores','1');
    try{
      const url=v2.toString(),raw=await requestJson(url,{fetchImpl,timeoutMs,retries:0}),rows=parseGdeltGeo(raw,{topic:topic.id,capturedAt:now(),url});
      return {topic,url,rows,api:'GEO2'};
    }catch(primary){
      const v1=new URL('https://api.gdeltproject.org/api/v1/gkg_geojson');v1.searchParams.set('QUERY',topic.gkg);v1.searchParams.set('TIMESPAN','60');v1.searchParams.set('OUTPUTTYPE','2');
      const url=v1.toString(),raw=await requestJson(url,{fetchImpl,timeoutMs,retries:0}),rows=parseGdeltGeo(raw,{topic:topic.id,capturedAt:now(),url});
      return {topic,url,rows,api:'GKG_GEOJSON1',fallback_reason:String(primary.message).slice(0,100)};
    }
  });
  const observations=[],sources=[];
  settled.forEach((r,i)=>{const name=topics[i].id;if(r.ok){observations.push(...r.value.rows);sources.push({name:'GDELT-'+name,status:'observed',signals:r.value.rows.length,url:r.value.url,api:r.value.api})}else sources.push({name:'GDELT-'+name,status:'unavailable',reason:String(r.error.message).slice(0,180)})});
  const gdacs=await official;
  observations.push(...gdacs.observations);sources.push(...gdacs.sources);
  return {captured_at:iso(now()),observations,sources,geolocated_alerts:gdacs.alerts,
    coverage:{gdelt_topics_observed:settled.filter(x=>x.ok).map(x=>x.value.topic.id),
      gdelt_topics_unavailable:settled.flatMap((x,i)=>x.ok?[]:[topics[i].id]),
      gdacs_disaster_alerts:gdacs.alerts.length,
      all_requested_topics_available:settled.every(x=>x.ok)}};
}

export function parseOpenSky(raw,{capturedAt,url}={}){
  need(Number.isFinite(Number(raw?.time))&&Array.isArray(raw?.states),'OpenSky respuesta inválida');
  const known=iso(capturedAt),states=raw.states,valid=states.map(x=>({lon:numeric(x?.[5]),lat:numeric(x?.[6]),ground:x?.[8],velocity:numeric(x?.[9])}))
    .filter(x=>Number.isFinite(x.lon)&&Number.isFinite(x.lat)&&Math.abs(x.lon)<=180&&Math.abs(x.lat)<=90&&typeof x.ground==='boolean');
  const observed=iso(Number(raw.time)*1000),out=[
    obs('opensky-count-'+observed,'transporte_aereo','global_aircraft_visible',valid.length,'count',observed,known,url),
    obs('opensky-airborne-'+observed,'transporte_aereo','global_aircraft_airborne',valid.filter(x=>!x.ground).length,'count',observed,known,url)
  ];
  for(const [name,lat0,lat1,lon0,lon1] of OPEN_SKY_REGIONS){
    const count=valid.filter(x=>x.lat>=lat0&&x.lat<lat1&&x.lon>=lon0&&x.lon<lon1).length;
    out.push(obs('opensky-'+name+'-'+observed,'transporte_aereo',name+'_aircraft_visible',count,'count',observed,known,url));
  }
  const speeds=valid.filter(x=>Number.isFinite(x.velocity)&&!x.ground).map(x=>x.velocity);
  if(speeds.length)out.push(obs('opensky-speed-'+observed,'transporte_aereo','global_airborne_mean_velocity',speeds.reduce((a,b)=>a+b,0)/speeds.length,'m_s',observed,known,url));
  return out;
}
async function openSkyToken(clientId,clientSecret,{fetchImpl,timeoutMs}){
  const url='https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret}).toString();
  const raw=await requestJson(url,{fetchImpl,timeoutMs,method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  need(typeof raw.access_token==='string'&&raw.access_token.length>20,'OpenSky token inválido');return raw.access_token;
}
export async function fetchAirTraffic({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,clientId=process.env.OPENSKY_CLIENT_ID,clientSecret=process.env.OPENSKY_CLIENT_SECRET}={}){
  const captured=iso(now()),url='https://opensky-network.org/api/states/all';
  if(!clientId||!clientSecret)return {captured_at:captured,observations:[],sources:[{name:'OpenSky',status:'requires_credentials',signals:0,url,reason:'OAuth2 requerido; no se consulta sin autorización'}]};
  try{
    const token=await openSkyToken(clientId,clientSecret,{fetchImpl,timeoutMs}),raw=await requestJson(url,{fetchImpl,timeoutMs,headers:{Authorization:'Bearer '+token}});
    const observations=parseOpenSky(raw,{capturedAt:now(),url});
    return {captured_at:captured,observations,sources:[{name:'OpenSky',status:'observed',signals:observations.length,url,usage:'research_or_licensed'}]};
  }catch(error){return {captured_at:captured,observations:[],sources:[{name:'OpenSky',status:'unavailable',signals:0,url,reason:String(error.message).slice(0,180)}]};}
}

export function parseJQuantsTopix(raw,{capturedAt,url}={}){
  const data=Array.isArray(raw?.data)?raw.data:Array.isArray(raw?.topix)?raw.topix:[];need(data.length,'J-Quants TOPIX vacío');
  const rows=data.filter(x=>numeric(x.C??x.Close)>0&&/^\d{4}-?\d{2}-?\d{2}$/.test(String(x.Date??x.date??'')));
  rows.sort((a,b)=>String(b.Date??b.date).localeCompare(String(a.Date??a.date)));const x=rows[0];
  need(x,'J-Quants TOPIX sin observación');const d=String(x.Date??x.date).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),value=Number(x.C??x.Close);
  return [obs('jpx-topix-'+d,'bolsas_directas','JPX_TOPIX_close',value,'index',d+'T00:00:00.000Z',capturedAt,url)];
}
export async function fetchDirectExchanges({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000,jquantsApiKey=process.env.JQUANTS_API_KEY}={}){
  const captured=iso(now()),observations=[],sources=[];
  const jpxUrl='https://api.jquants.com/v2/indices/bars/daily/topix';
  if(jquantsApiKey){
    try{const raw=await requestJson(jpxUrl,{fetchImpl,timeoutMs,headers:{'x-api-key':jquantsApiKey}}),rows=parseJQuantsTopix(raw,{capturedAt:now(),url:jpxUrl});observations.push(...rows);sources.push({name:'JPX-JQuants',status:'observed',signals:rows.length,url:jpxUrl,direct_exchange:true})}
    catch(error){sources.push({name:'JPX-JQuants',status:'unavailable',signals:0,url:jpxUrl,reason:String(error.message).slice(0,180),direct_exchange:true})}
  }else sources.push({name:'JPX-JQuants',status:'requires_credentials',signals:0,url:jpxUrl,reason:'x-api-key requerido por JPX',direct_exchange:true});
  // B3/Deutsche Börse direct APIs are licensed/contracted products. Keep them
  // explicit instead of silently replacing them with third-party quotes.
  sources.push({name:'B3-direct',status:'requires_license',signals:0,url:'https://developers.b3.com.br/',direct_exchange:true});
  sources.push({name:'Deutsche-Boerse-direct',status:'requires_license',signals:0,url:'https://www.deutsche-boerse.com/dbg-en/markets-services/ps-technology/ps-api-platform',direct_exchange:true});
  return {captured_at:captured,observations,sources};
}
