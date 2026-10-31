/* F001: extracción pública Coinbase por resoluciones, con concurrencia limitada.
 * 5 min / 14 días, 1 hora / 45 días, 1 día / 1.000 días.
 * No confundir "fetch paralelo" con CPU multihilo ni acceso L3/licenciado.
 */
import {HISTORIA_REQUERIDA,adquirirEnParalelo} from './fusion-temporal.mjs';
import {fetchQuote} from '../bitcoin/agente.mjs';
import {observeWorldU003} from '../universo/global-u003.mjs';
const ROOT='https://api.exchange.coinbase.com/products/BTC-USD/candles';
const need=(x,m)=>{if(!x)throw Error(m)};
const iso=t=>new Date(t).toISOString();
export function ventanas({granularity,asOf}){
  const spec=HISTORIA_REQUERIDA[granularity],cut=Date.parse(asOf);
  need(spec&&Number.isFinite(cut),'Resolución o corte incorrectos');
  const end=Math.floor(cut/(granularity*1000))*granularity*1000;
  const start=end-spec.days*86400000,step=spec.chunkDays*86400000;
  const out=[];for(let from=start;from<end;from+=step)
    out.push({start:from,end:Math.min(from+step,end),granularity});
  need(out.length<=100,'Demasiadas ventanas');
  need(out.every(x=>(x.end-x.start)/(granularity*1000)<=300),'Coinbase: límite 300 velas');
  return out;
}
async function bounded(url,{fetchImpl,timeoutMs=12000}){
  const response=await fetchImpl(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-F001/1.0'}});
  need(response.ok,'HTTP '+response.status+' en velas BTC');
  need(Number(response.headers?.get('content-length')??0)<=524288,'Respuesta demasiado grande');
  if(!response.body?.getReader){
    const raw=await response.text();need(raw.length<=524288,'Respuesta excesiva');
    return JSON.parse(raw);
  }
  let bytes=0;const chunks=[],reader=response.body.getReader();
  try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;
      need(bytes<=524288,'Respuesta excesiva');chunks.push(r.value);}}
  catch(error){await reader.cancel();throw error}
  const blob=new Uint8Array(bytes);let offset=0;
  for(const c of chunks){blob.set(c,offset);offset+=c.length}
  return JSON.parse(new TextDecoder().decode(blob));
}
async function ask(window,{fetchImpl,timeoutMs}){
  const url=new URL(ROOT);
  url.searchParams.set('start',iso(window.start));
  url.searchParams.set('end',iso(window.end));
  url.searchParams.set('granularity',String(window.granularity));
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{return await bounded(url.toString(),{fetchImpl,timeoutMs})}
    catch(error){
      last=error;
      if(!/HTTP (429|502|503)\b/.test(String(error.message))||attempt===2)throw error;
      await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
    }
  }
  throw last;
}
export async function descargarVelasParalelas({granularity,asOf,fetchImpl=fetch,timeoutMs=12000,workers=2}){
  need(Number.isInteger(workers)&&workers>=1&&workers<=4,'Concurrencia fuera de presupuesto');
  const items=ventanas({granularity,asOf}),data=Array(items.length),cursor={i:0};
  async function run(){
    for(;;){
      const i=cursor.i++;if(i>=items.length)break;
      const w=items[i],raw=await ask(w,{fetchImpl,timeoutMs});
      need(Array.isArray(raw)&&raw.length<=300,'La fuente devolvió más de 300 velas');
      data[i]=raw.filter(row=>Array.isArray(row)&&Number.isInteger(row[0])&&
        row[0]*1000>=w.start&&(row[0]+granularity)*1000<=w.end);
    }
  }
  await Promise.all(Array.from({length:Math.min(workers,items.length)},run));
  return data.flat();
}
export async function ejecutarFusionEnVivo({fetchImpl=fetch,now=()=>new Date().toISOString(),
  includeWorld=true,worldCollector,timeoutMs=12000}={}){
  // Las cinco tareas se lanzan antes de esperar cualquiera de ellas.
  const sourceTime=now();
  return adquirirEnParalelo({
    quote:()=>fetchQuote({fetchImpl,now,timeoutMs}),
    bars_300:()=>descargarVelasParalelas({granularity:300,asOf:sourceTime,fetchImpl,timeoutMs}),
    bars_3600:()=>descargarVelasParalelas({granularity:3600,asOf:sourceTime,fetchImpl,timeoutMs}),
    bars_86400:()=>descargarVelasParalelas({granularity:86400,asOf:sourceTime,fetchImpl,timeoutMs}),
    world:()=>includeWorld?(worldCollector?worldCollector():observeWorldU003({fetchImpl,now,timeoutMs})):null
  },{now});
}
