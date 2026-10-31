/* I001: durable input contract. Source bytes and exact decimals stay on the host.
 * No market prediction, training or change to the original XI runtime here. */
import {createHash,randomUUID} from 'node:crypto';
import {parse} from 'lossless-json';
import {utcTime} from '../universo/estados.mjs';

export const RAW_SCHEMA='laplace.input.raw.i001';
export const EVENT_SCHEMA='laplace.input.event.i001';
export const MAX_BODY=2*1024*1024;
export const need=(ok,message)=>{if(!ok)throw new Error(message)};
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  need(value!==undefined&&typeof value!=='bigint','JSON contains an unsupported value');
  if(typeof value==='number')need(Number.isFinite(value),'nonfinite number');
  return JSON.stringify(value);
}
export const exactJSON=text=>parse(text,undefined,number=>number);
export function identifier(value,label='identifier',max=240){
  need(typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f]/.test(value),label+' invalid');
  return value;
}
export function decimal(value){
  need(typeof value==='string'&&/^-?(?:0|[1-9]\d{0,99})(?:\.\d{1,40})?$/.test(value),'exact decimal string required');
  return value;
}
export function units(value,scale){
  decimal(value);need(Number.isInteger(scale)&&scale>=0&&scale<=40,'invalid decimal scale');
  const negative=value.startsWith('-'),[whole,part='']=value.replace(/^-/,'').split('.');
  need(part.length<=scale,'fraction exceeds asset precision');
  return (negative?-1n:1n)*BigInt(whole+part.padEnd(scale,'0'));
}
export function safeInteger(value){
  const s=String(value);need(/^(?:0|[1-9]\d*)$/.test(s),'unsigned integer required');
  const n=Number(s);need(Number.isSafeInteger(n),'integer exceeds safe control range');return n;
}
export function sourceURL(value){
  const u=new URL(value);need(u.protocol==='https:'&&!u.username&&!u.password,'public evidence URL must use HTTPS without credentials');
  need(u.toString().length<=2048,'source URL too long');return u.toString();
}
export function rawRecord(source,body,{received_at=new Date().toISOString(),native_id=null,revision=null,
  source_sequence=null,content_type='application/json',metadata={}}={}){
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
  need(bytes.length>0&&bytes.length<=MAX_BODY,'body outside input budget');
  identifier(source.id,'source id',100);identifier(source.adapter,'adapter',80);
  identifier(source.stream_key??source.id,'stream key');
  need(Buffer.byteLength(stable(metadata))<=16384,'metadata too large');
  return {schema:RAW_SCHEMA,delivery_id:randomUUID(),source_id:source.id,
    adapter:source.adapter,adapter_version:'i001.2',stream_key:source.stream_key??source.id,
    source_url:sourceURL(source.evidence_url??source.url),received_at:utcTime(received_at),
    native_id:native_id===null?null:identifier(String(native_id)),revision:revision===null?null:identifier(String(revision)),
    source_sequence:source_sequence===null?null:identifier(String(source_sequence)),
    content_type,raw_sha256:sha(bytes),body_base64:bytes.toString('base64'),metadata:{
      source_kind:source.source_kind??'unknown',origin_id:source.origin_id??new URL(source.evidence_url??source.url).hostname,...metadata}};
}
export function validateRaw(raw){
  need(raw?.schema===RAW_SCHEMA,'invalid raw schema');
  identifier(raw.delivery_id);identifier(raw.source_id);identifier(raw.adapter);identifier(raw.stream_key);
  utcTime(raw.received_at);sourceURL(raw.source_url);
  need(typeof raw.body_base64==='string'&&raw.body_base64.length<=Math.ceil(MAX_BODY/3)*4,'raw body exceeds limit');
  const bytes=Buffer.from(raw.body_base64,'base64');
  need(bytes.length>0&&bytes.toString('base64')===raw.body_base64&&sha(bytes)===raw.raw_sha256,'raw bytes/hash mismatch');
  return bytes;
}
export function event(raw,{native_id,revision='0',type,subject,event_time=null,published_at=null,payload,quality={}}){
  identifier(native_id,'native id',500);identifier(revision,'revision');identifier(type);identifier(subject);
  const known=utcTime(raw.received_at),when=event_time===null?null:utcTime(event_time);
  const published=published_at===null?null:utcTime(published_at);
  // Provider clock mistakes are isolated, never silently backdated.
  need((when===null||when<=known)&&(published===null||published<=known),'source timestamp after receipt');
  need(payload&&typeof payload==='object'&&!Array.isArray(payload),'event payload required');
  const event_key=sha(stable([raw.source_id,String(native_id),String(revision)]));
  const semantic={source_id:raw.source_id,native_id:String(native_id),revision:String(revision),type,subject,
    event_time:when,published_at:published,payload};
  return {schema:EVENT_SCHEMA,event_key,semantic_sha256:sha(stable(semantic)),...semantic,
    stream_key:raw.stream_key,source_url:raw.source_url,received_at:known,known_at:known,
    raw_sha256:raw.raw_sha256,delivery_id:raw.delivery_id,source_sequence:raw.source_sequence,
    quality:{integrity:'validated',truth:'source_assertion',source_kind:raw.metadata?.source_kind??'unknown',origin_id:raw.metadata?.origin_id??new URL(raw.source_url).hostname,...quality}};
}
export function validateEvent(e){
  need(e?.schema===EVENT_SCHEMA,'invalid event schema');
  need(/^[a-f0-9]{64}$/.test(e.event_key)&&/^[a-f0-9]{64}$/.test(e.semantic_sha256),'invalid event hashes');
  identifier(e.type);identifier(e.subject);sourceURL(e.source_url);utcTime(e.known_at);utcTime(e.received_at);
  need(e.known_at>=e.received_at,'event cannot predate receipt');
  const semantic=Object.fromEntries(['source_id','native_id','revision','type','subject','event_time','published_at','payload'].map(k=>[k,e[k]]));
  need(sha(stable(semantic))===e.semantic_sha256&&sha(stable([e.source_id,e.native_id,e.revision]))===e.event_key,'event semantics altered');
  need(Buffer.byteLength(stable(e))<=MAX_BODY*2,'event exceeds limit');return e;
}
