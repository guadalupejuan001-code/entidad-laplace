import {createHash} from 'node:crypto';
import {utcTime} from '../estados.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message)};
export async function sourceText(name,url,{fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=20000,
  maxBytes=4*1024*1024,archiveResponse}={}){
  let received=null,bodyHash=null,archive=null,attempts=0;
  try{
    let response;
    for(;attempts<2;){
      attempts++;
      try{response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
        headers:{Accept:'application/json, text/csv','User-Agent':'LaPlaceDIG-U004/1.0'}})}
      catch(error){if(attempts>=2)throw error;await new Promise(ok=>setTimeout(ok,250));continue}
      if(response.ok||![429,502,503,504].includes(response.status)||attempts>=2)break;
      await response.body?.cancel?.().catch(()=>{});
      await new Promise(ok=>setTimeout(ok,250));
    }
    need(response.ok,'HTTP '+response.status);
    const reader=response.body?.getReader(),chunks=[];let size=0,text;
    if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      need(size<=maxBytes,'respuesta excede el presupuesto de bytes');chunks.push(Buffer.from(value))}}
      catch(error){await reader.cancel().catch(()=>{});throw error}text=Buffer.concat(chunks).toString('utf8');
    }else{text=await response.text();need(Buffer.byteLength(text)<=maxBytes,'respuesta excesiva')}
    received=utcTime(now());bodyHash=createHash('sha256').update(text).digest('hex');
    archive=archiveResponse?await archiveResponse({name,url,received_at:received,body_sha256:bodyHash,text}):null;
    return {ok:true,text,source:{name,url,status:'received',received_at:received,body_sha256:bodyHash,attempts,
      raw_response_archived:Boolean(archive),archive_ref:archive??null}};
  }catch(error){return {ok:false,source:{name,url,status:'unavailable',signals:0,received_at:received,attempts,
    body_sha256:bodyHash,raw_response_archived:Boolean(archive),archive_ref:archive??null,
    reason:String(error.message).slice(0,220)}}}
}
export function sourceFailure(source,error){
  return {...source,status:'unavailable',signals:0,reason:String(error.message).slice(0,220)};
}
