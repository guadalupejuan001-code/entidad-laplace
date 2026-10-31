import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {COT_DATASETS,PROJECT_MODULES,LIQUIDITY_SERIES} from '../universo/capital/catalogo.mjs';
import {cotUrl,parseCot,parseYieldCurve,parseFredTable,buildUSLiquidity,dollars,fetchUSLiquidity} from '../universo/capital/fuentes.mjs';
import {sourceText} from '../universo/capital/http.mjs';
import {observeCapital} from '../universo/capital/global.mjs';
import {verifyUniverseSnapshot} from '../universo/estados.mjs';
import {verificarSelloCaptura} from '../universo/integridad.mjs';
import {planMacroCapture,macroAsOf} from '../universo/vintages-macro.mjs';
import {proveGlobalEther} from '../universo/ether-global.mjs';

const at='2026-10-30T18:00:00.000Z',url='https://example.org/data';
function cotRow(dataset='disaggregated',{code=COT_DATASETS[dataset].markets[0],date='2026-10-20',long='100',short='40'}={}){
  const row={market_and_exchange_names:'TEST FUTURES',cftc_contract_market_code:code,
    report_date_as_yyyy_mm_dd:date+'T00:00:00.000',futonly_or_combined:'FutOnly',open_interest_all:'500',contract_units:'test_contract'};
  for(const [,l,s] of COT_DATASETS[dataset].categories){row[l]=long;row[s]=short}return row;
}
const curve='observation_date,DGS2,DGS10,DGS3MO\n2026-10-28,4.67,5.05,4.18\n';
function moneyInputs({rrp='0.176',tga='1000',assets='7000',date='2026-10-28'}={}){
  const values={WALCL:assets,WDTGAL:tga,RRPONTSYD:rrp};
  return Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{
    rows:[{date,values:{[name]:value}}],source:{url:'https://fred.stlouisfed.org/series/'+name,
      received_at:at,body_sha256:'a'.repeat(64)}}]));
}
const options={capturedAt:at,url};
test('project tracks all eleven required modules and keeps global liquidity unfinished',()=>{
  assert.equal(PROJECT_MODULES.length,11);
  assert.equal(PROJECT_MODULES.find(m=>m.id==='global_liquidity').status,'partial_us_only');
  assert.equal(PROJECT_MODULES.find(m=>m.id==='order_l3').status,'pending');
  assert.ok(Object.hasOwn(LIQUIDITY_SERIES,'WDTGAL'));assert.ok(!Object.hasOwn(LIQUIDITY_SERIES,'WTREGEN'));
});
test('COT parses real report categories as long, short and net contracts with date-only reference',()=>{
  const r=parseCot([cotRow()],{...options,dataset:'disaggregated'});
  assert.equal(r.observations.length,16);
  assert.equal(r.observations.find(x=>x.variable.endsWith('_managed_money_net')).value,60);
  assert.ok(r.observations.every(x=>x.known_at===at&&x.unit==='contracts'));
  assert.equal(r.reports[0].publication_at,null);assert.equal(r.reports[0].frequency,'weekly');
});
test('financial COT keeps leveraged funds distinct from asset managers',()=>{
  const row=cotRow('financial');row.lev_money_positions_long='20';row.lev_money_positions_short='90';
  const r=parseCot([row],{...options,dataset:'financial'});
  assert.equal(r.observations.find(x=>x.variable.endsWith('_leveraged_funds_net')).value,-70);
  assert.equal(r.observations.find(x=>x.variable.endsWith('_asset_managers_net')).value,60);
});
test('COT selects the latest eligible report and does not mix futures-only with combined reports',()=>{
  const rows=[cotRow('disaggregated',{date:'2026-10-13',long:'10'}),cotRow('disaggregated'),
    cotRow('disaggregated',{date:'2026-11-03',long:'999'}),
    {...cotRow('disaggregated',{date:'2026-10-27',long:'888'}),futonly_or_combined:'Combined'}];
  const r=parseCot(rows,{...options,dataset:'disaggregated'});
  assert.equal(r.reports[0].reference_date,'2026-10-20');assert.equal(r.observations.find(x=>x.variable.endsWith('_managed_money_long')).value,100);
});
test('COT missing positions are absent, genuine zeros remain and conflicting duplicates fail',()=>{
  const row=cotRow();row.m_money_positions_short_all=null;row.prod_merc_positions_long='0';
  const r=parseCot([row],{...options,dataset:'disaggregated'});
  assert.ok(!r.observations.some(x=>x.variable.endsWith('_managed_money_net')));
  assert.equal(r.observations.find(x=>x.variable.endsWith('_producers_long')).value,0);
  assert.ok(r.reports[0].missing_fields.includes('m_money_positions_short_all'));
  assert.throws(()=>parseCot([cotRow(),cotRow('disaggregated',{long:'101'})],{...options,dataset:'disaggregated'}),/contradictorio/);
});
test('COT source queries retain leading-zero market identifiers and bound the requested history',()=>{
  const u=new URL(cotUrl('disaggregated',at));
  assert.ok(u.searchParams.get('$where').includes("'088691'"));
  assert.ok(u.searchParams.get('$where').includes('2026-10-30T00:00:00.000'));
  assert.ok(u.toString().length<=1024);
});
test('yield spreads use one complete reference date and explicit 10Y-minus-short direction',()=>{
  const csv=curve+'2026-10-29,4.00,,4.25\n2026-11-02,9,10,8\n';
  const r=parseYieldCurve(csv,options);assert.equal(r.metadata.reference_date,'2026-10-28');
  assert.equal(r.observations.find(x=>x.variable==='US_10Y_minus_2Y').value,38);
  assert.equal(r.observations.find(x=>x.variable==='US_10Y_minus_3M').value,87);
  assert.equal(r.metadata.real_time,false);assert.ok(r.observations.every(x=>x.observed_at==='2026-10-28T00:00:00.000Z'));
});
test('inverted curves retain negative spreads and zero rates are valid data',()=>{
  const r=parseYieldCurve('DATE,DGS2,DGS10,DGS3MO\n2026-10-28,5.1,4.9,0\n',options);
  assert.equal(r.observations.find(x=>x.variable==='US_10Y_minus_2Y').value,-20);
  assert.equal(r.observations.find(x=>x.variable==='US_DGS3MO').value,0);
});
test('missing, contradictory, zipped and malformed FRED series cannot generate numeric observations',()=>{
  assert.throws(()=>parseYieldCurve('DATE,DGS2,DGS10,DGS3MO\n2026-10-28,4,,4\n',options),/sin observaciones/);
  assert.throws(()=>parseYieldCurve(curve+'2026-10-28,1,2,3\n',options),/contradictoria/);
  assert.throws(()=>parseFredTable('PK\u0003\u0004',{series:['WALCL'],capturedAt:at}),/ZIP/);
  assert.throws(()=>parseYieldCurve('<html>blocked</html>',options),/columnas/);
});
test('liquidity normalizes millions and billions to exact dollars before subtracting',()=>{
  const r=buildUSLiquidity(moneyInputs({assets:'7000',tga:'1000',rrp:'3.000'}),{capturedAt:at});
  assert.equal(r.observations.find(x=>x.variable==='US_Fed_TGA_ONRRP_proxy').value,3000000000);
  assert.equal(r.metadata.is_global_index,false);assert.match(r.metadata.formula,/WDTGAL/);
  assert.equal(dollars('0.176',1000000000),176000000);
  assert.equal(dollars('0.001',1000000),1000);
});
test('liquidity aligns all three components rather than combining a newer RRP with older balances',()=>{
  const inputs=moneyInputs();inputs.RRPONTSYD.rows.push({date:'2026-10-29',values:{RRPONTSYD:'999'}});
  const r=buildUSLiquidity(inputs,{capturedAt:at});
  assert.equal(r.metadata.reference_date,'2026-10-28');
  assert.equal(r.observations.find(x=>x.variable==='US_overnight_reverse_repo').value,176000000);
  inputs.WDTGAL.rows[0].date='2026-10-21';
  assert.throws(()=>buildUSLiquidity(inputs,{capturedAt:at}),/fecha común/);
});
test('a weekly-average TGA is not silently substituted for the Wednesday level',()=>{
  const inputs=moneyInputs();inputs.WTREGEN=inputs.WDTGAL;delete inputs.WDTGAL;
  assert.throws(()=>buildUSLiquidity(inputs,{capturedAt:at}),/tres componentes/);
  assert.throws(()=>dollars('0.000000001',1000000),/inferior a un dólar/);
  assert.throws(()=>dollars('99999999999999',1000000),/enteros exactos/);
});
test('unavailable liquidity inputs preserve valid components without manufacturing a proxy',async()=>{
  const result=await fetchUSLiquidity({now:()=>at,fetchImpl:async request=>{
    const id=new URL(request).searchParams.get('id');
    return id==='WDTGAL'?new Response('denied',{status:403}):new Response('DATE,'+id+'\n2026-10-28,1\n');
  }});
  assert.equal(result.observations.length,2);assert.equal(result.metadata.status,'unavailable');
  assert.ok(!result.observations.some(x=>x.variable==='US_Fed_TGA_ONRRP_proxy'));
  assert.equal(result.sources.find(x=>x.name==='FRED-WDTGAL').status,'unavailable');
});
test('source acquisition archives the actual body and retries a transient response once',async()=>{
  let attempts=0,archived;
  const result=await sourceText('test',url,{now:()=>at,fetchImpl:async()=>{
    attempts++;return attempts===1?new Response('busy',{status:503}):new Response('DATE,A\n2026-10-28,1\n');
  },archiveResponse:async data=>{archived=data;return 'raw.gz.b64'}});
  assert.equal(attempts,2);assert.equal(result.ok,true);assert.equal(result.source.received_at,at);
  assert.equal(result.source.body_sha256,createHash('sha256').update(archived.text).digest('hex'));
  let denied=0;
  const blocked=await sourceText('denied',url,{fetchImpl:async()=>{denied++;return new Response('denied',{status:403})}});
  assert.equal(denied,1);assert.equal(blocked.ok,false);
});
function allSources(request){
  const u=new URL(request),id=u.searchParams.get('id');
  if(request.includes('72hh-3qpy'))return new Response(JSON.stringify(COT_DATASETS.disaggregated.markets.map(code=>cotRow('disaggregated',{code}))));
  if(request.includes('gpe5-46if'))return new Response(JSON.stringify(COT_DATASETS.financial.markets.map(code=>cotRow('financial',{code}))));
  if(id==='DGS2,DGS10,DGS3MO')return new Response(curve);
  if(Object.hasOwn(LIQUIDITY_SERIES,id))return new Response('DATE,'+id+'\n2026-10-28,'+(id==='RRPONTSYD'?'0.176':id==='WDTGAL'?'1000':'7000')+'\n');
  return new Response('unavailable',{status:404});
}
test('three collection groups preserve 121 dated states, six raw sources and separate prediction status',async()=>{
  const r=await observeCapital({now:()=>at,fetchImpl:allSources});
  assert.equal(r.coverage.known_signals,121);assert.equal(r.coverage.observed_sources,6);
  assert.equal(r.cot_reports.length,7);assert.equal(r.coverage.failed_sources,0);
  assert.ok(verifyUniverseSnapshot(r.universal_state));assert.ok(verificarSelloCaptura(r));
  assert.equal(r.prediction_inputs_enabled,false);assert.equal(r.parallel_prediction_engine_validated,false);
  assert.ok(r.universal_state.states.every(x=>x.known_at<=r.at&&x.observed_at<=r.at));
});
test('new capital states enter the existing revision journal without historical leakage',async()=>{
  const r=await observeCapital({now:()=>at,fetchImpl:allSources});
  const saved=planMacroCapture([],r,{recordedAt:at});assert.equal(saved.summary.new_references,121);
  assert.equal(macroAsOf(saved.entries,'2026-10-30T17:59:59.999Z').known_states,0);
  assert.equal(macroAsOf(saved.entries,at).known_states,121);
});
test('collector failures remain visible and cannot erase working curve data',async()=>{
  const r=await observeCapital({now:()=>at,fetchImpl:async request=>request.includes('id=DGS2')?new Response(curve):new Response('down',{status:404})});
  assert.equal(r.coverage.known_signals,5);assert.equal(r.coverage.failed_sources,5);
  assert.equal(r.coverage.groups.find(g=>g.group==='cot').status,'unavailable');
});
test('capital states round-trip through original XI and Inverse Ether Memory',
  {skip:process.env.MUNDO_X_QUANTUM?false:'requires original Mundo X runtime'},async()=>{
    const r=await observeCapital({now:()=>at,fetchImpl:allSources});
    const proof=proveGlobalEther(process.env.MUNDO_X_QUANTUM,r.universal_state);
    assert.equal(proof.records,121);assert.equal(proof.materialized_bytes,3888);
    assert.equal(proof.exact_roundtrip,true);assert.equal(proof.active_qubits,0);
  });
