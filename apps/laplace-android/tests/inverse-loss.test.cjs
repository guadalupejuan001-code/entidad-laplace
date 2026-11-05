const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const I=require('../app/src/main/assets/inverse-loss.js'),T=require('../app/src/main/assets/quantum-tracking.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/btc-20261105-1h-large-miss.json'))),f=fixture.records[1];
const archive=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(__dirname,'../../../evidencia/campana-c02/datos/BTC-USD-300.json.gz.b64'),'utf8').trim(),'base64')));
function synthetic(){
 const rows=[];let price=100;
 for(let i=0;i<1147;i++){
  const p=i%120,r=p>=66&&p<78?-.004:p>=78&&p<90?.004:p>=60&&p<66?-.0002:.00001;
  const open=price;price*=Math.exp(r);
  rows.push([1700000100+i*300,Math.min(open,price)*.999,Math.max(open,price)*1.001,open,price,p>=60&&p<66?40:10]);
 }
 const last=rows.at(-1),forecast={...structuredClone(f),reference:last[4],sourceCloseAt:last[0]+300,
  issuedAt:last[0]+302,originTime:last[0],targetCloseAt:last[0]+3900};
 return {rows,forecast};
}
test('una pérdida de 2000 USD de precio se invierte a un cierre y una condición mínima de trayectoria',()=>{
 const pct=2000/f.reference*100,t=I.targetFor(f,{lossPct:pct});
 assert.ok(Math.abs(t.price-(f.reference-2000))<1e-8);
 assert.ok(Math.abs(t.priceMove+2000)<1e-8);assert.equal(t.outcome,'target_close');
 // Equal log increments attain Cauchy-Schwarz equality; other paths can
 // need more realized variation. This is not a crash-probability estimate.
 const increments=Array(f.horizonBars).fill(t.cumulativeLogReturn/f.horizonBars);
 const realized=100*Math.sqrt(increments.reduce((s,r)=>s+r*r,0));
 assert.ok(Math.abs(realized-t.minimumCloseToCloseRVPct)<1e-12);
 assert.equal(I.targetFor(f,{lossPct:2,direction:'up'}).price,f.reference*1.02);
 assert.throws(()=>I.targetFor(f,{lossPct:100}),/magnitud|movimiento/);
 assert.throws(()=>I.targetFor(f,{lossPct:-1}),/movimiento/);
});
test('el archivo BTC anterior a la caída tiene 669 objetivos separados y sólo dos pérdidas del 2 %',()=>{
 const before=JSON.stringify(f),a=I.analyze(f,{rows:archive.rows,lossPct:2,mode:'retrospective',historyAsset:archive.asset,historyGranularity:archive.granularity});
 assert.equal(a.history.cases,669);assert.equal(a.history.lossCases,2);assert.equal(a.history.otherCases,667);
 assert.equal(a.history.lastCloseAt,1793838300);assert.ok(a.history.lastCloseAt<f.sourceCloseAt);
 assert.equal(a.status,'insufficient_event_history');assert.equal(a.currentWindowAvailable,false);
 assert.equal(a.candidates.length,2);assert.ok(a.candidates.every(c=>c.targetCloseAt<=f.sourceCloseAt));
 assert.equal(a.probabilityOfLoss,null);assert.equal(a.causalStatus,'not_identified');
 assert.equal(a.protection.lossUnit,'underlying_price_change_not_account_pnl');
 assert.equal(JSON.stringify(f),before);I.validate(a,f);
});
test('el inverso recupera precursores implantados en un control explícitamente sintético',()=>{
 const {rows,forecast}=synthetic(),a=I.analyze(forecast,{rows,lossPct:2});I.validate(a,forecast);
 assert.equal(a.currentWindowAvailable,true);assert.equal(a.status,'historical_candidates');
 assert.ok(a.history.lossCases>=8);assert.ok(a.history.otherCases>=8);
 const volume=a.drivers.find(d=>d.id==='volume_expansion');
 assert.equal(volume.currentPresent,true);assert.ok(volume.eventsWithSignal>0);assert.ok(volume.contrast>0);
 assert.ok(a.candidates.length>0);assert.ok(a.candidates.every(c=>c.targetCloseAt<=forecast.sourceCloseAt));
 assert.equal(a.predictiveValidation,'not_established');assert.equal(a.history.independenceProven,false);
});
test('las etiquetas del fallo y las velas posteriores no influyen en el análisis anterior',()=>{
 const baseline=I.analyze(f,{rows:archive.rows,mode:'retrospective'}),changed=structuredClone(f);
 changed.measurement=[{actual:1e9}];changed.checkedAt=1;changed.comparison={invented:true};
 const future=[[f.sourceCloseAt,0,1e12,0,1e12,1e12],[f.sourceCloseAt+300,-5,1,0,0,-1]];
 assert.deepEqual(I.analyze(changed,{rows:[...archive.rows,...future],mode:'retrospective'}),baseline);
 assert.throws(()=>I.analyze(f,{rows:archive.rows,historyAsset:'ETH-USD'}),/incompatible/);
 assert.throws(()=>I.analyze(f,{rows:archive.rows,historyGranularity:3600}),/incompatible/);
});
test('las condiciones actuales se contrastan con la ventana guardada al emitir',()=>{
 const {rows,forecast}=synthetic(),R=require('../app/src/main/assets/forecast-risk.js');
 forecast.riskDiagnostics=R.assess(forecast,{rows});
 const a=I.analyze(forecast,{rows});I.validate(a,forecast);
 const altered=structuredClone(a);altered.currentFeatures.momentum6Pct+=1;
 assert.throws(()=>I.validate(altered,forecast),/ventana guardada/);
});
test('las pérdidas aún no maduras y los huecos no se convierten en antecedentes',()=>{
 const {rows,forecast}=synthetic(),complete=I.analyze(forecast,{rows});
 assert.ok(complete.candidates.every(c=>c.targetCloseAt<=forecast.sourceCloseAt));
 const currentLoss={...forecast,measurement:[{actual:forecast.reference*.8}]};
 assert.deepEqual(I.analyze(currentLoss,{rows}),complete);
 const short=I.analyze(forecast,{rows:rows.slice(-31)});assert.equal(short.history.cases,0);
 assert.equal(short.status,'insufficient_history');assert.equal(short.probabilityOfLoss,null);
 const gap=I.analyze(forecast,{rows:rows.filter((_,i)=>i!==rows.length-4)});
 assert.equal(gap.currentWindowAvailable,false);assert.ok(gap.history.cases<=complete.history.cases);
 assert.throws(()=>I.analyze(forecast,{rows:[...rows,rows[0]]}),/duplicadas/);
});
test('las condiciones desconocidas no se contabilizan como ausencia de señal',()=>{
 const {rows,forecast}=synthetic();for(const row of rows)row[5]=0;
 const a=I.analyze(forecast,{rows});I.validate(a,forecast);
 const volume=a.drivers.find(d=>d.id==='volume_expansion');
 assert.ok(a.history.lossCases>0);assert.equal(volume.currentPresent,null);
 assert.equal(volume.eventsWithKnownSignal,0);assert.equal(volume.otherWithKnownSignal,0);
 assert.equal(volume.shareAmongLosses,null);assert.equal(volume.shareAmongOthers,null);assert.equal(volume.contrast,null);
});
test('el respaldo conserva el inverso y rechaza objetivos, probabilidades o trayectorias adulteradas',()=>{
 const original=structuredClone(f);original.inverseLoss=I.analyze(original,{rows:archive.rows,mode:'retrospective'});
 const now=Date.parse(fixture.exportedAt)/1000;T.validate(original,now);
 const imported=T.importEvidence([],JSON.stringify({schema:'laplace-lqt-backup-v1',records:[original]}),{now}).records[0];
 assert.deepEqual(imported.inverseLoss,original.inverseLoss);assert.deepEqual(imported.outputs,f.outputs);
 for(const tamper of [a=>a.target.price=1,a=>a.probabilityOfLoss=.99,
  a=>a.candidates[0].targetCloseAt=f.targetCloseAt,a=>a.drivers[0].shareAmongLosses=.37,
  a=>a.protection.ordersAuthorized=true,a=>a.reviewReasons=[],a=>a.status='safe']){
  const changed=structuredClone(original);tamper(changed.inverseLoss);assert.throws(()=>T.validate(changed,now),/Inverso/);
 }
 // Old backups remain valid and acquire no retrospective claim of protection.
 T.validate(f,now);assert.equal(f.inverseLoss,undefined);
});
