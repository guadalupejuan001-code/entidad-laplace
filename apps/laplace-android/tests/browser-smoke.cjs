/* Prueba REAL de interfaz con Chromium. Precios/velas simulados y etiquetados
 * para verificar controles, errores y navegación; no demuestra fuente real.
 * Falla ante cualquier error JS de arranque, botón sin respuesta o pantalla rota.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../app/src/main/assets');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const htmlSource=read('index.html');

const mock=[
  "(()=>{",
  "function candles(asset,step,days){",
  "const end=Math.floor(Date.now()/1000/step)*step;",
  "const total=Math.floor(days*86400/step);let value=asset==='BTC-USD'?61500:asset==='ETH-USD'?3100:180;",
  "const rows=[];",
  "for(let i=0;i<total;i++){",
  "const t=end-(total-i)*step;",
  "value*=Math.exp(.0015*Math.sin(i*.16)+.0009*Math.cos(i*.039));",
  "rows.push([t,value*.994,value*1.006,value,value,3+Math.sin(i*.12)**2]);",
  "}",
  "return rows;}",
  "window.LaplaceBridge={",
  "fetchCandles(id,asset,step,days){setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,granularity:step,candles:candles(asset,step,days)}),15);},",
  "fetchQuote(id,asset){const p=asset==='BTC-USD'?61500:asset==='ETH-USD'?3100:180;",
  "setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,quote:{asset,price:p,time:new Date().toISOString(),receivedAt:Date.now(),source:'SIMULACION SOLO PARA TEST'}}),10);}",
  "};",
  "let nextSeq=21;",
  "function simulatedLive(){if(!window.LaplaceMobile)return;",
  "window.LaplaceMobile.live({type:'status',state:'live',message:'SIMULACIÓN: ticker + heartbeat'});",
  "for(const asset of ['BTC-USD','ETH-USD','SOL-USD']){",
  "const time=new Date().toISOString(),price=asset==='BTC-USD'?61502.75:asset==='ETH-USD'?3102.4:181.8;",
  "window.LaplaceMobile.live({type:'ticker',asset,price,sequence:nextSeq++,time,observedAt:Date.parse(time),receivedAt:Date.now()});",
  "}}",
  "window.LaplaceLiveBridge={",
  "start(){setTimeout(simulatedLive,20);},",
  "stop(){window.LaplaceMobile.live({type:'status',state:'off',message:'Detenido en test'});}",
  "};})();"
].join('\n');

const mockXN01=String.raw`
window.LaplaceBridge.analyzeXN01=function(id,asset,encoded){
 const bars=JSON.parse(encoded);
 const result={
  schema:'laplace-xn01-native-xi-v1',asset:'BTC-USD',
  backend:'XI/Ether · NativeRuntime',direction:'subida',
  confidence:0.54,probability_up:0.54,prior:0.51,
  mask:13,support:14,training_rows:220,
  program_sha256:'a'.repeat(64),output_sha256:'b'.repeat(64),
  raw_register_output:'SIMULATED XI ONLY IN BROWSER TEST'
 };
 setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,xn01:result}),10);
};`;

const removeSources=htmlSource.replace(/<link rel="stylesheet" href="style.css">/,
  '<style>'+read('style.css')+'</style>')
  .replace(/<script src="[A-Za-z0-9.-]+\.js" defer><\/script>/g,'');
const sources=['world.js','engine.js','math-pde.js','fusion-integral.js',
  'pde-panel.js','live-feed.js','app.js'];
const loaded=removeSources.replace('</body>',
  '<script>'+mock+mockXN01+'</script>'+
  sources.map(name=>'<script>'+read(name).replace(/<\/script>/g,'<\\/script>')+'</script>').join('')+
  '</body>');
const chromePaths=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium',
  '/opt/google/chrome/chrome'].filter(Boolean);
const chrome=chromePaths.find(p=>fs.existsSync(p));
assert.ok(chrome,'Chromium/Chrome no está disponible: no saltar el test de UI');
(async()=>{
  const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text())});
  try{
    await page.setContent(loaded,{waitUntil:'domcontentloaded'});
    const ready=await page.evaluate(()=>window.LaplaceUIHealth?.initialized===true);
    assert.ok(ready,'La app no alcanzó la inicialización: posible botón muerto');
    assert.equal(await page.locator('[data-tab]').count(),6);
    assert.equal(await page.locator('[data-minutes]').count(),16);
    assert.equal(await page.locator('#horizonSelect option').count(),16);
    // La carga inicial está simulada, pero el controller debe recibir datos.
    await page.waitForFunction(()=>document.querySelector('#quoteBTC').textContent!=='—'&&
      !document.querySelector('#refresh').disabled,{timeout:25000});
    assert.match(await page.locator('#quoteBTC').innerText(),/61/);
    await page.waitForFunction(()=>document.querySelector('#liveStatus').textContent==='WebSocket conectado',null,{timeout:10000});
    assert.match(await page.locator('#liveCount').innerText(),/3 operaciones/);
    assert.match(await page.locator('#quoteBTCStatus').innerText(),/WEB SOCKET/);
    assert.match(await page.locator('#quoteETHStatus').innerText(),/WEB SOCKET/);
    assert.match(await page.locator('#quoteSOLStatus').innerText(),/WEB SOCKET/);
    assert.match(await page.locator('#liveGraphLabel').innerText(),/operaci/);
    const prevBTC=await page.locator('#quoteBTC').innerText();
    await page.evaluate(()=>{
      window.LaplaceMobile.live({type:'ticker',asset:'BTC-USD',price:999,
        sequence:1,time:new Date().toISOString(),observedAt:Date.now(),receivedAt:Date.now()});
    });
    assert.equal(await page.locator('#quoteBTC').innerText(),prevBTC,
      'Un ticker desordenado no puede sustituir al precio más reciente');
    await page.locator('#liveToggle').click();
    assert.match(await page.locator('#liveStatus').innerText(),/detenida/i);
    assert.equal(await page.locator('#liveToggle').getAttribute('aria-pressed'),'false');
    await page.locator('#liveToggle').click();
    await page.waitForFunction(()=>document.querySelector('#liveStatus').textContent==='WebSocket conectado',null,{timeout:10000});
    assert.equal(await page.locator('#liveToggle').getAttribute('aria-pressed'),'true');
    // La conexión WebSocket puede recuperarse antes de que termine la
    // validación de velas; esperar la condición, no asumir orden de callbacks.
    try{
      await page.waitForFunction(()=>!document.querySelector('#forecast').disabled,
        null,{timeout:15000});
    }catch(error){
      throw Error('El botón Proyectar no se habilitó: '+
        await page.locator('#dataStatus').innerText()+' / '+
        await page.locator('#noticeText').innerText());
    }
    assert.match(await page.locator('#chartComment').innerText(),/Historial real cargado/);
    await page.locator('#xn01Run').click();
    await page.waitForFunction(()=>document.querySelector('#xn01Confidence').textContent==='54.00 %',null,{timeout:20000});
    assert.equal(await page.locator('#xn01PUp').innerText(),'0.54');
    assert.match(await page.locator('#xn01Raw').textContent(),/SIMULATED XI ONLY/);
    await page.locator('#forecast').click();
    await page.waitForFunction(()=>document.querySelector('#estimate').textContent!=='—',{timeout:20000});
    assert.match(await page.locator('#relativeChange').innerText(),/%/);
    assert.match(await page.locator('#rawM001').textContent(),/returnLog/);
    await page.locator('#train').click();
    assert.match(await page.locator('#noticeText').innerText(),/M001|patrones/i);
    await page.locator('#test').click();
    assert.equal(await page.locator('#tests').isVisible(),true);
    await page.locator('[data-tab="panel"]').click();
    await page.locator('#evaluate').click();
    assert.equal(await page.locator('#tests').isVisible(),true);
    await page.locator('[data-tab="panel"]').click();
    await page.selectOption('#horizonSelect','60');
    assert.equal(await page.locator('#horizonTag').innerText(),'1 HORA');
    assert.equal(await page.locator('[data-minutes="60"]').getAttribute('aria-pressed'),'true');
    // Mismo paso de vela: el botón mantiene datos válidos sin recargar Internet.
    assert.equal(await page.locator('#forecast').isDisabled(),false);
    await page.locator('[data-tab="signals"]').click();
    assert.equal(await page.locator('#signals').isVisible(),true);
    await page.locator('[data-tab="world"]').click();
    assert.equal(await page.locator('#world').isVisible(),true);
    await page.locator('#worldSearch').fill('BTC');
    assert.match(await page.locator('#worldMatches').innerText(),/estados/);
    await page.locator('#capabilityRefresh').click();
    assert.equal(await page.locator('#capabilityRows .signal-row').count(),20);
    assert.match(await page.locator('#capabilityRaw').textContent(),/laplace-capability-observability-v1/);
    await page.locator('#capabilityQuery').fill('EF004');
    assert.equal(await page.locator('#capabilityRows .signal-row').count(),1);
    await page.locator('#capabilityQuery').fill('');
    assert.equal(await page.locator('#capabilityRows .signal-row').count(),20);
    await page.locator('[data-tab="equation"]').click();
    await page.selectOption('#pdePreset','quadratic');
    await page.locator('#pdeSolve').click();
    assert.match(await page.locator('#pdeStatus').innerText(),/resuelto/i);
    await page.locator('#graphWA').fill('3');
    await page.locator('#graphSolve').click();
    const x=Number((await page.locator('#graphValue').innerText()).replace(',','.'));
    assert.ok(Math.abs(x-25)<.01,'Grafo dejó de calcular al pulsar botón: '+x);
    await page.locator('[data-tab="integral"]').click();
    await page.locator('#integralRun').click();
    await page.waitForFunction(()=>{
      const t=document.querySelector('#integralStatus').textContent;
      return t.includes('F001 completado')||t.includes('No se pudo completar');
    },{timeout:90000});
    assert.match(await page.locator('#integralStatus').innerText(),/F001 completado/);
    assert.equal(await page.locator('.integral-item').count(),14);
    assert.match(await page.locator('#rawF001').textContent(),/price_candidate_unrounded/);
    assert.equal(await page.locator('#integralRun').isDisabled(),false);
    await page.locator('[data-tab="tests"]').click();
    await page.locator('#clearHistory').click();
    assert.match(await page.locator('#history').innerText(),/Sin candidatos/);
    // Cambiar resolución exige otro lote y desactiva botones hasta recibirlo.
    await page.locator('[data-tab="panel"]').click();
    await page.selectOption('#horizonSelect','129600');
    assert.equal(await page.locator('#forecast').isDisabled(),true);
    // Error de fuente REAL de interfaz: debe verse y no inventar resultado.
    await page.evaluate(()=>{window.LaplaceBridge.fetchCandles=(id,asset,step,days)=>{
      setTimeout(()=>window.LaplaceMobile.receive(id,{ok:false,error:'HTTP 429 simulado'}),15);}});
    await page.locator('#refresh').click();
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,{timeout:25000});
    assert.match(await page.locator('#noticeText').innerText(),/HTTP 429/i);
    assert.equal(await page.locator('#forecast').isDisabled(),true);
    // Pantalla estrecha: no se permite navegación horizontal recortada.
    await page.setViewportSize({width:320,height:750});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=3,'Desbordamiento horizontal de '+overflow+' px');
    assert.deepEqual(errors,[],'La interfaz emitió errores Javascript');
    console.log(JSON.stringify({ok:true,price:true,forecast:true,analyze:true,
      test:true,evaluate:true,world:true,laplacePDE:true,laplaceGraph:true,
      capabilities:20,F001:true,rowsF001:14,fallbackHTTP429:true,noHorizontalOverflow:true,
      stream:true,livePauseResume:true,streamOutOfOrderIgnored:true,jsErrors:errors.length}));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
