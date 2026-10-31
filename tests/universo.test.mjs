import test from 'node:test';
import assert from 'node:assert/strict';
import {observation,causalHypothesis,universeSnapshot,verifyUniverseSnapshot}
  from '../universo/estados.mjs';
import {measureKp,KP_URL} from '../universo/geomagnetismo.mjs';
import {measureBook,measureTrades,measureTicker,observeUniverseBTC,URLS}
  from '../universo/mercado.mjs';
const stamp='2026-10-29T18:00:40.000Z';
const rec=(id,domain='fisica',known_at=stamp,observed_at=stamp,value=8)=>({
  id,domain,variable:'energia',value,unit:'J',
  observed_at,known_at,source_url:'https://example.org/measured'
});
test('U001 acepta cualquier dominio, preserva conteos, hipotesis y hash reproducible',()=>{
  const records=[rec('a'),rec('b','cosmos'),rec('c','fisica','2026-10-29T18:10:00Z',stamp)];
  const relation={id:'ha',from:'a',to:'b',type:'hipotesis',label:'ley_por_validar'};
  const report=universeSnapshot(records,{cutoff:stamp,hypotheses:[relation]});
  assert.equal(report.known_states,2);assert.equal(report.withheld_future,1);
  assert.deepEqual(report.domains,['cosmos','fisica']);
  assert.equal(report.relations[0].type,'hipotesis');
  assert.equal(report.complete_universe_observed,false);
  assert.ok(verifyUniverseSnapshot(report));
  assert.equal(report.snapshot_sha256,universeSnapshot(records.slice().reverse(),{cutoff:stamp,hypotheses:[relation]}).snapshot_sha256);
  assert.throws(()=>verifyUniverseSnapshot({...report,known_states:4}),/modificado/);
});
test('U001 prohíbe ids repetidos, datos sin fuentes y afirmaciones causales sin pruebas',()=>{
  assert.throws(()=>universeSnapshot([rec('a'),rec('a')],{cutoff:stamp}),/duplicado/);
  assert.throws(()=>observation({...rec('b'),source_url:'http://bad.example'}),/HTTPS/);
  assert.throws(()=>observation({...rec('b'),observed_at:'2026-10-29T18:10:00Z'}),/todavia/);
  assert.throws(()=>causalHypothesis({id:'h',from:'a',to:'b',label:'ley',type:'causa_probada'}),/hipotesis/);
  assert.throws(()=>universeSnapshot(Array.from({length:4097},(_,i)=>rec('x'+i)),{cutoff:stamp}),/4096/);
});
const levels=()=>({
  sequence:456,bids:Array.from({length:15},(_,i)=>[(80700-i).toFixed(2),'0.1','1']),
  asks:Array.from({length:15},(_,i)=>[(80701+i).toFixed(2),'0.2','2'])
});
test('profundidad y spread reales son magnitudes, no promesas predictivas',()=>{
  const b=measureBook(levels(),{at:stamp});
  assert.equal(b.best_bid_usd,80700);assert.equal(b.best_ask_usd,80701);
  assert.equal(b.levels_used,10);assert.ok(b.spread_bps>0);
  assert.ok(b.top10_notional_imbalance<0);
  assert.throws(()=>measureBook({...levels(),asks:[['80699','1','1'],...levels().asks]},{at:stamp}),/cruzado/);
});
test('L2 con mas de 20 mil niveles mantiene el prefijo sin copiar el libro entero',()=>{
  const many=21001;
  const data={bids:Array.from({length:many},(_,i)=>[String(80700-i*0.01),'0.01',1]),
    asks:Array.from({length:many},(_,i)=>[String(80701+i*0.01),'0.02',1])};
  const result=measureBook(data,{at:stamp});
  assert.deepEqual(result.source_level_counts,{bids:many,asks:many});
  assert.equal(result.levels_used,10);
  assert.equal(result.best_bid_usd,80700);
});
test('trade lado maker, ventana observada y cobertura parcial',()=>{
  const rows=[{trade_id:1,side:'buy',size:'0.2',price:'80000',time:'2026-10-29T17:58:00Z'},
    {trade_id:2,side:'sell',size:'0.4',price:'80000',time:'2026-10-29T17:59:00Z'},
    {trade_id:3,side:'buy',size:'1',price:'80000',time:'2026-10-29T16:00:00Z'}];
  const r=measureTrades(rows,{at:stamp});
  assert.equal(r.observed_trade_count,2);
  assert.equal(r.maker_buy_notional_usd,16000);
  assert.equal(r.maker_sell_notional_usd,32000);
  assert.equal(r.sample_complete,false);
  assert.throws(()=>measureTrades([rows[0],rows[0]],{at:stamp}),/duplicado/);
});
test('ticker externo se rechaza si llega con retraso o futuro no disponible',()=>{
  const ticker={price:'3122.75',time:'2026-10-29T18:00:35Z'};
  const r=measureTicker(ticker,{at:stamp,product:'ETH-USD',source:URLS.eth});
  assert.equal(r.price,3122.75);
  assert.throws(()=>measureTicker({...ticker,time:'2026-10-29T17:40:00Z'},
    {at:stamp,product:'ETH-USD',source:URLS.eth}),/vencido/);
});
const S=300,base=Date.parse('2026-10-28T22:00:00Z')/1000;
function candles(){
  const data=[];let p=80500;
  for(let i=0;i<240;i++){
    const open=p;p*=Math.exp(0.0002*Math.sin(i*0.4));
    data.push([base+S*i,Math.min(open,p)*0.9999,Math.max(open,p)*1.0001,open,p,20+i%8]);
  }
  return data;
}
const ticker={price:'80741.69',bid:'80741.68',ask:'80741.70',
  trade_id:123,time:'2026-10-29T18:00:35Z'};
