const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),T=require('../app/src/main/assets/quantum-tracking.js');
const report=JSON.parse(fs.readFileSync(path.join(root,'evidencia/campana-c02/resultados.json')));
test('la campaña conserva el circuito y empaqueta modelos reales con huellas comprobables',()=>{
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const native='apps/laplace-android/app/src/main/cpp/';
 assert.equal(report.kernelSHA256,sha(Buffer.concat([fs.readFileSync(path.join(root,native+'laplace_temporal.hpp')),Buffer.from('\n'),fs.readFileSync(path.join(root,native+'laplace_campaign.hpp'))])));
 assert.equal(report.algorithmFrozenCommit,'8b6545b12765426a9957b1441d6eec609db107eb');
 assert.equal(report.models.length,33);
 for(const x of report.models){
  const bytes=fs.readFileSync(path.join(root,'apps/laplace-android/app/src/main/assets/campaign-models',x.file));
  assert.equal(sha(bytes),x.packagedSHA256);
  const model=JSON.parse(zlib.gunzipSync(Buffer.from(bytes.toString().trim(),'base64')));
  assert.equal(sha(model.checkpoint),model.checkpointSHA256);assert.ok(model.checkpoint.startsWith('LQC3 3\n'));
  assert.equal(model.kernelSHA256,report.kernelSHA256);
 }
});
test('aciertos completos, referencia emparejada e intervalos quedan separados de la selección',()=>{
 for(const r of report.results){
  assert.equal(r.campaign.candidates,216);assert.equal(r.qubits,1000);assert.equal(r.components,1);
  assert.equal(r.test.cases,r.referenceTest.cases);
  if(r.granularity===300)assert.ok(r.firstTestOrigin>1793383500,'intraday holdout is later than the old archive');
  const model=report.models.find(m=>m.asset===r.asset&&m.minutes===r.minutes);
  const result={...r,market:'crypto',schema:'laplace-lqt1000-v1',quantum:true,checkpointSaved:true,
   checkpointSHA256:'a'.repeat(64),kernelSHA256:report.kernelSHA256,originTime:r.sourceCloseAt-r.granularity,
   updates:512,onlineUpdates:0,selectedTemporalLag:0,initialTestThrough:r.sourceCloseAt,
   nativeMilliseconds:0,calibrationCases:12};
  const f=T.freeze(result,{issuedAt:r.sourceCloseAt+1});assert.equal(f.algorithmVersion,3);
  assert.equal(f.referenceTest.cases,f.training.test.cases);
  assert.ok(model);
 }
 assert.equal(report.prospectivelyValidated,false);assert.equal(report.automaticTrading,false);
});
