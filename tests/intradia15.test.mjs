import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCandles,project15m,observeAndProject15m,backtestIntraday}
  from '../bitcoin/intradia15.mjs';
const STEP=300,start=Date.parse('2026-10-28T22:00:00Z')/1000;
function dataset(n=240){
  const bars=[];let value=81000;
  for(let i=0;i<n;i++){
    const open=value;
    const movement=(i%7===0?0.0016:-0.00009)+Math.sin(i/9)*0.0004;
    value=open*Math.exp(movement);
    bars.push([start+i*STEP,Math.min(open,value)*0.9998,Math.max(open,value)*1.0002,
      open,value,10+i%18]);
  }
  return bars;
}
const raw=dataset(),observed='2026-10-29T18:00:35.000Z';
const quote={asset:'BTC-USD',price_basis:'spot_quote',value:'80999.12',
  observed_at:observed,known_at:'2026-10-29T18:00:40.000Z'};
test('no consume vela actual sin cerrar, y usa exactamente tres periodos = 15 minutos',()=>{
  const incomplete=[...raw,[start+240*STEP,1,3,2,2,1]];
  const bars=canonicalCandles(incomplete,{asOf:observed});
  assert.equal(bars.length,240);
  assert.equal(bars.at(-1).time,start+239*STEP);
  const result=project15m(incomplete,quote,{capturedAt:'2026-10-29T18:00:41.000Z'});
  assert.equal(result.horizon_minutes,15);
  assert.equal(result.target_at,'2026-10-29T18:15:35.000Z');
  assert.equal(result.price_candles,240);
  assert.equal(result.random_sampling,false);
  assert.equal(result.live_trading_enabled,false);
  assert.ok(Number.isFinite(result.projected_price_usd));
  assert.ok(result.analog_count>=8);
  assert.ok(result.calculations.selected_analogues.every(s=>s.outcome_at<='2026-10-29T18:00:00.000Z'));
});
test('no se accede a resultados posteriores ni a velas de futuro',()=>{
  const base=project15m(raw,quote,{capturedAt:'2026-10-29T18:00:41.000Z'});
  const injected=dataset(241);
  injected[240]=[start+240*STEP,1,500000,1,499999,99999];
  const result=project15m(injected,quote,{capturedAt:'2026-10-29T18:00:41.000Z'});
  assert.equal(result.input_sha256,base.input_sha256);
  assert.equal(result.projected_price_usd,base.projected_price_usd);
  assert.deepEqual(result.backtest,base.backtest);
});
test('auditor retrospectivo compara contra precio actual sin usar resultados futuros',()=>{
  const bars=canonicalCandles(raw,{asOf:observed});
  const report=backtestIntraday(bars);
  assert.ok(report.scored>=20);
  assert.ok(report.model_mae_return_pct>=0);
  assert.ok(report.reference_mae_return_pct>=0);
  assert.ok(['mejora_en_muestra_reciente','sin_ventaja_demostrada'].includes(report.qualification));
});
test('rechaza vela duplicada, rango falso, historia corta y precio vencido',()=>{
  assert.throws(()=>canonicalCandles([...raw,raw[0]],{asOf:observed}),/duplicada/);
  const invalid=raw.map(x=>[...x]);invalid[0][2]=1;
  assert.throws(()=>canonicalCandles(invalid,{asOf:observed}),/OHLCV/);
  assert.throws(()=>canonicalCandles(raw.slice(-10),{asOf:observed}),/60 barras/);
  assert.throws(()=>project15m(raw,quote,{capturedAt:'2026-10-29T18:10:35.000Z'}),/vencida/);
});
test('bloquea extrapolacion cuando no existe reciente conexion cronologica',()=>{
  const gapped=raw.filter((_,i)=>i%3===0||i===raw.length-1);
  const result=project15m(gapped,quote,{capturedAt:'2026-10-29T18:00:41.000Z'});
  assert.equal(result.status,'barras_incompletas');
  assert.equal(result.model_selected,'persistencia');
});
test('lectura simulada de cotizacion mas velas Coinbase; ninguna red externa de prueba',async()=>{
  const ticker={price:'80999.12',bid:'80999.11',ask:'80999.13',trade_id:123,
    time:observed};
  const fakeFetch=async url=>{
    if(url.endsWith('/ticker'))return new Response(JSON.stringify(ticker));
    if(url.endsWith('/stats'))return new Response(JSON.stringify({open:'80500'}));
    if(url.includes('/candles?'))return new Response(JSON.stringify(raw.slice().reverse()));
    throw Error('URL no esperada '+url);
  };
  const result=await observeAndProject15m({fetchImpl:fakeFetch,now:()=>'2026-10-29T18:00:41.000Z'});
  assert.equal(result.asset,'BTC-USD');
  assert.equal(result.observed_price_usd,80999.12);
  assert.equal(result.price_candles,240);
  assert.ok(result.input_sha256.length===64);
});
