'use strict';
/*
 * LaPlaceDIG — historical truth contract.
 * No forecast, AI, quote feed or inference lives in this module.
 * Every fact must supply its ORIGINAL availability timestamp.
 */
import {createHash} from 'node:crypto';

const REQUIRED={
  precio:['id','kind','observed_at','known_at','source_url','asset','price_basis','currency','value'],
  economia:['id','kind','observed_at','known_at','source_url','series_id','unit','value'],
  geopolitica:['id','kind','observed_at','known_at','source_url','event_code','summary','region'],
  humanitaria:['id','kind','observed_at','known_at','source_url','event_code','summary','region']
};
export const KIND=Object.freeze(Object.keys(REQUIRED));
export const MAX_RECORDS=10000;
export const MAX_DATA_BYTES=8*1024*1024;
const fail=(reason)=>{throw new Error(reason)};
const need=(condition,reason)=>{if(!condition)fail(reason)};
export function timestamp(raw,field='timestamp'){
  need(typeof raw==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw),
    field+' must be an explicit UTC ISO-8601 timestamp ending in Z');
  const ms=Date.parse(raw);
  need(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===raw.slice(0,10),
    field+' contains an invalid date');
  return new Date(ms).toISOString();
}
function text(value,field,max=250){
  need(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001F]/.test(value),
    field+' requires printable nonempty text <= '+max+' characters');
  return value;
}
export function canonicalFact(entry){
  need(entry && typeof entry==='object'&&!Array.isArray(entry),'each observation must be a JSON object');
  const type=entry.kind;
  need(Object.hasOwn(REQUIRED,type),'unknown observation kind '+String(type));
  const keys=Object.keys(entry).sort();
  const expected=REQUIRED[type].slice().sort();
  need(JSON.stringify(keys)===JSON.stringify(expected),
    'wrong or missing '+type+' fields: expected exactly '+expected.join(','));
  const out={
    id:text(entry.id,'id',150),
    kind:type,
    observed_at:timestamp(entry.observed_at,'observed_at'),
    known_at:timestamp(entry.known_at,'known_at'),
    source_url:text(entry.source_url,'source_url',1024)
  };
  need(out.known_at>=out.observed_at,'information cannot be known before its occurrence in this schema');
  let u;try{u=new URL(out.source_url)}catch{fail('source_url must be an HTTPS URL')};
  need(u.protocol==='https:'&&Boolean(u.hostname),'source_url must be an HTTPS URL');
  if(type==='precio'){
    out.asset=text(entry.asset,'asset',32);
    need(/^[A-Z0-9.^_-]{1,32}$/.test(out.asset),'asset should be uppercase identifier');
    out.price_basis=text(entry.price_basis,'price_basis',40);
    need(['raw_close','adjusted_close','monthly_average','spot_quote'].includes(out.price_basis),
      'unknown price basis');
    out.currency=text(entry.currency,'currency',12);
    need(/^[A-Z]{3,12}$/.test(out.currency),'currency must be uppercase');
    out.value=decimal(entry.value,'value',true);
  }else if(type==='economia'){
    out.series_id=text(entry.series_id,'series_id',100);
    out.unit=text(entry.unit,'unit',100);
    out.value=decimal(entry.value,'value',false);
  }else{
    out.event_code=text(entry.event_code,'event_code',80);
    out.summary=text(entry.summary,'summary',1200);
    out.region=text(entry.region,'region',120);
  }
  return Object.freeze(out);
}
function decimal(raw,field,positive){
  need(typeof raw==='string'&&/^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,8})?$/.test(raw),
    field+' requires a finite decimal STRING (never floating point or exponent notation)');
  if(positive)need(Number(raw)>0,'price must be strictly positive');
  return raw;
}
export function canonicalLedger(rows){
  need(Array.isArray(rows)&&rows.length<=MAX_RECORDS,'maximum '+MAX_RECORDS+' observations');
  const ids=new Set();
  const items=rows.map((row,index)=>{
    const fact=canonicalFact(row);
    need(!ids.has(fact.id),'duplicate observation id '+fact.id+' at '+index);
    ids.add(fact.id);return fact;
  });
  return Object.freeze(items.sort((a,b)=>
    a.known_at.localeCompare(b.known_at)||a.id.localeCompare(b.id)));
}
export function parseJSONL(source){
  need(typeof source==='string'&&Buffer.byteLength(source,'utf8')<=MAX_DATA_BYTES,
    'ledger exceeds 8 MiB of input');
  const lines=source.split(/\r?\n/).filter(l=>l.trim());
  need(lines.length<=MAX_RECORDS,'too many records');
  const records=lines.map((line,index)=>{
    let obj;
    try{obj=JSON.parse(line)}catch{fail('invalid JSON at line '+(index+1))}
    return obj;
  });
  return canonicalLedger(records);
}
export function stringifyJSONL(records){
  return canonicalLedger([...records]).map(r=>JSON.stringify(r)).join('\n')+(records.length?'\n':'');
}
export function ledgerHash(records){
  return createHash('sha256').update(stringifyJSONL(records)).digest('hex');
}
export function asOf(records,cutoff){
  const time=timestamp(cutoff,'cutoff');
  const normalized=canonicalLedger([...records]);
  return Object.freeze(normalized.filter(item=>item.known_at<=time));
}
export function latestEconomicVintages(records,cutoff){
  const recent=new Map();
  for(const event of asOf(records,cutoff)){
    if(event.kind!=='economia')continue;
    const key=event.series_id+'|'+event.observed_at;
    recent.set(key,event);
  }
  return Object.freeze([...recent.values()]);
}
export function persistenceBaseline(records,cutoff,asset){
  const selected=asOf(records,cutoff)
    .filter(x=>x.kind==='precio'&&x.asset===asset)
    .sort((a,b)=>a.observed_at.localeCompare(b.observed_at)||a.known_at.localeCompare(b.known_at));
  if(!selected.length){
    return Object.freeze({status:'sin_datos',asset,cutoff:timestamp(cutoff),forecast:null});
  }
  const latest=selected[selected.length-1];
  return Object.freeze({
    status:'referencia_sin_ia',asset,cutoff:timestamp(cutoff),
    forecast:latest.value,unit:latest.currency,basis:latest.price_basis,
    last_observation:latest.observed_at,last_known_at:latest.known_at,
    source_id:latest.id,
    warning:'Persistencia estadistica; NO es una prediccion validada de LaPlace'
  });
}
