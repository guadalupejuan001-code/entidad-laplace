/* D001 — shared, bounded contracts for public derivative market observations.
 * This library never authenticates, submits orders, or infers account identity.
 */
import {createHash} from 'node:crypto';
import {observation,utcTime} from '../estados.mjs';

export const D001_SCHEMA='laplace-derivatives-d001-v1';
export const D001_ROOTS=Object.freeze({
  binance:'https://fapi.binance.com',
  hyperliquid:'https://api.hyperliquid.xyz',
  deribit:'https://www.deribit.com'
});
const need=(ok,message)=>{if(!ok)throw Error(message)};
export const sha256=raw=>createHash('sha256').update(raw).digest('hex');
export const utc=utcTime;
export function number(raw,{name='valor',min=-1e30,max=1e30}={}){
  need((typeof raw==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/.test(raw))||
    (typeof raw==='number'&&Number.isFinite(raw)),name+' no numérico');
  const n=Number(raw);
  need(Number.isFinite(n)&&n>=min&&n<=max,name+' fuera de rango');
  return n;
}
export function timestampMillis(raw,{cutoff,ageMs=300000}={}){
  const at=Date.parse(utc(cutoff));
  need(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>0,'Timestamp de mercado inválido');
  need(raw<=at+1000,'Dato futuro: lectura rechazada');
  need(at-raw<=ageMs,'Dato atrasado: lectura rechazada');
  return new Date(raw).toISOString();
}
export function instrumentId({venue,kind,symbol,settlement,expiry=null,side=null,strike=null}){
  need(Object.hasOwn(D001_ROOTS,venue),'Venue no registrada');
  need(['perpetual','future','option'].includes(kind),'Tipo de contrato no registrado');
  need(typeof symbol==='string'&&/^[A-Za-z0-9_.:/-]{2,80}$/.test(symbol),'Símbolo no registrado');
  need(typeof settlement==='string'&&/^[A-Z0-9]{2,12}$/.test(settlement),'Moneda no válida');
  if(kind==='option'){
    need(typeof expiry==='string'&&Number.isFinite(Date.parse(expiry)),'Vencimiento de opción obligatorio');
    need(['call','put'].includes(side),'Lado de opción obligatorio');
    number(strike,{name:'strike',min:0.0000001,max:1e15});
  }else need(expiry===null&&side===null&&strike===null,'Metadatos de opción en contrato no opción');
  return Object.freeze({venue,kind,symbol,settlement,expiry,side,strike});
}
export function numericRecord({contract,metric,value,unit,observedAt,knownAt,sourceUrl}){
  need(contract&&typeof contract==='object'&&contract.symbol,'Contrato ausente');
  need(typeof metric==='string'&&/^[a-z][a-z0-9_]{1,65}$/.test(metric),'Métrica no admitida');
  need(typeof unit==='string'&&/^[A-Za-z0-9_.:/-]{2,32}$/.test(unit),'Unidad no admitida');
  const observed=utc(observedAt),known=utc(knownAt);
  need(observed<=known,'Datos conocidos antes de existir');
  const metricValue=number(value,{name:metric});
  const domain=contract.kind==='option'?'opciones_publicas':'derivados_perpetuos_publicos';
  const tag=observed.replace(/[^A-Za-z0-9]/g,'');
  const id='d001-'+contract.venue+'-'+contract.symbol+'-'+metric+'-'+tag;
  // Market-level source is a public URL; confidential customer IDs are absent.
  return observation({id,domain,variable:('D001_'+contract.venue+'_'+contract.symbol+'_'+metric).replace(/[^A-Za-z0-9_.:/-]/g,'_'),
    value:metricValue,unit,observed_at:observed,known_at:known,source_url:sourceUrl});
}
export async function boundedJSON(url,{fetchImpl=fetch,timeoutMs=12000,method='GET',
  body=null,maxBytes=3000000}={}){
  need(typeof url==='string','URL de fuente requerida');
  const parsed=new URL(url);
  need(parsed.protocol==='https:'&&Object.values(D001_ROOTS).includes(parsed.origin)&&
    !parsed.username&&!parsed.password,'Host de mercado no autorizado');
  need(['GET','POST'].includes(method),'Método de solo lectura requerido');
  if(parsed.origin===D001_ROOTS.binance){
    const allowed=['/fapi/v1/premiumIndex','/fapi/v1/openInterest','/fapi/v1/fundingRate'];
    need(method==='GET'&&allowed.includes(parsed.pathname)&&
      ['BTCUSDT','ETHUSDT'].includes(parsed.searchParams.get('symbol'))&&
      parsed.searchParams.size===(parsed.pathname.endsWith('/fundingRate')?2:1)&&
      (!parsed.pathname.endsWith('/fundingRate')||parsed.searchParams.get('limit')==='1'),
      'Binance: sólo endpoints públicos predeclarados de mercado');
  }else if(parsed.origin===D001_ROOTS.deribit){
    need(method==='GET'&&
      ['/api/v2/public/get_instruments','/api/v2/public/get_book_summary_by_currency'].includes(parsed.pathname)&&
      ['BTC','ETH'].includes(parsed.searchParams.get('currency'))&&
      parsed.searchParams.get('kind')==='option'&&
      parsed.searchParams.size===(parsed.pathname.endsWith('get_instruments')?3:2)&&
      (!parsed.pathname.endsWith('get_instruments')||parsed.searchParams.get('expired')==='false'),
      'Deribit: sólo métodos de mercado de opciones públicos');
  }else{
    let payload=null;
    try{payload=JSON.parse(body)}catch{}
    need(method==='POST'&&parsed.pathname==='/info'&&!parsed.search&&
      payload?.type==='metaAndAssetCtxs'&&payload.dex===''&&
      Object.keys(payload).length===2&&typeof body==='string'&&body.length<=200,
      'Hyperliquid: sólo metaAndAssetCtxs público');
  }
  const response=await fetchImpl(url,{method,body,signal:AbortSignal.timeout(timeoutMs),
    redirect:'error',cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-D001/1.0',
      ...(method==='POST'?{'Content-Type':'application/json'}:{})}});
  need(response?.ok,'Mercado HTTP '+(response?.status??'sin_respuesta'));
  need(!Number(response.headers?.get?.('content-length')??0)||
    Number(response.headers.get('content-length'))<=maxBytes,'Respuesta demasiado grande');
  const reader=response.body?.getReader?.();
  let text;
  if(reader){
    const parts=[];let n=0;
    try{for(;;){const r=await reader.read();if(r.done)break;n+=r.value.byteLength;
      need(n<=maxBytes,'Respuesta demasiado grande');parts.push(Buffer.from(r.value));}}
    catch(error){await reader.cancel().catch(()=>{});throw error}
    text=Buffer.concat(parts).toString('utf8');
  }else{
    text=await response.text();need(Buffer.byteLength(text,'utf8')<=maxBytes,'Respuesta demasiado grande');
  }
  return {value:JSON.parse(text),sha256:sha256(text),bytes:Buffer.byteLength(text),url};
}
export function sourceStatus({name,url,status='observed',knownAt,count=0,hash=null,
  error=null,notes=null}){
  return {name,status,url,received_at:utc(knownAt),signals:count,
    response_sha256:hash,reason:error===null?null:String(error.message??error).slice(0,180),
    notes,requires_license:false,client_identity_available:false};
}
