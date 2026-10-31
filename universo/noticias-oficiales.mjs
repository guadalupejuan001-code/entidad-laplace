/* Alertas geolocalizadas de GDACS. Su cobertura es desastres naturales;
 * no sustituyen noticias de conflicto, comercio ni otros temas de GDELT. */
import {createHash} from 'node:crypto';
import {plainText} from '../bitcoin/agente.mjs';
import {numeric} from './fuentes-oficiales.mjs';
import {observation,utcTime} from './estados.mjs';

export const GDACS_URL='https://www.gdacs.org/xml/rss.xml';
const need=(ok,message)=>{if(!ok)throw Error(message)};
const hash=text=>createHash('sha256').update(text).digest('hex');
const TYPES=['EQ','TC','FL','VO','DR','WF'];
function tag(text,name){
  return text.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]??'';
}
function timestamp(text){
  const value=plainText(text,100);if(!value)return null;
  if(!/(?:GMT|UTC|Z|[+-]\d{2}:?\d{2})$/i.test(value))return null;
  const ms=Date.parse(value);return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function reportUrl(text){
  try{const u=new URL(plainText(text,1500));
    need(['gdacs.org','www.gdacs.org'].includes(u.hostname)&&!u.username&&!u.password,'enlace externo');
    need(['http:','https:'].includes(u.protocol),'protocolo inválido');u.protocol='https:';return u.toString();
  }catch{return null}
}
export function parseGdacs(xml,{capturedAt,url=GDACS_URL,maxAgeHours=48}={}){
  const known=utcTime(capturedAt);
  need(typeof xml==='string'&&Buffer.byteLength(xml)<=4*1024*1024,'GDACS excede 4 MiB');
  need(!/<!DOCTYPE|<!ENTITY/i.test(xml),'GDACS XML con declaraciones externas');
  need(/<rss\b/i.test(xml)&&/<channel\b/i.test(xml)&&/<\/channel\s*>/i.test(xml),'GDACS no es un feed RSS completo');
  const channel=xml.split(/<item\b/i)[0],feedTime=timestamp(tag(channel,'pubDate'));
  need(feedTime&&feedTime<=known,'GDACS sin fecha válida o con fecha futura');
  need(Date.parse(known)-Date.parse(feedTime)<=maxAgeHours*3600000,'GDACS feed anticuado');
  const blocks=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)];
  need((xml.match(/<item\b/gi)??[]).length===blocks.length,'GDACS contiene alertas truncadas');
  need(blocks.length<=3000,'GDACS excede 3000 alertas');
  const events=new Map(),rejected={invalid:0,future:0,not_current:0};
  for(const [,block] of blocks){
    const type=plainText(tag(block,'gdacs:eventtype'),8).toUpperCase();
    const id=plainText(tag(block,'gdacs:eventid'),40),published=timestamp(tag(block,'pubDate'));
    const modified=timestamp(tag(block,'gdacs:datemodified'))??published;
    const eventAt=timestamp(tag(block,'gdacs:fromdate')),link=reportUrl(tag(block,'link'));
    const title=plainText(tag(block,'title'),220),country=plainText(tag(block,'gdacs:country'),100);
    let lat=numeric(plainText(tag(block,'geo:lat'),40)),lon=numeric(plainText(tag(block,'geo:long'),40));
    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      const point=plainText(tag(block,'georss:point'),100).split(/\s+/);lat=numeric(point[0]);lon=numeric(point[1]);
    }
    const current=plainText(tag(block,'gdacs:iscurrent'),10).toLowerCase();
    if(current!=='true'){rejected.not_current++;continue}
    const level=plainText(tag(block,'gdacs:alertlevel'),12).toLowerCase();
    if(!TYPES.includes(type)||!/^\d{1,20}$/.test(id)||!published||!modified||!eventAt||!link||!title||
      !Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||
      !['green','orange','red'].includes(level)){rejected.invalid++;continue}
    if(published>known||modified>known||eventAt>known){rejected.future++;continue}
    const key=type+'-'+id,content={id:key,event_type:type,title,country,latitude:lat,longitude:lon,
      location_kind:'alert_reference_point',alert_level:level,event_at:eventAt,
      published_at:published,modified_at:modified,url:link};
    const event={...content,known_at:known,version_sha256:hash(JSON.stringify(content))};
    const previous=events.get(key);
    if(!previous||event.modified_at>previous.modified_at||
      (event.modified_at===previous.modified_at&&event.version_sha256>previous.version_sha256))events.set(key,event);
  }
  const alerts=[...events.values()].sort((a,b)=>a.id.localeCompare(b.id)),n=alerts.length;
  need(n>0||!(rejected.invalid+rejected.future),'GDACS no tiene alertas válidas; no se infiere un total cero');
  const make=(name,value,unit='count')=>observation({id:'gdacs-'+name+'-'+known,
    domain:'noticias_geolocalizadas',variable:'gdacs_'+name,value,unit,
    observed_at:known,known_at:known,source_url:url});
  const observations=[make('current_alerts',n),...['green','orange','red'].map(level=>
    make(level+'_alerts',alerts.filter(x=>x.alert_level===level).length)),
    ...TYPES.map(type=>make(type.toLowerCase()+'_alerts',alerts.filter(x=>x.event_type===type).length))];
  if(n)observations.push(make('north_share',alerts.filter(x=>x.latitude>=0).length/n,'ratio'),
    make('east_share',alerts.filter(x=>x.longitude>=0).length/n,'ratio'));
  return {observations,alerts,feed_published_at:feedTime,total_items:blocks.length,rejected,
    coverage:['natural_disaster_alerts'],geography_semantics:'Puntos de referencia de alertas de GDACS; no país de la fuente periodística.'};
}
export async function fetchGdacs({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=20000,archiveResponse}={}){
  try{
    const response=await fetchImpl(GDACS_URL,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
      headers:{Accept:'application/rss+xml, application/xml','User-Agent':'LaPlaceDIG-U003/1.1'}});
    need(response.ok,'HTTP '+response.status);
    const reader=response.body?.getReader(),chunks=[];let bytes=0,text;
    if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
      need(bytes<=4*1024*1024,'GDACS excede 4 MiB');chunks.push(Buffer.from(value))}}
      catch(error){await reader.cancel().catch(()=>{});throw error}text=Buffer.concat(chunks).toString('utf8');
    }else text=await response.text();
    const received=utcTime(now()),data=parseGdacs(text,{capturedAt:received}),bodyHash=hash(text);
    const archive=archiveResponse?await archiveResponse({source:'GDACS',url:GDACS_URL,
      received_at:received,body_sha256:bodyHash,text}):null;
    return {captured_at:received,...data,sources:[{name:'GDACS-official-alerts',status:'observed',
      signals:data.observations.length,url:GDACS_URL,primary_source:true,body_sha256:bodyHash,
      received_at:received,feed_published_at:data.feed_published_at,coverage:data.coverage,
      alert_count:data.alerts.length,raw_response_archived:Boolean(archive),archive_ref:archive??null,
      attribution:'GDACS / European Commission JRC / United Nations'}]};
  }catch(error){return {captured_at:utcTime(now()),observations:[],alerts:[],sources:[{
    name:'GDACS-official-alerts',status:'unavailable',signals:0,url:GDACS_URL,
    reason:String(error.message).slice(0,180),coverage:['natural_disaster_alerts']}]}}
}
