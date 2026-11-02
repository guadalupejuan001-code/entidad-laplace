const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),assets=path.resolve(__dirname,'../app/src/main/assets');
const runtime=fs.readFileSync(path.join(assets,'ef004-runtime.js'),'utf8');
function mobile(captures){const ctx=vm.createContext({TextEncoder,TextDecoder,URL,structuredClone,crypto:crypto.webcrypto,console});
 vm.runInContext(runtime,ctx);vm.runInContext(ctx.LAPLACE_EF004_WORKER_SOURCE,ctx);ctx.json=JSON.stringify(captures);vm.runInContext('globalThis.captures=JSON.parse(json)',ctx);return ctx}
async function synthetic(n=110){
 const {universeSnapshot}=await import(path.join(root,'universo/estados.mjs'));
 const {sellarCaptura}=await import(path.join(root,'universo/integridad.mjs'));
 const all=[];let a=80,b=100,c=120,lag=0;
 for(let i=0;i<n;i++){
  const d=.028*Math.sin(1.73*i)+.017*Math.cos(.81*i),db=i?1.65*lag+.0012*Math.sin(i*3.17):0;
  a*=Math.exp(d);b*=Math.exp(db);c*=Math.exp(.012*Math.sin(2.4*i)+.018*Math.cos(1.9*i));lag=d;
  const at=new Date(Date.UTC(2026,8,1)+i*6*3600000).toISOString();
  const rows=[a,b,c].map((value,j)=>({id:'test-'+j+'-'+i,domain:'domain_'+j,variable:'var_'+j,unit:'USD',value,
   observed_at:at,known_at:at,source_url:'https://example.org/test-'+j}));
  all.push(sellarCaptura({schema:'laplace-universo-global-u003-v4',at,universal_state:universeSnapshot(rows,{cutoff:at}),
   source_status:[],coverage:{complete_world:false},prediction_inputs_enabled:false,automatic_trading:false}));
 }return all;
}
test('SHA móvil coincide con Node incluso en texto Unicode',()=>{
 const c=mobile([]);for(const text of ['', 'abc','LAPLACE · español ✨', 'x'.repeat(150000)])
 assert.equal(c.LaplaceEF004Core.sha256(text),crypto.createHash('sha256').update(text).digest('hex'));
});
test('EF004 móvil ejecuta exactamente el modelo original y sus sellos',async()=>{
 const captures=await synthetic(),c=mobile(captures),{aprenderNucleoEF004}=await import(path.join(root,'demonio/finanzas-ef004.mjs'));
 const original=aprenderNucleoEF004(captures),result=vm.runInContext('LaplaceEF004Core.aprenderNucleoEF004(captures)',c);
 assert.equal(result.status,'experimental_model_frozen');assert.equal(result.model_sha256,original.model_sha256);
 assert.equal(result.forecast_sha256,original.forecast_sha256);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),original);
 assert.ok(result.model.models.some(m=>m.model?.kind==='joint'));
});
test('EF004 móvil detecta manipulación del archivo y del pronóstico',async()=>{
 const captures=await synthetic(),c=mobile(captures);
 const result=vm.runInContext('LaplaceEF004Core.aprenderNucleoEF004(captures)',c);c.forecast=result;
 vm.runInContext('forecast.trajectory[0].states[0].estimated_value+=1',c);
 assert.throws(()=>vm.runInContext('LaplaceEF004Core.verificarPronosticoEF004(forecast)',c),/modificado/);
 vm.runInContext('captures[0].universal_state.states[0].value+=1',c);
 assert.throws(()=>vm.runInContext('LaplaceEF004Core.aprenderNucleoEF004(captures)',c),/modificada|modificado/);
});
test('dos capturas no se maquillan como entrenamiento, con motor presente',async()=>{
 const c=mobile(await synthetic(2)),r=vm.runInContext('LaplaceEF004Core.aprenderNucleoEF004(captures)',c);
 assert.equal(r.status,'abstained');assert.equal(r.contiguous_captures,2);assert.equal(r.observed_training_pairs,0);
});
test('paquete conserva todas las fuentes canónicas exactas, no un EF004 alternativo',()=>{
 const c=mobile([]);for(const [file,sha] of Object.entries(c.LAPLACE_EF004_ENGINE.sources))
 assert.equal(sha,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'));
 assert.match(fs.readFileSync(path.join(assets,'ef004-mobile.js'),'utf8'),/new Worker/);
});
test('archivo Android contiene todas las capturas empaquetadas cuando está preparado',()=>{
 const file=path.join(assets,'ef004-archive.js');assert.ok(fs.existsSync(file),'Ejecuta prepare-ef004.mjs con el archivo EF002 antes de probar Android');
 const text=fs.readFileSync(file,'utf8'),data=JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,''));
 assert.equal(data.archive_count,data.captures.length);assert.equal(data.index.length,data.captures.length);
 const c=mobile(data.captures);const r=vm.runInContext('LaplaceEF004Core.aprenderNucleoEF004(captures)',c);
 assert.ok(['abstained','experimental_model_frozen'].includes(r.status));assert.equal(data.synthetic_data,false);
});
