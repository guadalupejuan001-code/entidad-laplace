/* LAPLACE 3.2: estado del flujo público Coinbase. Sin red ni cuentas.
 * Mismo contrato en Android WebView y pruebas Node. Heartbeat ≠ precio.
 */
(function(root){
'use strict';
const ASSETS=Object.freeze(['BTC-USD','ETH-USD','SOL-USD']);
const STATES=Object.freeze(['connecting','subscribing','live','retrying','off','paused']);
function finite(value){return typeof value==='number'&&Number.isFinite(value)}
function createTracker(){
  const last=new Map(),samples=new Map(ASSETS.map(x=>[x,[]]));
  let status='connecting',message='Iniciando WebSocket',retrySeconds=0,updates=0,
    lastEvent=0,connectedAt=0;
  function statusUpdate(event,now=Date.now()){
    if(!event||event.type!=='status'||!STATES.includes(event.state))return false;
    status=event.state;
    message=String(event.message||'Estado de WebSocket').slice(0,160);
    retrySeconds=Number.isInteger(event.retrySeconds)&&event.retrySeconds>=0?
      event.retrySeconds:0;
    lastEvent=now;
    if(status==='live')connectedAt=now;
    return true;
  }
  function acceptTicker(data,now=Date.now()){
    if(!data||data.type!=='ticker'||!ASSETS.includes(data.asset))return false;
    const price=Number(data.price),seq=Number(data.sequence);
    const observed=Date.parse(data.time),received=Number(data.receivedAt);
    if(!finite(price)||price<=0||price>1e10||
      !Number.isSafeInteger(seq)||seq<0||
      !Number.isFinite(observed)||!Number.isFinite(received)||
      observed>now+30_000||received>now+30_000||
      now-observed>600_000||now-received>60_000||
      Math.abs(observed-Number(data.observedAt))>1500)return false;
    const prior=last.get(data.asset);
    if(prior&&(seq<=prior.sequence||observed<prior.observedAt))return false;
    const quote={asset:data.asset,price,sequence:seq,
      observedAt:observed,time:data.time,receivedAt:received,
      source:'Coinbase Exchange · WebSocket ticker público',isLive:true};
    last.set(data.asset,quote);updates++;lastEvent=now;
    const arr=samples.get(data.asset);
    arr.push({price,at:observed});
    if(arr.length>80)arr.splice(0,arr.length-80);
    return true;
  }
  return {
    statusUpdate,acceptTicker,
    quote(asset){return last.get(asset)||null},
    points(asset){return (samples.get(asset)||[]).slice()},
    isFresh(asset,now=Date.now(),ttl=60000){
      const q=last.get(asset);
      return !!q&&status==='live'&&now-q.receivedAt<=ttl&&
        now-q.observedAt<=Math.max(ttl,90000);
    },
    snapshot(){
      return {status,message,retrySeconds,updates,lastEvent,connectedAt,
        assetsWithTicks:last.size};
    }
  };
}
const exported={ASSETS,STATES,createTracker};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
root.LaplaceLiveMath=exported;
})(typeof window!=='undefined'?window:globalThis);
