import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseGdacs,fetchGdacs,GDACS_URL} from '../universo/noticias-oficiales.mjs';
import {fetchGeoNews,parseGdeltGeo} from '../universo/fuentes-u003.mjs';
import {planMacroCapture,macroAsOf,verifyMacroJournal,persistMacroCapture,readMacroJournal,MACRO_JOURNAL} from '../universo/vintages-macro.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

const at='2026-10-30T16:00:00.000Z';
const item=({id='1',lat='10',lon='20',current='true',level='Orange',modified='Fri, 30 Oct 2026 15:00:00 GMT'}={})=>
  '<item><title>Flood alert &amp; update</title><link>http://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid='+id+'</link>'+
  '<pubDate>Fri, 30 Oct 2026 14:00:00 GMT</pubDate><gdacs:datemodified>'+modified+'</gdacs:datemodified>'+
  '<gdacs:fromdate>Thu, 29 Oct 2026 10:00:00 GMT</gdacs:fromdate><gdacs:iscurrent>'+current+'</gdacs:iscurrent>'+
  '<gdacs:eventtype>FL</gdacs:eventtype><gdacs:eventid>'+id+'</gdacs:eventid><gdacs:alertlevel>'+level+'</gdacs:alertlevel>'+
  '<geo:lat>'+lat+'</geo:lat><geo:long>'+lon+'</geo:long><gdacs:country>Example</gdacs:country></item>';
const feed=items=>'<rss><channel><pubDate>Fri, 30 Oct 2026 15:45:00 GMT</pubDate>'+items+'</channel></rss>';

test('GDACS preserves event, publication, revision and reception times separately',()=>{
  const r=parseGdacs(feed(item()),{capturedAt:at});assert.equal(r.alerts.length,1);assert.equal(r.observations.length,12);
  const alert=r.alerts[0];assert.equal(alert.latitude,10);assert.equal(alert.longitude,20);
  assert.equal(alert.event_at,'2026-10-29T10:00:00.000Z');assert.equal(alert.modified_at,'2026-10-30T15:00:00.000Z');
  assert.equal(alert.known_at,at);assert.match(alert.url,/^https:/);assert.equal(alert.title,'Flood alert & update');
  assert.deepEqual(r.coverage,['natural_disaster_alerts']);
});
test('GDACS deduplicates event episodes and excludes inactive, future and missing coordinates',()=>{
  const xml=feed(item()+item({modified:'Fri, 30 Oct 2026 15:30:00 GMT',level:'Red'})+
    item({id:'2',current:'false'})+item({id:'3',modified:'Fri, 30 Oct 2026 17:00:00 GMT'})+
    item({id:'4',lat:''})+item({id:'5',lon:'181'}));
  const r=parseGdacs(xml,{capturedAt:at});assert.equal(r.alerts.length,1);assert.equal(r.alerts[0].alert_level,'red');
  assert.deepEqual(r.rejected,{invalid:2,future:1,not_current:1});
});
test('GDACS rejects XML declarations, incomplete items and stale feeds',()=>{
  assert.throws(()=>parseGdacs('<!DOCTYPE rss>'+feed(item()),{capturedAt:at}),/declaraciones/);
  assert.throws(()=>parseGdacs(feed('<item><title>truncated'),{capturedAt:at}),/truncadas/);
  assert.throws(()=>parseGdacs(feed(item()),{capturedAt:'2026-11-05T16:00:00.000Z'}),/anticuado/);
});
test('empty geographic feeds do not fabricate hemisphere fractions',()=>{
  const r=parseGdacs(feed(''),{capturedAt:at});assert.equal(r.alerts.length,0);assert.equal(r.observations.length,10);
  const rows=parseGdeltGeo({type:'FeatureCollection',features:[]},{topic:'trade',capturedAt:at,url:'https://example.org/'});
  assert.equal(rows.length,1);assert.equal(rows[0].value,0);
  assert.throws(()=>parseGdacs(feed(item({lat:''})),{capturedAt:at}),/no se infiere un total cero/);
});
test('GDELT failure leaves disaster coverage available and failed topics explicit',async()=>{
  const r=await fetchGeoNews({now:()=>at,topics:[{id:'trade',query:'trade',gkg:'TRADE'}],
    fetchImpl:async url=>url===GDACS_URL?new Response(feed(item())):new Response('down',{status:503})});
  assert.equal(r.geolocated_alerts.length,1);assert.ok(r.sources.some(x=>x.name==='GDELT-trade'&&x.status==='unavailable'));
  assert.ok(r.sources.some(x=>x.name==='GDACS-official-alerts'&&x.status==='observed'));
  assert.equal(r.coverage.all_requested_topics_available,false);assert.deepEqual(r.coverage.gdelt_topics_unavailable,['trade']);
});
test('GDACS raw body hashes can be archived for replay',async()=>{
  let archived;
  const r=await fetchGdacs({now:()=>at,fetchImpl:async()=>new Response(feed(item())),
    archiveResponse:async data=>{archived=data;return 'response.xml'}});
  assert.equal(r.sources[0].raw_response_archived,true);assert.equal(r.sources[0].body_sha256,archived.body_sha256);
  assert.equal(parseGdacs(archived.text,{capturedAt:at}).alerts[0].version_sha256,r.alerts[0].version_sha256);
});

