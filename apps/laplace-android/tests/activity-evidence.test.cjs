const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),load=p=>fs.readFileSync(path.join(root,p));
test('el estudio de actividad identifica sus datos reales y el motor embarcado',()=>{
 const report=JSON.parse(load('evidencia/actividad-m005/resultados.json'));
 const sha=p=>createHash('sha256').update(load(p)).digest('hex');
 assert.equal(report.data_sha256,sha('evidencia/entrenamiento-x002-20261030/velas.json'));
 assert.equal(report.engine_sha256,sha('apps/laplace-android/app/src/main/assets/activity-engine.js'));
 assert.equal(report.prospectively_validated,false);assert.equal(report.rows,4032);
 for(const r of report.reports){
  assert.equal(r.status,'forecast');assert.ok(r.examples.every(e=>e.knownAt<=r.dataKnownThrough));
  for(const key of ['volatility','volume']){
   const measured=r.outputs[key].test;
   assert.equal(measured.cases,r.evidence.length);
   const mae=r.evidence.reduce((s,c)=>s+Math.abs(c.predicted[key]-c.actual[key])/r.evidence.length,0);
   assert.ok(Math.abs(mae-measured.mae)<1e-9);
  }
 }
});
test('la auditoría compara las tres APK con la misma entrada y las mismas fórmulas',()=>{
 const r=JSON.parse(load('evidencia/actividad-m005/auditoria-apks.json'));
 assert.equal(r.same_input_predictions_equal,true);
 for(const version of r.versions){
  assert.equal(version.engine_sha256,r.versions[0].engine_sha256);
  assert.deepEqual(version.functions,r.versions[0].functions);
  assert.deepEqual(version.forecasts,r.versions[0].forecasts);
 }
});
