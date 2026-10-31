import test from 'node:test';
import assert from 'node:assert/strict';
import {CFTC_TABLES,parseCftcWeeklyHtml,observeCftcWeekly} from '../universo/swaps/cftc-semanal.mjs';
import {parsePublicSdrRecord,ingestPublicSdrRows} from '../universo/swaps/sdr-publico.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {readFileSync} from 'node:fs';

const now='2026-10-31T05:45:00.000Z';
const dates=['September 11','September 18','September 25','October 02','October 09'];
const baseRows=[
['Total Interest Rate*',[452840098,443345532,440828042,437677154,447597368]],
['Cleared**',[393690713,385448030,383299703,380502211,390424271]],
['Uncleared',[59149385,57897502,57528339,57174943,57173097]],
['Total Credit',[7546059,7403808,8324619,8589200,8426536]],
['Cleared',[4986647,5189222,5886944,6022648,5813800]],
['Uncleared',[2559412,2214585,2437675,2566552,2612736]],
['Total FX',[93179796,79295286,81143056,84378711,82574588]],
['Cleared',[4627718,4114896,4132482,4083242,4103726]],
['Uncleared',[88552078,75180390,77010574,80295469,78470862]],
['TOTAL',[553565953,530044626,530295717,530645065,538598491]]
];
const title={
gross_notional:'Gross Notional Outstanding by Cleared Status (Millions of USD) - Open Interest Equivalent (Single-Count) - 10/09/2026',
trade_dollars:'Transaction Dollar Volume by Cleared Status (Millions of USD) (Single-Count) - 10/09/2026',
trade_tickets:'Transaction Ticket Volume by Cleared Status (Transactions) (Single-Count) - 10/09/2026'
};
const moneyRows=[
['Total Interest Rate*',[19587561,23357236,18437027,21095539,17932972]],
['Cleared**',[17722701,20909609,16044817,18855782,16061980]],
['Uncleared',[1864860,2447627,2392210,2239756,1870992]],
['Total Credit',[558253,899454,3290303,1665053,1085518]],
['Cleared',[359948,604128,2830091,1318361,792297]],
['Uncleared',[198305,295326,460212,346692,293221]],
['Total FX',[15335334,14420650,14289023,18185959,13175643]],
['Cleared',[386996,349558,334542,327678,340952]],
['Uncleared',[14948338,14071092,13954481,17858281,12834692]],
['TOTAL',[35481148,38677340,36016353,40946550,32194133]]
];
const ticketRows=[
['Total Interest Rate*',[92251,103998,94009,98486,90290]],
['Cleared**',[85963,94810,85088,90280,83220]],
['Uncleared',[6288,9188,8921,8206,7070]],
['Total Credit',[6688,10038,19543,17765,12992]],
['Cleared',[5757,8625,16831,15450,11318]],
['Uncleared',[931,1414,2712,2315,1674]],
['Total FX',[739303,734109,704768,787111,666015]],
['Cleared',[52768,56515,53408,55866,45659]],
['Uncleared',[686535,677595,651360,731245,620356]],
['TOTAL',[838242,848145,818319,903362,769297]]
];
const rowsFor={gross_notional:baseRows,trade_dollars:moneyRows,trade_tickets:ticketRows};
function html(kind,{dated='10/09/2026',rows=rowsFor[kind],cols=dates}={}){
  const t=title[kind].replace('10/09/2026',dated);
  const cells=(arr,tag='td')=>arr.map(x=>'<'+tag+'><span>'+x+'</span></'+tag+'>').join('');
  return '<!doctype html><html><body><h1>'+t+'</h1>'+
    '<table><tbody><tr>'+cells(['',...cols],'th')+'</tr>'+
    rows.map(([label,nums])=>'<tr>'+cells([label,...nums.map(x=>x.toLocaleString('en-US'))])+'</tr>').join('')+
    '</tbody></table><p>Only single-count cleared-status rows, not participant totals.</p></body></html>';
}
test('D002 01: 3 documentos CFTC oficiales, sin URLs arbitrarias ni datos privados',()=>{
  assert.equal(Object.keys(CFTC_TABLES).length,3);
  assert.ok(Object.values(CFTC_TABLES).every(x=>x.url.startsWith('https://www.cftc.gov/MarketReports/SwapsReports/')));
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional'),{kind:'gross_notional',knownAt:now,
    sourceUrl:'https://evil.example/index.html'}),/autorizada/);
});
test('D002 02: la tabla notional produce 50 observaciones exactas con cinco viernes',()=>{
  const result=parseCftcWeeklyHtml(html('gross_notional'),{kind:'gross_notional',knownAt:now});
  assert.equal(result.observations.length,50);
  assert.deepEqual(result.week_dates,['2026-09-11','2026-09-18','2026-09-25','2026-10-02','2026-10-09']);
  const x=result.observations.find(o=>o.variable==='CFTC_gross_notional_interest_rate_total'&&
    o.observed_at==='2026-10-09T00:00:00.000Z');
  assert.equal(x.value,447597368);
  assert.equal(x.unit,'million_usd');
  assert.equal(x.known_at,now);
  assert.equal(result.raw_counterparties,false);
  assert.equal(result.reference_status,'lagging_weekly_page');
  assert.ok(result.reference_age_days>21);
});
test('D002 03: dólares de transacciones y tickets no se mezclan con notional outstanding',()=>{
  const money=parseCftcWeeklyHtml(html('trade_dollars'),{kind:'trade_dollars',knownAt:now});
  const tickets=parseCftcWeeklyHtml(html('trade_tickets'),{kind:'trade_tickets',knownAt:now});
  assert.equal(money.observations.length,50);
  assert.equal(tickets.observations.length,50);
  assert.ok(money.observations.every(x=>x.unit==='million_usd'));
  assert.ok(tickets.observations.every(x=>x.unit==='count'));
  assert.equal(money.observations.find(x=>x.variable==='CFTC_trade_dollars_all_all'&&
    x.observed_at==='2026-10-09T00:00:00.000Z').value,32194133);
  assert.equal(tickets.observations.find(x=>x.variable==='CFTC_trade_tickets_all_all'&&
    x.observed_at==='2026-10-09T00:00:00.000Z').value,769297);
});
test('D002 04: rechaza totales inconsistentes, datos no numéricos o tabla cortada',()=>{
  const bad=baseRows.map(([s,v])=>[s,[...v]]);
  bad[1][1][4]=100;
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional',{rows:bad}),{
    kind:'gross_notional',knownAt:now}),/tabla única/);
  const missing=baseRows.slice(0,9);
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional',{rows:missing}),{
    kind:'gross_notional',knownAt:now}),/tabla única/);
  const nullRows=baseRows.map(([s,v])=>[s,[...v]]);nullRows[0][1][3]='N/A';
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional',{rows:nullRows}),{
    kind:'gross_notional',knownAt:now}),/tabla única/);
});
test('D002 05: no admite referencias futuras, semanas de distinta longitud ni cambio de tabla',()=>{
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional'),{
    kind:'gross_notional',knownAt:'2026-10-08T10:00:00.000Z'}),/futura/);
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional',{cols:[
    'September 11','September 18','September 25','October 03','October 09']}),{
      kind:'gross_notional',knownAt:now}),/semanales/);
  assert.throws(()=>parseCftcWeeklyHtml(html('gross_notional'),{
    kind:'trade_dollars',knownAt:now}),/encabezado/);
});
test('D002 06: no retrotrae información descargada hoy a la semana antigua',()=>{
  const report=parseCftcWeeklyHtml(html('gross_notional'),{kind:'gross_notional',knownAt:now});
  const before=universeSnapshot(report.observations,{cutoff:'2026-10-23T22:00:00.000Z'});
  assert.equal(before.known_states,0);
  const at=universeSnapshot(report.observations,{cutoff:now});
  assert.equal(at.known_states,50);
});
test('D002 07: las tres fuentes comienzan concurrentemente y devuelven 150 estados',async()=>{
  const pending=new Map();
  const task=observeCftcWeekly({now:()=>now,fetchImpl:url=>
    new Promise(resolve=>pending.set(url,resolve))});
  assert.equal(pending.size,3);
  for(const [key,def] of Object.entries(CFTC_TABLES))pending.get(def.url)(
    new Response(html(key),{status:200,headers:{'content-type':'text/html'}}));
  const report=await task;
  assert.equal(report.observations.length,150);
  assert.equal(report.source_status.filter(x=>x.status==='observed').length,3);
  assert.equal(report.coverage.latest_week,'2026-10-09');
  assert.equal(report.prediction_inputs_enabled,false);
  assert.equal(report.automatic_trading,false);
});
test('D002 08: una fuente HTTP 403 no equivale a cero OTC; se preservan las demás',async()=>{
  const r=await observeCftcWeekly({now:()=>now,fetchImpl:url=>
    url===CFTC_TABLES.trade_dollars.url?new Response('denied',{status:403}):
    new Response(html(Object.entries(CFTC_TABLES).find(([,x])=>x.url===url)[0]),{status:200})});
  assert.equal(r.observations.length,100);
  assert.equal(r.coverage.unavailable_sources,1);
  assert.equal(r.source_status.find(x=>x.status==='unavailable').missing_is_zero,false);
});
test('D002 09: no mezcla tablas de semanas incompatibles',async()=>{
  const old=['September 04','September 11','September 18','September 25','October 02'];
  const r=await observeCftcWeekly({now:()=>now,fetchImpl:url=>{
    const kind=Object.entries(CFTC_TABLES).find(([,x])=>x.url===url)[0];
    return new Response(kind==='trade_dollars'?html(kind,{dated:'10/02/2026',cols:old}):html(kind),
      {status:200});
  }});
  assert.equal(r.observations.length,0);
  assert.equal(r.coverage.status,'incompatible_reference_weeks');
});
const source='https://www.cmegroup.com/market-data/repository/data.html';
const sdr=(opts={})=>({
 public_id:'PUBLIC:SWAP:12345678',
 execution_at:'2026-10-30T15:00:00.000Z',
 disseminated_at:'2026-10-30T16:00:00.000Z',
 asset_class:'interest_rate',notional:'2500000',
 notional_currency:'USD',notional_semantics:'rounded',
 clearing:'cleared',action:'new',version:1,
 tenor:'5Y',price:3.5,price_unit:'percent',...opts
});
test('D002 10: contrato Part43 no expone contrapartes ni presume nocional exacto',()=>{
  const r=parsePublicSdrRecord(sdr(),{receivedAt:now,sourceUrl:source});
  assert.equal(r.asset_class,'interest_rate');
  assert.equal(r.notional_is_true_exact_amount,false);
  assert.equal(r.counterparties_identified,false);
  assert.ok(!JSON.stringify(r).includes('PUBLIC:SWAP:12345678'));
  assert.throws(()=>parsePublicSdrRecord({...sdr(),counterparty_name:'Private A'},{
    receivedAt:now,sourceUrl:source}),/confidencial/);
  assert.throws(()=>parsePublicSdrRecord(sdr(),{receivedAt:now,
    sourceUrl:'https://third-party.example/download.csv'}),/aprobada/);
});
test('D002 11: Notional masked no inventa valor; cancelación elimina y corrección espera',()=>{
  const masked=ingestPublicSdrRows([sdr({notional:null,notional_semantics:'masked'})],{
    receivedAt:now,sourceUrl:source});
  assert.equal(masked.observations.length,0);
  assert.equal(masked.pending[0].reason,'notional_capped_or_masked');
  const versioned=ingestPublicSdrRows([sdr(),sdr({version:2,action:'cancel'})],{
    receivedAt:now,sourceUrl:source});
  assert.equal(versioned.observations.length,0);
  assert.equal(versioned.tombstoned.length,1);
  const corrected=ingestPublicSdrRows([sdr(),sdr({version:2,action:'correct',notional:'2600000'})],{
    receivedAt:now,sourceUrl:source});
  assert.equal(corrected.observations.length,0);
  assert.equal(corrected.pending[0].reason,'correction_requires_reconciled_prior_snapshot');
});
test('D002 11b: tasas de swap negativas válidas y URL con secretos rechazada',()=>{
  const r=parsePublicSdrRecord(sdr({price:'-0.25'}),{receivedAt:now,sourceUrl:source});
  assert.equal(r.price,-0.25);
  assert.throws(()=>parsePublicSdrRecord(sdr(),{receivedAt:now,
    sourceUrl:source+'?token=PRIVATE'}),/aprobada/);
});
test('D002 12: precio y diseminación posterior al corte rechazados',()=>{
  assert.throws(()=>parsePublicSdrRecord(sdr({
    disseminated_at:'2026-11-01T15:00:00.000Z'}),{
    receivedAt:now,sourceUrl:source}),/aún no divulgada/);
  assert.throws(()=>parsePublicSdrRecord(sdr({version:0}),{
    receivedAt:now,sourceUrl:source}),/revisión/);
});
test('D002 13: U003 opt-in por defecto y no trading',()=>{
  const src=readFileSync(new URL('../universo/global-u003.mjs',import.meta.url),'utf8');
  assert.match(src,/LAPLACE_D002_ENABLED==='true'/);
  assert.match(src,/if\(includeOtcSwaps\)/);
});
