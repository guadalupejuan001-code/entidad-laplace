const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../app/src/main/assets/forecast-risk.js'),T=require('../app/src/main/assets/quantum-tracking.js');
const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/btc-20261105-1h-large-miss.json')));
const prior=fixture.records[0],failed=fixture.records[1];
function rowsFor(f){
 const rows=[];
 for(let i=0;i<31;i++){
  const close=f.reference*Math.exp(.0001*(i-30));
  rows.push([f.sourceCloseAt-(31-i)*f.granularity,close*.999,close*1.001,close,close,i>=25?100:10]);
 }
 return rows;
}
test('el fallo de 2087 USD se reproduce sin sustituir su pronóstico original',()=>{
 assert.equal(fixture.developmentCase,true);assert.equal(fixture.prospectiveValidation,false);
 fixture.records.forEach(f=>T.validate(f,Date.parse(fixture.exportedAt)/1000));
 const before=JSON.stringify(failed),r=R.audit(failed);
 assert.ok(Math.abs(r.absoluteError-2087.4573413075705)<1e-8);
 assert.ok(Math.abs(r.expectedMove-20.68734130758)<1e-8);
 assert.ok(Math.abs(r.observedMove+2066.77)<1e-8);
 assert.equal(r.directionCorrect,false);assert.equal(r.insidePriceInterval,false);
 assert.equal(r.recordedActivityAlert,null);assert.equal(JSON.stringify(failed),before);
});
test('el cambio de actividad era calculable con las dos emisiones, sin mirar el cierre futuro',()=>{
 const d=R.assess(failed,{records:fixture.records,mode:'retrospective'});
 assert.equal(d.status,'activity_shift');assert.deepEqual(d.alerts,['reference_volume_doubled']);
 assert.ok(Math.abs(d.comparison.volumeRatio-4.37777127955259)<1e-12);
 assert.ok(Math.abs(d.comparison.volatilityRatio-1.4815211092606533)<1e-12);
 assert.equal(d.comparison.elapsedSeconds,30600);assert.equal(d.recent,null);
 assert.equal(d.inputProgramSHA256,null);assert.equal(d.tailProbability,null);
 assert.equal(d.predictiveValidation,'not_established');assert.equal(d.contextContributing,false);
 assert.match(R.describe(d),/Reconstrucción posterior/);
 assert.equal(R.audit({...failed,riskDiagnostics:d}).recordedActivityAlert,null);
});
test('cambiar todos los resultados posteriores no cambia las señales reconstruidas',()=>{
 const before=R.assess(failed,{records:fixture.records,mode:'retrospective'});
 const changed=structuredClone(fixture.records);
 for(const f of changed){f.measurement=[{actual:1e9}];f.checkedAt=1;f.confidence={status:'invented'};}
 assert.deepEqual(R.assess(changed[1],{records:changed,mode:'retrospective'}),before);
 const future={...structuredClone(prior),sourceCloseAt:failed.sourceCloseAt+300,
  issuedAt:failed.issuedAt+300,outputs:[{}, {baseline:.0001},{baseline:.0001}]};
 assert.deepEqual(R.assess(failed,{records:[future,...fixture.records],mode:'retrospective'}),before);
 const late={...structuredClone(prior),issuedAt:failed.issuedAt+1};
 assert.equal(R.assess(failed,{records:[late]}).comparison,null);
});
test('las ventanas guardan 31 velas cerradas y excluyen velas futuras y abiertas',()=>{
 const rows=rowsFor(failed),before=R.assess(failed,{rows});
 assert.equal(before.inputWindow.length,31);assert.equal(before.recent.closedThrough,failed.sourceCloseAt);
 assert.ok(Math.abs(before.recent.volumeRatio-10)<1e-12);
 assert.equal(before.alerts.includes('recent_volume_doubled'),true);
 const future=[failed.sourceCloseAt,0,1e9,1e9,1e9,1e12];
 assert.deepEqual(R.assess(failed,{rows:[...rows,future]}),before);
 const fromObjects=rows.map(r=>({time:r[0],low:r[1],high:r[2],open:r[3],close:r[4],volume:r[5]}));
 assert.deepEqual(R.assess(failed,{rows:fromObjects}),before);
 assert.equal(R.validate(before,failed),before);
 assert.equal(R.assess(failed,{rows:rows.slice(-10)}).recent,null);
 const gap=rows.filter((_,i)=>i!==4);assert.equal(R.assess(failed,{rows:gap}).recent,null);
 assert.throws(()=>R.assess(failed,{rows:[...rows,rows[0]]}),/duplicadas/);
});
test('el diagnóstico es opcional para respaldos anteriores y se valida al importar',()=>{
 T.validate(failed,Date.parse(fixture.exportedAt)/1000);
 const f=structuredClone(failed);f.programSHA256='a'.repeat(64);
 f.riskDiagnostics=R.assess(f,{records:[prior],rows:rowsFor(f)});
 T.validate(f,Date.parse(fixture.exportedAt)/1000);
 const text=JSON.stringify({schema:'laplace-lqt-backup-v1',records:[f]});
 const imported=T.importEvidence([],text,{now:Date.parse(fixture.exportedAt)/1000}).records[0];
 assert.deepEqual(imported.riskDiagnostics,f.riskDiagnostics);assert.deepEqual(imported.outputs,f.outputs);
 const reordered=structuredClone(f);
 reordered.riskDiagnostics=Object.fromEntries(Object.entries(reordered.riskDiagnostics).reverse());
 T.validate(reordered,Date.parse(fixture.exportedAt)/1000);
 const tampered=structuredClone(f);tampered.riskDiagnostics.alerts=[];
 assert.throws(()=>T.validate(tampered,Date.parse(fixture.exportedAt)/1000),/contradictorias/);
 const leaked=structuredClone(f);leaked.riskDiagnostics.inputWindow.push([f.sourceCloseAt,1,2,1,1,1]);
 assert.throws(()=>T.validate(leaked,Date.parse(fixture.exportedAt)/1000),/diagnóstico/);
});
test('cero actividad o falta de historia nunca se presentan como ausencia de riesgo',()=>{
 const f=structuredClone(failed);f.outputs[1].baseline=0;f.outputs[2].baseline=0;
 assert.equal(R.assess(f,{records:[]}).status,'insufficient_input_history');
 const p={...structuredClone(prior),outputs:[{}, {baseline:0},{baseline:0}]};
 const d=R.assess(f,{records:[p]});assert.equal(d.comparison.volumeRatio,null);
 assert.equal(d.comparison.volatilityRatio,null);assert.equal(d.status,'no_rule_triggered');
 assert.match(R.describe(d),/pueden ocurrir movimientos fuera/);
 assert.match(R.describe(null),/no guardó señales/);
});
test('la huella nativa se conserva en el registro y se rechaza una huella malformada',()=>{
 const f=structuredClone(failed);f.programSHA256='a'.repeat(64);
 const result={...f,schema:'laplace-lqt1000-v1',quantum:true,qubits:1000,components:1,
  checkpointSaved:true,...f.training,programSHA256:f.programSHA256};
 const frozen=T.freeze(result,{issuedAt:f.issuedAt});assert.equal(frozen.programSHA256,f.programSHA256);
 assert.throws(()=>T.freeze({...result,programSHA256:'broken'},{issuedAt:f.issuedAt}),/Huella/);
});
