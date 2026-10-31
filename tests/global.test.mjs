import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_SYMBOLS,WEATHER_GRID,EXPECTED_SIGNAL_BUDGET} from '../universo/catalogo-global.mjs';
import {parseWorldBank,parseWeather,parseEarthquakes,weatherUrl} from '../universo/fuentes-globales.mjs';
import {universeSnapshot,verifyUniverseSnapshot} from '../universo/estados.mjs';
import {encodeGlobalSnapshot,compileGlobalEther,proveGlobalEther} from '../universo/ether-global.mjs';
import {cleanSymbol} from '../bolsa/mercado.mjs';

const captured='2026-10-30T06:30:00.000Z';
test('U002 catalog expands coverage without exceeding the 4096-state contract',()=>{
  assert.equal(MARKET_SYMBOLS.length,40);
  assert.equal(WEATHER_GRID.length,40);
  assert.equal(EXPECTED_SIGNAL_BUDGET.markets,160);
  assert.equal(EXPECTED_SIGNAL_BUDGET.weather,160);
  const nominal=Object.values(EXPECTED_SIGNAL_BUDGET).reduce((a,b)=>a+b,0);
  assert.equal(nominal,369);
  assert.equal(cleanSymbol('^VIX'),'^VIX');
});
test('World Bank parser records latest available annual values with capture-time knowledge',()=>{
  const url='https://api.worldbank.org/v2/country/WLD;USA/indicator/NY.GDP.MKTP.KD.ZG?format=json';
  const raw=[{page:1},[
    {countryiso3code:'USA',date:'2025',value:2.2},
    {countryiso3code:'USA',date:'2024',value:1.9},
    {countryiso3code:'WLD',date:'2025',value:2.8}
  ]];
  const rows=parseWorldBank(raw,{indicator:'NY.GDP.MKTP.KD.ZG',capturedAt:captured,url,economies:['WLD','USA']});
  assert.equal(rows.length,2);assert.ok(rows.every(x=>x.known_at===captured));
  assert.equal(rows.find(x=>x.variable==='USA_gdp_growth').value,2.2);
  assert.equal(rows.find(x=>x.variable==='USA_gdp_growth').observed_at,'2025-01-01T00:00:00.000Z');
});
test('global weather grid produces four numerical states per cell and retains exact coordinates in variables',()=>{
  const grid=[{id:'lat_p0_lon_p0',lat:0,lon:0},{id:'lat_p30_lon_p75',lat:30,lon:75}];
  const raw=grid.map((_,i)=>({current:{time:'2026-10-30T06:15',temperature_2m:20+i,surface_pressure:1000+i,wind_speed_10m:10+i,precipitation:i}}));
  const url=weatherUrl(grid),rows=parseWeather(raw,{capturedAt:captured,url,grid});
  assert.equal(rows.length,8);assert.ok(rows.every(x=>x.domain==='clima_global'));
  assert.ok(rows.some(x=>x.variable==='lat_p30_lon_p75_precipitation'&&x.value===1));
});
test('USGS feed is reduced to global and eight-sector physical states without inventing locations',()=>{
  const raw={type:'FeatureCollection',features:[
    {properties:{mag:5.1,time:Date.parse('2026-10-30T05:00:00Z')},geometry:{coordinates:[-120,40,10]}},
    {properties:{mag:3.2,time:Date.parse('2026-10-30T04:00:00Z')},geometry:{coordinates:[80,-20,20]}}
  ]};
  const rows=parseEarthquakes(raw,{capturedAt:captured});
  assert.equal(rows.length,11);
  assert.equal(rows.find(x=>x.variable==='earthquakes_24h_count').value,2);
  assert.equal(rows.find(x=>x.variable==='earthquakes_24h_m45_count').value,1);
  assert.equal(rows.find(x=>x.variable==='earthquakes_24h_max_magnitude').value,5.1);
});
function syntheticSnapshot(n=320){
  const rows=Array.from({length:n},(_,i)=>({
    id:'s'+i,domain:'d'+(i%7),variable:'v'+i,value:(i-150)/7,unit:'u',
    observed_at:'2026-10-30T06:00:00.000Z',known_at:captured,source_url:'https://example.org/s'+i
  }));
  return universeSnapshot(rows,{cutoff:captured});
}
test('U002 compact Ether encoding preserves hundreds of world states deterministically',()=>{
  const s=syntheticSnapshot(),a=encodeGlobalSnapshot(s),b=encodeGlobalSnapshot(s);
  assert.equal(a.records,320);assert.equal(a.sha256,b.sha256);
  assert.equal(a.bytes.length,16+320*32);assert.equal(a.dictionary.length,320);
  const xi=compileGlobalEther(s);assert.match(xi.xi,/mem_materialize/);assert.ok(xi.nonzero_bytes>0);
  assert.ok(verifyUniverseSnapshot(s));
});
const binary=process.env.MUNDO_X_QUANTUM;
test('U002 round-trips hundreds of signals through original XI / Inverse Ether Memory',{skip:binary?false:'requires original Mundo X runtime'},()=>{
  const proof=proveGlobalEther(binary,syntheticSnapshot(384));
  assert.equal(proof.status,'U002_XI_ETHER_VERIFICADO');assert.equal(proof.records,384);
  assert.equal(proof.exact_roundtrip,true);assert.equal(proof.active_qubits,0);
  assert.equal(proof.prediction_generated,false);
});
