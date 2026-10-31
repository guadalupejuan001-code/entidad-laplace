/* FINRA Weekly Summary O001-B.
 * ATS_W_SMBL and OTC_W_SMBL are symbol aggregates. _SMBL_FIRM rows are a
 * separate breakdown and MUST NEVER be added on top of symbol aggregates.
 * The MPID/firm names identify reporting venues/firms, not their customers.
 */
import {observation,utcTime} from '../estados.mjs';
import {FINRA_API,readFinraPages} from './finra-query.mjs';
export const WEEKLY_SCHEMA='laplace-finra-otc-weekly-o001b-v1';
export const WEEKLY_SEGMENTS=Object.freeze(['ATS','OTC']);
const TIERS=Object.freeze(['T1','T2','OTCE']);
const TYPES=Object.freeze({ATS:{symbol:'ATS_W_SMBL',venue:'ATS_W_SMBL_FIRM'},
  OTC:{symbol:'OTC_W_SMBL',venue:'OTC_W_SMBL_FIRM'}});
const need=(ok,message)=>{if(!ok)throw Error(message)};
const SYMBOL=/^[A-Z0-9.^$/-]{1,20}$/;
export function dateOnly(d,{monday=false}={}){
  need(typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d),'FINRA fecha YYYY-MM-DD inválida');
  const dt=new Date(d+'T00:00:00.000Z');
  need(Number.isFinite(dt.valueOf())&&dt.toISOString().slice(0,10)===d,'FINRA fecha inexistente');
  need(!monday||dt.getUTCDay()===1,'FINRA weekStartDate debe ser lunes');
  return d;
}
function count(n,field){
  const raw=typeof n==='string'?n:String(n);
  need(/^(0|[1-9]\d*)$/.test(raw),'FINRA '+field+' requiere entero no negativo');
  const value=Number(raw);
  need(Number.isSafeInteger(value),'FINRA '+field+' excede precisión exacta');
  return value;
}
export function checkTargets(targets){
  need(Array.isArray(targets)&&targets.length>=1&&targets.length<=8,'FINRA 1-8 símbolos');
  const seen=new Set();
  return targets.map(t=>{
    need(t&&typeof t.symbol==='string'&&SYMBOL.test(t.symbol)&&
      TIERS.includes(t.tier),'FINRA símbolo/tier no admitido');
    need(!seen.has(t.symbol),'FINRA símbolo duplicado');seen.add(t.symbol);
    return {symbol:t.symbol,tier:t.tier}; // Tier explícito; no inventarlo.
  });
}
export function weeklyFilters({weekStart,tier,symbol,segment,view='symbol'}){
  dateOnly(weekStart,{monday:true});
  checkTargets([{symbol,tier}]);
  need(WEEKLY_SEGMENTS.includes(segment)&&['symbol','venue'].includes(view),
    'FINRA clasificación semanal inválida');
  return [
    {compareType:'EQUAL',fieldName:'weekStartDate',fieldValue:weekStart},
    {compareType:'EQUAL',fieldName:'tierIdentifier',fieldValue:tier},
    {compareType:'EQUAL',fieldName:'summaryTypeCode',fieldValue:TYPES[segment][view]},
    {compareType:'EQUAL',fieldName:'issueSymbolIdentifier',fieldValue:symbol}
  ];
}
function publicationDate(row,at,weekStart,tier){
  const published=dateOnly(row.initialPublishedDate);
  const date=Date.parse(published+'T00:00:00.000Z');
  const cut=Date.parse(at),week=Date.parse(weekStart+'T00:00:00.000Z');
  need(date<=cut,'FINRA semana publicada después del corte temporal');
  need(date>=week+(tier==='T1'?14:28)*86400000,
    'FINRA reporte previo al retraso mínimo previsto');
  if(row.lastUpdateDate)need(dateOnly(row.lastUpdateDate)<=at.slice(0,10),
    'FINRA actualización posterior al corte');
  return published;
}
function canonicalRow(row,params,at,view){
  need(row&&typeof row==='object'&&!Array.isArray(row),'Fila FINRA inválida');
  const expected=TYPES[params.segment][view];
  need(row.weekStartDate===params.weekStart&&
    row.tierIdentifier===params.tier&&
    row.issueSymbolIdentifier===params.symbol&&
    row.summaryTypeCode===expected,'FINRA fila ajena al filtro semanal');
  if(row.summaryStartDate)need(row.summaryStartDate===params.weekStart,'FINRA fechas de semana diferentes');
  const shares=count(row.totalWeeklyShareQuantity,'volumen');
  const trades=count(row.totalWeeklyTradeCount,'operaciones');
  need(trades===0?shares===0:shares>=trades,'FINRA acciones/operaciones inconsistentes');
  const published=publicationDate(row,at,params.weekStart,params.tier);
  let venue=null;
  if(view==='venue'){
    const mpid=row.MPID??row.marketParticipantIdentifier??null;
    const name=row.marketParticipantName??null,crd=row.firmCRDNumber??null;
    need(mpid===null||typeof mpid==='string'&&/^[A-Z0-9]{1,12}$/.test(mpid),
      'FINRA identificador de venue inválido');
    need(name===null||typeof name==='string'&&name.length<=200,
      'FINRA denominación venue inválida');
    need(crd===null||Number.isSafeInteger(Number(crd))&&Number(crd)>=0,
      'FINRA CRD de firma inválido');
    need(mpid!==null||name!==null||crd!==null,'FINRA venue sin identificador');
    venue={mpid,reporting_firm:name,crd:crd===null?null:Number(crd),
      de_minimis:Boolean(name&&/de minimis/i.test(name))};
  }else{
    need(row.MPID==null&&row.marketParticipantIdentifier==null&&
      row.marketParticipantName==null&&row.firmCRDNumber==null,
      'FINRA símbolo agregado contiene firma: no sumar vistas distintas');
  }
  return {week_start:params.weekStart,tier:params.tier,symbol:params.symbol,
    segment:params.segment,shares,trades,published_date:published,venue};
}
export function normalizeWeeklyRows(rows,{weekStart,tier,symbol,segment,view='symbol',at}={}){
  need(Array.isArray(rows)&&rows.length<=10000,'FINRA fila semanal excesiva');
  const captured=utcTime(at),p={weekStart:dateOnly(weekStart,{monday:true}),tier,symbol,segment};
  weeklyFilters({...p,view});
  if(!rows.length)return {status:'not_reported',rows:[],at:captured,
    meaning:'No recibido no implica cero volumen'};
  const parsed=rows.map(r=>canonicalRow(r,p,captured,view)),seen=new Set();
  for(const r of parsed){
    const venue=r.venue,key=view==='symbol'?'symbol':
      [venue.mpid??'',venue.crd??'',venue.reporting_firm??''].join('|');
    need(!seen.has(key),'FINRA duplicado en vista '+view+': '+key);
    seen.add(key);
  }
  return {status:'observed',rows:parsed,at:captured};
}
export function weeklyObservations(summary,{at,sourceUrl}={}){
  const captured=utcTime(at);
  need(summary.status==='observed'&&summary.rows.length===1&&summary.rows[0].venue===null,
    'FINRA: sólo un agregado por símbolo confirmado genera estados');
  const r=summary.rows[0],obsAt=r.week_start+'T00:00:00.000Z',
    domain='actividad_ats_noats_semanal',base='FINRA_'+r.segment+'_'+r.tier+'_'+r.symbol;
  const data=[['shares',r.shares,'shares'],['trades',r.trades,'count']];
  return data.map(([metric,value,unit])=>observation({
    id:'finra-week-'+r.week_start+'-'+r.segment+'-'+r.tier+'-'+r.symbol+'-'+metric,
    domain,variable:base+'_'+metric,value,unit,
    observed_at:obsAt,known_at:captured,source_url:sourceUrl
  }));
}
async function collectGroup(client,{weekStart,target,segment,view,pageSize,maxPages,now}){
  const filters=weeklyFilters({weekStart,...target,segment,view});
  const dataset='weeklySummary',at=utcTime(now());
  try{
    const pages=await readFinraPages(client,{dataset,compareFilters:filters,pageSize,maxPages});
    need(pages.complete,'FINRA paginación semanal incompleta; no publicar parcial');
    const report=normalizeWeeklyRows(pages.rows,{weekStart,...target,segment,view,at:utcTime(now())});
    const scope=[weekStart,target.tier,target.symbol,segment,view].join('|');
    return {scope,status:report.status,rows:report.rows,receipts:pages.receipts,
      source_url:pages.source_url,at:report.at};
  }catch(error){
    return {scope:[weekStart,target.tier,target.symbol,segment,view].join('|'),
      status:'unavailable',rows:[],receipts:[],source_url:FINRA_API+'/data/group/otcMarket/name/weeklySummary',
      at,reason:String(error.message).slice(0,180)};
  }
}
async function pool(items,limit,fn){
  const result=Array(items.length),cursor={i:0};
  async function worker(){for(;;){const i=cursor.i++;if(i>=items.length)return;
    result[i]=await fn(items[i]);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return result;
}
export async function observeWeeklyFinra({weekStart,targets=[{symbol:'AAPL',tier:'T1'},{symbol:'SPY',tier:'T1'}],
  includeVenues=true,client,now=()=>new Date().toISOString(),pageSize=300,maxPages=4}={}){
  dateOnly(weekStart,{monday:true});const selected=checkTargets(targets);
  if(!client?.enabled){
    return {schema:WEEKLY_SCHEMA,status:'requires_credentials',week_start:weekStart,
      observations:[],venues:[],sources:[{name:'FINRA-weeklySummary',status:'requires_credentials',
        reason:'Se necesita FINRA Public API Credential autorizada'}],
      prediction_inputs_enabled:false,automatic_trading:false};
  }
  const jobs=selected.flatMap(target=>WEEKLY_SEGMENTS.flatMap(segment=>
    (includeVenues?['symbol','venue']:['symbol']).map(view=>({target,segment,view}))));
  const groups=await pool(jobs,2,job=>collectGroup(client,{weekStart,...job,pageSize,maxPages,now}));
  const sources=[],observations=[],venues=[],byPair=new Map();
  for(const item of groups){
    const [week,tier,symbol,segment,view]=item.scope.split('|');
    sources.push({name:'FINRA-weeklySummary-'+segment+'-'+view+'-'+symbol,
      status:item.status,scope:item.scope,source_url:item.source_url,
      received_at:item.at,receipts:item.receipts,reason:item.reason??null,
      data_type:view==='symbol'?'symbol_aggregate':'reporting_venue_breakdown',
      published_dates:[...new Set(item.rows.map(r=>r.published_date))],
      hidden_customer_identity:false,customer_identity_available:false});
    if(item.status!=='observed')continue;
    if(view==='symbol'){
      observations.push(...weeklyObservations({status:'observed',rows:item.rows},
        {at:item.at,sourceUrl:item.source_url}));
      byPair.set(segment+'|'+symbol,item.rows[0]);
    }else for(const r of item.rows)venues.push({
      ...r,reporting_venue_not_customer:true,customer_identity_unavailable:true,
      double_count_with_symbol_totals:true
    });
  }
  // Sólo cuota ATS / (ATS + NonATS) — NO es cuota del mercado total
  // y nunca se suma a los dos volúmenes originales.
  for(const target of selected){
    const a=byPair.get('ATS|'+target.symbol),b=byPair.get('OTC|'+target.symbol);
    if(!a||!b||a.shares+b.shares===0)continue;
    observations.push(observation({
      id:'finra-week-ratio-'+weekStart+'-'+target.tier+'-'+target.symbol,
      domain:'actividad_ats_noats_semanal',
      variable:'FINRA_ATS_OFF_EXCHANGE_SHARE_'+target.symbol,
      value:a.shares/(a.shares+b.shares),unit:'ratio',
      observed_at:weekStart+'T00:00:00.000Z',known_at:utcTime(now()),
      source_url:FINRA_API+'/data/group/otcMarket/name/weeklySummary'
    }));
  }
  const reconciliation=[];
  for(const target of selected)for(const segment of WEEKLY_SEGMENTS){
    const base=byPair.get(segment+'|'+target.symbol);
    const venueGroup=groups.find(g=>g.scope===[weekStart,target.tier,target.symbol,
      segment,'venue'].join('|'));
    if(!base||!venueGroup||venueGroup.status!=='observed')continue;
    const shares=venueGroup.rows.reduce((a,r)=>a+BigInt(r.shares),0n);
    const trades=venueGroup.rows.reduce((a,r)=>a+BigInt(r.trades),0n);
    reconciliation.push({segment,symbol:target.symbol,tier:target.tier,
      reported_symbol_shares:base.shares,
      venue_shares_sum:shares.toString(),reported_symbol_trades:base.trades,
      venue_trades_sum:trades.toString(),
      equal_shares:shares===BigInt(base.shares),
      equal_trades:trades===BigInt(base.trades),
      interpretation:'Metadata de contraste; nunca sumar vistas ni inferir volumen oculto del desajuste.'});
  }
  return {schema:WEEKLY_SCHEMA,status:observations.length?'observed':'partial_or_unavailable',
    week_start:weekStart,targets:selected,observations,venues,sources,reconciliation,
    coverage:{requested_sources:jobs.length,observed_sources:sources.filter(s=>s.status==='observed').length,
      unavailable_sources:sources.filter(s=>s.status!=='observed').length},
    venue_semantics:'Reported ATS/Non-ATS trading firm is public; investor or order origin not identified.',
    no_double_counting:true,as_of_data_only:true,prediction_inputs_enabled:false,
    automatic_trading:false};
}
