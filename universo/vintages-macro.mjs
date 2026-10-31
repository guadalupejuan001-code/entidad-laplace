/* Memoria prospectiva de revisiones macro. Cada cambio se añade con hash
 * encadenado; conocer hoy una cifra revisada no la hace conocida en el pasado. */
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {observation,utcTime,universeSnapshot,verifyUniverseSnapshot} from './estados.mjs';
import {huellaContenido,verificarSelloCaptura} from './integridad.mjs';
import {dateOnly} from './fuentes-oficiales.mjs';
import {EXACT_VINTAGE_SERIES} from './catalogo-u003.mjs';

export const MACRO_JOURNAL='macro-vintages.jsonl';
const ZERO='0'.repeat(64),MAX_BYTES=32*1024*1024,MAX_ENTRIES=65536;
const DOMAINS=new Set(['macro_global','empleo_macro','empleo_alta_frecuencia','tasas_mercado',
  'tasas_bancos_centrales','tasas_oficiales_directas','macro_vintage_dates',
  'posicionamiento_cot','curva_tesoro','liquidez_eeuu']);
const need=(ok,message)=>{if(!ok)throw Error(message)};
function cleanObservation(raw){
  const item=observation(raw),source=new URL(item.source_url);
  need(![...source.searchParams.keys()].some(k=>/^(?:api_?key|token|access_token|client_secret)$/i.test(k)),
    'URL macro contiene credenciales');
  need(DOMAINS.has(item.domain),'dominio no macro');return item;
}
function slot(item){
  return huellaContenido([item.domain,item.variable,item.observed_at,new URL(item.source_url).origin]);
}
function versionFingerprint(item,vintage){
  return huellaContenido({value:item.value,unit:item.unit,provider_vintage_date:vintage.date,
    publication_at:vintage.publication_at});
}
function vintageFor(item,capture){
  const meta=(capture.macro_vintages??[]).find(v=>
    EXACT_VINTAGE_SERIES[v.series]?.name===item.variable&&v.reference_date===item.observed_at.slice(0,10));
  if(!meta)return {date:null,publication_at:null,publication_precision:'unknown',basis:'laplace_capture'};
  dateOnly(meta.vintage_date);need(meta.vintage_date<=capture.at.slice(0,10),'vintage macro futuro');
  const published=meta.publication_at===null||meta.publication_at===undefined?null:utcTime(meta.publication_at);
  if(published){
    need(published<=capture.at&&meta.publication_precision==='second','publicación macro futura o imprecisa');
    need(/^https:\/\//.test(meta.publication_evidence?.source_url??'')&&
      /^[a-f0-9]{64}$/.test(meta.publication_evidence?.body_sha256??''),'publicación exacta sin evidencia');
  }
  return {date:meta.vintage_date,publication_at:published,publication_precision:published?'second':'day',
    basis:'provider_vintage',...(published?{publication_evidence:meta.publication_evidence}:{})};
}
export function verifyMacroJournal(entries){
  need(Array.isArray(entries)&&entries.length<=MAX_ENTRIES,'diario macro demasiado grande');
  let previous=ZERO,lastCapture='';const slots=new Map();
  entries.forEach((entry,index)=>{
    const {entry_sha256,...body}=entry;
    need(entry.schema==='laplace-macro-revision-v1'&&entry.sequence===index+1&&
      entry.previous_sha256===previous&&entry_sha256===huellaContenido(body),'integridad del diario macro inválida');
    const item=cleanObservation(entry.observation),capture=utcTime(entry.captured_at),recorded=utcTime(entry.recorded_at);
    need(item.known_at<=capture&&capture<=recorded&&lastCapture<=capture,'cronología macro inválida');
    need(/^[a-f0-9]{64}$/.test(entry.source_capture_sha256),'captura macro sin huella');
    need(entry.slot===slot(item)&&entry.version_fingerprint===versionFingerprint(item,entry.provider_vintage),
      'identidad de revisión macro inválida');
    const last=slots.get(entry.slot);
    need(entry.revision_index===(last?.revision_index??0)+1,'secuencia de revisión inválida');
    need(!last||last.observation.unit===item.unit,'cambio de unidad macro no comparable');
    need(!last||last.version_fingerprint!==entry.version_fingerprint,'revisión macro duplicada');
    if(entry.provider_vintage.date){dateOnly(entry.provider_vintage.date);
      need(entry.provider_vintage.date<=capture.slice(0,10),'vintage macro futuro')}
    if(entry.provider_vintage.publication_at){
      need(utcTime(entry.provider_vintage.publication_at)<=capture&&
        entry.provider_vintage.publication_precision==='second'&&
        /^[a-f0-9]{64}$/.test(entry.provider_vintage.publication_evidence?.body_sha256??''),
        'publicación exacta no verificada');
    }
    previous=entry_sha256;lastCapture=capture;slots.set(entry.slot,entry);
  });
  return true;
}
export function planMacroCapture(entries,capture,{recordedAt=new Date().toISOString()}={}){
  verifyMacroJournal(entries);verificarSelloCaptura(capture);verifyUniverseSnapshot(capture.universal_state);
  const at=utcTime(capture.at),recorded=utcTime(recordedAt);
  need(at<=recorded&&(!entries.length||at>=entries.at(-1).captured_at),'captura macro fuera de orden o futura');
  need(capture.universal_state.cutoff===at,'corte de captura macro inconsistente');
  const last=new Map(entries.map(entry=>[entry.slot,entry])),next=[...entries],added=[];
  let unchanged=0,newReferences=0,revisions=0;
  for(const raw of capture.universal_state.states.filter(x=>DOMAINS.has(x.domain))){
    const item=cleanObservation(raw);need(item.known_at<=at,'dato macro posterior a su captura');
    const key=slot(item),vintage=vintageFor(item,capture),fingerprint=versionFingerprint(item,vintage),old=last.get(key);
    need(!old||old.observation.unit===item.unit,'cambio de unidad macro no comparable');
    if(old?.version_fingerprint===fingerprint){unchanged++;continue}
    if(old)revisions++;else newReferences++;
    const body={schema:'laplace-macro-revision-v1',sequence:next.length+1,
      previous_sha256:next.at(-1)?.entry_sha256??ZERO,slot:key,revision_index:(old?.revision_index??0)+1,
      version_fingerprint:fingerprint,captured_at:at,recorded_at:recorded,
      source_capture_sha256:capture.capture_sha256,observation:{...item},provider_vintage:vintage};
    const entry={...body,entry_sha256:huellaContenido(body)};
    next.push(entry);added.push(entry);last.set(key,entry);
  }
  need(next.length<=MAX_ENTRIES,'diario macro lleno; archivar sin descartar revisiones');
  return {entries:next,added,summary:{capture_at:at,total_entries:next.length,new_references:newReferences,
    revisions,unchanged,last_entry_sha256:next.at(-1)?.entry_sha256??ZERO,
    exact_historical_release_time_available:false,availability_basis:'captura_conservada_por_laplace'}};
}
export function macroAsOf(entries,cutoff){
  verifyMacroJournal(entries);const at=utcTime(cutoff),latest=new Map();
  for(const entry of entries)if(entry.captured_at<=at&&entry.observation.known_at<=at)latest.set(entry.slot,entry);
  const rows=[...latest.values()].map(entry=>({...entry.observation,
    id:'macro-v'+entry.sequence+'-'+entry.version_fingerprint.slice(0,16),known_at:entry.captured_at}));
  need(rows.length<=4096,'selección macro excede 4096 estados; particionar por período');
  return universeSnapshot(rows,{cutoff:at});
}
export function readMacroJournal(directory){
  const path=join(directory,MACRO_JOURNAL);if(!existsSync(path))return [];
  need(statSync(path).size<=MAX_BYTES,'diario macro supera 32 MiB; archivar sin borrarlo');
  const text=readFileSync(path,'utf8');need(!text||text.endsWith('\n'),'diario macro truncado; no se sobrescribe');
  const entries=text.split('\n').filter(Boolean).map(JSON.parse);verifyMacroJournal(entries);return entries;
}
export function persistMacroCapture(directory,capture,options={}){
  mkdirSync(directory,{recursive:true});const lock=join(directory,'macro-vintages.lock');
  let fd;try{fd=openSync(lock,'wx',0o600)}catch(error){
    if(error.code==='EEXIST')throw Error('Otro proceso conserva el diario macro; no se sobrescribe');throw error}
  let temporary;
  try{
    const entries=readMacroJournal(directory),result=planMacroCapture(entries,capture,options);
    if(result.added.length){
      const text=result.entries.map(entry=>JSON.stringify(entry)).join('\n')+'\n';
      need(Buffer.byteLength(text)<=MAX_BYTES,'diario macro lleno; archivar sin descartar revisiones');
      const path=join(directory,MACRO_JOURNAL);temporary=path+'.'+process.pid+'.temporal';
      const target=openSync(temporary,'wx',0o600);
      try{writeFileSync(target,text);fsyncSync(target)}finally{closeSync(target)}
      renameSync(temporary,path);temporary=null;
    }
    return result.summary;
  }finally{
    if(temporary&&existsSync(temporary))unlinkSync(temporary);
    closeSync(fd);unlinkSync(lock);
  }
}
