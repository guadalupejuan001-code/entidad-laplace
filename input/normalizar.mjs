import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {parse as parseHTML} from 'parse5';
import {validateRaw,event,need,exactJSON,decimal,safeInteger,sourceURL,sha,stable,identifier} from './contrato.mjs';

const list=x=>x===undefined?[]:Array.isArray(x)?x:[x];
const plain=x=>typeof x==='string'?x:typeof x?.['#text']==='string'?x['#text']:'';
const iso=x=>{need(typeof x==='string'&&Number.isFinite(Date.parse(x)),'invalid provider date');return new Date(x).toISOString()};
export function htmlText(html){
  need(typeof html==='string'&&html.length<=2*1024*1024,'HTML exceeds parser budget');
  const tree=parseHTML(html),out=[];
  const visit=(node,depth)=>{need(depth<256,'HTML nesting exceeds limit');
    if(['script','style','nav','noscript','template'].includes(node.tagName))return;
    if(node.nodeName==='#text')out.push(node.value);
    for(const c of node.childNodes??[])visit(c,depth+1);
  };visit(tree,0);return out.join(' ').replace(/\s+/g,' ').trim().slice(0,200000);
}
export function parseFeed(text){
  need(!/<!DOCTYPE|<!ENTITY/i.test(text),'DTD/entities forbidden');
  need(XMLValidator.validate(text)===true,'invalid XML feed');
  const x=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,parseAttributeValue:false,
    processEntities:false,trimValues:true}).parse(text);
  const items=x.rss?.channel?.item??x.feed?.entry;need(items!==undefined,'RSS/Atom entries missing');
  const rows=list(items);need(rows.length<=500,'feed exceeds 500 entries');
  return rows.map(i=>{
    const links=list(i.link),link=links.find(k=>k?.['@_rel']==='alternate')??links[0];
    const url=typeof link==='string'?link:link?.['@_href'];
    const title=plain(i.title),body=plain(i.description)||plain(i.summary)||plain(i.content)||plain(i['content:encoded']);
    need(title||body,'feed entry has no text');
    return {id:plain(i.guid)||plain(i.id)||url,url:sourceURL(url),title:htmlText(title),text:htmlText(body),
      published:i.pubDate??i.published??null,updated:i.updated??null};
  });
}
function documents(raw,rows){
  return rows.map(i=>{
    const title=String(i.title??'').slice(0,1000),text=String(i.text??'').slice(0,200000),url=sourceURL(i.url??raw.source_url);
    need(title.length+text.length>0,'document has no text');
    const published=i.published?iso(i.published):null;
    const revision=sha(JSON.stringify([title,text,url]));
    return event(raw,{native_id:'document:'+String(i.id??url),revision,type:'document',subject:i.subject??'WORLD',
      event_time:published,published_at:published,payload:{url,title,text,language:i.language??null,
        // A content fingerprint groups copies; it is not a proof of independent evidence.
        content_fingerprint:sha((title+' '+text).toLowerCase().replace(/\W+/g,' ').trim()),
        publisher:new URL(url).hostname},quality:{independence:'unverified',coverage:'this_feed_only'}});
  });
}
export function normalize(raw){
  const bytes=validateRaw(raw),text=bytes.toString('utf8');
  if(raw.adapter==='rss')return documents(raw,parseFeed(text));
  if(raw.adapter==='html')return documents(raw,[{id:raw.source_url,url:raw.source_url,title:raw.metadata.title??'',text:htmlText(text)}]);
  const p=exactJSON(text);
  if(raw.adapter==='coinbase_ticker'){
    if(p.type&&p.type!=='ticker')return [];
    const product=p.product_id??raw.metadata.product;need(typeof product==='string'&&/^[A-Z0-9-]{2,40}$/.test(product),'invalid Coinbase product');
    const price=decimal(p.price);need(!price.startsWith('-')&&/[1-9]/.test(price),'nonpositive market price');
    const time=iso(p.time),native=raw.native_id??'ticker:'+product+':'+String(p.trade_id??time)+':'+time;
    const size=p.last_size??p.size??null;if(size!==null)decimal(size);
    const bid=p.best_bid??p.bid??null,ask=p.best_ask??p.ask??null;if(bid!==null)decimal(bid);if(ask!==null)decimal(ask);
    const payload={price,currency:product.split('-').at(-1),size,best_bid:bid,best_ask:ask};
    return [event(raw,{native_id:native,revision:raw.adapter_version==='i001.1'?'0':sha(stable(payload)),type:'quote',subject:product,event_time:time,
      payload,
      quality:{sequence_complete:null,coverage:'ticker_updates_not_full_order_book',recovery:raw.metadata.recovery??'live'}})];
  }
  if(raw.adapter==='document_json')return documents(raw,Array.isArray(p)?p:[p]);
  if(raw.adapter==='macro_json'){
    const rows=Array.isArray(p)?p:[p];need(rows.length<=500,'macro batch exceeds limit');
    return rows.map(i=>{identifier(i.series_id,'macro series',100);identifier(i.unit,'macro unit',100);
      return event(raw,{native_id:i.id??i.series_id+':'+i.observed_at,revision:String(i.revision??sha(JSON.stringify(i))),
        type:'macro',subject:i.series_id,event_time:iso(i.observed_at),published_at:i.published_at?iso(i.published_at):null,
        payload:{series_id:i.series_id,unit:i.unit,value:decimal(i.value),vintage:i.vintage??null},quality:{vintage_verified:i.vintage_verified===true}})});
  }
  if(raw.adapter==='chain_block'||raw.adapter==='chain_part'){
    need((raw.adapter==='chain_part'?['connect_part']:['connect','disconnect','finalize']).includes(p.operation),'invalid chain operation');
    need(typeof p.network==='string'&&typeof p.hash==='string'&&typeof p.parent_hash==='string','chain identity missing');
    const height=safeInteger(p.height),transfers=p.transfers??[];need(Array.isArray(transfers)&&transfers.length<=20000,'block transfer budget exceeded');
    for(const t of transfers){need(typeof t.asset==='string'&&typeof t.amount_raw==='string'&&/^\d+$/.test(t.amount_raw),'invalid exact transfer amount');
      need(t.from===null||typeof t.from==='string','invalid transfer origin');need(typeof t.to==='string','invalid transfer destination');}
    const {rpc_response_sha256,logs_response_sha256,...payload}=p;
    const time=p.time?iso(p.time):null,clockFuture=time!==null&&time>raw.received_at;
    return [event(raw,{native_id:raw.native_id??p.network+':'+height+':'+p.hash+':'+p.operation,
      revision:raw.revision??'0',type:raw.adapter==='chain_part'?'chain_transfer_batch':'chain_block',subject:p.network,event_time:clockFuture?null:time,
      payload:{...payload,height,transfers},quality:{rpc_response_sha256:rpc_response_sha256??null,logs_response_sha256:logs_response_sha256??null,
        source_clock_future:clockFuture,identity_attribution:'public_labels_only',coverage:p.coverage??'configured_scope',finality:p.operation==='finalize'?'finalized':'provisional'}})];
  }
  if(raw.adapter==='status')return [event(raw,{native_id:raw.native_id??raw.delivery_id,type:'source_status',subject:raw.source_id,payload:p,quality:{truth:'operational_observation'}})];
  throw Error('unsupported input adapter '+raw.adapter);
}
