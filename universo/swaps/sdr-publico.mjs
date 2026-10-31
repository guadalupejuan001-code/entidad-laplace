/* D002: safe canonicalization of PUBLIC, voluntarily supplied Part 43 SDR rows.
 * No network ingestion is enabled here: CME/DTCC/ICE files require separate
 * proven format adapters, licensing/redistribution review and as-of auditing.
 * This contract must not reconstruct counterparties or capped notionals.
 */
import {createHash} from 'node:crypto';
import {observation,utcTime} from '../estados.mjs';

export const SDR_D002_SCHEMA='laplace-sdr-public-transactions-d002-v1';
const HOSTS=new Set(['www.cmegroup.com','cmegroup.com',
  'pddata.dtcc.com','www.dtcc.com','www.theice.com','www.ice.com']);
const ASSETS=new Set(['interest_rate','credit','fx','equity','commodity']);
const ACTIONS=new Set(['new','correct','cancel']);
const CLEARING=new Set(['cleared','uncleared','unknown']);
const need=(c,m)=>{if(!c)throw Error(m)};
function iso(x,field){
  need(typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x),
    'SDR timestamp UTC requerido: '+field);
  return utcTime(x);
}
function safeSource(s){
  const u=new URL(s);
  need(u.protocol==='https:'&&HOSTS.has(u.hostname)&&!u.username&&!u.password&&
    !u.search, // no URL tokens, customer filters or private query parameters
    'SDR debe proceder de fuente pública aprobada');
  return s;
}
const FIELDS=new Set(['public_id','execution_at','disseminated_at','asset_class',
  'notional','notional_currency','notional_semantics','clearing',
  'action','version','tenor','price','price_unit']);
function normalNum(x,{name,min=0,max=1e18}={}){
  const numericPattern=min<0?/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/:/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const n=typeof x==='number'?x:typeof x==='string'&&numericPattern.test(x)?Number(x):NaN;
  need(Number.isFinite(n)&&n>=min&&n<=max,name+' inválido');
  return n;
}
const idHash=x=>createHash('sha256').update(x).digest('hex').slice(0,32);
export function parsePublicSdrRecord(raw,{receivedAt,sourceUrl}={}){
  need(raw&&typeof raw==='object'&&!Array.isArray(raw),'SDR fila no es objeto');
  need(Object.keys(raw).every(k=>FIELDS.has(k)),
    'SDR contiene campo desconocido o confidencial; rechazar, no guardar');
  safeSource(sourceUrl);
  const now=iso(receivedAt,'captura'),when=iso(raw.execution_at,'ejecución'),
    published=iso(raw.disseminated_at,'diseminación');
  need(when<=published&&published<=now,
    'SDR información aún no divulgada o temporalmente imposible');
  need(typeof raw.public_id==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(raw.public_id),
    'SDR identificador público inválido');
  need(Number.isSafeInteger(raw.version)&&raw.version>=1&&raw.version<=10000,
    'SDR revisión requerida');
  need(ASSETS.has(raw.asset_class)&&ACTIONS.has(raw.action)&&
    CLEARING.has(raw.clearing),'SDR clase/acción/clearing no declarados');
  need(typeof raw.notional_currency==='string'&&/^[A-Z]{3}$/.test(raw.notional_currency),
    'SDR divisa inválida');
  need(['rounded','capped','masked','unknown'].includes(raw.notional_semantics),
    'SDR debe identificar censura/redondeo del nocional público');
  if(raw.notional===null||raw.notional===undefined){
    need(['masked','unknown'].includes(raw.notional_semantics),
      'SDR notional ausente sin política de ocultación');
  }
  const parsedNotional=raw.notional===null||raw.notional===undefined?null:
    normalNum(raw.notional,{name:'notional',max:1e16});
  if(raw.tenor!==null&&raw.tenor!==undefined)
    need(typeof raw.tenor==='string'&&/^[A-Za-z0-9 _./+-]{1,32}$/.test(raw.tenor),
      'SDR tenor no permitido');
  const parsedPrice=raw.price===null||raw.price===undefined?null:
    normalNum(raw.price,{name:'price',min:-1e15,max:1e15});
  if(raw.price_unit!==null&&raw.price_unit!==undefined)
    need(typeof raw.price_unit==='string'&&/^[A-Za-z0-9_.:/-]{2,32}$/.test(raw.price_unit),
      'SDR unidad de precio inválida');
  const key=idHash(sourceUrl+'|'+raw.public_id);
  return {schema:SDR_D002_SCHEMA,key,received_at:now,
    execution_at:when,disseminated_at:published,
    asset_class:raw.asset_class,action:raw.action,version:raw.version,
    clearing:raw.clearing,source_url:sourceUrl,
    notional_public:parsedNotional,
    notional_semantics:raw.notional_semantics,
    notional_currency:raw.notional_currency,
    tenor:raw.tenor??null,price:parsedPrice,price_unit:raw.price_unit??null,
    counterparties_identified:false,notional_is_true_exact_amount:false};
}
export function ingestPublicSdrRows(rows,{receivedAt,sourceUrl,maxRows=256}={}){
  need(Array.isArray(rows)&&rows.length<=maxRows&&Number.isInteger(maxRows)&&maxRows>=1&&maxRows<=2048,
    'SDR presupuesto excedido');
  const versions=new Map(),all=[];
  for(const row of rows){
    const r=parsePublicSdrRecord(row,{receivedAt,sourceUrl});
    const key=r.key,existing=versions.get(key);
    if(existing){
      need(r.version>existing.version,
        'SDR versión duplicada o desordenada del identificador público');
      need(r.disseminated_at>=existing.disseminated_at,
        'SDR revisión conocida antes que la previa');
    }
    versions.set(key,r);all.push(r);
  }
  // Corrections/cancellations MUST NOT be silently summed as new volume.
  const emitted=[],pending=[],tombstoned=[];
  for(const v of versions.values()){
    if(v.action==='cancel'){tombstoned.push(v.key);continue}
    if(v.action!=='new'){pending.push({key:v.key,reason:'correction_requires_reconciled_prior_snapshot'});continue}
    if(v.notional_public===null){pending.push({key:v.key,reason:'notional_capped_or_masked'});continue}
    emitted.push(observation({
      id:'sdr-'+v.key+'-v'+v.version,
      domain:'swaps_otc_public_transaccion',
      variable:'SDR_'+v.asset_class+'_reported_notional_'+v.key,
      value:v.notional_public,unit:v.notional_currency,
      observed_at:v.execution_at,known_at:v.received_at,
      source_url:v.source_url
    }));
  }
  return {schema:SDR_D002_SCHEMA,rows_seen:rows.length,public_ids:versions.size,
    observations:emitted,pending,tombstoned,
    no_raw_customer_fields:true,observed_notional_exact:false,
    public_part43_data_only:true,requires_upstream_provider_adapter:true,
    linked_live_feed:false,training_eligible:false,
    prediction_inputs_enabled:false,automatic_trading:false};
}
