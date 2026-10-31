/* Small, declared historical sample. Never download today's article text and
 * pretend it is the original version. Market vintages remain unverified. */
import {inflateRawSync} from 'node:zlib';
import {canonicalLedger,timestamp,ledgerHash} from '../historia/contrato.mjs';
import {digest} from '../inteligencia/laplace.mjs';
import {decimal} from './agente.mjs';

const DAY=86400000,need=(ok,message)=>{if(!ok)throw Error(message)};
export const HISTORY_VERSION='laplace-bitcoin-history-v1';
export const HISTORY_POLICY=Object.freeze({
  sample:'one GDELT 00:00 UTC export per day; at most two events per mapped theme',
  archive_delay_hours:24,article_bodies_fetched:false,region:'GLOBAL',
  price_availability:'download_capture_time; original historical candle vintages unavailable',
  narrative_availability:'max(DATEADDED + 24h, HTTP Last-Modified)',
  codebook:'https://data.gdeltproject.org/documentation/CAMEO.Manual.1.1b3.pdf',
  format:'https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf',
  proxies:{CONFLICT_ESCALATION:'CAMEO 19/20 indicates reported fighting/mass violence, not a measured increase',
    AID_BLOCKED:'CAMEO 1623 indicates reduced/stopped assistance, not necessarily a physical blockade'}
});
function compactTime(raw){
  need(/^\d{14}$/.test(raw),'DATEADDED invalido');
  return timestamp(raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)+'T'+raw.slice(8,10)+':'+raw.slice(10,12)+':'+raw.slice(12,14)+'Z');
}
export function unzipSingle(bytes,expectedName){
  const b=Buffer.from(bytes);need(b.length>=30&&b.length<=2*1024*1024&&b.readUInt32LE(0)===0x04034b50,'ZIP invalido');
  const flags=b.readUInt16LE(6),method=b.readUInt16LE(8),size=b.readUInt32LE(18),rawSize=b.readUInt32LE(22);
  const nameLength=b.readUInt16LE(26),extraLength=b.readUInt16LE(28),offset=30+nameLength+extraLength;
  need(!(flags&9)&&method===8&&size>0&&rawSize<=8*1024*1024&&offset+size<=b.length,'ZIP fuera de limites');
  need(b.subarray(30,30+nameLength).toString()===expectedName,'nombre ZIP inesperado');
  const out=inflateRawSync(b.subarray(offset,offset+size),{maxOutputLength:8*1024*1024});
  need(out.length===rawSize,'tamano ZIP inconsistente');return out.toString('utf8');
}
export function cameoTheme(code,root){
  if(['073','0863'].includes(code))return ['humanitaria','RELIEF_ACCESS'];
  if(code==='1623')return ['humanitaria','AID_BLOCKED'];
  if(code==='0871')return ['geopolitica','CEASEFIRE'];
  if(code==='163')return ['geopolitica','SANCTIONS'];
  if(root==='05')return ['geopolitica','DIPLOMATIC_COOPERATION'];
  if(['19','20'].includes(root))return ['geopolitica','CONFLICT_ESCALATION'];
  return null;
}
export function archiveFacts(tsv,{lastModified,capturedAt,slot}){
  const capture=timestamp(capturedAt),modified=new Date(lastModified).toISOString(),at=timestamp(slot);
  need(modified<=capture,'archivo modificado despues de la captura');
  const counts=new Map(),records=[];let rows=0,matched=0,invalid=0;
  for(const line of tsv.trim().split(/\r?\n/)){
    if(!line)continue;const c=line.split('\t');rows++;
    if(c.length!==61){invalid++;continue}
    const mapped=cameoTheme(c[26],c[28]);if(!mapped)continue;matched++;
    if((counts.get(mapped[1])??0)>=2)continue;
    let url;try{url=new URL(c[60])}catch{invalid++;continue}
    if(url.protocol!=='https:'||url.username||url.password||url.toString().length>1024){invalid++;continue}
    let added;try{added=compactTime(c[59])}catch{invalid++;continue}
    if(added!==at||!/^\d+$/.test(c[0])){invalid++;continue}
    const known=new Date(Math.max(Date.parse(added)+DAY,Date.parse(modified))).toISOString();
    if(known>capture){invalid++;continue}
    counts.set(mapped[1],(counts.get(mapped[1])??0)+1);
    records.push({id:'gdelt-archive-'+c[0],kind:mapped[0],event_code:mapped[1],region:'GLOBAL',
      summary:'GDELT archived event '+c[0]+'; CAMEO '+c[26]+'; event day '+c[1]+'. Structured annotation, not independently verified.',
      observed_at:added,known_at:known,source_url:url.toString()});
  }
  return {records,rows,matched,invalid,selected:records.length};
}
// The endpoint's decimals are parsed lexically, without a float round trip.
export function candleFacts(raw,{sourceUrl,capturedAt,start,end}){
  const capture=timestamp(capturedAt),begin=timestamp(start),until=timestamp(end);
  const parsed=JSON.parse(raw);need(Array.isArray(parsed)&&parsed.length<=300,'velas invalidas');
  need(parsed.every(row=>Array.isArray(row)&&row.length===6&&row.every(value=>typeof value==='number'&&Number.isFinite(value))),
    'esquema de velas invalido');
  const tokens=[...raw.matchAll(/\[\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g)];
  need(tokens.length===parsed.length,'formato decimal de velas no admitido');
  const records=[],seen=new Set();
  for(const token of tokens){
    const time=Number(token[1]);need(Number.isSafeInteger(time)&&time%86400===0,'vela fuera del corte diario');
    const closeAt=new Date(time*1000+DAY).toISOString();
    if(closeAt<begin||closeAt>until||closeAt>capture)continue;
    const value=decimal(token[5]);need(!seen.has(closeAt),'vela duplicada');seen.add(closeAt);
    records.push({id:'coinbase-close-'+time,kind:'precio',asset:'BTC-USD',currency:'USD',price_basis:'raw_close',
      value,observed_at:closeAt,known_at:capture,source_url:sourceUrl});
  }
  return records;
}
async function download(url,maxBytes,fetchImpl){
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LaplaceBitcoin historical research'},cache:'no-store'});
  need(response.ok,'HTTP '+response.status);
  const reader=response.body?.getReader();need(reader,'respuesta vacia');
  const chunks=[];let length=0;
  for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;
    if(length>maxBytes){await reader.cancel();throw Error('descarga fuera de limites')};chunks.push(Buffer.from(part.value))}
  return {bytes:Buffer.concat(chunks),lastModified:response.headers.get('last-modified'),capturedAt:new Date().toISOString()};
}
export async function downloadHistory({start,end,fetchImpl=fetch,onProgress=()=>{}}){
  const begin=timestamp(start),until=timestamp(end),days=(Date.parse(until)-Date.parse(begin))/DAY;
  need(Number.isInteger(days)&&days>=51&&days<=180,'historia: 51..180 dias completos');
  need(begin.endsWith('T00:00:00.000Z')&&until.endsWith('T00:00:00.000Z')&&until<new Date().toISOString(),'cortes diarios pasados requeridos');
  const url=new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles');
  url.searchParams.set('granularity','86400');url.searchParams.set('start',new Date(Date.parse(begin)-DAY).toISOString());url.searchParams.set('end',until);
  const price=await download(url.toString(),1024*1024,fetchImpl);
  const records=candleFacts(price.bytes.toString(),{sourceUrl:url.toString(),capturedAt:price.capturedAt,start:begin,end:until});
  const archives=[],slots=[];
  for(let time=Date.parse(begin)-2*DAY;time<Date.parse(until)-DAY;time+=DAY)slots.push(new Date(time).toISOString());
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<slots.length){const slot=slots[next++],stamp=slot.replace(/[-:TZ.]/g,'').slice(0,14);
      const name=stamp+'.export.CSV',sourceUrl='https://data.gdeltproject.org/gdeltv2/'+name+'.zip';
      try{
        const data=await download(sourceUrl,2*1024*1024,fetchImpl);
        need(data.lastModified,'archivo sin Last-Modified');
        const result=archiveFacts(unzipSingle(data.bytes,name),{...data,slot});records.push(...result.records);
        const {records:ignored,...counts}=result;
        archives.push({slot,url:sourceUrl,status:'ok',sha256:digest(data.bytes),last_modified:data.lastModified,captured_at:data.capturedAt,...counts});
      }catch(error){archives.push({slot,url:sourceUrl,status:'error',error:error.message})}
      onProgress({complete:archives.length,total:slots.length});
    }
  }));
  const unique=new Map();for(const fact of records)if(!unique.has(fact.id))unique.set(fact.id,fact);
  const ledger=canonicalLedger([...unique.values()]);
  return {schema:HISTORY_VERSION,downloaded_at:new Date().toISOString(),start:begin,end:until,synthetic:false,
    policy:HISTORY_POLICY,price_source:{url:url.toString(),sha256:digest(price.bytes),captured_at:price.capturedAt,original_vintages_verified:false},
    archives:archives.sort((a,b)=>a.slot.localeCompare(b.slot)),records:ledger,ledger_sha256:ledgerHash(ledger)};
}
