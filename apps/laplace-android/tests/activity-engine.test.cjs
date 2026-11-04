const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../app/src/main/assets/activity-engine.js');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function rows(n=700){
 let p=100;return Array.from({length:n},(_,i)=>{
  p*=Math.exp(.001*Math.sin(i*.21)+.0004*Math.cos(i*.073));
  return [1800000000+i*300,p*.99,p*1.01,p,p,10+3*Math.sin(i*.13)**2];
 });
}
const opts={asset:'BTC-USD',minutes:15,granularity:300};
test('M001 de precio conserva el mismo código que en las APK 4.0, 4.1 y 4.2',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/engine.js'));
 assert.equal(crypto.createHash('sha256').update(src).digest('hex'),
  '7aa226bce6d4a063b40bd9d0f3d3240d163ca92a853557c0e719de335b34c83e');
});
test('las etiquetas futuras son volumen total y volatilidad de todas las velas',()=>{
 const r=rows(100),p=A.prepare(r,opts),i=50,actual=p.target(i);
 const expectedV=r.slice(i+1,i+4).reduce((s,x)=>s+x[5],0);
 const expectedRV=100*Math.sqrt([i+1,i+2,i+3].reduce((s,k)=>s+Math.log(r[k][4]/r[k-1][4])**2,0));
 assert.ok(Math.abs(actual.volume-expectedV)<1e-8);
 assert.ok(Math.abs(actual.volatility-expectedRV)<1e-10);
 assert.throws(()=>A.prepare(r,{...opts,asOf:r.at(-1)[0]}),/cerradas/);
});
test('selecciona en validación y nunca usa resultados futuros como analogías',()=>{
 const r=rows(),result=A.analyze(r,opts);assert.equal(result.status,'forecast');
 assert.ok(result.outputs.volume.test.cases>=8);
 assert.ok(result.examples.every(e=>e.knownAt<=result.dataKnownThrough));
 const mutated=r.map((x,i)=>i<result.protocol.validationEnd?x:
  [x[0],500,1500,1000,1000+Math.sin(i)*100,10000+i]);
 const changed=A.analyze(mutated,opts);
 assert.deepEqual(changed.weights,result.weights);
 for(const key of ['volatility','volume'])assert.deepEqual(changed.outputs[key].validation,result.outputs[key].validation);
});
test('congela ambas predicciones y comprueba solamente el período completo',()=>{
 const r=rows(),history=r.slice(0,600),result=A.analyze(history,opts);
 const f=A.freeze(result,{id:'frozen',issuedAt:history.at(-1)[0]+301});
 const original=JSON.stringify(f);
 assert.equal(A.evaluate([f],r.slice(0,602),{...opts,now:r[601][0]+300}).evaluated,0);
 const checked=A.evaluate([f],r,{...opts,now:r.at(-1)[0]+300});
 assert.equal(checked.evaluated,1);assert.equal(JSON.stringify(f),original);
 assert.equal(checked.records[0].observedCloseAt,r[602][0]+300);
 assert.deepEqual(checked.records[0].outputs,f.outputs);
 const actual=A.prepare(r,opts).target(599);
 for(const key of ['volatility','volume'])assert.ok(Math.abs(checked.records[0].measurement[key].actual-actual[key])<1e-9);
 assert.equal(A.evaluate(checked.records,r,{...opts,now:r.at(-1)[0]+300}).evaluated,0);
 assert.equal(A.evaluate([f],r,{...opts,asset:'ETH-USD',now:r.at(-1)[0]+300}).evaluated,0);
});
test('se abstiene ante huecos actuales o historia independiente insuficiente',()=>{
 const r=rows();for(const x of r.slice(-10))x[0]+=300;
 assert.equal(A.analyze(r,opts).status,'abstained');
 assert.equal(A.analyze(rows(100),opts).status,'abstained');
});
test('ceros no se convierten en porcentajes infinitos ni falsa ventaja',()=>{
 const r=rows().map(x=>[x[0],100,100,100,100,0]),result=A.analyze(r,opts);
 assert.equal(result.status,'forecast');
 for(const key of ['volatility','volume']){
  assert.equal(result.outputs[key].predicted,0);assert.equal(result.outputs[key].test.mae,0);
  assert.equal(result.outputs[key].test.skill,null);assert.equal(result.outputs[key].test.wape,null);
 }
});
test('importación conserva predicciones y recalcula errores desde resultados originales',()=>{
 const r=rows(),result=A.analyze(r.slice(0,600),opts),f=A.freeze(result,{id:'one',issuedAt:r[599][0]+301});
 const checked=A.evaluate([f],r,{...opts,now:r.at(-1)[0]+300}).records[0];
 checked.measurement.volume.error=-999;
 const text=JSON.stringify({schema:'laplace-activity-evidence-v1',records:[checked]});
 const imported=A.importEvidence([],text,{now:r.at(-1)[0]+300});
 assert.equal(imported.added,1);assert.ok(imported.records[0].measurement.volume.error>=0);
 assert.equal(A.importEvidence(imported.records,text,{now:r.at(-1)[0]+300}).added,0);
 assert.throws(()=>A.importEvidence([],JSON.stringify({schema:'wrong',records:[]})));
});
