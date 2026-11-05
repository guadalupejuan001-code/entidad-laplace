/* Real native LQT + actual archived OHLCV + the complete UI under file://.
 * Android transport/storage is replaced only here by a host adapter. JNI has
 * its own real-library JUnit test. No JS learner or fabricated model result. */
const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'../../..');
const report=JSON.parse(fs.readFileSync(path.join(root,'evidencia/campana-c02/resultados.json'))),
 all=JSON.parse(require('node:zlib').gunzipSync(Buffer.from(fs.readFileSync(path.join(root,'evidencia/campana-c02/datos/BTC-USD-300.json.gz.b64'),'utf8').trim(),'base64'))).rows,initial=all.slice(0,-24),states=new Map();
let now=initial.at(-1)[0]+302,analyzeCalls=0;
const sha=s=>createHash('sha256').update(s).digest('hex');
async function native(action,json){
 try{
  const p=JSON.parse(json),h=p.minutes*60/p.granularity,key=p.asset+':'+p.granularity+':'+h;
  if(action==='backup'){assert.ok(states.has(key));return {ok:true,result:states.get(key)};}
  if(action==='restore'){
   const model=p.model,k=model.asset+':'+model.granularity+':'+model.minutes*60/model.granularity;
   assert.equal(sha(model.checkpoint),model.checkpointSHA256);
   if(states.has(k))assert.equal(states.get(k).checkpointSHA256,model.checkpointSHA256);else states.set(k,model);
   return {ok:true,result:{alreadyPresent:true}};
  }
  assert.equal(action,'analyze');analyzeCalls++;
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lqt-browser-'));
  try{
   const source=`lqc.configure ${p.asset} ${p.granularity} ${h} crypto ${now} quantum\n`+
    p.rows.map(r=>'lqc.candle '+r.join(' ')+' 0\n').join('')+'lqc.run\n';
   const file=path.join(directory,'model.xi');fs.writeFileSync(file,source);const args=[file];
   if(states.has(key)){const checkpoint=path.join(directory,'model.lqt');fs.writeFileSync(checkpoint,states.get(key).checkpoint);args.push(checkpoint);}
   const run=spawnSync(path.join(root,'build/campaign-runner'),args,{encoding:'utf8',maxBuffer:2*1024*1024,timeout:30000});
   assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout),state=result.checkpoint;
   const model={schema:'laplace-campaign-checkpoint-v1',asset:p.asset,granularity:p.granularity,minutes:p.minutes,
    kernelSHA256:report.kernelSHA256,checkpointSHA256:sha(state),checkpoint:state};states.set(key,model);
   delete result.checkpoint;Object.assign(result,{minutes:p.minutes,checkpointSaved:true,checkpointSHA256:sha(state),
    kernelSHA256:report.kernelSHA256,programSHA256:sha(source)});
   return {ok:true,result};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 }catch(error){return {ok:false,error:error.message};}
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('__lqtRequest',native);
  await page.addInitScript(({rows,clock})=>{
   window.__rows=rows;window.__clock=Number(localStorage.getItem('qa-lqt-clock'))||clock;const RealDate=Date;
   window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__clock*1000]));}static now(){return window.__clock*1000;}};
   window.LaplaceBridge={
    fetchCandles(id,asset,g){setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,granularity:g,candles:window.__rows}),5);},
    fetchQuote(id,asset){setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,quote:{asset,price:window.__rows.at(-1)[4],
     time:new Date().toISOString(),receivedAt:Date.now(),market:'crypto',source:'Archived Coinbase data / native UI test'}}),5);},
    exportHistory(text){window.__exported=text;setTimeout(()=>window.LaplaceExportResult('Respaldo exportado en prueba.'),5);},
    importHistory(){setTimeout(()=>window.LaplaceImportResult({ok:true,text:window.__exported,name:'native-backup.json'}),5);}
   };
   window.LaplaceQuantumBridge={request(id,action,json){window.__lqtRequest(action,json).then(result=>window.LaplaceQuantumMobile.receive(id,result));}};
  },{rows:initial,clock:now});
  await page.goto(pathToFileURL(path.join(root,'apps/laplace-android/app/src/main/assets/index.html')).href);
  await page.waitForFunction(()=>window.LaplaceUIHealth?.initialized);
  assert.equal(await page.locator('#classicalReference').getAttribute('open'),null);
  await page.locator('#lqtRun').click();
  await page.waitForFunction(()=>window.LaplaceQuantumMobile.state().records.length===1,null,{timeout:30000});
  const first=await page.evaluate(()=>window.LaplaceQuantumMobile.state().records[0]);
  assert.equal(first.training.updatedRotations,1000);assert.match(await page.locator('#lqtVolume').textContent(),/BTC/);
  assert.equal(first.algorithmVersion,3);
  assert.match(await page.locator('#lqtValidation').textContent(),/subidas y .* bajadas/);
  await page.locator('#lqtRun').click();assert.equal(analyzeCalls,1,'same origin must preserve original forecast and checkpoint');
  now=all.at(-1)[0]+302;
  await page.evaluate(({rows,clock})=>{window.__rows=rows;window.__clock=clock;localStorage.setItem('qa-lqt-clock',String(clock));},{rows:all,clock:now});
  await page.locator('#lqtRun').click();
  await page.waitForFunction(()=>window.LaplaceQuantumMobile.state().records.length===2,null,{timeout:30000});
  const second=await page.evaluate(()=>window.LaplaceQuantumMobile.state().records[1]);
  assert.equal(second.training.onlineUpdates,first.campaign.pooledWeight>0?8:0);assert.notEqual(second.checkpointSHA256,first.checkpointSHA256);
  await page.locator('[data-tab="tests"]').click();await page.locator('#lqtSync').click();
  await page.waitForFunction(()=>window.LaplaceQuantumMobile.state().records[0].status==='verified');
  const checked=await page.evaluate(()=>window.LaplaceQuantumMobile.state().records);
  assert.deepEqual(checked[0].outputs,first.outputs);assert.equal(checked[0].measurement[0].actual,all[initial.length-1+3][4]);
  assert.equal(checked[1].status,'pending');assert.equal(await page.locator('#lqtHistory .history-entry').count(),2);
  await page.locator('#lqtExport').click();await page.waitForFunction(()=>window.__exported);
  const backup=await page.evaluate(()=>JSON.parse(window.__exported));
  assert.equal(backup.model.checkpointSHA256,second.checkpointSHA256);assert.equal(backup.records.length,2);
  assert.ok(backup.model.checkpoint.startsWith('LQC3 3\n'));
  await page.locator('#lqtImport').click();
  await page.waitForFunction(()=>document.querySelector('#lqtHistoryStatus').textContent.includes('2 ya existentes'));
  assert.equal(await page.evaluate(()=>window.LaplaceQuantumMobile.state().records.length),2);
  await page.locator('[data-tab="panel"]').click();await page.locator('#lqtCard .raw-details > summary').first().click();
  assert.match(await page.locator('#lqtValidation').textContent(),/No mejoró|Mejoró/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const captures=path.join(root,'apps/laplace-android/build/ux-previews');fs.mkdirSync(captures,{recursive:true});
  await page.locator('#lqtCard').screenshot({path:path.join(captures,'LAPLACE-4.6-CAMPANA-NATIVA.png')});
  await page.reload();await page.waitForFunction(()=>window.LaplaceQuantumMobile?.state().records.length===2);
  assert.equal(await page.evaluate(()=>window.LaplaceQuantumMobile.state().records[0].status),'verified');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({nativeXI:true,actualArchivedOHLCV:true,connected1000:true,
   learningRetained:true,laterUpdates:8,immutableForecasts:true,threeObservedErrors:true,backupAndImport:true,fileOrigin:true,jsErrors:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
