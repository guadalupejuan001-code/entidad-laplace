/* Pulso Mundial: identidad estable y refinamiento conservador del catálogo. */
import {createHash} from 'node:crypto';
import {utcTime} from '../universo/estados.mjs';
export const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export const need=(ok,message)=>{if(!ok)throw Error(message)};
export const normalizeName=s=>String(s).normalize('NFKC').toUpperCase()
  .replace(/&/g,' AND ').replace(/\bCORPORATION\b/g,'CORP').replace(/\bINCORPORATED\b/g,'INC')
  .replace(/[^A-Z0-9]/g,'');
const union=(a=[],b=[])=>[...new Set([...a,...b])].sort();
export const cik=s=>{need(/^\d{1,10}$/.test(String(s)),'CIK inválido');return String(s).padStart(10,'0')};
export class Registry {
  constructor(previous=null,symbols=[]){
    if(previous){
      const {registry_sha256,...body}=previous;
      need(previous.schema==='laplace-pulso-instituciones-p001-v1'&&hash(body)===registry_sha256,'registro institucional alterado');
    }
    this.entities=new Map((previous?.entities??[]).map(x=>[x.id,structuredClone(x)]));
    this.identity=new Map();
    for(const e of this.entities.values())for(const k of ['cik','ticker'])if(e.identifiers[k]){
      const key=k+':'+e.identifiers[k];need(!this.identity.has(key),'identificador duplicado en registro');this.identity.set(key,e.id);
    }
    this.sources=new Map((previous?.sources??[]).map(x=>[x.id,structuredClone(x)]));
    this.reports=new Map((previous?.reports??[]).map(x=>[x.id,structuredClone(x)]));
    this.assertions=new Map((previous?.assertions??[]).map(x=>[x.id,structuredClone(x)]));
    for(const symbol of symbols)this.upsert({id:'market:'+symbol,name:symbol,identifiers:{ticker:symbol},roles:['existing_market_instrument']});
  }
  upsert(row){
    const ids=row.identifiers??{};
    const matchIds=new Set([...(this.entities.has(row.id)?[row.id]:[]),
      ...['cik','ticker'].flatMap(k=>ids[k]&&this.identity.has(k+':'+ids[k])?[this.identity.get(k+':'+ids[k])]:[])]);
    const matches=[...matchIds].map(id=>this.entities.get(id));
    need(matches.length<=1,'identidad ambigua; requiere conciliación: '+row.name);
    const old=matches[0],id=old?.id??row.id;
    need(typeof id==='string'&&id.length>0,'entidad sin identificador');
    for(const key of ['cik','ticker'])if(old?.identifiers[key]&&ids[key])
      need(old.identifiers[key]===ids[key],'conflicto de identificador '+key);
    const ranks={SEC_submissions_CIK_and_ticker:4,SEC_ticker_and_CIK:3,CUSIP_security_identifier_not_company_identifier:3,catalogue_identifier:1};
    const basis=row.identity_basis??old?.identity_basis??'catalogue_identifier';
    const oldRank=ranks[old?.identity_basis]??0,newRank=ranks[basis]??0;
    const next={id,name:row.name,identifiers:{...(old?.identifiers??{}),...ids},
      aliases:union(old?.aliases,[...(row.aliases??[]),...(old?[old.name]:[]),row.name]),
      roles:union(old?.roles,row.roles),source_ids:union(old?.source_ids,row.source_ids),
      identity_basis:old&&oldRank>=newRank?old.identity_basis:basis};
    if(old?.jurisdiction||row.jurisdiction)next.jurisdiction=row.jurisdiction??old.jurisdiction;
    this.entities.set(id,next);for(const k of ['cik','ticker'])if(next.identifiers[k])this.identity.set(k+':'+next.identifiers[k],id);
    return next;
  }
  source(raw){
    need(raw&&typeof raw.text==='string','falta respuesta original');
    const url=new URL(raw.url);need(url.protocol==='https:'&&['www.sec.gov','data.sec.gov'].includes(url.hostname),'fuente SEC inválida');
    const received=utcTime(raw.received_at),body_sha256=hash(raw.text);
    const id='src:'+hash(url.toString()+'|'+body_sha256).slice(0,32);
    const old=this.sources.get(id);
    if(old){need(received>=old.known_at,'reimportación intenta retroceder la disponibilidad');return old}
    const s={id,url:url.toString(),body_sha256,known_at:received,bytes:Buffer.byteLength(raw.text)};
    this.sources.set(id,s);return s;
  }
  assertion(row){
    need(this.entities.has(row.from)&&this.entities.has(row.to),'relación con entidad desconocida');
    need(row.from!==row.to,'autorelación institucional');
    const source=this.sources.get(row.source_id);need(source,'relación sin fuente');
    const observed=utcTime(row.observed_at);need(observed<=source.known_at,'relación futura');
    const known=utcTime(row.known_at??source.known_at);
    need(known>=source.known_at,'relación anterior a su fuente');
    for(const id of row.supporting_source_ids??[]){const support=this.sources.get(id);need(support&&support.known_at<=known,'relación anterior a evidencia de apoyo')}
    const body={...row,observed_at:observed,known_at:known};
    const item={id:'rel:'+hash(body).slice(0,32),...body};this.assertions.set(item.id,item);return item;
  }
  seal(){
    const sorted=map=>[...map.values()].sort((a,b)=>a.id.localeCompare(b.id));
    const body={schema:'laplace-pulso-instituciones-p001-v1',entities:sorted(this.entities),sources:sorted(this.sources),
      reports:sorted(this.reports),assertions:sorted(this.assertions),
      coverage:{complete_world:false,complete_controlled_companies:false,
        subsidiary_scope:'entities_disclosed_in_exhibit_21_only',
        portfolio_scope:'reported_13f_positions_only_not_total_assets_under_management'},
      prediction_inputs_enabled:false};
    return {...body,registry_sha256:hash(body)};
  }
}