const response=data=>new Response(JSON.stringify(data),{status:200});
function source(url){
  if(url.endsWith('/ticker')&&url.includes('BTC-USD'))return Promise.resolve(response(ticker));
  if(url.endsWith('/stats'))return Promise.resolve(response({open:'80000'}));
  if(url.includes('/candles?'))return Promise.resolve(response(candles()));
  if(url===URLS.book)return Promise.resolve(response(levels()));
  if(url===URLS.trades)return Promise.resolve(response([{trade_id:1,side:'sell',
    size:'0.01',price:'80740',time:'2026-10-29T17:59:58Z'}]));
  if(url===URLS.eth)return Promise.resolve(response({price:'3200.55',time:ticker.time}));
  if(url===URLS.euro)return Promise.resolve(response({price:'74690',time:ticker.time}));
  throw Error('ruta desconocida '+url);
}
test('instrumento universal conecta I015 + cuatro mediciones, sin alterar el precio proyectado',async()=>{
  const run=await observeUniverseBTC({fetchImpl:source,now:()=>stamp});
  assert.equal(run.source_count,5);
  assert.equal(run.universal_state.known_states,10);
  assert.equal(run.universal_state.relations.length,9);
  assert.equal(run.universal_state.domains.length,4);
  assert.ok(verifyUniverseSnapshot(run.universal_state));
  assert.equal(run.projected_price_usd,run.instrument_15m.projected_price_usd);
  assert.equal(run.augmented_prediction_enabled,false);
  assert.equal(run.execution_orders,0);
  assert.equal(run.full_universe_observed,false);
});
test('si falla una fuente secundaria no se inventan mediciones',async()=>{
  const run=await observeUniverseBTC({fetchImpl:url=>url===URLS.book?Promise.reject(Error('caido')):source(url),
    now:()=>stamp});
  assert.equal(run.source_count,4);
  assert.equal(run.measured_market.find(x=>x.name==='book').status,'unavailable');
  assert.equal(run.universal_state.states.some(x=>x.domain==='liquidez'),false);
});
test('estado externo futuro queda retenido por corte sin filtración',async()=>{
  const future=rec('future','economia','2026-10-29T18:10:00Z',stamp);
  const run=await observeUniverseBTC({fetchImpl:source,now:()=>stamp,additionalObservations:[future]});
  assert.equal(run.universal_state.withheld_future,1);
  assert.equal(run.universal_state.domains.includes('economia'),false);
});

test('Kp NOAA permite un nuevo dominio fisico sin inventar conexion con BTC',async()=>{
  const rows=[{time_tag:'2026-10-29T12:00:00',Kp:1.33,a_running:5,station_count:8},
    {time_tag:'2026-10-29T15:00:00',Kp:0.33,a_running:2,station_count:8},
    {time_tag:'2026-10-29T21:00:00',Kp:7,a_running:40,station_count:8}];
  const physical=measureKp(rows,{capturedAt:stamp});
  assert.equal(physical.value,0.33);
  assert.equal(physical.observed_at,'2026-10-29T15:00:00.000Z');
  assert.equal(physical.known_at,stamp);
  const original=await observeUniverseBTC({fetchImpl:source,now:()=>stamp});
  const withSpace=await observeUniverseBTC({fetchImpl:url=>url===KP_URL?
    Promise.resolve(response(rows)):source(url),now:()=>stamp});
  assert.equal(withSpace.measured_space_weather.status,'observed');
  assert.equal(withSpace.source_count,original.source_count+1);
  assert.equal(withSpace.universal_state.domains.includes('geomagnetismo'),true);
  assert.equal(withSpace.universal_state.relations.some(x=>x.from.includes('noaa-kp')),false);
  assert.equal(withSpace.projected_price_usd,original.projected_price_usd);
  assert.throws(()=>measureKp([{time_tag:'2026-10-28T00:00:00',Kp:3}],{capturedAt:stamp}),/frescura/);
});
