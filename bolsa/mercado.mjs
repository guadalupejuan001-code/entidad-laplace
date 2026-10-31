/* Bolsa B001 — adaptador intradía sin claves para el laboratorio X001.
 * Fuente HTTP: Yahoo Finance chart endpoint. Solo convierte datos observados
 * a la forma OHLCV usada por Laplace; no ejecuta órdenes ni autentica cuentas.
 */
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
export const DEFAULT_SYMBOLS=Object.freeze(['SPY','AAPL','NVDA']);
export function cleanSymbol(raw){
  const s=String(raw??'').trim().toUpperCase();
  need(/^\^?[A-Z0-9][A-Z0-9.^=-]{0,14}$/.test(s),'Símbolo bursátil inválido');
  return s;
}
export function chartUrl(symbol,{range='1mo',interval='5m'}={}){
  const s=cleanSymbol(symbol);
  need(['5m'].includes(interval),'B001 usa velas de 5 minutos');
  need(['5d','1mo','3mo'].includes(range),'Rango no permitido');
  const u=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(s));
  u.searchParams.set('interval',interval);u.searchParams.set('range',range);
  u.searchParams.set('includePrePost','false');u.searchParams.set('events','div,splits');
  return u.toString();
}
export function parseChart(raw,symbol){
  const s=cleanSymbol(symbol),result=raw?.chart?.result?.[0];
  need(result&&Array.isArray(result.timestamp),'Respuesta bursátil sin timestamps');
  const q=result.indicators?.quote?.[0],ts=result.timestamp;
  need(q&&['low','high','open','close','volume'].every(k=>Array.isArray(q[k])),'Respuesta OHLCV incompleta');
  const bars=[];
  for(let i=0;i<ts.length;i++){
    const vals=[ts[i],q.low[i],q.high[i],q.open[i],q.close[i],q.volume[i]];
    if(!vals.every(Number.isFinite))continue;
    const [t,l,h,o,c,v]=vals;
    if(t%300!==0||l<=0||h<l||o<l||o>h||c<l||c>h||v<0)continue;
    bars.push([t,l,h,o,c,v]);
  }
  bars.sort((a,b)=>a[0]-b[0]);
  need(bars.length>=64,'Muy pocas velas válidas para '+s);
  return {symbol:s,currency:result.meta?.currency??null,exchange:result.meta?.exchangeName??null,
    timezone:result.meta?.exchangeTimezoneName??null,bars,
    source:'Yahoo Finance chart endpoint',captured_at:new Date().toISOString()};
}
export async function fetchIntraday(symbol,{fetchImpl=fetch,range='1mo',timeoutMs=12000}={}){
  const url=chartUrl(symbol,{range});
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-B001/1.0'}});
  need(r.ok,'Fuente bursátil HTTP '+r.status);
  const raw=await r.json();
  const parsed=parseChart(raw,symbol);
  return {...parsed,url};
}
