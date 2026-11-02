const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../app/src/main/assets/tracking.js');
const record=(extra={})=>({id:'one',asset:'BTC-USD',minutes:5,granularity:300,
  market:'crypto',issuedAt:900,sourceTime:900,targetAt:1200,
  estimate:110,baseline:100,low:95,high:115,status:'pending',...extra});
const bars=[{time:900,close:105},{time:1200,close:106}];
const run=(records,rows=bars,extra={})=>T.evaluate(records,rows,
  {asset:'BTC-USD',granularity:300,now:1500,...extra});
test('congela el cierre, mide signo/error/dirección y no cambia el original',()=>{
  const f=record(),r=run([f]),out=r.records[0],m=T.metrics(out);
  assert.equal(r.evaluated,1);assert.equal(out.actual,105);
  assert.equal(f.status,'pending');assert.equal(m.signedError,5);
  assert.equal(m.absoluteError,5);assert.equal(m.errorPercent,100*5/105);
  assert.equal(m.directionCorrect,true);assert.equal(m.improvement,0);
  assert.equal(m.inRange,true);assert.equal(m.observationDelay,0);
  assert.deepEqual(run([out],[{time:900,close:99}]).records[0],out);
});
test('no evalúa un objetivo futuro ni una vela abierta',()=>{
  assert.equal(run([record()],bars,{now:1199}).evaluated,0);
  assert.equal(run([record({targetAt:1250})],bars,{now:1300}).evaluated,0);
});
test('usa primer cierre posterior al objetivo y registra desfase',()=>{
  const out=run([record({targetAt:1250})]).records[0];
  assert.equal(out.observedCloseAt,1500);assert.equal(T.metrics(out).observationDelay,250);
});
test('no rellena cierre ausente ni usa otro activo o resolución',()=>{
  assert.equal(run([record()],[{time:1500,close:99}]).evaluated,0);
  assert.equal(run([record({asset:'ETH-USD'})]).evaluated,0);
  assert.equal(run([record({granularity:3600})]).evaluated,0);
});
test('dirección fallida puede quedar cerca; se informa sin confundir métricas',()=>{
  const f=run([record({estimate:99.9})],[{time:900,close:100.1}]).records[0];
  const m=T.metrics(f),s=T.summarize([f],.5);
  assert.equal(m.directionCorrect,false);assert.ok(m.errorPercent<.5);
  assert.equal(s.correctDirections,0);assert.equal(s.near,1);
  assert.equal(m.signedError,99.9-100.1);
});
test('resultado plano no se disfraza de subida; referencia y caída se miden',()=>{
  const m=T.metrics(run([record({estimate:90})],[{time:900,close:100}]).records[0]);
  assert.equal(m.actualDirection,0);assert.equal(m.predictedDirection,-1);
  assert.equal(m.directionCorrect,false);assert.equal(m.improvement,-10);
});
test('rechaza precios inválidos y candidatos sin datos numéricos válidos',()=>{
  assert.equal(run([record({estimate:NaN})]).evaluated,0);
  assert.equal(run([record()],[{time:900,close:0}]).evaluated,0);
  assert.equal(T.metrics({status:'verified',actual:0}),null);
});
test('no elimina registros, ni siquiera tras superar los 250 antiguos',()=>{
  const records=Array.from({length:400},(_,i)=>record({id:String(i)}));
  const r=run(records);assert.equal(r.records.length,400);assert.equal(r.evaluated,400);
});
test('acciones: cuenta velas posteriores al origen, sin fecha ficticia de fin de semana',()=>{
  const origin=Date.UTC(2026,9,30)/1000,monday=Date.UTC(2026,10,2)/1000;
  const f=record({market:'equity',asset:'AAPL',granularity:86400,
    sourceCloseAt:origin+86400,sourceTime:origin+86400,issuedAt:origin+86400+60,
    targetAt:null,horizonBars:1});
  const r=T.evaluate([f],[{time:origin,close:100},{time:monday,close:108}],
    {asset:'AAPL',granularity:86400,now:monday+86400});
  assert.equal(r.evaluated,1);assert.equal(r.records[0].actual,108);
  assert.equal(T.metrics(r.records[0]).observationDelay,null);
  assert.equal(T.evaluate([f],[{time:monday,close:108}],
    {asset:'AAPL',granularity:86400,now:monday+86400}).evaluated,0);
});
test('el resumen no mezcla dólares de activos distintos; usa error relativo por caso',()=>{
  const verified=run([record()]).records[0];
  const s=T.summarize([verified,record({id:'pending',targetAt:9000})]);
  assert.equal(s.evaluated,1);assert.equal(s.pending,1);
  assert.equal(s.meanErrorPercent,T.metrics(verified).errorPercent);
  assert.equal(T.summarize([]).meanErrorPercent,null);
});
