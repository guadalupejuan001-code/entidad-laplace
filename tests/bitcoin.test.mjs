import test from 'node:test';
import assert from 'node:assert/strict';
import {collectBitcoin,fetchQuote,parseFeed,exportCaptureFacts,SOURCES,sourceTime,classifyHeadline} from '../bitcoin/agente.mjs';
import {canonicalLedger} from '../historia/contrato.mjs';
import {configuration,marketSamples} from '../narrativa/modelo.mjs';
const now='2026-10-28T04:00:00.000Z';
const media=SOURCES[0],official=SOURCES.find(s=>s.id==='un');
const rss=items=>'<rss><channel>'+items+'</channel></rss>';
const item=(title,url='https://example.org/bitcoin',date=now)=>`<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`;
const ticker={price:'80800.01000001',bid:'80800.01',ask:'80800.02',time:'2026-10-28T03:59:59.123456789Z',trade_id:4};
const response=body=>new Response(typeof body==='string'?body:JSON.stringify(body));
function fakeFetch(url){
  if(url.endsWith('/ticker'))return Promise.resolve(response(ticker));
  if(url.endsWith('/stats'))return Promise.resolve(response({open:'80000'}));
  if(url===official.url)return Promise.resolve(response(rss(item('Humanitarian corridor: aid delivered to civilians'))));
  return Promise.resolve(response(rss(item('Bitcoin market announcement'))));
}
test('live BTC quote keeps exact decimals, nanosecond source time and its actual capture time',async()=>{
  const quote=await fetchQuote({fetchImpl:fakeFetch,now:()=>now});
  assert.equal(quote.asset,'BTC-USD');assert.equal(quote.value,ticker.price);
  assert.equal(quote.source_time,ticker.time);assert.equal(quote.observed_at,'2026-10-28T03:59:59.123Z');
  assert.equal(quote.known_at,now);assert.equal(quote.price_basis,'spot_quote');
  assert.throws(()=>sourceTime('2026-02-30T00:00:00Z'),/invalida/);
  await assert.rejects(()=>fetchQuote({now:()=>now,fetchImpl:async url=>response(url.endsWith('/ticker')?{...ticker,time:'2026-10-27T00:00:00Z'}:{open:'80000'})}),/actualidad/);
});
test('RSS filters media to Bitcoin, retains official humanitarian context, rejects hostile XML and URLs',async()=>{
  const content=rss(item('Bitcoin &amp; <b>world</b> news','https://example.org/a?utm_source=x')+
    item('Bitcoin &amp; world news','https://example.org/a?utm_source=y')+
    item('Unrelated sports news','https://example.org/sports')+item('Bitcoin bad link','javascript:alert(1)'));
  const parsed=await parseFeed(content,media,now);
  assert.equal(parsed.length,1);assert.equal(parsed[0].url,'https://example.org/a');
  assert.equal(parsed[0].title,'Bitcoin & world news');assert.equal(parsed[0].training_kind,null);
  assert.equal((await parseFeed(rss(item('Civilian deaths and humanitarian access denied')),official,now))[0].training_kind,'humanitaria');
  assert.equal(classifyHeadline('SEC charges adviser for failure to disclose conflict of interest','official'),null);
  await assert.rejects(()=>parseFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',media,now),/XML/);
  const atom='<feed><entry><title>Bitcoin update</title><link href="https://example.org/atom"/><updated>'+now+'</updated></entry></feed>';
  assert.equal((await parseFeed(atom,media,now))[0].url,'https://example.org/atom');
});
test('one source failure cannot fabricate a price or erase successful feeds',async()=>{
  const failed=async url=>{if(url.endsWith('/ticker'))throw Error('source unavailable');return fakeFetch(url)};
  const capture=await collectBitcoin({fetchImpl:failed,now:()=>now,sources:[media,official]});
  assert.equal(capture.status,'price_unavailable');assert.equal(capture.quote,null);
  assert.equal(capture.news.length,2);assert.equal(capture.successful_sources,2);assert.equal(capture.orders_executed,0);
  assert.equal(capture.sources.find(s=>s.id==='coinbase').status,'error');
});
test('fact export excludes monetary/price headlines and never backdates first-seen evidence',async()=>{
  const capture=await collectBitcoin({fetchImpl:fakeFetch,now:()=>now,sources:[media,official]});
  capture.news.find(n=>n.training_kind).published_at='2026-10-20T00:00:00.000Z';
  const facts=canonicalLedger(exportCaptureFacts(capture));
  assert.equal(facts.length,2);assert.equal(facts.find(f=>f.kind==='humanitaria').known_at,now);
  assert.equal(facts.find(f=>f.kind==='precio').price_basis,'spot_quote');
  const config=configuration({start_at:'2026-10-01T00:00:00Z',train_end:'2026-10-10T00:00:00Z',validation_end:'2026-10-20T00:00:00Z'});
  assert.equal(marketSamples(facts,config,now,'2026-10-29T04:00:00.000Z','2026-10-29T04:00:00.000Z').rows.length,0);
  assert.throws(()=>configuration({...config,asset:'ETH-USD'}),/Bitcoin/);
});
