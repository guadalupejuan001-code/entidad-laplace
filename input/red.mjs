import {fetch as undiciFetch,EnvHttpProxyAgent} from 'undici';
import WebSocket from 'ws';
import {HttpsProxyAgent} from 'https-proxy-agent';
import {randomInt} from 'node:crypto';
import {need,MAX_BODY,rawRecord,exactJSON} from './contrato.mjs';

let dispatcher;
export function endpoint(value,{websocket=false}={}){
  const u=new URL(value),local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  need(!u.username&&!u.password,'put credentials in environment headers, not URLs');
  need(websocket?(u.protocol==='wss:'||(local&&u.protocol==='ws:')):(u.protocol==='https:'||(local&&u.protocol==='http:')),'transport requires TLS outside loopback');
  return u;
}
export async function request(url,{headers={},body,method='GET',timeoutMs=15000,maxBytes=MAX_BODY,fetchImpl}={}){
  endpoint(url);if(!dispatcher)dispatcher=new EnvHttpProxyAgent();
  const response=await (fetchImpl??undiciFetch)(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(timeoutMs),dispatcher});
  if(response.status===304)return {status:304,headers:response.headers,bytes:null};
  if(!response.ok){await response.body?.cancel();const e=Error('upstream HTTP '+response.status);e.status=response.status;
    const h=response.headers.get('retry-after');e.retryMs=h?(Number.isFinite(Number(h))?Number(h)*1000:Math.max(0,Date.parse(h)-Date.now())):null;throw e}
  const reader=response.body?.getReader();need(reader,'empty upstream response');let size=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;need(size<=maxBytes,'upstream body exceeds limit');chunks.push(Buffer.from(value))}}
  catch(e){await reader.cancel();throw e}
  return {status:response.status,headers:response.headers,bytes:Buffer.concat(chunks)};
}
export function sourceHeaders(source){
  const headers={Accept:'application/json, application/rss+xml, application/atom+xml, text/html',...source.headers};
  for(const [name,variable] of Object.entries(source.headers_env??{})){need(process.env[variable],'missing credential environment variable '+variable);headers[name]=process.env[variable]}
  return headers;
}
export function delay(ms,signal){return new Promise(resolve=>{
  if(signal?.aborted)return resolve();const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()};
  const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});
})}
export class Supervisor{
  constructor({status=async()=>{},signal}={}){this.report=status;this.signal=signal;this.states=new Map()}
  async run(source,iteration){
    let failures=0;while(!this.signal?.aborted){
      const started=Date.now();
      try{await iteration();if(failures)await this.report(source,{state:'recovered',previous_failures:failures});failures=0;
        this.states.set(source.id,{state:'healthy',last_success_at:new Date().toISOString()});
        await delay(Math.max(0,(source.interval_ms??10000)-(Date.now()-started)),this.signal);
      }catch(error){
        failures++;const wait=Math.min(60000,Math.max(error.retryMs??0,250*2**Math.min(failures,7)))+randomInt(0,200);
        const state={state:failures>=5?'circuit_open':'retrying',failures,code:String(error.code??error.status??error.name),retry_ms:wait};
        this.states.set(source.id,state);try{await this.report(source,state)}catch{/* The WAL's health endpoint also exposes backpressure. */}
        await delay(wait,this.signal);
      }
    }
  }
}
export async function pollSource(source,admit,{fetchImpl,state={}}={}){
  const headers=sourceHeaders(source);if(state.etag)headers['If-None-Match']=state.etag;if(state.modified)headers['If-Modified-Since']=state.modified;
  const res=await request(source.url,{headers,fetchImpl,timeoutMs:source.timeout_ms??15000});
  if(res.status===304)return {not_modified:true};
  const record=await admit(source,res.bytes,{content_type:res.headers.get('content-type')??'application/octet-stream',metadata:{product:source.product??null,title:source.title??null}});
  // Never advance HTTP validators until durable admission has succeeded.
  state.etag=res.headers.get('etag');state.modified=res.headers.get('last-modified');return record;
}
function proxyFor(url){
  const u=new URL(url),no=(process.env.NO_PROXY??process.env.no_proxy??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(no.some(s=>s==='*'||u.hostname.toLowerCase()===s.replace(/^\./,'')||u.hostname.toLowerCase().endsWith(s.startsWith('.')?s:'.'+s)))return null;
  return process.env.HTTPS_PROXY??process.env.https_proxy??process.env.HTTP_PROXY??process.env.http_proxy;
}
export function websocket(url,options={}){
  endpoint(url,{websocket:true});const proxy=proxyFor(url);
  return new WebSocket(url,{maxPayload:MAX_BODY,handshakeTimeout:15000,...options,...(proxy?{agent:new HttpsProxyAgent(proxy)}:{})});
}
export async function coinbaseSocket(source,admit,{signal,report=async()=>{},socketFactory=websocket,fetchImpl}={}){
  need(Array.isArray(source.products)&&source.products.length>0,'Coinbase product list required');
  // Ticker recovery is a latest-state snapshot. No promise of replaying every trade.
  for(const product of source.products){
    const url='https://api.exchange.coinbase.com/products/'+encodeURIComponent(product)+'/ticker';
    const r=await request(url,{fetchImpl});await admit(source,r.bytes,{metadata:{product,recovery:'rest_snapshot_after_reconnect'}});
  }
  await report(source,{state:'connected',coverage:'ticker_latest_state',missed_updates_recoverable:false});
  return new Promise((resolve,reject)=>{
    const ws=socketFactory(source.url),queue=[];let busy=false,stopped=false,last=Date.now();
    const finish=e=>{if(stopped)return;stopped=true;clearInterval(timer);signal?.removeEventListener('abort',abort);if(e)reject(e);else resolve()};
    const abort=()=>{ws.terminate();finish()};
    const drain=async()=>{
      if(busy||stopped)return;busy=true;
      try{while(queue.length){const batch=queue.splice(0,64);await Promise.all(batch.map(item=>admit(source,item.body,{received_at:item.received_at})));if(queue.length<64)ws.resume()}}
      catch(e){ws.terminate();finish(e)}finally{busy=false}
    };
    const timer=setInterval(()=>{if(Date.now()-last>45000){ws.terminate();finish(Error('WebSocket heartbeat expired'))}},10000);
    ws.on('open',()=>ws.send(JSON.stringify({type:'subscribe',product_ids:source.products,channels:['ticker','heartbeat']})));
    ws.on('message',body=>{
      last=Date.now();let p;try{p=exactJSON(body.toString())}catch{p=null}
      if(p?.type==='error'){ws.terminate();finish(Error('WebSocket subscription rejected'));return}
      if(p&&p.type!=='ticker')return;
      if(queue.length>=256){ws.terminate();finish(Object.assign(Error('WebSocket source queue full; reconnect snapshot required'),{code:'INPUT_BACKPRESSURE'}));return}
      queue.push({body:Buffer.from(body),received_at:new Date().toISOString()});if(queue.length>=128)ws.pause();void drain();
    });
    ws.on('error',e=>finish(e));ws.on('close',()=>{void (async()=>{
      // Previously captured messages must finish admission before reconnect.
      while(busy)await delay(5);if(stopped)return;
      try{await report(source,{state:'disconnected',sequence_complete:false,recovery:'latest_snapshot_only'})}catch{}
      finish(signal?.aborted?undefined:Error('WebSocket disconnected'));
    })()});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
}
