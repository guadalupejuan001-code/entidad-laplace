import test from 'node:test';
import assert from 'node:assert/strict';
import {resumirFuentesEF002} from '../estado-financiero/resumen-fuentes.mjs';
test('CFTC publica count: sus 150 observaciones se preservan en el resumen',()=>{
  const rows=[
    {group:'swaps_otc_d002',name:'CFTC-gross_notional',status:'observed',count:50},
    {group:'swaps_otc_d002',name:'CFTC-trade_dollars',status:'observed',count:50},
    {group:'swaps_otc_d002',name:'CFTC-trade_tickets',status:'observed',count:50},
    {group:'derivatives_d001',name:'mark',status:'observed',signals:14},
    {group:'etf_fund_flows_c001',name:'NPORT',status:'requires_credentials'},
    {group:'direct_exchanges',name:'Private feed',status:'requires_license'}
  ];
  const g=resumirFuentesEF002(rows);
  assert.equal(g.find(x=>x.group==='swaps_otc_d002').signal_count,150);
  assert.equal(g.find(x=>x.group==='swaps_otc_d002').observed_sources,3);
  assert.equal(g.find(x=>x.group==='derivatives_d001').signal_count,14);
  assert.equal(g.find(x=>x.group==='etf_fund_flows_c001').restricted_sources,1);
  assert.equal(g.find(x=>x.group==='direct_exchanges').restricted_sources,1);
});
test('no duplica count y signals, ni transforma fuentes no observadas en ceros de mercado',()=>{
  const [g]=resumirFuentesEF002([
    {group:'g',name:'once',status:'observed',signals:2,count:50},
    {group:'g',name:'retry',status:'unavailable',count:100},
    {group:'g',name:'not_public',status:'not_published',count:90}
  ]);
  assert.equal(g.signal_count,2);
  assert.equal(g.observed_sources,1);
  assert.equal(g.failed_sources,1);
  assert.equal(g.not_reported_sources,1);
  assert.equal(g.source_ids.length,3);
});
test('un contador inválido no afecta el resto de los indicadores',()=>{
  const [g]=resumirFuentesEF002([
    {group:'g',status:'observed',count:'NaN'},
    {group:'g',status:'observed',count:3}
  ]);
  assert.equal(g.signal_count,3);
});
