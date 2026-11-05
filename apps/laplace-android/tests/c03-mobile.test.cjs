const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assets=path.resolve(__dirname,'../app/src/main/assets'),root=path.resolve(__dirname,'../../..');
test('el worker C03 móvil reproduce la auditoría real de Node y cuenta los mismos objetivos',async()=>{
 const ctx=vm.createContext({URL,TextEncoder,TextDecoder,console,Date,postMessage:message=>ctx.reply=message});
 vm.runInContext(fs.readFileSync(path.join(assets,'ef004-runtime.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(assets,'ef004-archive.js'),'utf8').replace('window.LAPLACE_EF004_ARCHIVE','globalThis.archive'),ctx);
 vm.runInContext(ctx.LAPLACE_EF004_WORKER_SOURCE,ctx);
 const {ejecutarConjuntoC03}=await import(path.join(root,'prediccion/conjunta-c03.mjs'));
 const options={asOf:new Date().toISOString(),horizonHours:6},captures=JSON.parse(JSON.stringify(ctx.archive.captures));
 const expected=ejecutarConjuntoC03(captures,options);
 ctx.options=options;
 vm.runInContext('onmessage({data:{id:1,action:"joint",captures:archive.captures,options}})',ctx);
 assert.equal(ctx.reply.ok,true);
 const {context_journal,market_frame,...core}=JSON.parse(JSON.stringify(ctx.reply.result));
 assert.deepEqual(core,expected);assert.equal(market_frame,null);
 assert.equal(context_journal.frames_verified,0);
 assert.equal(expected.components.length,20);
 assert.equal(expected.prospectively_validated,false);
});
test('el worker acepta ausencia de capturas como abstención explícita de C03',()=>{
 const ctx=vm.createContext({URL,TextEncoder,TextDecoder,console,Date,postMessage:message=>ctx.reply=message});
 vm.runInContext(fs.readFileSync(path.join(assets,'ef004-runtime.js'),'utf8'),ctx);
 vm.runInContext(ctx.LAPLACE_EF004_WORKER_SOURCE,ctx);
 vm.runInContext('onmessage({data:{id:2,action:"joint",captures:[],options:{asOf:new Date().toISOString()}}})',ctx);
 assert.equal(ctx.reply.ok,true);
 assert.equal(ctx.reply.result.reason,'independent_world_history_unavailable');
});
