import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Registry} from '../pulso/registro.mjs';
import {parseExhibit21,parse13F,recentFilings,collectInstitutionSources} from '../pulso/sec.mjs';
import {refineInstitutionRegistry,institutionalSnapshot,institutionalBatches,institutionalTrainingFacts} from '../pulso/instituciones.mjs';
import {readInstitutionCapture} from '../tools/instituciones.mjs';
import {canonicalLedger} from '../historia/contrato.mjs';

const captured='2026-10-30T18:00:00.000Z';
const position=(value='100')=>`<ns:infoTable><ns:nameOfIssuer>TEST INC</ns:nameOfIssuer><ns:titleOfClass>COM</ns:titleOfClass><ns:cusip>123456789</ns:cusip><ns:value>${value}</ns:value><ns:sshPrnamt>10</ns:sshPrnamt><ns:sshPrnamtType>SH</ns:sshPrnamtType><ns:investmentDiscretion>SOLE</ns:investmentDiscretion><ns:votingAuthority><ns:Sole>10</ns:Sole><ns:Shared>0</ns:Shared><ns:None>0</ns:None></ns:votingAuthority></ns:infoTable>`;
const cover=(count,total)=>`<edgarSubmission><tableEntryTotal>${count}</tableEntryTotal><tableValueTotal>${total}</tableValueTotal></edgarSubmission>`;
test('refines an existing JPM market entity and rejects conflicting strong identifiers',()=>{
  const r=new Registry(null,['JPM']);
  const e=r.upsert({id:'sec:0000019617',name:'JPMorgan Chase & Co.',identifiers:{ticker:'JPM',cik:'0000019617'},roles:['institutional_root']});
  assert.equal(e.id,'market:JPM');assert.equal(r.entities.size,1);
  assert.throws(()=>r.upsert({id:e.id,name:'Other',identifiers:{cik:'0000000001'}}),/conflicto/);
  const altered=r.seal();altered.entities[0].name='Tampered';assert.throws(()=>new Registry(altered),/alterado/);
});
test('EX-21 imports group subsidiaries without inventing direct parents or ownership percentages',()=>{
  const p=parseExhibit21('<p>List of subsidiaries; insignificant subsidiaries omitted</p><table><tr><td>Name of Subsidiary</td><td>Jurisdiction</td></tr><tr><td>A &amp; B LLC</td><td>Delaware</td></tr></table>');
  assert.equal(p.rows.length,1);assert.equal(p.rows[0].name,'A & B LLC');assert.equal(p.omissions_disclosed,true);
  assert.equal(p.direct_parentage_verified,false);assert.equal(p.complete_control_tree,false);
  assert.throws(()=>parseExhibit21('<p>Subsidiaries</p><tr><td>X</td><td>Y</td><td>Z</td></tr>'),/sin filas|revisar/);
});
test('13F preserves namespace-qualified rows and reconciles cover counts and dollar totals',()=>{
  const p=parse13F('<informationTable>'+position()+position('250')+'</informationTable>',cover(2,350));
  assert.equal(p.raw_rows,2);assert.equal(p.positions.length,1);assert.equal(p.positions[0].reported_value,'350');
  assert.equal(p.positions[0].reported_quantity,'20');assert.equal(p.control_inferred,false);assert.equal(p.ownership_percentage,null);
  assert.throws(()=>parse13F(position(),cover(2,100)),/filas/);
  assert.throws(()=>parse13F(position(),cover(1,101)),/valor/);
  assert.throws(()=>parse13F('<!DOCTYPE x>'+position(),cover(1,100)),/DTD/);
});
test('sources retain first real capture time and reject retrospective relabelling',()=>{
  const r=new Registry(),raw={url:'https://data.sec.gov/submissions/CIK0000019617.json',text:'{}',received_at:captured};
  const first=r.source(raw),again=r.source({...raw,received_at:'2026-10-31T18:00:00Z'});
  assert.equal(first.id,again.id);assert.equal(again.known_at,captured);
  assert.throws(()=>r.source({...raw,received_at:'2026-10-29T18:00:00Z'}),/retroceder/);
});
test('future SEC filings cannot become the selected original report',()=>{
  const raw={filings:{recent:{form:['10-K','10-K'],accessionNumber:['0000019617-26-000001','0000019617-27-000001'],
    reportDate:['2025-12-31','2026-12-31'],acceptanceDateTime:['2026-02-13T20:00:00Z','2027-02-13T20:00:00Z']}}};
  const p=recentFilings(raw,'10-K',captured);assert.equal(p.length,1);assert.equal(p[0].report_date,'2025-12-31');
});
test('source discovery accepts both real EX-21 filename styles and records failures',async()=>{
  const seen=[];
  const result=await collectInstitutionSources({institutions:[{cik:'0000019617',ticker:'JPM'}],fetchText:async url=>{
    seen.push(url);
    const text=url.endsWith('company_tickers.json')?'{}':url.includes('submissions')?JSON.stringify({cik:'19617',tickers:['JPM'],filings:{recent:{form:['10-K','13F-HR'],
      accessionNumber:['0000019617-26-000001','0000019617-26-000002'],reportDate:['2025-12-31','2026-06-30'],acceptanceDateTime:['2026-02-13T20:00:00Z','2026-08-12T20:00:00Z']}}}):url.endsWith('index.json')?
        JSON.stringify({directory:{item:url.includes('000001961726000001')?[{name:'corp10k2025exhibit21.htm'}]:[{name:'primary_doc.xml'},{name:'Information_Table.xml'}]}}):'document';
    return {url,text,received_at:captured};
  }});
  assert.equal(result.bundles.length,1);assert.ok(seen.some(x=>x.endsWith('corp10k2025exhibit21.htm')));
  const failed=await collectInstitutionSources({institutions:[{cik:'1',ticker:'X'}],fetchText:async url=>{
    if(url.endsWith('company_tickers.json'))return {url,text:'{}',received_at:captured};throw Error('HTTP 503');
  }});
  assert.equal(failed.bundles.length,0);assert.equal(failed.status[0].status,'unavailable');
});
test('archived SEC extraction is reproducible, idempotent and dates every relation by actual availability',()=>{
  const path=new URL('../evidencia/pulso-20261030/capture.json',import.meta.url).pathname;
  const bundles=readInstitutionCapture(path),r=refineInstitutionRegistry(bundles);
  const expected=JSON.parse(gunzipSync(readFileSync(new URL('../evidencia/pulso-20261030/resultado/registry.json.gz',import.meta.url))));
  assert.equal(r.registry_sha256,expected.registry_sha256);
  const repeated=refineInstitutionRegistry(bundles,{previous:r});assert.equal(repeated.registry_sha256,r.registry_sha256);
  const before=new Date(Date.parse(r.sources.map(s=>s.known_at).sort()[0])-1).toISOString();
  assert.equal(institutionalSnapshot(r,{cutoff:before}).edges.length,0);
  const cutoff=r.sources.map(s=>s.known_at).sort().at(-1),v=institutionalSnapshot(r,{cutoff});
  assert.equal(v.reports.find(x=>x.kind==='subsidiaries'&&x.root==='market:JPM').rows,18);
  assert.equal(v.reports.find(x=>x.kind==='subsidiaries'&&x.root==='sec:0002012383').rows,286);
  assert.equal(v.reports.filter(x=>x.kind==='holdings').reduce((n,x)=>n+x.rows,0),84032);
  assert.ok(v.edges.filter(e=>e.relation==='reported_13f_position').every(e=>e.attributes.control_inferred===false));
  assert.equal(r.entities.filter(e=>e.identifiers.ticker==='JPM').length,1);
  assert.ok(r.entities.find(e=>e.id==='market:JPM').aliases.includes('jepi morgan'));
  assert.ok(!r.entities.find(e=>e.id==='market:JPM').aliases.includes('JEPI'));
  const {batches,observations}=institutionalBatches(r,{cutoff});
  assert.equal(observations.length,13720);assert.equal(batches.reduce((n,b)=>n+b.known_states,0),13720);
  assert.ok(batches.every(b=>b.known_states<=1024));
  assert.ok(observations.every(o=>new URL(o.source_url).hostname==='www.sec.gov'));
  const facts=institutionalTrainingFacts(r,{cutoff});assert.equal(facts.length,6);assert.deepEqual(canonicalLedger(facts),facts);
});
