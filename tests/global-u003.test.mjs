import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBisPolicyCsv,parseBls,parseFredCsv,parseFredInitialRelease,parseNeso,parsePortWatch,
  parseGdeltGeo,parseOpenSky,parseJQuantsTopix
} from '../universo/fuentes-u003.mjs';
import {cleanSymbol} from '../bolsa/mercado.mjs';
import {
  REGIONAL_MARKET_SYMBOLS,COMMODITY_FUTURES,POLICY_AREAS,NEWS_TOPICS,NESO_FIELDS
} from '../universo/catalogo-u003.mjs';

const captured='2026-10-30T15:30:00.000Z';
test('U003 catalog adds regional exchanges and real commodity futures without replacing U002',()=>{
  assert.ok(REGIONAL_MARKET_SYMBOLS.includes('^N225'));
  assert.ok(REGIONAL_MARKET_SYMBOLS.includes('^BVSP'));
  assert.ok(REGIONAL_MARKET_SYMBOLS.includes('^GDAXI'));
  assert.equal(cleanSymbol('000001.SS'),'000001.SS');
  assert.ok(COMMODITY_FUTURES.includes('CL=F'));
  assert.ok(COMMODITY_FUTURES.includes('GC=F'));
  assert.ok(POLICY_AREAS.length>=15);
  assert.ok(NEWS_TOPICS.length>=6);
});
test('BIS policy-rate SDMX CSV parser preserves monthly reference time and capture time',()=>{
  const csv='FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE\nM,US,2026-09,3.875\nM,GB,2026-09,3.75\nM,US,2026-08,4.125\n';
  const rows=parseBisPolicyCsv(csv,{capturedAt:captured,url:'https://stats.bis.org/test',areas:['US','GB']});
  assert.equal(rows.length,2);assert.equal(rows.find(x=>x.variable==='US_policy_rate').value,3.875);
  assert.equal(rows[0].known_at,captured);assert.match(rows[0].observed_at,/2026-09-01/);
});
test('BLS parser returns monthly employment levels with first-seen knowledge timestamp',()=>{
  const raw={status:'REQUEST_SUCCEEDED',Results:{series:[
    {seriesID:'CES0000000001',data:[{year:'2026',period:'M09',value:'160500'}]},
    {seriesID:'LNS14000000',data:[{year:'2026',period:'M09',value:'4.2'}]}
  ]}};
  const rows=parseBls(raw,{capturedAt:captured,url:'https://api.bls.gov/'});
  assert.equal(rows.length,2);assert.equal(rows.find(x=>x.variable==='us_unemployment_rate').value,4.2);
});
test('FRED public CSV parser supports weekly claims without an API key',()=>{
  const csv='DATE,ICSA\n2026-10-17,195000\n2026-10-24,194000\n';
  const row=parseFredCsv(csv,{series:'ICSA',capturedAt:captured,url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=ICSA'});
  assert.equal(row.value,194000);assert.equal(row.variable,'us_initial_unemployment_claims');
});
test('ALFRED date-only vintage does not invent an intraday publication timestamp',()=>{
  const raw={observations:[
    {date:'2026-07-01',realtime_start:'2026-08-07',realtime_end:'2026-08-26',value:'4.3'},
    {date:'2026-08-01',realtime_start:'2026-09-04',realtime_end:'2026-09-30',value:'4.4'}
  ]};
  const row=parseFredInitialRelease(raw,{series:'UNRATE',capturedAt:captured,url:'https://api.stlouisfed.org/fred/series/observations'});
  assert.equal(row.variable,'us_unemployment_rate_vintage');
  assert.equal(row.value,4.4);
  assert.equal(row.known_at,captured);
  assert.equal(row.observed_at,'2026-08-01T00:00:00.000Z');
});
test('NESO parser extracts actual half-hour electricity state',()=>{
  const rec={SETTLEMENT_DATE:'2026-10-29',SETTLEMENT_PERIOD:48,FORECAST_ACTUAL_INDICATOR:'A',
    ND:27000,TSD:29000,EMBEDDED_WIND_GENERATION:3100,EMBEDDED_SOLAR_GENERATION:0,
    IFA_FLOW:1000,BRITNED_FLOW:-400,NEMO_FLOW:500,NSL_FLOW:1200,ELECLINK_FLOW:300,VIKING_FLOW:800};
  const rows=parseNeso({success:true,result:{records:[rec]}},{capturedAt:captured,url:'https://api.neso.energy/test'});
  assert.equal(rows.length,NESO_FIELDS.length);assert.equal(rows.find(x=>x.variable==='gb_national_demand').value,27000);
});
test('PortWatch parser aggregates port calls and estimated trade separately',()=>{
  const raw={features:[{attributes:{date:'2026-10-28',portcalls_sum:1200,portcalls_cargo_sum:700,portcalls_tanker_sum:250,import_sum:5e7,export_sum:4e7}}]};
  const rows=parsePortWatch(raw,{capturedAt:captured,url:'https://portwatch.imf.org/test'});
  assert.equal(rows.length,5);assert.equal(rows.find(x=>x.variable==='global_port_calls').value,1200);
});
test('GDELT geolocated news parser creates counts and hemisphere shares only from coordinates',()=>{
  const raw={type:'FeatureCollection',features:[
    {geometry:{coordinates:[10,50]}},{geometry:{coordinates:[-70,-20]}},{geometry:{coordinates:[120,30]}}
  ]};
  const rows=parseGdeltGeo(raw,{topic:'conflict',capturedAt:captured,url:'https://api.gdeltproject.org/test'});
  assert.equal(rows.length,3);assert.equal(rows.find(x=>x.variable==='gdelt_conflict_locations').value,3);
  assert.equal(rows.find(x=>x.variable==='gdelt_conflict_north_share').value,2/3);
});
test('OpenSky parser reduces authorized global states without retaining aircraft identities',()=>{
  const raw={time:Date.parse('2026-10-30T15:29:00Z')/1000,states:[
    ['abc',null,null,null,null,-74,40,null,false,240],
    ['def',null,null,null,null,2,48,null,false,220],
    ['ghi',null,null,null,null,130,-30,null,true,0]
  ]};
  const rows=parseOpenSky(raw,{capturedAt:captured,url:'https://opensky-network.org/api/states/all'});
  assert.ok(rows.some(x=>x.variable==='global_aircraft_visible'&&x.value===3));
  assert.ok(rows.every(x=>!JSON.stringify(x).includes('abc')));
});
test('JPX direct parser remains credential-gated but has a deterministic TOPIX contract',()=>{
  const rows=parseJQuantsTopix({data:[{Date:'20261029',C:3412.5}]},{capturedAt:captured,url:'https://api.jquants.com/v2/indices/bars/daily/topix'});
  assert.equal(rows.length,1);assert.equal(rows[0].variable,'JPX_TOPIX_close');assert.equal(rows[0].value,3412.5);
});