function capture(value,time,{reference='2026-09-01',unit='pct',source='https://example.org/macro',vintages=[]}={}){
  const row={id:'us-rate-'+reference,domain:'macro_vintage_dates',variable:'us_unemployment_rate_vintage',
    value,unit,observed_at:reference+'T00:00:00.000Z',known_at:time,source_url:source};
  return sellarCaptura({schema:'test-macro-capture',at:time,universal_state:universeSnapshot([row],{cutoff:time}),macro_vintages:vintages});
}
const plan=(entries,c)=>planMacroCapture(entries,c,{recordedAt:'2026-11-01T00:00:00.000Z'});
test('macro revisions preserve old values and cannot cross their availability cutoff',()=>{
  const a=plan([],capture(4,at)),b=plan(a.entries,capture(4.2,'2026-10-30T17:00:00.000Z'));
  assert.equal(a.summary.new_references,1);assert.equal(b.summary.revisions,1);
  assert.equal(macroAsOf(b.entries,'2026-10-30T15:59:59.000Z').known_states,0);
  assert.equal(macroAsOf(b.entries,'2026-10-30T16:30:00.000Z').states[0].value,4);
  assert.equal(macroAsOf(b.entries,'2026-10-30T17:00:00.000Z').states[0].value,4.2);
  assert.equal(b.entries[0].observation.value,4);assert.ok(verifyMacroJournal(b.entries));
});
test('repeated values are deduplicated but a later reversion is a new revision',()=>{
  const a=plan([],capture(4,at)),same=plan(a.entries,capture(4,'2026-10-30T17:00:00.000Z',{source:'https://example.org/macro?end=2026-10-30'}));
  assert.equal(same.entries.length,1);assert.equal(same.summary.unchanged,1);
  const b=plan(same.entries,capture(4.2,'2026-10-30T18:00:00.000Z'));
  const c=plan(b.entries,capture(4,'2026-10-30T19:00:00.000Z'));
  assert.equal(c.entries.length,3);assert.equal(c.entries[2].revision_index,3);
  assert.equal(macroAsOf(c.entries,'2026-10-30T19:00:00.000Z').states[0].value,4);
});
test('a new reference period is not counted as revising the old period',()=>{
  const a=plan([],capture(4,at)),b=plan(a.entries,capture(4.2,'2026-10-31T17:00:00.000Z',{reference:'2026-10-01'}));
  assert.equal(b.summary.new_references,1);assert.equal(b.summary.revisions,0);
  assert.equal(macroAsOf(b.entries,'2026-10-31T17:00:00.000Z').known_states,2);
});
test('an ALFRED day remains separate from the time Laplace captured its value',()=>{
  const c=capture(4,at,{vintages:[{series:'UNRATE',reference_date:'2026-09-01',vintage_date:'2026-10-02',publication_at:null}]});
  const r=plan([],c);assert.equal(r.entries[0].provider_vintage.date,'2026-10-02');
  assert.equal(r.entries[0].provider_vintage.publication_at,null);
  assert.equal(macroAsOf(r.entries,'2026-10-02T23:59:59.000Z').known_states,0);
});
test('macro journal rejects changed units, out-of-order imports, secrets and tampered entries',()=>{
  const a=plan([],capture(4,at));
  assert.throws(()=>plan(a.entries,capture(4.1,'2026-10-30T17:00:00.000Z',{unit:'USD'})),/unidad/);
  assert.throws(()=>plan(a.entries,capture(4,'2026-10-30T15:00:00.000Z')),/fuera de orden/);
  assert.throws(()=>plan([],capture(4,at,{source:'https://example.org/?api_key=secret'})),/credenciales/);
  const altered=structuredClone(a.entries);altered[0].observation.value=100;
  assert.throws(()=>verifyMacroJournal(altered),/integridad/);
});
test('atomic persistence recovers previous revisions and preserves a corrupt or locked journal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'laplace-vintages-'));
  try{
    persistMacroCapture(dir,capture(4,at),{recordedAt:'2026-11-01T00:00:00.000Z'});
    persistMacroCapture(dir,capture(4.2,'2026-10-30T17:00:00.000Z'),{recordedAt:'2026-11-01T00:00:00.000Z'});
    assert.equal(readMacroJournal(dir).length,2);
    const path=join(dir,MACRO_JOURNAL),before=readFileSync(path,'utf8');
    writeFileSync(join(dir,'macro-vintages.lock'),'busy');
    assert.throws(()=>persistMacroCapture(dir,capture(5,'2026-10-30T18:00:00.000Z')),/Otro proceso/);
    assert.equal(readFileSync(path,'utf8'),before);rmSync(join(dir,'macro-vintages.lock'));
    writeFileSync(path,before.trimEnd());
    assert.throws(()=>persistMacroCapture(dir,capture(5,'2026-10-30T18:00:00.000Z')),/truncado/);
    assert.equal(readFileSync(path,'utf8'),before.trimEnd());assert.equal(existsSync(join(dir,'macro-vintages.lock')),false);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
