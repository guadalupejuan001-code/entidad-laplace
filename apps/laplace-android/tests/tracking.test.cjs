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
const measured=(error,extra={})=>record({status:'verified',actual:1000,baseline:900,
  estimate:1000+error,observedCloseAt:1200,...extra});
test('mediana, MAE, P90 y máximo distinguen un caso extremo de un error habitual',()=>{
  const records=[1,2,3,4,5,6,7,8,9,500].map((e,i)=>measured(e,{id:'case-'+i}));
  const s=T.summarize(records);
  assert.equal(s.price.median,5.5);assert.equal(s.price.p90,9);assert.equal(s.price.max,500);
  assert.ok(Math.abs(s.price.mean-54.5)<1e-10);
  assert.equal(s.price.baselineMean,100);
  assert.ok(Math.abs(s.price.improvementPercent-45.5)<1e-10);
  assert.equal(s.maxErrorPercent,50);assert.equal(s.p90ErrorPercent,.9);
  assert.equal(s.correctDirections,10);assert.equal(s.near,5);
  assert.equal(s.worst.id,'case-9');assert.equal(s.evaluated,10);
});
test('no muestra P90 con menos de diez casos ni inventa un máximo con pendientes',()=>{
  assert.equal(T.summarize([measured(20)]).price.p90,null);
  const empty=T.summarize([record()]);
  assert.equal(empty.maxErrorPercent,null);assert.equal(empty.price,null);
  assert.equal(empty.improvementPercent,null);
});
test('separa dólares por activo, plazo y resolución aun cuando todos usan USD',()=>{
  const records=[measured(20),measured(500,{id:'hour',minutes:60}),
    measured(1,{id:'eth',asset:'ETH-USD'}),measured(10,{id:'resolution',granularity:3600})];
  const all=T.summarize(records);assert.equal(all.price,null);
  const groups=T.groups(records);assert.equal(groups.length,4);
  assert.deepEqual(groups.map(g=>g.price.max),[20,10,500,1]);
  assert.equal(T.summarize([measured(0,{baseline:1000})]).price.improvementPercent,null);
});
test('muestra las demoras del cierre y distingue las fechas no comparables',()=>{
  const s=T.summarize([measured(1),measured(1,{observedCloseAt:1397}),
    measured(1,{observedCloseAt:undefined}),measured(1,{market:'equity',targetAt:null})]);
  assert.equal(s.exactTime,1);assert.equal(s.delayedTime,1);assert.equal(s.unknownTime,2);
  assert.equal(s.maxDelaySeconds,197);
});
test('los ejemplos de la captura separan cercanía, dirección y persistencia',()=>{
  const first=measured(0,{actual:78287.8,estimate:78308,baseline:78305.5});
  const second=measured(0,{actual:78263.19,estimate:78301.18,baseline:78314.54,minutes:60});
  const a=T.metrics(first),b=T.metrics(second);
  assert.ok(Math.abs(a.absoluteError-20.2)<1e-8);assert.equal(a.directionCorrect,false);
  assert.ok(Math.abs(a.improvement+2.5)<1e-8);
  assert.ok(Math.abs(b.absoluteError-37.99)<1e-8);assert.equal(b.directionCorrect,true);
  assert.ok(Math.abs(b.improvement-13.36)<1e-8);
});
const file=records=>JSON.stringify({schema:'laplace-local-evidence-v3',records,
  metrics:[{absoluteError:0}],summary:{maxError:0}});
test('importa cifras originales, recalcula métricas y conserva IDs ya presentes',()=>{
  const original=measured(20,{id:'kept'}),snapshot=JSON.stringify(original);
  const imported=measured(500,{id:'new'});
  const out=T.importEvidence([original],file([measured(0,{id:'kept'}),imported]),
    {allowedAssets:['BTC-USD'],now:5000,name:'mi-registro.json'});
  assert.equal(out.added,1);assert.equal(out.duplicates,1);
  assert.equal(JSON.stringify(original),snapshot);assert.equal(out.records[0],original);
  assert.equal(out.records[1].estimate,1500);assert.equal(out.records[1].actual,1000);
  assert.equal(out.records[1].importedFromFile.name,'mi-registro.json');
  assert.equal(T.summarize(out.records).price.max,500);
  assert.equal(T.summarize(out.records).imported,1);
  assert.equal(T.importEvidence(out.records,file([imported]),{now:5000}).added,0);
});
test('archivo inválido no importa parcialmente ni reemplaza los registros anteriores',()=>{
  const current=[measured(1)],snapshot=JSON.stringify(current);
  for(const text of ['{','{}',file([measured(1,{asset:'UNKNOWN'})]),
    file([measured(1),measured(2,{actual:-1})]),file([measured(1,{observedCloseAt:6000})]),
    file([measured(1,{targetAt:800})]),'x'.repeat(8*1024*1024+1)]){
    assert.throws(()=>T.importEvidence(current,text,{allowedAssets:['BTC-USD'],now:5000}));
    assert.equal(JSON.stringify(current),snapshot);
  }
});
