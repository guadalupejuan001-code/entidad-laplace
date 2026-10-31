/* Import source snapshots without fabricating historical availability.
 * captured_at is when THIS content version was actually captured/archived.
 * A response downloaded today cannot become a point-in-time archive by using
 * its old article date. The caller must supply the real capture timestamp.
 */
import {canonicalLedger,timestamp} from '../historia/contrato.mjs';
import {digest} from '../inteligencia/laplace.mjs';

const need=(ok,message)=>{if(!ok)throw new Error(message)};
function sourceTime(raw){
  need(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw),
    'la fuente requiere timestamp con hora y zona, no solo fecha');
  need(new Date(raw.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===raw.slice(0,10),
    'fecha de fuente invalida');
  const milliseconds=Date.parse(raw);need(Number.isFinite(milliseconds),'timestamp de fuente invalido');
  return timestamp(new Date(milliseconds).toISOString());
}
function snapshot(raw){
  need(raw&&typeof raw==='object'&&raw.response,'se requiere {captured_at,response}');
  return {captured:timestamp(raw.captured_at,'captured_at'),response:raw.response};
}
const maximum=(...times)=>times.sort().at(-1);
function summary(...parts){
  return parts.filter(value=>typeof value==='string').join(' ').replace(/<[^>]*>/g,' ')
    .replace(/[\u0000-\u001F\s]+/g,' ').trim().slice(0,1200);
}

export function importReliefWeb(raw){
  const {captured,response}=snapshot(raw);
  need(Array.isArray(response.data),'respuesta ReliefWeb sin data');
  const rows=response.data.map(item=>{
    const fields=item.fields;need(fields?.date&&typeof fields.title==='string','reporte incompleto');
    const created=sourceTime(fields.date.created);
    const original=fields.date.original?sourceTime(fields.date.original):created;
    const changed=fields.date.changed?sourceTime(fields.date.changed):created;
    need(created<=captured&&changed<=captured&&original<=captured,'captura anterior a la version de contenido recibida');
    const source_url=fields.url;
    need(typeof source_url==='string'&&new URL(source_url).hostname==='reliefweb.int','URL ReliefWeb invalida');
    return {id:'reliefweb-'+digest(String(item.id)+'|'+changed+'|'+captured).slice(0,32),
      kind:'humanitaria',event_code:'TEXT_ONLY',region:fields.primary_country?.iso3??'GLOBAL',
      summary:summary(fields.title,fields.body),observed_at:original,
      known_at:maximum(captured,created,changed,original),source_url};
  });
  return canonicalLedger(rows);
}

export function importGDELT(raw){
  const {captured,response}=snapshot(raw);
  need(Array.isArray(response.articles),'respuesta GDELT sin articles');
  const rows=response.articles.map(item=>{
    need(typeof item.seendate==='string'&&/^\d{8}T\d{6}Z$/.test(item.seendate),
      'seendate GDELT invalido');
    const s=item.seendate;
    const seen=timestamp(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+
      s.slice(9,11)+':'+s.slice(11,13)+':'+s.slice(13,15)+'Z');
    need(seen<=captured,'captura anterior a seendate');
    need(typeof item.title==='string'&&typeof item.url==='string','articulo GDELT incompleto');
    return {id:'gdelt-'+digest(item.url+'|'+seen+'|'+captured).slice(0,32),kind:'geopolitica',
      event_code:'TEXT_ONLY',region:'GLOBAL',summary:summary(item.title),
      observed_at:seen,known_at:captured,source_url:item.url};
  });
  // sourcecountry describes the outlet, NOT where the event occurred. Ignore it.
  return canonicalLedger(rows);
}
