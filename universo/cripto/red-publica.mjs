/* K001 bounded public HTTP: exact allowlist, no addresses, no transactions. */
import {createHash} from 'node:crypto';
import {observation,utcTime} from '../estados.mjs';
import {K001_URLS,K001_LIMITS} from './catalogo-k001.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m)};
export const k001Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const k001Time=utcTime;
export function exactNumber(x,label,{min=0,max=1e20}={}){
  need((typeof x==='number'||typeof x==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(x))&&
    x!==''&&x!==null,nameSafe(label)+' missing/invalid');
  const n=Number(x);need(Number.isFinite(n)&&n>=min&&n<=max,nameSafe(label)+' out of range');
  return n;
}
function nameSafe(s){return String(s).slice(0,50)}
export function k001Observation({id,domain,metric,value,unit,observedAt,knownAt,url}){
  return observation({id,domain,variable:'K001_'+metric,value:exactNumber(value,metric),
    unit,observed_at:utcTime(observedAt),known_at:utcTime(knownAt),source_url:url});
}
export function source({name,url,knownAt,status='observed',signals=0,sha=null,error=null,details={}}){
  return {name,status,url,received_at:utcTime(knownAt),signals,
    body_sha256:sha,missing_is_zero:false,
    error:error===null?null:String(error?.message??error).slice(0,210),...details};
}
function allowed(url,method,body){
  const accepted=Object.values(K001_URLS);
  need(accepted.includes(url),'K001 URL no admitida');
  if(url===K001_URLS.ethereum){
    need(method==='POST'&&typeof body==='string'&&body.length<=170,
      'K001 Ethereum solo JSON-RPC lectura');
    let x;try{x=JSON.parse(body)}catch{}
    need(x&&x.jsonrpc==='2.0'&&Number.isInteger(x.id)&&
      (x.method==='eth_chainId'&&Array.isArray(x.params)&&x.params.length===0||
       x.method==='eth_getBlockByNumber'&&Array.isArray(x.params)&&
       x.params.length===2&&x.params[0]==='finalized'&&x.params[1]===false),
      'K001 Ethereum metodo privado o bloque no finalizado');
    need(Object.keys(x).sort().join(',')==='id,jsonrpc,method,params',
      'K001 Ethereum payload extra prohibido');
  }else need(method==='GET'&&body===null,'K001 solo GET público permitido');
}
export async function readPublic(url,{fetchImpl=fetch,method='GET',body=null,
  timeoutMs=K001_LIMITS.timeoutMs,maxBytes=K001_LIMITS.tvlBytes}={}){
  allowed(url,method,body);
  need(Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=60000,
    'K001 timeout fuera de rango');
  need(Number.isInteger(maxBytes)&&maxBytes>=1000&&maxBytes<=K001_LIMITS.stablecoinsBytes,
    'K001 máximo bytes inválido');
  const response=await fetchImpl(url,{method,redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(timeoutMs),
    headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},
    ...(method==='POST'?{body}:{})});
  need(response?.ok,'K001 HTTP '+(response?.status??'unavailable'));
  const declared=Number(response.headers?.get?.('content-length')??0);
  need(!declared||declared<=maxBytes,'K001 cuerpo declarado excesivo');
  let raw='';
  const reader=response.body?.getReader?.();
  if(reader){
    let count=0;const parts=[];
    try{for(;;){
      const next=await reader.read();if(next.done)break;
      count+=next.value.byteLength;need(count<=maxBytes,'K001 cuerpo excesivo');
      parts.push(Buffer.from(next.value));
    }}catch(error){await reader.cancel().catch(()=>{});throw error}
    raw=Buffer.concat(parts).toString('utf8');
  }else{
    raw=await response.text();need(Buffer.byteLength(raw,'utf8')<=maxBytes,
      'K001 cuerpo excesivo');
  }
  let data;try{data=JSON.parse(raw)}catch{throw Error('K001 JSON inválido')}
  return {data,sha256:k001Hash(raw),bytes:Buffer.byteLength(raw,'utf8')};
}
