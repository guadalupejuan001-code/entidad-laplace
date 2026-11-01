import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPABILITY_CATALOG,resumirCapacidades} from '../nucleo/registro-capacidades.mjs';
test('las veinte capacidades tienen ID, ruta y no se presentan ejecutadas por defecto',()=>{
  assert.equal(CAPABILITY_CATALOG.length,20);
  assert.equal(new Set(CAPABILITY_CATALOG.map(x=>x.id)).size,20);
  assert.ok(CAPABILITY_CATALOG.every(x=>x.source&&x.title));
  const x=resumirCapacidades();
  assert.equal(x.items.length,20);
  assert.equal(x.counts.executed,0);
  assert.equal(x.complete_in_apk,false);
  assert.equal(x.world_affects_central_price,false);
  assert.equal(x.validated_predictive_gain,false);
});
test('BIS y DeFi son observaciones parciales, no predictores certificados',()=>{
  const w={captured_at:'2026-10-31T20:04:19Z',
    capture_sha256:'f'.repeat(64),states_count:1051,
    archive_manifests_count:3,
    groups:[{group:'bis_banking_b001',signals:32,status:'observed_partial'},
      {group:'blockchain_defi_k001',signals:16,status:'observed_partial'},
      {group:'etf_fund_flows_c001',signals:0,status:'requires_credentials'},
      {group:'derivatives_d001',signals:154,status:'observed_partial'},
      {group:'swaps_otc_d002',signals:150,status:'observed_partial'}],
    ef004_report:{schema:'laplace-demonio-financiero-ef004-v1',
      status:'abstained',reason:'insufficient_independent_capture_history',
      as_of:'2026-10-31T20:04:19Z',contiguous_captures:1}};
  const r=resumirCapacidades({world:w,executed:{f001:true}});
  const item=k=>r.items.find(x=>x.key===k);
  assert.equal(item('B001').state,'observed_archive');
  assert.equal(item('K001').state,'observed_archive');
  assert.equal(item('C001').state,'not_observed');
  assert.equal(item('D001_D002').state,'observed_archive');
  assert.equal(item('EF004').state,'abstained');
  assert.equal(item('EF001_EF005').state,'partial');
  assert.equal(item('RAW_V001').state,'partial');
  assert.equal(item('XN01').state,'not_executed');
  assert.equal(r.counts.executed,0);
});
test('el reporte sólo declara XI ejecutado al recibir su resultado nativo',()=>{
  const r=resumirCapacidades({executed:{xn01:true,m001Diary:12}});
  assert.equal(r.items.find(x=>x.key==='XN01_RAW').state,'executed');
  assert.equal(r.items.find(x=>x.key==='M001_DIARY').state,'partial');
  assert.equal(r.items.find(x=>x.key==='EF003').state,'not_executed');
});
