const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const assets=path.resolve(__dirname,'../app/src/main/assets'),root=path.resolve(__dirname,'../../..');
test('C04 recupera los tres deltas reales en el worker y coincide con Node',async()=>{
 const ctx=vm.createContext({URL,TextEncoder,TextDecoder,console,Date,postMessage:m=>ctx.reply=m});
 // Mantener los objetos JSON en el mismo realm, como sucede en un Worker real.
 vm.runInContext('globalThis.structuredClone=x=>JSON.parse(JSON.stringify(x))',ctx);
 vm.runInContext(fs.readFileSync(path.join(assets,'ef004-runtime.js'),'utf8'),ctx);
 vm.runInContext(ctx.LAPLACE_EF004_WORKER_SOURCE,ctx);
 const text=fs.readFileSync(path.join(assets,'ef004-archive.js'),'utf8');
 const packed=JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,''));
 const frames=['BTC-USD','ETH-USD','SOL-USD'].map(asset=>JSON.parse(fs.readFileSync(path.join(root,'evidencia/c04-contexto-vivo',asset+'.json'))));
 const options={asOf:new Date().toISOString(),asset:'BTC-USD',horizonHours:6};
 const {ejecutarContextoVivoC04}=await import(path.join(root,'estado-financiero/contexto-mercado-c04.mjs'));
 const {ejecutarConjuntoC03}=await import(path.join(root,'prediccion/conjunta-c03.mjs'));
 const expected=ejecutarContextoVivoC04(packed.captures,frames,null,options,ejecutarConjuntoC03);
 ctx.payload=JSON.stringify({id:4,action:'joint',captures:packed.captures,marketFrames:frames,options});
 vm.runInContext('onmessage({data:JSON.parse(payload)})',ctx);
 assert.equal(ctx.reply.ok,true,ctx.reply.error);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.reply.result)),expected);
 assert.equal(expected.context_journal.frames_materialized,3);
 assert.equal(expected.context_journal.unresolved.length,0);
 assert.equal(expected.prospectively_validated,false);
});
test('el comparador portátil verifica el sello real y coincide con Node',async()=>{
 const portable=require(path.join(assets,'comparison-c04.js'));
 const {compararPronosticosC04}=await import(path.join(root,'nucleo/comparacion-c04.mjs'));
 const body={schema:'laplace-c03-context-forecast-v1',asset:'ETH-USD',issued_at:'2026-11-01T00:00:00.000Z',
  target_at:'2026-11-01T01:00:00.000Z',reference_price:2000,estimated_price:2010,
  lower:1980,upper:2020,probability_up:.6};
 const f={...body,forecast_sha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
 const record={asset:'ETH-USD',issuedAt:Date.parse(body.issued_at)/1000,targetCloseAt:Date.parse(body.target_at)/1000,
  reference:2000,outputs:[{predicted:2005}],probabilityUp:.55,checkpointSHA256:'1'.repeat(64),jointContext:{forecast:f}};
 assert.deepEqual(portable.compararPronosticosC04(record,2008,record.targetCloseAt),
  compararPronosticosC04(record,2008,record.targetCloseAt));
 record.jointContext.forecast.estimated_price++;
 assert.throws(()=>portable.compararPronosticosC04(record,2008,record.targetCloseAt),/alterado/);
});
