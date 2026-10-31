/* Bitcoin-only public observation agent. No orders, private accounts or LLM
 * claims. This exact module is shared by the CLI and the hosted dashboard. */
export const AGENT_VERSION='laplace-bitcoin-live-v2';
export const ASSET='BTC-USD';
export const SOURCES=Object.freeze([
  {id:'coindesk',name:'CoinDesk',type:'media',url:'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml'},
  {id:'decrypt',name:'Decrypt',type:'media',url:'https://decrypt.co/feed'},
  {id:'cointelegraph',name:'Cointelegraph',type:'media',url:'https://cointelegraph.com/rss'},
  {id:'sec',name:'SEC · EE. UU.',type:'official',url:'https://www.sec.gov/news/pressreleases.rss'},
  {id:'fed',name:'Reserva Federal',type:'official',url:'https://www.federalreserve.gov/feeds/press_all.xml'},
  {id:'ecb',name:'Banco Central Europeo',type:'official',url:'https://www.ecb.europa.eu/rss/press.html'},
  {id:'un',name:'ONU · Noticias',type:'official',url:'https://news.un.org/feed/subscribe/en/news/all/rss.xml'}
]);
const QUOTE_URL='https://api.exchange.coinbase.com/products/BTC-USD/ticker';
const STATS_URL='https://api.exchange.coinbase.com/products/BTC-USD/stats';
const need=(ok,message)=>{if(!ok)throw new Error(message)};
export async function sha256(text){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
  return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function decimal(raw){
  need(typeof raw==='string'&&/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,8})?$/.test(raw)&&Number(raw)>0,
    'Cotizacion decimal invalida');return raw;
}
export function sourceTime(raw){
  need(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(raw),
    'Fecha de cotizacion invalida');
  const value=Date.parse(raw);need(Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===raw.slice(0,10),'Fecha de cotizacion invalida');
  return new Date(value).toISOString();
}
function entities(text){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,code)=>{
    if(code[0]==='#'){
      const value=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);
      return value>0&&value<=0x10ffff?String.fromCodePoint(value):'';
    }
    return named[code.toLowerCase()]??whole;
  });
}
export function plainText(raw,max=260){
  return entities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' '))
    .replace(/<[^>]+>/g,' ').replace(/[\u0000-\u001f\s]+/g,' ').trim().slice(0,max);
}
function tag(block,name){
  const found=block.match(new RegExp('<(?:[a-z0-9_-]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?'+name+'>','i'));
  return found?.[1]??'';
}
function safeUrl(raw,base){
  try{
    const url=new URL(entities(raw.trim()),base);
    if(url.protocol!=='https:'||url.username||url.password)return null;
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key))url.searchParams.delete(key);
    url.searchParams.sort();return url.toString();
  }catch{return null}
}
export function classifyHeadline(title,type){
  const t=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const bitcoin=/\b(bitcoin|btc|satoshi)\b/.test(t);
  const geopolitical=/\b(sanction|sanctions|war|ceasefire|invasion|airstrike|military|geopolitic|armed conflict|renewed conflict|conflicto armado|guerra)\b/.test(t);
  const humanitarian=/\b(humanitarian|famine|displaced|refugees|civilian|civilians|hambruna|humanitario)\b/.test(t);
  const monetary=/\b(interest rate|federal funds|monetary policy|fomc|inflation|financial stability|monetary|liquidity)\b/.test(t);
  const regulation=/\b(crypto|cryptocurrency|digital asset|digital assets|bitcoin etf|bitcoin trust)\b/.test(t);
  if(type==='media'&&!bitcoin)return null;
  if(!bitcoin&&!geopolitical&&!humanitarian&&!monetary&&!regulation)return null;
  return {category:humanitarian?'humanitaria':geopolitical?'geopolitica':bitcoin?'bitcoin':monetary?'monetaria':'regulacion',
    relevance:bitcoin?'bitcoin_directo':'contexto',training_kind:humanitarian?'humanitaria':geopolitical?'geopolitica':null};
}
export async function parseFeed(xml,source,capturedAt){
  need(typeof xml==='string'&&new TextEncoder().encode(xml).length<=1024*1024,'Feed excede 1 MiB');
  need(!/<!DOCTYPE|<!ENTITY/i.test(xml),'Declaraciones XML externas no admitidas');
  need(/<(rss|feed)\b/i.test(xml),'La respuesta no es RSS/Atom');
  const blocks=[...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0,100);
  const records=[],seen=new Set();
  for(const [,block] of blocks){
    const title=plainText(tag(block,'title')).split(/\s+/).slice(0,24).join(' ');
    if(!title)continue;
    const classification=classifyHeadline(title,source.type);if(!classification)continue;
    let rawLink=plainText(tag(block,'link'),2048);
    if(!rawLink){const atom=block.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/i);rawLink=atom?.[1]??''}
    if(!rawLink)rawLink=plainText(tag(block,'guid'),2048);
    const url=safeUrl(rawLink,source.url);if(!url)continue;
    const rawDate=plainText(tag(block,'pubDate')||tag(block,'published')||tag(block,'updated')||tag(block,'date'),100);
    const parsed=rawDate?Date.parse(rawDate):NaN;
    const published=Number.isFinite(parsed)&&parsed<=Date.parse(capturedAt)+60000?new Date(parsed).toISOString():null;
    if(published&&Date.parse(published)<Date.parse(capturedAt)-45*86400000)continue;
    const id=await sha256(source.id+'|'+url+'|'+title+'|'+(published??'unknown'));
    if(seen.has(id))continue;seen.add(id);
    records.push({id,source_id:source.id,source_name:source.name,source_type:source.type,
      source_feed:source.url,url,title,published_at:published,captured_at:capturedAt,...classification});
  }
  return records.sort((a,b)=>(b.published_at??'').localeCompare(a.published_at??'')).slice(0,5);
}
async function fetchBounded(url,{fetchImpl,timeoutMs}){
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
    headers:{'Accept':'application/json, application/rss+xml, application/xml, text/xml',
      'User-Agent':'LaplaceBitcoin/0.5 (+https://github.com/guadalupejuan001-code/LaPlaceDIG)'}});
  need(response.ok,'HTTP '+response.status);
  const length=Number(response.headers.get('content-length')??0);
  need(length<=1024*1024,'Respuesta excede 1 MiB');
  const reader=response.body?.getReader();need(reader,'Respuesta vacia');
  let size=0;const chunks=[];
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      need(size<=1024*1024,'Respuesta excede 1 MiB');chunks.push(value)}
  }catch(error){await reader.cancel();throw error}
  const joined=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length}
  return new TextDecoder().decode(joined);
}
export async function fetchQuote({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=9000}={}){
  const options={fetchImpl,timeoutMs};
  const [tickerResult,statsResult]=await Promise.allSettled([
    fetchBounded(QUOTE_URL,options),fetchBounded(STATS_URL,options)
  ]);
  if(tickerResult.status!=='fulfilled')throw tickerResult.reason;
  const ticker=JSON.parse(tickerResult.value),captured=now(),observed=sourceTime(ticker.time);
  const age=Date.parse(captured)-Date.parse(observed);
  need(age>=-60000&&age<=300000,'La fuente devolvio una cotizacion fuera de la ventana de actualidad');
  const price=decimal(ticker.price);
  let change=null,open=null;
  if(statsResult.status==='fulfilled'){
    try{open=decimal(JSON.parse(statsResult.value).open);change=(Number(price)/Number(open)-1)*100}catch{}
  }
  return {id:await sha256('coinbase|'+ticker.time+'|'+price),asset:ASSET,currency:'USD',price_basis:'spot_quote',
    value:price,bid:decimal(ticker.bid),ask:decimal(ticker.ask),observed_at:observed,
    source_time:ticker.time,captured_at:captured,known_at:captured>observed?captured:observed,
    source_id:'coinbase',source_name:'Coinbase Exchange',source_url:QUOTE_URL,
    trade_id:String(ticker.trade_id),open_24h:open,change_24h_pct:change};
}
export async function collectBitcoin({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=9000,sources=SOURCES}={}){
  const started=now(),reports=[];
  const quoteTask=fetchQuote({fetchImpl,now,timeoutMs}).then(quote=>{
    reports.push({id:'coinbase',name:'Coinbase Exchange',type:'market',url:QUOTE_URL,status:'ok',items:1,captured_at:quote.captured_at});return quote;
  }).catch(error=>{reports.push({id:'coinbase',name:'Coinbase Exchange',type:'market',url:QUOTE_URL,
    status:'error',items:0,captured_at:now(),error:String(error.message).slice(0,180)});return null});
  const newsTask=Promise.all(sources.map(async source=>{
    try{
      const xml=await fetchBounded(source.url,{fetchImpl,timeoutMs}),captured=now();
      const news=await parseFeed(xml,source,captured);
      reports.push({...source,status:'ok',items:news.length,captured_at:captured,content_sha256:await sha256(xml)});
      return news;
    }catch(error){reports.push({...source,status:'error',items:0,captured_at:now(),error:String(error.message).slice(0,180)});return []}
  }));
  const [quote,groups]=await Promise.all([quoteTask,newsTask]);
  const news=groups.flat().sort((a,b)=>(b.published_at??'').localeCompare(a.published_at??''));
  reports.sort((a,b)=>a.id.localeCompare(b.id));
  const failed=reports.filter(source=>source.status==='error').length;
  return {schema:AGENT_VERSION,id:crypto.randomUUID(),asset:ASSET,started_at:started,completed_at:now(),
    status:quote?(failed?'partial':'ok'):'price_unavailable',quote,news,sources:reports,
    successful_sources:reports.length-failed,total_sources:reports.length,
    prediction_status:'pendiente_de_entrenamiento_con_historia_real',orders_executed:0};
}
export function exportCaptureFacts(capture){
  const facts=[];
  if(capture.quote){const q=capture.quote;facts.push({id:'btc-quote-'+q.id,kind:'precio',asset:ASSET,
    currency:'USD',price_basis:'spot_quote',value:q.value,observed_at:q.observed_at,known_at:q.known_at,source_url:q.source_url})}
  for(const item of capture.news){
    if(!item.training_kind||!item.published_at)continue;
    const captured=item.first_seen_at??item.captured_at;
    facts.push({id:'btc-story-'+item.id,kind:item.training_kind,event_code:'TEXT_ONLY',region:'GLOBAL',
      summary:item.title,observed_at:item.published_at,known_at:captured>item.published_at?captured:item.published_at,source_url:item.url});
  }
  return facts;
}
