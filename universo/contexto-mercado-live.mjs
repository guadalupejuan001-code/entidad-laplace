/* Transporte Node equivalente al puente Android C04. Sólo lectura pública. */
import {createHash} from 'node:crypto';
import {CRYPTO_CONTEXT_ASSETS,MARKET_ROOT} from './microestructura-medidas.mjs';
export async function capturarContextoMercadoC04(asset,{fetchImpl=fetch,
  now=()=>new Date().toISOString(),timeoutMs=10000}={}){
  if(!CRYPTO_CONTEXT_ASSETS.includes(asset))throw Error('C04: activo no permitido');
  const components={};
  for(const name of ['ticker','book','trades']){
    const source_url=MARKET_ROOT+asset+'/'+(name==='book'?'book?level=2':name);
    try{
      const response=await fetchImpl(source_url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
        headers:{Accept:'application/json','User-Agent':'EntidadLaplace-C04/public-market-research'}});
      if(!response.ok)throw Error('HTTP '+response.status);
      const bytes=new Uint8Array(await response.arrayBuffer());
      const limit=name==='book'?2*1024*1024:name==='trades'?256*1024:64*1024;
      if(bytes.length>limit)throw Error('Respuesta demasiado grande');
      const received_at=now(),raw_sha256=createHash('sha256').update(bytes).digest('hex');
      let data=JSON.parse(new TextDecoder().decode(bytes)),source_level_counts;
      if(name==='book'){
        source_level_counts={bids:data.bids.length,asks:data.asks.length};
        data={sequence:data.sequence,bids:data.bids.slice(0,10),asks:data.asks.slice(0,10)};
      }
      components[name]={status:'observed',source_url,received_at,raw_sha256,data,
        ...(source_level_counts?{source_level_counts}:{})};
    }catch(error){
      if(name==='ticker')throw error;
      components[name]={status:'unavailable',source_url,error:'No se pudo obtener '+name};
    }
  }
  return {schema:'laplace-market-context-c04-v1',asset,captured_at:now(),components};
}
