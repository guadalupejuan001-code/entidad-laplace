import {observation,utcTime} from '../estados.mjs';
import {numeric,csvRows,dateOnly} from '../fuentes-oficiales.mjs';
import {huellaContenido} from '../integridad.mjs';
import {COT_DATASETS,YIELD_SERIES,LIQUIDITY_SERIES} from './catalogo.mjs';
import {sourceText,sourceFailure} from './http.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message)};
const make=(domain,variable,value,unit,date,known,url)=>observation({
  id:'u004-'+variable+'-'+date,domain,variable,value,unit,
  observed_at:dateOnly(date),known_at:utcTime(known),source_url:url
});
export function cotUrl(dataset,at=new Date().toISOString()){
  const def=COT_DATASETS[dataset];need(def,'tipo de reporte COT desconocido');
  const fields=['market_and_exchange_names','report_date_as_yyyy_mm_dd','cftc_contract_market_code',
    'open_interest_all','contract_units','futonly_or_combined',...def.categories.flatMap(x=>x.slice(1))];
  const u=new URL('https://publicreporting.cftc.gov/resource/'+def.id+'.json');
  u.searchParams.set('$select',fields.join(','));
  const end=utcTime(at).slice(0,10),start=new Date(Date.parse(at)-90*86400000).toISOString().slice(0,10);
  u.searchParams.set('$where',"futonly_or_combined='FutOnly' AND cftc_contract_market_code in("+def.markets.map(x=>"'"+x+"'").join(',')+
    ") AND report_date_as_yyyy_mm_dd >= '"+start+"T00:00:00.000' AND report_date_as_yyyy_mm_dd <= '"+end+"T00:00:00.000'");
  u.searchParams.set('$order','report_date_as_yyyy_mm_dd DESC,cftc_contract_market_code ASC');
  u.searchParams.set('$limit','60');return u.toString();
}
export function parseCot(raw,{dataset,capturedAt,url}={}){
  const def=COT_DATASETS[dataset],known=utcTime(capturedAt);need(def&&Array.isArray(raw)&&raw.length<=400,'reporte COT inválido');
  const selected=new Map(),duplicates=new Map();
  for(const record of raw){
    const code=record?.cftc_contract_market_code,date=String(record?.report_date_as_yyyy_mm_dd??'').slice(0,10);
    if(!def.markets.includes(code)||record.futonly_or_combined!=='FutOnly')continue;
    let observed;try{observed=dateOnly(date)}catch{continue}if(observed>known)continue;
    const key=code+'|'+date,facts={open_interest:record.open_interest_all,
      categories:def.categories.map(x=>x.slice(1).map(field=>record[field]??null))};
    const fingerprint=huellaContenido(facts);
    need(!duplicates.has(key)||duplicates.get(key)===fingerprint,'COT duplicado contradictorio');duplicates.set(key,fingerprint);
    if(!selected.has(code)||date>selected.get(code).date)selected.set(code,{date,record});
  }
  const observations=[],reports=[];
  for(const code of def.markets){
    const selectedRow=selected.get(code);if(!selectedRow)continue;
    const {date,record}=selectedRow,prefix='COT_'+dataset+'_'+code,missing=[];
    const count=field=>{const n=numeric(record[field]);return Number.isSafeInteger(n)&&n>=0?n:NaN};
    const oi=count('open_interest_all');
    if(Number.isFinite(oi))observations.push(make('posicionamiento_cot',prefix+'_open_interest',oi,'contracts',date,known,url));
    else missing.push('open_interest_all');
    for(const [category,longField,shortField] of def.categories){
      const long=count(longField),short=count(shortField);
      if(Number.isFinite(long))observations.push(make('posicionamiento_cot',prefix+'_'+category+'_long',long,'contracts',date,known,url));else missing.push(longField);
      if(Number.isFinite(short))observations.push(make('posicionamiento_cot',prefix+'_'+category+'_short',short,'contracts',date,known,url));else missing.push(shortField);
      if(Number.isFinite(long)&&Number.isFinite(short))observations.push(make('posicionamiento_cot',prefix+'_'+category+'_net',long-short,'contracts',date,known,url));
    }
    reports.push({dataset:dataset,market_code:code,market_name:record.market_and_exchange_names??null,
      contract_units:record.contract_units??null,reference_date:date,publication_at:null,
      frequency:'weekly',received_at:known,missing_fields:missing,
      reference_age_days:Number(((Date.parse(known)-Date.parse(dateOnly(date)))/86400000).toFixed(2)),
      semantics:'Contratos reportados por categoría; no órdenes actuales ni intenciones de operadores.'});
  }
  need(observations.length,'COT sin mercados registrados y valores válidos');
  return {observations,reports,missing_markets:def.markets.filter(code=>!selected.has(code))};
}
export async function fetchCot(options={}){
  const results=await Promise.all(Object.keys(COT_DATASETS).map(async dataset=>{
    const read=await sourceText('CFTC-'+dataset,cotUrl(dataset,(options.now??(()=>new Date().toISOString()))()),options);
    if(!read.ok)return {observations:[],reports:[],source:read.source};
    try{
      const parsed=parseCot(JSON.parse(read.text),{dataset,capturedAt:read.source.received_at,url:read.source.url});
      return {...parsed,source:{...read.source,status:'observed',signals:parsed.observations.length,
        frequency:'weekly',reference_precision:'day',dataset:COT_DATASETS[dataset].name,
        missing_markets:parsed.missing_markets,complete:!parsed.missing_markets.length&&parsed.reports.every(x=>!x.missing_fields.length)}};
    }catch(error){return {observations:[],reports:[],source:sourceFailure(read.source,error)}}
  }));
  return {observations:results.flatMap(x=>x.observations),reports:results.flatMap(x=>x.reports),sources:results.map(x=>x.source)};
}
export function fredUrl(series,at){
  const list=Array.isArray(series)?series:[series];
  need(list.length&&list.every(x=>YIELD_SERIES.includes(x)||Object.hasOwn(LIQUIDITY_SERIES,x)),'serie U004 no registrada');
  const end=utcTime(at),start=new Date(Date.parse(end)-60*86400000).toISOString().slice(0,10);
  const u=new URL('https://fred.stlouisfed.org/graph/fredgraph.csv');u.searchParams.set('id',list.join(','));
  u.searchParams.set('cosd',start);u.searchParams.set('coed',end.slice(0,10));return u.toString();
}
export function parseFredTable(text,{series,capturedAt}={}){
  need(!text.startsWith('PK'),'FRED devolvió ZIP; consultar series de distinta frecuencia por separado');
  const table=csvRows(text),header=table.shift()??[],known=utcTime(capturedAt),indices=series.map(name=>header.indexOf(name));
  need(['DATE','observation_date'].includes(header[0])&&indices.every(x=>x>0),'CSV FRED sin columnas esperadas');
  const rows=[];const duplicates=new Map();
  for(const record of table){
    const date=record[0];let reference;try{reference=dateOnly(date)}catch{continue}
    if(reference>known)continue;
    const values=Object.fromEntries(series.map((name,i)=>[name,record[indices[i]]]));
    if(!series.every(name=>Number.isFinite(numeric(values[name]))))continue;
    const content=huellaContenido(values);need(!duplicates.has(date)||duplicates.get(date)===content,'fecha FRED duplicada contradictoria');
    if(duplicates.has(date))continue;duplicates.set(date,content);rows.push({date,values});
  }
  need(rows.length,'FRED sin observaciones completas anteriores al corte');
  return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
export function parseYieldCurve(text,{capturedAt,url}={}){
  const known=utcTime(capturedAt),rows=parseFredTable(text,{series:YIELD_SERIES,capturedAt:known}),last=rows.at(-1);
  const levels=Object.fromEntries(YIELD_SERIES.map(name=>[name,numeric(last.values[name])]));
  need(Object.values(levels).every(n=>n>=-50&&n<=100),'rendimientos fuera del rango de datos');
  const observations=YIELD_SERIES.map(name=>make('curva_tesoro','US_'+name,levels[name],'pct',last.date,known,url));
  const bps=(a,b)=>Number(((a-b)*100).toFixed(8));
  observations.push(make('curva_tesoro','US_10Y_minus_2Y',bps(levels.DGS10,levels.DGS2),'bps',last.date,known,url),
    make('curva_tesoro','US_10Y_minus_3M',bps(levels.DGS10,levels.DGS3MO),'bps',last.date,known,url));
  return {observations,metadata:{reference_date:last.date,frequency:'daily_business_days',real_time:false,
    reference_precision:'day',spread_formula:'(10Y - plazo_corto) * 100 puntos básicos',
    common_date_required:true,publication_at:null}};
}
export async function fetchYieldCurve(options={}){
  const at=(options.now??(()=>new Date().toISOString()))(),read=await sourceText('FRED-US-yield-curve',fredUrl(YIELD_SERIES,at),options);
  if(!read.ok)return {observations:[],sources:[read.source],metadata:null};
  try{const parsed=parseYieldCurve(read.text,{capturedAt:read.source.received_at,url:read.source.url});
    return {...parsed,sources:[{...read.source,status:'observed',signals:parsed.observations.length,...parsed.metadata}]};
  }catch(error){return {observations:[],sources:[sourceFailure(read.source,error)],metadata:null}}
}
export function dollars(raw,factor){
  const match=/^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(String(raw));need(match,'balance monetario no válido');
  const frac=match[2]??'',scale=10n**BigInt(frac.length),numerator=BigInt(match[1]+frac)*BigInt(factor);
  need(numerator%scale===0n,'precisión monetaria inferior a un dólar');
  const value=numerator/scale;need(value<=BigInt(Number.MAX_SAFE_INTEGER),'balance excede enteros exactos del transporte');
  return Number(value);
}
export function buildUSLiquidity(inputs,{capturedAt}={}){
  const known=utcTime(capturedAt),names=Object.keys(LIQUIDITY_SERIES);
  need(names.every(name=>Array.isArray(inputs[name]?.rows)&&inputs[name].rows.length),'liquidez de EE. UU. sin los tres componentes');
  const maps=Object.fromEntries(names.map(name=>[name,new Map(inputs[name].rows.map(row=>[row.date,row.values[name]]))]));
  const dates=[...maps.WALCL.keys()].filter(date=>date<=known.slice(0,10)&&names.every(name=>maps[name].has(date))).sort();
  const date=dates.at(-1);need(date,'liquidez sin fecha común; no mezclar períodos');
  const amounts=Object.fromEntries(names.map(name=>[name,dollars(maps[name].get(date),LIQUIDITY_SERIES[name].factor_usd)]));
  const observations=names.map(name=>make('liquidez_eeuu',LIQUIDITY_SERIES[name].name,amounts[name],'USD',date,known,inputs[name].source.url));
  const net=BigInt(amounts.WALCL)-BigInt(amounts.WDTGAL)-BigInt(amounts.RRPONTSYD);
  need(net>=BigInt(Number.MIN_SAFE_INTEGER)&&net<=BigInt(Number.MAX_SAFE_INTEGER),'proxy excede enteros exactos');
  observations.push(make('liquidez_eeuu','US_Fed_TGA_ONRRP_proxy',Number(net),'USD',date,known,'https://fred.stlouisfed.org/series/WALCL'));
  return {observations,metadata:{status:'calculated',reference_date:date,scope:'US_Fed_TGA_ONRRP',is_global_index:false,
    formula:'WALCL * 1e6 - WDTGAL * 1e6 - RRPONTSYD * 1e9',formula_defined_by:'Laplace U004 v1',
    alignment:'misma_fecha_de_referencia',tga_basis:'Wednesday level; no promedio semanal WTREGEN',
    currency:'USD',input_sources:names.map(name=>({series:name,url:inputs[name].source.url,
      received_at:inputs[name].source.received_at,body_sha256:inputs[name].source.body_sha256})),
    semantics:'Proxy exploratorio de balance Fed menos TGA y ON RRP; no liquidez mundial ni causalidad financiera demostrada.'}};
}
export async function fetchUSLiquidity(options={}){
  const now=options.now??(()=>new Date().toISOString()),names=Object.keys(LIQUIDITY_SERIES);
  const results=await Promise.all(names.map(async name=>{
    const read=await sourceText('FRED-'+name,fredUrl(name,now()),options);
    if(!read.ok)return {name,source:read.source,rows:[]};
    try{return {name,rows:parseFredTable(read.text,{series:[name],capturedAt:read.source.received_at}),
      source:{...read.source,status:'observed',signals:0,frequency:LIQUIDITY_SERIES[name].frequency,
        original_unit_multiplier_usd:LIQUIDITY_SERIES[name].factor_usd}};
    }catch(error){return {name,rows:[],source:sourceFailure(read.source,error)}}
  }));
  const sources=results.map(x=>x.source),inputs=Object.fromEntries(results.map(x=>[x.name,x]));
  try{const parsed=buildUSLiquidity(inputs,{capturedAt:now()});
    sources.forEach(source=>{source.signals=1});return {...parsed,sources};
  }catch(error){
    const observations=[];
    for(const result of results)if(result.rows.length){
      try{const row=result.rows.at(-1),def=LIQUIDITY_SERIES[result.name];
        observations.push(make('liquidez_eeuu',def.name,dollars(row.values[result.name],def.factor_usd),
          'USD',row.date,result.source.received_at,result.source.url));result.source.signals=1;
      }catch(valueError){result.source.status='unavailable';result.source.reason=String(valueError.message).slice(0,220)}
    }
    return {observations,sources,metadata:{status:'unavailable',scope:'US_Fed_TGA_ONRRP',
      is_global_index:false,aligned:false,reason:String(error.message).slice(0,220),
      note:'Componentes individuales conservados; proxy no calculado sin todos los datos alineados.'}};
  }
}
