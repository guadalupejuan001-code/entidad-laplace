const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const V=require('../app/src/main/assets/history-verifier.js'),T=require('../app/src/main/assets/quantum-tracking.js');
const report=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../evidencia/lqt1000/resultados.json')));
function fixture(id='historico',asset='BTC-USD'){
 const h=report.horizons.find(x=>x.minutes===15),r=structuredClone(h.quantum);
 Object.assign(r,{asset,minutes:15,checkpointSaved:true,checkpointSHA256:h.checkpointSHA256,kernelSHA256:report.algorithmSHA256});
 const f=T.freeze(r,{issuedAt:r.sourceCloseAt+1,id});
 const rows=Array.from({length:4},(_,i)=>{const p=f.reference*(1+.001*i);return [f.originTime+i*300,p*.99,p*1.01,p,p,10]});
 return {f,rows};
}
function harness(items,clock){
 let records=items,calls=[],timers=[];
 const v=V.create({now:()=>clock.value,setTimer:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimer:()=>{}});
 v.register('native',{records:()=>records,evaluate:T.evaluate,update:next=>records=next});
 return {v,get records(){return records},calls,timers,close:()=>v.dispose()};
}
test('recupera un pronóstico de hace 40 días con su ventana exacta y conserva sus salidas',async()=>{
 const {f,rows}=fixture(),clock={value:f.targetCloseAt+40*86400},h=harness([f],clock);
 h.v.configure(async request=>{h.calls.push(request);return rows});
 const result=await h.v.sync();assert.equal(result.evaluated,1);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].start,f.originTime);assert.equal(h.calls[0].end,f.targetCloseAt);
 assert.equal((h.calls[0].end-h.calls[0].start)/300,4);
 assert.equal(h.records[0].status,'verified');assert.deepEqual(h.records[0].outputs,f.outputs);
 assert.equal(h.records[0].measurement[0].actual,rows.at(-1)[4]);h.close();
});
test('un fallo de BTC no impide comprobar ETH, y el reintento automático respeta la espera',async()=>{
 const btc=fixture('btc'),eth=fixture('eth','ETH-USD'),clock={value:btc.f.targetCloseAt+10},h=harness([btc.f,eth.f],clock);
 let offline=true;
 h.v.configure(async q=>{h.calls.push(q.asset);if(q.asset==='BTC-USD'&&offline)throw Error('HTTP 429');return eth.rows});
 const r=await h.v.sync();assert.equal(r.evaluated,1);assert.equal(h.records.find(f=>f.id==='btc').verification.reason,'source_error');
 assert.equal(h.records.find(f=>f.id==='eth').status,'verified');await h.v.sync();assert.equal(h.calls.length,2);
 offline=false;await h.v.sync({force:true});assert.equal(h.records.find(f=>f.id==='btc').status,'verified');h.close();
});
test('no usa velas parciales ni rellena un hueco, y vuelve a comprobar con datos nuevos',async()=>{
 const {f,rows}=fixture(),clock={value:f.targetCloseAt-1},h=harness([f],clock);let complete=false;
 h.v.configure(async()=>{h.calls.push(1);return complete?rows:rows.filter((_,i)=>i!==2)});
 await h.v.sync({force:true});assert.equal(h.calls.length,0);
 clock.value=f.targetCloseAt+5;await h.v.sync();assert.equal(h.records[0].verification.reason,'missing_bars');assert.equal(h.records[0].status,'pending');
 complete=true;await h.v.sync({force:true});assert.equal(h.records[0].status,'verified');h.close();
});
test('las llamadas simultáneas comparten la consulta y los períodos solapados se agrupan',async()=>{
 const {f,rows}=fixture(),clock={value:f.targetCloseAt+5},other={...structuredClone(f),id:'otra'};
 const h=harness([f,other],clock);let release;
 h.v.configure(()=>new Promise(resolve=>{h.calls.push(1);release=resolve}));
 const one=h.v.sync(),two=h.v.sync({force:true});assert.equal(one,two);await Promise.resolve();release(rows);
 const r=await one;assert.equal(h.calls.length,1);assert.equal(r.evaluated,2);h.close();
});
test('la reanudación comprueba sin botón y un error de almacenamiento no se cuenta como guardado',async()=>{
 const {f,rows}=fixture(),clock={value:f.targetCloseAt+5},h=harness([f],clock);
 h.v.configure(async()=>rows);h.v.wake();h.timers.at(-1).fn();await h.v.sync();assert.equal(h.records[0].status,'verified');h.close();
 const v=V.create({now:()=>clock.value,setTimer:()=>1,clearTimer:()=>{}});
 v.register('native',{records:()=>[f],evaluate:T.evaluate,update(){throw Error('Sin espacio')}});v.configure(async()=>rows);
 const r=await v.sync();assert.equal(r.evaluated,0);assert.ok(r.errors.some(e=>e.message==='Sin espacio'));v.dispose();
});
test('la consulta de campaña añade los días aunque proceda de un registro importado y permite forzar red',async()=>{
 const requests=[],ctx={window:{LaplaceActivityData:{selection:()=>({asset:'BTC-USD',market:'crypto',minutes:15}),freshness:()=>({valid:true})},
  LaplaceCampaignFetch:async s=>{requests.push(s);return [{time:1}]}},Date};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/campaign-data.js'),'utf8'),ctx);
 const D=ctx.window.LaplaceCampaignData,s={asset:'BTC-USD',market:'crypto',minutes:15,granularity:300};
 await D.history(s);assert.equal(requests[0].days,28);await D.history(s);assert.equal(requests.length,1);
 await D.history(s,{force:true});assert.equal(requests.length,2);assert.equal(D.selection().granularity,300);
});
test('una nota importada no inventa un resultado verificado y un registro sin fechas no bloquea los demás',async()=>{
 const {f,rows}=fixture(),now=f.targetCloseAt+5;
 assert.equal(V.phase({...f,verification:{reason:'verified'}},now),'due');
 const invalid={...structuredClone(f),id:'sin-fechas',sourceCloseAt:undefined,originTime:undefined,sourceTime:undefined};
 const h=harness([invalid,f],{value:now});h.v.configure(async()=>rows);
 const result=await h.v.sync();assert.equal(result.evaluated,1);
 assert.equal(h.records.find(x=>x.id==='sin-fechas').verification.reason,'invalid_period');
 assert.equal(h.records.find(x=>x.id===f.id).status,'verified');h.close();
});
