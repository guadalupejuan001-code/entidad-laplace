import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {FINRA_API,FINRA_TOKEN,authConfigured,createFinraClient,validateQuery,
  readFinraPages} from '../universo/otc/finra-query.mjs';
import {checkTargets,weeklyFilters,normalizeWeeklyRows,
  observeWeeklyFinra,dateOnly} from '../universo/otc/finra-weekly.mjs';
import {blockFilters,normalizeBlocks,observeMonthlyBlocks} from '../universo/otc/finra-blocks.mjs';

const WEEK='2026-09-28',MONTH='2026-08-01',CAPTURE='2026-10-31T03:25:00.000Z';
const T={symbol:'AAPL',tier:'T1'};
function weekly(segment='ATS',view='symbol',overrides={}){
  return {issueSymbolIdentifier:'AAPL',weekStartDate:WEEK,summaryStartDate:WEEK,
    tierIdentifier:'T1',summaryTypeCode:segment+'_W_SMBL'+(view==='venue'?'_FIRM':''),
    initialPublishedDate:'2026-10-19',lastUpdateDate:'2026-10-19',
    totalWeeklyTradeCount:'200',totalWeeklyShareQuantity:'20000',
    MPID:view==='venue'?'UBSA':null,firmCRDNumber:null,
    marketParticipantName:view==='venue'?'UBS ATS':null,
    ...overrides};
}
function block(segment='ATS',threshold='2K',override={}){
  return {monthStartDate:MONTH,summaryStartDate:MONTH,atsOtc:segment,
    summaryTypeCode:threshold,initialPublishedDate:'2026-10-05',
    lastUpdateDate:'2026-10-05',totalTradeCount:'1000',totalShareQuantity:'1000000',
    MPID:segment==='ATS'?'UBSA':undefined,
    marketParticipantName:segment==='ATS'?'UBS ATS':undefined,
    crdFirmName:segment==='OTC'?'DEALER LLC':undefined,
    ATSBlockCount:segment==='ATS'?'5':undefined,
    ATSBlockQuantity:segment==='ATS'?'12500':undefined,
    OTCBlockCount:segment==='OTC'?'5':undefined,
    OTCBlockQuantity:segment==='OTC'?'12500':undefined,...override};
}
const fakeClient=(fn)=>({enabled:true,request:async request=>{
  const rows=await fn(request);return {rows,received_at:CAPTURE,
    response_sha256:'a'.repeat(64),
    source_url:FINRA_API+'/data/group/otcMarket/name/'+request.dataset};
}});
test('OAuth no conecta sin credencial y jamás imprime datos secretos',()=>{
  assert.equal(authConfigured({clientId:'',clientSecret:''}),false);
  assert.equal(createFinraClient({clientId:'',clientSecret:''}).enabled,false);
  const c=createFinraClient({clientId:'client-test',clientSecret:'secret-test'});
  assert.equal(c.enabled,true);
  assert.equal(JSON.stringify(c),'{"enabled":true}'); // Las funciones request no exponen token.
});
test('query siempre filtra por período; valida límites, campos y dataset permitido',()=>{
  assert.throws(()=>validateQuery({dataset:'weeklySummary',compareFilters:[]}),/filtros/);
  assert.throws(()=>validateQuery({dataset:'weeklySummary',compareFilters:weeklyFilters({
    weekStart:WEEK,tier:'T1',symbol:'AAPL',segment:'ATS'}),limit:1001}),/límite/);
  assert.throws(()=>validateQuery({dataset:'bad',compareFilters:blockFilters(MONTH)}),/dataset/);
  assert.throws(()=>validateQuery({dataset:'blocksSummary',compareFilters:[
    {compareType:'EQUAL',fieldName:'issueSymbolIdentifier',fieldValue:'AAPL'}]}),/partición/);
  const q=validateQuery({dataset:'weeklySummary',compareFilters:weeklyFilters({
    weekStart:WEEK,tier:'T1',symbol:'AAPL',segment:'ATS'})});
  assert.equal(q.compareFilters.length,4);
});
test('OAuth y POST acotado usan endpoints oficiales y token no sale en recibos',async()=>{
  const requests=[];
  const c=createFinraClient({clientId:'id',clientSecret:'secret',now:()=>CAPTURE,
    fetchImpl:async (url,opt)=>{
      requests.push({url,auth:opt.headers.Authorization,body:opt.body});
      if(url===FINRA_TOKEN)return new Response(JSON.stringify({access_token:'token-very-long',
        expires_in:3600}),{status:200});
      return new Response(JSON.stringify([weekly()]),{status:200});
    }});
  const filters=weeklyFilters({weekStart:WEEK,...T,segment:'ATS'});
  const a=await c.request({dataset:'weeklySummary',compareFilters:filters});
  const b=await c.request({dataset:'weeklySummary',compareFilters:filters});
  assert.equal(requests.length,3);
  assert.equal(requests[0].url,FINRA_TOKEN);
  assert.equal(requests[1].url,FINRA_API+'/data/group/otcMarket/name/weeklySummary');
  assert.match(requests[0].auth,/^Basic /);
  assert.equal(requests[1].auth,'Bearer token-very-long');
  assert.equal(JSON.parse(requests[1].body).compareFilters[0].fieldValue,WEEK);
  assert.equal(a.rows.length,1);
  assert.ok(!JSON.stringify(a).includes('token-very-long'));
  assert.equal(b.rows.length,1);
});
test('OAuth concurrente comparte una sola petición de token',async()=>{
  let tokenCalls=0,apiCalls=0;
  const c=createFinraClient({clientId:'id',clientSecret:'secret',now:()=>CAPTURE,
    fetchImpl:async url=>{
      if(url===FINRA_TOKEN){tokenCalls++;return new Response(JSON.stringify({
        access_token:'shared-token-very-long',expires_in:3600}),{status:200})}
      apiCalls++;return new Response(JSON.stringify([weekly()]),{status:200});
    }});
  const q={dataset:'weeklySummary',
    compareFilters:weeklyFilters({weekStart:WEEK,...T,segment:'ATS'})};
  const rows=await Promise.all([c.request(q),c.request(q),c.request(q)]);
  assert.equal(rows.length,3);assert.equal(tokenCalls,1);assert.equal(apiCalls,3);
});
test('fecha semanal exige lunes, tier explícito y símbolos finra con slash',()=>{
  assert.equal(dateOnly(WEEK,{monday:true}),WEEK);
  assert.throws(()=>dateOnly('2026-10-30',{monday:true}),/lunes/);
  assert.deepEqual(checkTargets([{symbol:'AAC/U',tier:'T2'}]),[{symbol:'AAC/U',tier:'T2'}]);
  assert.throws(()=>checkTargets([{symbol:'AAPL',tier:'NMS'}]),/símbolo/);
  assert.throws(()=>checkTargets([T,T]),/duplicado/);
});
test('resumen semanal conserva período, publicación y categoría de datos no identificadores',()=>{
  const r=normalizeWeeklyRows([weekly()],{weekStart:WEEK,...T,segment:'ATS',at:CAPTURE});
  assert.equal(r.rows[0].venue,null);
  assert.equal(r.rows[0].shares,20000);
  assert.equal(r.rows[0].published_date,'2026-10-19');
  assert.throws(()=>normalizeWeeklyRows([weekly('ATS','symbol',{initialPublishedDate:'2026-11-02'})],
    {weekStart:WEEK,...T,segment:'ATS',at:CAPTURE}),/después/);
  assert.throws(()=>normalizeWeeklyRows([weekly('ATS','symbol',{summaryTypeCode:'ATS_W_SMBL_FIRM'})],
    {weekStart:WEEK,...T,segment:'ATS',at:CAPTURE}),/ajena/);
  assert.throws(()=>normalizeWeeklyRows([weekly('ATS','symbol',{MPID:'UBSA'})],
    {weekStart:WEEK,...T,segment:'ATS',at:CAPTURE}),/firma/);
});
test('vista de venues no identifica al inversor ni se suma al agregado',async()=>{
  const c=fakeClient(async q=>{
    const type=q.compareFilters.find(x=>x.fieldName==='summaryTypeCode').fieldValue;
    const segment=type.startsWith('ATS')?'ATS':'OTC';
    const view=type.endsWith('_FIRM')?'venue':'symbol';
    const amount=segment==='ATS'?20000:80000;
    return [weekly(segment,view,{totalWeeklyShareQuantity:String(amount),
      MPID:view==='venue'&&segment==='ATS'?'UBSA':null,
      marketParticipantName:view==='venue'?segment==='ATS'?'UBS ATS':'De Minimis Firms':null,
      firmCRDNumber:null})];
  });
  const x=await observeWeeklyFinra({weekStart:WEEK,targets:[T],
    client:c,now:()=>CAPTURE,pageSize:10,maxPages:2});
  assert.equal(x.status,'observed');
  assert.equal(x.observations.length,5); // 2 por segmento + cuota ATS del total off exchange
  assert.equal(x.venues.length,2);
  assert.equal(x.coverage.observed_sources,4);
  assert.ok(x.venues.every(r=>r.customer_identity_unavailable===true));
  assert.ok(x.venues.every(r=>r.double_count_with_symbol_totals===true));
  assert.equal(x.observations.find(r=>r.variable==='FINRA_ATS_OFF_EXCHANGE_SHARE_AAPL').value,0.2);
  assert.ok(x.observations.every(r=>r.known_at===CAPTURE));
  const snap=universeSnapshot(x.observations,{cutoff:'2026-10-30T00:00:00.000Z'});
  assert.equal(snap.known_states,0);
});
test('fallos y ausencia no se transforman en volumen cero',async()=>{
  const bad=fakeClient(async()=>[]);
  const r=await observeWeeklyFinra({weekStart:WEEK,targets:[T],client:bad,
    now:()=>CAPTURE,includeVenues:false,pageSize:10});
  assert.equal(r.observations.length,0);
  assert.equal(r.status,'partial_or_unavailable');
  assert.equal(r.sources[0].status,'not_reported');
  assert.equal(r.sources[1].status,'not_reported');
  const noCred=await observeWeeklyFinra({weekStart:WEEK,targets:[T],
    client:{enabled:false},now:()=>CAPTURE});
  assert.equal(noCred.status,'requires_credentials');
  assert.equal(noCred.sources[0].status,'requires_credentials');
});
test('paginación truncada no produce estados falsos',async()=>{
  const client=fakeClient(async()=>[weekly()]);
  const pages=await readFinraPages(client,{dataset:'weeklySummary',
    compareFilters:weeklyFilters({weekStart:WEEK,...T,segment:'ATS'}),pageSize:1,maxPages:1});
  assert.equal(pages.complete,false);
  assert.equal(pages.rows.length,0);
  const report=await observeWeeklyFinra({weekStart:WEEK,targets:[T],client,
    now:()=>CAPTURE,pageSize:1,maxPages:1,includeVenues:false});
  assert.equal(report.observations.length,0);
  assert.ok(report.sources.every(s=>s.status==='unavailable'));
});
test('bloques mensuales mantienen intervalos y no suman total de trades dos veces',async()=>{
  const c=fakeClient(async q=>{
    if(q.dataset==='blocksSummary')return [block('ATS','2K'),block('ATS','10K',
      {ATSBlockCount:'3',ATSBlockQuantity:'33000'})];
    return [block('OTC','10K')];
  });
  const x=await observeMonthlyBlocks({monthStart:MONTH,client:c,now:()=>CAPTURE});
  assert.equal(x.observations.length,6);
  assert.equal(x.venues.length,3);
  assert.equal(x.coverage.observed_sources,2);
  assert.equal(x.observations.find(o=>o.variable==='FINRA_ATS_BLOCKS_2K_block_count').value,5);
  assert.equal(x.observations.find(o=>o.variable==='FINRA_ATS_BLOCKS_10K_block_shares').value,33000);
  assert.ok(x.observations.every(o=>!o.variable.includes('totalShareQuantity')));
  assert.ok(x.venues.every(v=>v.all_trades_includes_block_and_nonblock));
  assert.ok(x.venues.every(v=>v.do_not_sum_with_weekly));
});
test('bloques solo se admiten con publicación conocida y campos consistentes',()=>{
  assert.throws(()=>blockFilters('2026-08-18'),/01/);
  assert.throws(()=>normalizeBlocks([block('ATS','2K',{ATSBlockQuantity:'1000001'})],
    {monthStart:MONTH,segment:'ATS',at:CAPTURE}),/excede/);
  assert.throws(()=>normalizeBlocks([block('ATS','2K',{initialPublishedDate:'2026-11-02'})],
    {monthStart:MONTH,segment:'ATS',at:CAPTURE}),/no publicado/);
  assert.throws(()=>normalizeBlocks([block('OTC','2K',{atsOtc:'ATS'})],
    {monthStart:MONTH,segment:'OTC',at:CAPTURE}),/ajeno/);
});
test('datos mensuales opcionales no se simulan sin credenciales',async()=>{
  const x=await observeMonthlyBlocks({monthStart:MONTH,client:{enabled:false},
    now:()=>CAPTURE});
  assert.equal(x.status,'requires_credentials');
  assert.equal(x.observations.length,0);
});
