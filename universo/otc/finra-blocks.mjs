/* O001-B: ATS y Non-ATS Block Summaries mensuales.
 * Estos informes usan meses, no semanas ni símbolos individuales.
 * Los totales de cada firm incluyen operaciones block+no-block y aparecen
 * repetidos por categoría. Solo se promueven COUNT/QUANTITY de bloques.
 */
import {observation,utcTime} from '../estados.mjs';
import {FINRA_API,readFinraPages} from './finra-query.mjs';
import {dateOnly} from './finra-weekly.mjs';
export const BLOCKS_SCHEMA='laplace-finra-monthly-blocks-o001b-v1';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const TYPES=Object.freeze({
  ATS:{dataset:'blocksSummary',label:'ATS',count:'ATSBlockCount',shares:'ATSBlockQuantity'},
  OTC:{dataset:'otcBlocksSummary',label:'OTC',count:'OTCBlockCount',shares:'OTCBlockQuantity'}
});
const THRESHOLDS=['2K','10K'];
function positiveInt(n,key){
  const str=typeof n==='string'?n:String(n);
  need(/^(0|[1-9]\d*)$/.test(str),'FINRA bloque '+key+' no entero');
  const val=Number(str);need(Number.isSafeInteger(val),'FINRA bloque '+key+' fuera de precisión');
  return val;
}
export function blockFilters(monthStart){
  dateOnly(monthStart);
  need(monthStart.endsWith('-01'),'FINRA mes debe comenzar en día 01');
  return [{compareType:'EQUAL',fieldName:'monthStartDate',fieldValue:monthStart}];
}
export function normalizeBlocks(rows,{monthStart,segment,at}={}){
  blockFilters(monthStart);
  need(Object.hasOwn(TYPES,segment),'FINRA segmento blocks desconocido');
  const captured=utcTime(at);
  need(Array.isArray(rows)&&rows.length<=10000,'FINRA blocks demasiadas filas');
  if(!rows.length)return {status:'not_reported',rows:[]};
  const cfg=TYPES[segment],seen=new Set(),out=[];
  for(const item of rows){
    need(item&&typeof item==='object'&&!Array.isArray(item),'FINRA bloque inválido');
    need(item.monthStartDate===monthStart&&item.atsOtc===cfg.label&&
      THRESHOLDS.includes(item.summaryTypeCode),'FINRA bloque ajeno al mes/segmento');
    if(item.summaryStartDate)need(item.summaryStartDate===monthStart,'FINRA summaryStartDate no coincide');
    const published=dateOnly(item.initialPublishedDate);
    need(Date.parse(published+'T00:00:00Z')>=Date.parse(monthStart+'T00:00:00Z')+28*86400000,
      'FINRA blocks prematuro');
    need(published<=captured.slice(0,10),'FINRA blocks aún no publicado');
    if(item.lastUpdateDate)need(dateOnly(item.lastUpdateDate)<=captured.slice(0,10),
      'FINRA blocks revisión futura');
    const count=positiveInt(item[cfg.count],cfg.count),
      shares=positiveInt(item[cfg.shares],cfg.shares);
    const overallTrades=positiveInt(item.totalTradeCount,'totalTradeCount'),
      overallShares=positiveInt(item.totalShareQuantity,'totalShareQuantity');
    need(count<=overallTrades&&shares<=overallShares&&
      (count===0?shares===0:shares>=count),'FINRA blocks excede volumen de referencia');
    const mpid=segment==='ATS'?(item.MPID??null):null;
    const participant=segment==='ATS'?(item.marketParticipantName??null):
      (item.crdFirmName??item.marketParticipantName??null);
    const crd=segment==='OTC'?(item.firmCRDNumber??null):null;
    need(mpid===null||typeof mpid==='string'&&/^[A-Z0-9]{1,12}$/.test(mpid),
      'FINRA blocks MPID no válido');
    need(participant===null||typeof participant==='string'&&participant.length>=1&&
      participant.length<=250,'FINRA blocks firma no válida');
    need(crd===null||/^\d{1,9}$/.test(String(crd)),'FINRA blocks CRD no válido');
    need(mpid!==null||participant!==null||crd!==null,
      'FINRA blocks sin centro/participante reportante');
    const key=[segment,mpid??'',crd??'',participant??'',item.summaryTypeCode].join('|');
    need(!seen.has(key),'FINRA bloques duplicados para centro y categoría');seen.add(key);
    out.push({month_start:monthStart,segment,threshold:item.summaryTypeCode,
      venue:{mpid,reporting_firm:participant,crd:crd===null?null:Number(crd)},
      block_count:count,block_shares:shares,all_trades:overallTrades,
      all_shares:overallShares,published_date:published,
      source_scope:'NMS stocks, monthly, all participating securities combined',
      customer_identity_available:false});
  }
  return {status:'observed',rows:out};
}
function aggregateBlocks(parsed,{monthStart,segment,at,sourceUrl}){
  need(parsed.status==='observed','No hay blocks confirmados');
  const captured=utcTime(at),observed=monthStart+'T00:00:00.000Z';
  const states=[];
  for(const threshold of THRESHOLDS){
    const group=parsed.rows.filter(r=>r.threshold===threshold);
    if(!group.length)continue;
    // Por categoría, cada venue se observa una vez. No sumar las columnas
    // "totalTradeCount" ni "totalShareQuantity" repetidas en ambas categorías.
    const totals={block_count:group.reduce((a,x)=>a+x.block_count,0),
      block_shares:group.reduce((a,x)=>a+x.block_shares,0)};
    need(Object.values(totals).every(Number.isSafeInteger),'FINRA bloques fuera de precisión agregada');
    for(const [metric,value] of Object.entries(totals)){
      states.push(observation({
        id:'finra-blocks-'+monthStart+'-'+segment+'-'+threshold+'-'+metric,
        domain:'bloques_ats_noats_mensual',
        variable:'FINRA_'+segment+'_BLOCKS_'+threshold+'_'+metric,
        value,unit:metric==='block_count'?'count':'shares',
        observed_at:observed,known_at:captured,source_url:sourceUrl
      }));
    }
  }
  return states;
}
export async function observeMonthlyBlocks({monthStart,client,
  now=()=>new Date().toISOString(),pageSize=300,maxPages=5}={}){
  blockFilters(monthStart);
  if(!client?.enabled)return {schema:BLOCKS_SCHEMA,month_start:monthStart,
    status:'requires_credentials',observations:[],venues:[],sources:[
      {name:'FINRA-blocks',status:'requires_credentials',
        reason:'FINRA Public API Credential requerida'}],
    prediction_inputs_enabled:false,automatic_trading:false};
  const jobs=Object.entries(TYPES).map(([segment,config])=>({segment,config}));
  const collected=await Promise.all(jobs.map(async ({segment,config})=>{
    const sourceUrl=FINRA_API+'/data/group/otcMarket/name/'+config.dataset;
    try{
      const pages=await readFinraPages(client,{dataset:config.dataset,
        compareFilters:blockFilters(monthStart),pageSize,maxPages});
      need(pages.complete,'FINRA blocks no recuperó todas las páginas');
      const parsed=normalizeBlocks(pages.rows,{monthStart,segment,at:utcTime(now())});
      return {segment,status:parsed.status,rows:parsed.rows,
        at:utcTime(now()),source_url:sourceUrl,receipts:pages.receipts};
    }catch(error){
      return {segment,status:'unavailable',rows:[],at:utcTime(now()),
        source_url:sourceUrl,receipts:[],reason:String(error.message).slice(0,180)};
    }
  }));
  const observations=[],venues=[],sources=[];
  for(const group of collected){
    sources.push({name:'FINRA-'+group.segment+'-monthly-blocks',status:group.status,
      source_url:group.source_url,received_at:group.at,receipts:group.receipts,
      publication_dates:[...new Set(group.rows.map(x=>x.published_date))],
      reason:group.reason??null,period:'monthly',availability_time_exact:false});
    if(group.status!=='observed')continue;
    observations.push(...aggregateBlocks({status:group.status,rows:group.rows},
      {monthStart,segment:group.segment,at:group.at,sourceUrl:group.source_url}));
    venues.push(...group.rows.map(x=>({...x,
      reporting_venue_not_customer:true,
      do_not_sum_with_weekly:true,
      all_trades_includes_block_and_nonblock:true})));
  }
  return {schema:BLOCKS_SCHEMA,month_start:monthStart,
    status:observations.length?'observed':'partial_or_unavailable',observations,
    venues,sources,
    coverage:{requested_sources:2,observed_sources:sources.filter(x=>x.status==='observed').length,
      missing_sources:sources.filter(x=>x.status!=='observed').length},
    semantics:'Monthly NMS block category data, not symbol-specific, not private order book.',
    no_double_counting:true,prediction_inputs_enabled:false,automatic_trading:false};
}
