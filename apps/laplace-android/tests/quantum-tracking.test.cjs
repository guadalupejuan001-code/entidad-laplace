const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),T=require('../app/src/main/assets/quantum-tracking.js');
const root=path.resolve(__dirname,'../../..'),report=JSON.parse(fs.readFileSync(path.join(root,'evidencia/lqt1000/resultados.json')));
function fixture(){
 const h=report.horizons.find(x=>x.minutes===15),r=structuredClone(h.quantum);
 Object.assign(r,{minutes:15,checkpointSaved:true,checkpointSHA256:h.checkpointSHA256,kernelSHA256:report.algorithmSHA256});
 const f=T.freeze(r,{issuedAt:r.sourceCloseAt+1,id:'native-result'}),rows=[];
 for(let i=-10;i<=3;i++){
  const close=f.reference*(1+.001*Math.max(0,i));rows.push([f.originTime+i*300,close*.99,close*1.01,close,close,10]);
 }return {r,f,rows};
}
test('LQT congela la salida nativa y rechaza modelos incompletos o períodos pasados',()=>{
 const {r,f}=fixture(),price=f.outputs[0].predicted;r.outputs[0].predicted=1;
 assert.equal(f.outputs[0].predicted,price);
 assert.throws(()=>T.freeze({...r,updatedRotations:999},{issuedAt:r.sourceCloseAt+1}),/núcleo/);
 assert.throws(()=>T.freeze(r,{issuedAt:r.targetCloseAt}),/futuro/);
});
test('LQT espera todas las velas, calcula tres errores y conserva el pronóstico',()=>{
 const {f,rows}=fixture(),options={asset:f.asset,granularity:300};
 assert.equal(T.evaluate([f],rows,{...options,now:f.targetCloseAt-1}).evaluated,0);
 const result=T.evaluate([f],rows,{...options,now:f.targetCloseAt}),actual=result.records[0];
 assert.equal(result.evaluated,1);assert.deepEqual(actual.outputs,f.outputs);
 const squares=[1,2,3].reduce((sum,i)=>sum+Math.log((1+.001*i)/(1+.001*(i-1)))**2,0);
 assert.ok(Math.abs(actual.measurement[1].actual-100*Math.sqrt(squares))<1e-10);
 assert.equal(actual.measurement[2].actual,30);
 assert.equal(actual.measurement[0].error,Math.abs(f.outputs[0].predicted-rows.at(-1)[4]));
 assert.equal(T.evaluate(result.records,rows,{...options,now:f.targetCloseAt}).evaluated,0);
 const summary=T.summarize(result.records,{asset:f.asset,minutes:15,granularity:300});
 assert.equal(summary.cases,1);assert.equal(summary.directionCases,1);
 assert.equal(summary.mae[0],actual.measurement[0].error);
 assert.equal(T.summarize(result.records,{asset:'ETH-USD',minutes:15,granularity:300}).cases,0);
});
test('un hueco o cierre futuro deja pendiente el registro cuántico',()=>{
 const {f,rows}=fixture(),options={asset:f.asset,granularity:300,now:f.targetCloseAt};
 const gap=rows.filter(x=>x[0]!==f.originTime+600);
 assert.equal(T.evaluate([f],gap,options).evaluated,0);
 assert.equal(T.evaluate([f],rows,{...options,now:f.sourceCloseAt}).evaluated,0);
});
test('el respaldo recalcula errores, conserva identificadores y valida todo antes de añadir',()=>{
 const {f,rows}=fixture(),done=T.evaluate([f],rows,{asset:f.asset,granularity:300,now:f.targetCloseAt}).records[0];
 done.measurement.forEach(x=>{x.error=999999;x.baselineError=999999;});
 const text=JSON.stringify({schema:'laplace-lqt-backup-v1',records:[done]});
 const first=T.importEvidence([],text,{now:f.targetCloseAt});assert.equal(first.added,1);
 assert.notEqual(first.records[0].measurement[0].error,999999);
 const again=T.importEvidence(first.records,text,{now:f.targetCloseAt});assert.equal(again.added,0);assert.equal(again.duplicates,1);
 const bad=structuredClone(done);bad.id='bad';delete bad.training;
 assert.throws(()=>T.importEvidence([],JSON.stringify({schema:'laplace-lqt-backup-v1',records:[done,bad]}),{now:f.targetCloseAt}),/Entrenamiento/);
 assert.equal(first.records.length,1);
});
test('la evidencia LQT corresponde al algoritmo entregado y a los datos archivados',()=>{
 const digest=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
 assert.equal(report.algorithmSHA256,digest('apps/laplace-android/app/src/main/cpp/laplace_temporal.hpp'));
 assert.equal(report.sourceSHA256,digest(report.source));
 assert.equal(report.nativeVerification.originalEtherParity,true);assert.equal(report.nativeVerification.allRotationsLearned,true);
 assert.equal(report.retention.testPerturbationDoesNotTrain,true);assert.equal(report.retention.repeatedLabelsNotLearnedTwice,true);
 assert.equal(report.physicalQPU,false);assert.equal(report.prospectivelyValidated,false);
 for(const h of report.horizons){assert.equal(h.quantum.components,1);assert.equal(h.quantum.updatedRotations,1000);
  assert.equal(h.matchedClassical.quantum,false);assert.equal(h.matchedClassical.components,1000);}
});
test('la respuesta a datos queda registrada y los resultados de versiones distintas no se mezclan',()=>{
 const {r,f,rows}=fixture();assert.equal(f.algorithmVersion,2);
 assert.equal(f.training.test.predictedUp+r.test.predictedDown,r.test.cases);
 const forged=structuredClone(f);forged.training.test.predictedUp=r.test.cases+1;
 assert.throws(()=>T.validate(forged,f.issuedAt),/respuesta/);
 const done=T.evaluate([f],rows,{asset:f.asset,granularity:300,now:f.targetCloseAt}).records[0];
 const older={...structuredClone(done),id:'older',algorithmVersion:1};
 assert.equal(T.summarize([done,older],{asset:f.asset,minutes:15,granularity:300,algorithmVersion:2}).cases,1);
 assert.equal(T.summarize([done,older],{asset:f.asset,minutes:15,granularity:300}).cases,2);
});
test('la comparación anterior conserva los mismos objetivos y sus errores sin redondear',()=>{
 const comparison=JSON.parse(fs.readFileSync(path.join(root,'evidencia/lqt1000/comparacion-anterior.json')));
 assert.equal(comparison.algorithmSHA256,report.algorithmSHA256);assert.equal(comparison.sourceSHA256,report.sourceSHA256);
 assert.equal(comparison.usesSpotTicker,false);
 for(const h of comparison.horizons){
  assert.equal(h.legacy.cases,h.quantum.cases);
  for(const c of h.legacyCases){assert.ok(c.knownThrough<c.targetCloseAt);assert.equal(c.targetCloseAt-c.knownThrough,h.minutes*60);}
  for(let i=0;i<3;i++){
   const mae=h.legacyCases.reduce((s,c)=>s+Math.abs(c.predicted[i]-c.actual[i])/h.legacyCases.length,0);
   assert.ok(Math.abs(mae-h.legacy.mae[i])<1e-10);
  }
 }
});
test('C01 conserva el ensayo separado y prueba aporte del circuito sin proclamar ventaja financiera',()=>{
 const response=JSON.parse(fs.readFileSync(path.join(root,'evidencia/lqt1000/respuesta-c01.json')));
 assert.equal(response.algorithmSHA256,report.algorithmSHA256);
 const source=fs.readFileSync(path.join(root,'apps/laplace-android/tests/lqt-learning.cpp'));
 assert.equal(response.controlledTestSHA256,createHash('sha256').update(source).digest('hex'));
 const c=response.controlledInteraction;
 assert.equal(c.testSeed,20261104);assert.equal(c.unseenCases,256);
 assert.equal(c.quantumUpdates,c.matchedNoCZUpdates);
 assert.ok(c.quantumAccuracy>=.95&&c.matchedNoCZAccuracy<=.75);
 assert.equal(c.optimizerNextStepIdentical,true);
 assert.equal(response.protocol.forcedAlternatingDirections,false);
 assert.equal(response.prospectivelyValidated,false);assert.equal(response.quantumSpeedupDemonstrated,false);
 for(const h of response.reusedMarketBenchmark){assert.ok(h.test.predictedUp>0&&h.test.predictedDown>0);assert.ok(h.meanAbsoluteNormalizedPriceResponse>.001);}
 assert.ok(response.additionalArchivedPeriod.lastClose<=report.firstOpen);
});
