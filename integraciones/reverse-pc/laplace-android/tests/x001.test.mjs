import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStockChart,BOLSA_LAB} from '../../reverse-os-android/app/src/main/assets/laplace/x001.mjs';
const start=Math.floor(Date.parse('2026-10-01T13:30:00Z')/300000)*300;
function bars(n=500){let p=500;return Array.from({length:n},(_,i)=>{const o=p;p*=Math.exp((i%18<10?.0008:-.0007));return [start+i*300,Math.min(o,p)*.9999,Math.max(o,p)*1.0001,o,p,1000+(i%7)*100]})}
function chart(rows){return {chart:{result:[{meta:{currency:'USD',exchangeName:'NMS',exchangeTimezoneName:'America/New_York'},timestamp:rows.map(x=>x[0]),indicators:{quote:[{low:rows.map(x=>x[1]),high:rows.map(x=>x[2]),open:rows.map(x=>x[3]),close:rows.map(x=>x[4]),volume:rows.map(x=>x[5])}]}}]}}}
test('B001 normaliza solo velas cerradas de cinco minutos sin predecir en JavaScript',()=>{
 const b=bars(),received=new Date((b.at(-1)[0]+600)*1000).toISOString(),r=parseStockChart(chart(b),'SPY',received);
 assert.equal(r.symbol,'SPY');assert.equal(r.bars.length,b.length);assert.equal(r.exchange,'NMS');
 assert.match(r.note,/XN01\/XI-Ether/);
 assert.equal('probability_up' in r,false);assert.equal('direction' in r,false);
});
test('el adaptador descarta puntos abiertos o inválidos',()=>{
 const b=bars(100),last=[...b.at(-1)];last[0]+=300;
 const raw=chart([...b,last]),received=new Date((b.at(-1)[0]+450)*1000).toISOString(),r=parseStockChart(raw,'AAPL',received);
 assert.equal(r.bars.at(-1)[0],b.at(-1)[0]);
});
test('B001 empaquetado conserva evidencia explícita sin convertirla en exactitud universal',()=>{
 assert.deepEqual(Object.keys(BOLSA_LAB),['SPY','AAPL','NVDA']);
 for(const row of Object.values(BOLSA_LAB)){assert.ok(row.accuracy>=0&&row.accuracy<=1);assert.ok(row.baseline>=0&&row.baseline<=1);}
});
