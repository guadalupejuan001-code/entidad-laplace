import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalLedger,canonicalFact,parseJSONL,stringifyJSONL,asOf,
  latestEconomicVintages,persistenceBaseline,ledgerHash} from '../historia/contrato.mjs';
import {prepareEtherProjection,proveWithOriginalEther} from '../historia/ether-xi.mjs';

// All fixture data below is SYNTHETIC: never use these values as market quotes.
const src='https://example.org/synthetic-test-not-market-data';
const price=(id,observed,known,value)=>({
  id,kind:'precio',asset:'TEST',price_basis:'raw_close',currency:'USD',
  observed_at:observed,known_at:known,value,source_url:src
});
const economy=(id,known,value)=>({
  id,kind:'economia',series_id:'SYNTHETIC_SERIES',unit:'index',
  observed_at:'2020-01-01T00:00:00Z',known_at:known,value,source_url:src
});
const geo=(id,known)=>({
  id,kind:'geopolitica',event_code:'TEST_EVENT',summary:'Hecho artificial de prueba',
  region:'TEST_REGION',source_url:src,observed_at:'2020-01-02T00:00:00Z',known_at:known
});
const all=canonicalLedger([
  price('p1','2020-01-01T21:00:00Z','2020-01-01T21:01:00Z','100.00'),
  price('p2','2020-01-02T21:00:00Z','2020-01-02T21:01:00Z','102.50'),
  economy('econ-first','2020-01-02T13:00:00Z','1.2'),
  economy('econ-revised','2020-01-06T13:00:00Z','2.1'),
  geo('geopub','2020-01-04T14:00:00Z')
]);

test('canonical ledger is lossless, stable and rejects duplicate identifiers',()=>{
  assert.equal(parseJSONL(stringifyJSONL(all)).length,5);
  assert.deepEqual(parseJSONL(stringifyJSONL(all)),all);
  assert.equal(ledgerHash(all),ledgerHash([...all].reverse()));
  assert.throws(()=>canonicalLedger([...all,all[0]]),/duplicate/);
});

test('a past event published later remains invisible until publication',()=>{
  const a=asOf(all,'2020-01-03T00:00:00Z');
  assert.deepEqual(a.map(x=>x.id),['p1','econ-first','p2']);
  assert.equal(a.some(x=>x.id==='geopub'),false);
  assert.equal(a.some(x=>x.id==='econ-revised'),false);
  const b=asOf(all,'2020-01-04T14:00:00Z');
  assert.equal(b.some(x=>x.id==='geopub'),true);
});

test('economic revisions preserve historically available version',()=>{
  const before=latestEconomicVintages(all,'2020-01-03T00:00:00Z');
  const after=latestEconomicVintages(all,'2020-01-07T00:00:00Z');
  assert.equal(before[0].value,'1.2');
  assert.equal(after[0].value,'2.1');
});

test('baseline is computed only from prices known by cutoff, or abstains',()=>{
  const early=persistenceBaseline(all,'2020-01-01T21:00:00Z','TEST');
  assert.equal(early.status,'sin_datos');
  const known=persistenceBaseline(all,'2020-01-02T21:01:00Z','TEST');
  assert.equal(known.forecast,'102.50');
  assert.equal(known.status,'referencia_sin_ia');
  assert.equal(persistenceBaseline(all,'2020-01-07T00:00:00Z','UNKNOWN').forecast,null);
});

test('missing publication time or forged future access is rejected',()=>{
  const p=price('bad','2020-01-04T21:00:00Z','2020-01-03T21:00:00Z','1.00');
  assert.throws(()=>canonicalFact(p),/cannot be known before/);
  assert.throws(()=>canonicalFact({...p,known_at:undefined}));
  assert.throws(()=>canonicalFact({...p,known_at:'2020-02-31T12:00:00Z'}));
  assert.throws(()=>canonicalFact({...p,source_url:'file:///secret'}));
  assert.throws(()=>canonicalFact({...p,kind:'not_real'}));
  assert.throws(()=>canonicalFact({...p,value:1.2}));
  assert.throws(()=>canonicalFact({...p,value:'0.00',known_at:'2020-01-05T21:00:00Z'}));
});

test('XI projection excludes later publications before it creates a program',()=>{
  const a=prepareEtherProjection(all,'2020-01-02T22:00:00Z');
  const b=prepareEtherProjection(all,'2020-01-07T22:00:00Z');
  assert.equal(a.records.length,3);
  assert.equal(b.records.length,5);
  assert.ok(!a.bytes.toString('utf8').includes('geopub'));
  assert.ok(!a.bytes.toString('utf8').includes('econ-revised'));
  assert.ok(b.bytes.toString('utf8').includes('econ-revised'));
  assert.ok(a.xi.includes('mem_materialize'));
  assert.ok(a.xi.includes('mem_store'));
  assert.notEqual(a.sha256,b.sha256);
});

test('original native XI/Ether round-trip conserves every available record',t=>{
  if(!process.env.MUNDO_X_QUANTUM){
    t.skip('requires original pinned Mundo X executable from CI');return;
  }
  const result=proveWithOriginalEther(process.env.MUNDO_X_QUANTUM,all,'2020-01-02T22:00:00Z');
  assert.equal(result.status,'XI_VERIFICADO');
  assert.equal(result.exact_roundtrip,true);
  assert.equal(result.visible_records,3);
  assert.equal(result.active_qubits,0);
  assert.equal(result.observed_kinds.geopolitica,0);
  assert.ok(result.inverse_memory_overrides>0);
  assert.equal(result.forecasts_generated,0);
});
