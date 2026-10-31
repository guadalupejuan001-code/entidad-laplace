/* U002 — colectores públicos globales.
 * Convierte cada fuente a observaciones numéricas fechadas. No mezcla estas
 * señales con el predictor financiero sin validación fuera de muestra.
 */
import {chartUrl,parseChart} from '../bolsa/mercado.mjs';
import {fetchKp} from './geomagnetismo.mjs';
import {numeric} from './fuentes-oficiales.mjs';
import {MARKET_SYMBOLS,CRYPTO_PRODUCTS,MACRO_ECONOMIES,MACRO_INDICATORS,WEATHER_GRID,WEATHER_VARIABLES} from './catalogo-global.mjs';

const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const iso=x=>new Date(x).toISOString();
const safe=s=>String(s).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'X';
const observation=(id,domain,variable,value,unit,observedAt,knownAt,sourceUrl)=>({
  id,domain,variable,value,unit,observed_at:observedAt,known_at:knownAt,source_url:sourceUrl
});
async function json(url,{fetchImpl=fetch,timeoutMs=12000,maxBytes=2_000_000,headers={}}={}){
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-U002/1.0',...headers}});
  need(r.ok,'HTTP '+r.status+' '+new URL(url).hostname);
  const body=await r.text();need(body.length<=maxBytes,'respuesta excesiva '+new URL(url).hostname);
  return JSON.parse(body);
}
async function poolMap(items,limit,fn){
  const out=Array(items.length),cursor={i:0};
  async function worker(){for(;;){const i=cursor.i++;if(i>=items.length)return;try{out[i]={status:'fulfilled',value:await fn(items[i],i)}}catch(reason){out[i]={status:'rejected',reason}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
}
function closedBars(parsed,capturedAt){
  const cap=Date.parse(capturedAt)/1000;
  return parsed.bars.filter(b=>(b[0]+300)<=cap);
}
function marketRows(parsed,capturedAt,url){
  const b=closedBars(parsed,capturedAt);need(b.length>=7,'mercado sin suficientes velas cerradas '+parsed.symbol);
  const i=b.length-1,last=b[i],r5=Math.log(last[4]/b[i-1][4]),r30=Math.log(last[4]/b[i-6][4]);
  const vol=b.slice(i-5,i+1).reduce((s,x)=>s+x[5],0)/6,rel=vol>0?last[5]/vol:1;
  const at=iso((last[0]+300)*1000),known=iso(capturedAt),key=safe(parsed.symbol),unit=safe(parsed.currency??'native');
  return [
    observation('mkt-'+key+'-close-'+at,'mercado_global',key+'_close',last[4],unit,at,known,url),
    observation('mkt-'+key+'-r5-'+at,'mercado_global',key+'_return_5m',r5,'ratio',at,known,url),
    observation('mkt-'+key+'-r30-'+at,'mercado_global',key+'_return_30m',r30,'ratio',at,known,url),
    observation('mkt-'+key+'-vol-'+at,'mercado_global',key+'_relative_volume_30m',rel,'ratio',at,known,url)
  ];
}
export async function fetchGlobalMarkets({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000,symbols=MARKET_SYMBOLS}={}){
  const settled=await poolMap(symbols,4,async symbol=>{
    const url=chartUrl(symbol,{range:'5d',interval:'5m'}),raw=await json(url,{fetchImpl,timeoutMs});
    return {symbol,url,parsed:parseChart(raw,symbol)};
  });
  const captured=iso(now()),observations=[],sources=[];
  settled.forEach((r,i)=>{
    const symbol=symbols[i];
    if(r.status==='fulfilled'){
      try{const rows=marketRows(r.value.parsed,captured,r.value.url);observations.push(...rows);sources.push({name:symbol,status:'observed',signals:rows.length,url:r.value.url});}
      catch(e){sources.push({name:symbol,status:'unavailable',reason:String(e.message).slice(0,180)});}
    }else sources.push({name:symbol,status:'unavailable',reason:String(r.reason?.message??r.reason).slice(0,180)});
  });
  return {group:'markets',captured_at:captured,observations,sources};
}

const CB='https://api.exchange.coinbase.com/products/';
export async function fetchGlobalCrypto({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=10000,products=CRYPTO_PRODUCTS}={}){
  const settled=await poolMap(products,2,async product=>{
    const url=CB+encodeURIComponent(product)+'/ticker',raw=await json(url,{fetchImpl,timeoutMs,maxBytes:200000});
    const price=numeric(raw?.price),t=Date.parse(raw?.time);need(Number.isFinite(price)&&price>0&&Number.isFinite(t),'ticker cripto inválido '+product);
    need(t<=Date.parse(now()),'ticker cripto futuro');
    return {product,url,price,observed_at:iso(t)};
  });
  const captured=iso(now()),observations=[],sources=[];
  settled.forEach((r,i)=>{
    const product=products[i],key=safe(product);
    if(r.status==='fulfilled'){
      const x=r.value,o=observation('crypto-'+key+'-'+x.observed_at,'cripto_global',key+'_spot',x.price,product.endsWith('-USD')?'USD':'native',x.observed_at,captured,x.url);
      observations.push(o);sources.push({name:product,status:'observed',signals:1,url:x.url});
    }else sources.push({name:product,status:'unavailable',reason:String(r.reason?.message??r.reason).slice(0,180)});
  });
  return {group:'crypto',captured_at:captured,observations,sources};
}

function wbUrl(indicator,economies=MACRO_ECONOMIES){
  const countries=economies.join(';');
  return 'https://api.worldbank.org/v2/country/'+countries+'/indicator/'+encodeURIComponent(indicator)+'?format=json&per_page=200&date=2020:2026';
}
export function parseWorldBank(raw,{indicator,capturedAt,url,economies=MACRO_ECONOMIES}={}){
  need(Array.isArray(raw)&&Array.isArray(raw[1]),'respuesta World Bank inválida');
  const def=MACRO_INDICATORS[indicator];need(def,'indicador World Bank no registrado');
  const by=new Map();
  for(const row of raw[1]){
    const code=String(row?.countryiso3code??'').toUpperCase(),year=Number(row?.date),value=numeric(row?.value);
    if(!economies.includes(code)||!Number.isInteger(year)||year<1900||year>Number(iso(capturedAt).slice(0,4))||!Number.isFinite(value))continue;
    const old=by.get(code);if(!old||year>old.year)by.set(code,{year,value});
  }
  const known=iso(capturedAt),observations=[];
  for(const code of economies){
    const r=by.get(code);if(!r)continue;
    const observed=iso(Date.UTC(r.year,0,1,0,0,0));
    observations.push(observation('macro-'+code+'-'+def.name+'-'+r.year,'macro_global',code+'_'+def.name,r.value,def.unit,observed,known,url));
  }
  return observations;
}
export async function fetchGlobalMacro({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000,indicators=MACRO_INDICATORS}={}){
  const captured=iso(now()),codes=Object.keys(indicators),settled=await poolMap(codes,2,async indicator=>{
    const url=wbUrl(indicator),raw=await json(url,{fetchImpl,timeoutMs,maxBytes:1_500_000});
    return {indicator,url,observations:parseWorldBank(raw,{indicator,capturedAt:now(),url})};
  });
  const observations=[],sources=[];
  settled.forEach((r,i)=>{
    const indicator=codes[i];
    if(r.status==='fulfilled'){observations.push(...r.value.observations);sources.push({name:indicator,status:'observed',signals:r.value.observations.length,url:r.value.url});}
    else sources.push({name:indicator,status:'unavailable',reason:String(r.reason?.message??r.reason).slice(0,180)});
  });
  return {group:'macro',captured_at:captured,observations,sources};
}

export function weatherUrl(grid=WEATHER_GRID){
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',grid.map(x=>x.lat).join(','));
  u.searchParams.set('longitude',grid.map(x=>x.lon).join(','));
  u.searchParams.set('current',WEATHER_VARIABLES.map(x=>x.api).join(','));
  u.searchParams.set('timezone','UTC');u.searchParams.set('forecast_days','1');
  return u.toString();
}
function weatherTime(raw,capturedAt){
  const t=raw?.current?.time;need(typeof t==='string','clima sin timestamp');
  const parsed=Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(t)?t:t+'Z');
  need(Number.isFinite(parsed)&&parsed<=Date.parse(capturedAt),'timestamp climático inválido o futuro');
  return iso(parsed);
}
export function parseWeather(raw,{capturedAt,url,grid=WEATHER_GRID}={}){
  const rows=Array.isArray(raw)?raw:[raw];need(rows.length===grid.length,'malla meteorológica incompleta');
  const known=iso(capturedAt),observations=[];
  rows.forEach((row,i)=>{
    const at=weatherTime(row,known),node=grid[i];
    for(const v of WEATHER_VARIABLES){
      const value=numeric(row?.current?.[v.api]);if(!Number.isFinite(value))continue;
      observations.push(observation('weather-'+node.id+'-'+v.name+'-'+at,'clima_global',node.id+'_'+v.name,value,v.unit,at,known,url));
    }
  });
  return observations;
}
export async function fetchGlobalWeather({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,grid=WEATHER_GRID}={}){
  const captured=iso(now()),url=weatherUrl(grid);
  try{
    const raw=await json(url,{fetchImpl,timeoutMs,maxBytes:2_000_000});
    const observations=parseWeather(raw,{capturedAt:now(),url,grid});
    return {group:'weather',captured_at:captured,observations,sources:[{name:'Open-Meteo-grid',status:'observed',signals:observations.length,url}]};
  }catch(e){return {group:'weather',captured_at:captured,observations:[],sources:[{name:'Open-Meteo-grid',status:'unavailable',reason:String(e.message).slice(0,180),url}]};}
}

export const USGS_DAY='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const SECTORS=Object.freeze([
  ['N_W180_W90',0,90,-180,-90],['N_W90_E0',0,90,-90,0],['N_E0_E90',0,90,0,90],['N_E90_E180',0,90,90,180],
  ['S_W180_W90',-90,0,-180,-90],['S_W90_E0',-90,0,-90,0],['S_E0_E90',-90,0,0,90],['S_E90_E180',-90,0,90,180]
]);
export function parseEarthquakes(raw,{capturedAt,url=USGS_DAY}={}){
  need(raw?.type==='FeatureCollection'&&Array.isArray(raw.features)&&raw.features.length<=50000,'feed sísmico inválido');
  const known=iso(capturedAt),events=[];
  for(const f of raw.features){
    const mag=numeric(f?.properties?.mag),time=numeric(f?.properties?.time),coords=f?.geometry?.coordinates;
    if(!Number.isFinite(mag)||!Number.isFinite(time)||!Array.isArray(coords)||!Number.isFinite(coords[0])||!Number.isFinite(coords[1]))continue;
    if(time>Date.parse(known))continue;events.push({mag,time,lon:coords[0],lat:coords[1]});
  }
  const obsAt=known,observations=[
    observation('seismic-count-'+known,'sismologia_global','earthquakes_24h_count',events.length,'count',obsAt,known,url),
    observation('seismic-m45-'+known,'sismologia_global','earthquakes_24h_m45_count',events.filter(e=>e.mag>=4.5).length,'count',obsAt,known,url),
    observation('seismic-max-'+known,'sismologia_global','earthquakes_24h_max_magnitude',events.length?Math.max(...events.map(e=>e.mag)):0,'magnitude',obsAt,known,url)
  ];
  for(const [name,lat0,lat1,lon0,lon1] of SECTORS){
    const count=events.filter(e=>e.lat>=lat0&&e.lat<(lat1===90?90.0001:lat1)&&e.lon>=lon0&&e.lon<(lon1===180?180.0001:lon1)).length;
    observations.push(observation('seismic-'+name+'-'+known,'sismologia_global','earthquakes_24h_'+name,count,'count',obsAt,known,url));
  }
  return observations;
}
export async function fetchGlobalPhysical({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000}={}){
  const captured=iso(now());
  const [quake,kp]=await Promise.allSettled([
    json(USGS_DAY,{fetchImpl,timeoutMs,maxBytes:4_000_000}),
    fetchKp({fetchImpl,now,timeoutMs})
  ]);
  const observations=[],sources=[];
  if(quake.status==='fulfilled'){
    try{const o=parseEarthquakes(quake.value,{capturedAt:now()});observations.push(...o);sources.push({name:'USGS-earthquakes',status:'observed',signals:o.length,url:USGS_DAY});}
    catch(e){sources.push({name:'USGS-earthquakes',status:'unavailable',reason:String(e.message).slice(0,180),url:USGS_DAY});}
  }else sources.push({name:'USGS-earthquakes',status:'unavailable',reason:String(quake.reason?.message??quake.reason).slice(0,180),url:USGS_DAY});
  if(kp.status==='fulfilled'){
    const x=kp.value;observations.push(observation('geomag-kp-'+x.observed_at,'geomagnetismo',x.variable,x.value,x.unit,x.observed_at,x.known_at,x.source_url));
    sources.push({name:'NOAA-Kp',status:'observed',signals:1,url:x.source_url});
  }else sources.push({name:'NOAA-Kp',status:'unavailable',reason:String(kp.reason?.message??kp.reason).slice(0,180)});
  return {group:'physical',captured_at:captured,observations,sources};
}
