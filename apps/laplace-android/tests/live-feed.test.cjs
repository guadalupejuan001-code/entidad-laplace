const test=require('node:test');
const assert=require('node:assert/strict');
const Live=require('../app/src/main/assets/live-feed.js');
const NOW=Date.parse('2026-10-31T19:30:00.000Z');
function tick(symbol,price,sequence=20,time=NOW,receivedAt=NOW){
 return {type:'ticker',asset:symbol,price,sequence,
  time:new Date(time).toISOString(),observedAt:time,receivedAt};
}
test('aprobación real de ticker con hora, producto y secuencia monotónica',()=>{
 const s=Live.createTracker();
 assert.ok(s.statusUpdate({type:'status',state:'live',message:'Coinbase confirmado'},NOW));
 assert.ok(s.acceptTicker(tick('BTC-USD',61502.13),NOW));
 assert.equal(s.quote('BTC-USD').price,61502.13);
 assert.equal(s.isFresh('BTC-USD',NOW+1000),true);
 assert.equal(s.snapshot().updates,1);
 assert.equal(s.points('BTC-USD').length,1);
 assert.equal(s.acceptTicker(tick('BTC-USD',61510,20),NOW),false);
 assert.equal(s.acceptTicker(tick('BTC-USD',61510,19),NOW),false);
 assert.equal(s.quote('BTC-USD').price,61502.13);
 assert.ok(s.acceptTicker(tick('ETH-USD',3102.30,21),NOW));
 assert.ok(s.acceptTicker(tick('SOL-USD',190.43,22),NOW));
 assert.equal(s.snapshot().assetsWithTicks,3);
});
test('heartbeats y estados jamás inventan precios',()=>{
 const s=Live.createTracker();
 assert.equal(s.acceptTicker({type:'heartbeat',product_id:'BTC-USD'},NOW),false);
 assert.equal(s.quote('BTC-USD'),null);
 assert.ok(s.statusUpdate({type:'status',state:'retrying',message:'Conexión perdida',retrySeconds:4},NOW));
 assert.equal(s.snapshot().retrySeconds,4);
 assert.equal(s.statusUpdate({type:'status',state:'fake'},NOW),false);
 assert.equal(s.snapshot().updates,0);
});
test('descarta precio no finito, activo ajeno, hora imposible y mensajes antiguos',()=>{
 const s=Live.createTracker();
 s.statusUpdate({type:'status',state:'live'},NOW);
 for(const price of [NaN,0,-4,Infinity,1e11])
   assert.equal(s.acceptTicker(tick('BTC-USD',price),NOW),false);
 assert.equal(s.acceptTicker(tick('DOGE-USD',120),NOW),false);
 assert.equal(s.acceptTicker(tick('BTC-USD',100,1,NOW+60000),NOW),false);
 assert.equal(s.acceptTicker(tick('BTC-USD',100,1,NOW-700000),NOW),false);
 assert.equal(s.acceptTicker(tick('BTC-USD',100,1,NOW,NOW-90000),NOW),false);
 assert.equal(s.snapshot().updates,0);
});
test('el usuario detiene el stream; un precio viejo se etiqueta obsoleto',()=>{
 const s=Live.createTracker();
 s.statusUpdate({type:'status',state:'live'},NOW);
 s.acceptTicker(tick('BTC-USD',61000),NOW);
 assert.equal(s.isFresh('BTC-USD',NOW+120000),false);
 s.statusUpdate({type:'status',state:'off'},NOW+1000);
 assert.equal(s.isFresh('BTC-USD',NOW+2000),false);
});
test('mantiene solo 80 puntos sin confundir BTC ETH y SOL',()=>{
 const s=Live.createTracker();s.statusUpdate({type:'status',state:'live'},NOW);
 for(let i=0;i<100;i++)assert.ok(s.acceptTicker(tick('BTC-USD',60000+i,20+i),NOW));
 assert.equal(s.points('BTC-USD').length,80);
 assert.equal(s.points('ETH-USD').length,0);
 assert.equal(s.points('SOL-USD').length,0);
 assert.equal(s.snapshot().updates,100);
});
