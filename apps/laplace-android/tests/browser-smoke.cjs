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
  "const total=Math.min(2400,Math.floor(days*86400/step));let value=asset==='BTC-USD'?61500:asset==='ETH-USD'?3100:asset==='SOL-USD'?180:asset==='AAPL'?350:200;",
  "const rows=[];",
  "for(let i=0;i<total;i++){",
  "const t=end-(total-i)*step;",
  "value*=Math.exp(.0015*Math.sin(i*.16)+.0009*Math.cos(i*.039));",
  "rows.push([t,value*.994,value*1.006,value,value,3+Math.sin(i*.12)**2]);",
  "}",
  "return rows;}",
  "window.LaplaceBridge={",
  "fetchCandles(id,asset,step,days){setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,granularity:step,candles:candles(asset,step,days)}),15);},",
  "fetchQuote(id,asset){const p=asset==='BTC-USD'?61500:asset==='ETH-USD'?3100:asset==='SOL-USD'?180:asset==='AAPL'?350:200;",
  "setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,quote:{asset,price:p,time:new Date().toISOString(),receivedAt:Date.now(),source:asset.includes('-USD')?'SIMULACION COINBASE SOLO PARA TEST':'SIMULACION YAHOO SOLO PARA TEST',market:asset.includes('-USD')?'crypto':'equity',indicative:!asset.includes('-USD')}}),10);}",
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

const mockBroker=String.raw`
window.__brokerCalls=[];let connected=false;
window.LaplaceBridge.brokerCommand=function(id,action,encoded){
 const data=JSON.parse(encoded);window.__brokerCalls.push({action,data});let result;
 if(action==='status'||action==='generate')result={configured:connected,public_key:'PUBLIC-KEY-SIMULADA-SOLO-PARA-TEST',manual_orders:true,automatic_orders:false};
 else if(action==='configure'){connected=true;result={configured:true};}
 else if(action==='disconnect'){connected=false;result={configured:false};}
 else if(action==='accounts')result={results:[{account_number:'CUENTA-SIMULADA',status:'active',buying_power:'10000',is_api_tradable:true}]};
 else if(action==='orders')result={results:[],next:null};
 else if(action==='prepare')result={nonce:'nonce-simulado',body:data,real_order_sent:false,
  quote:{timestamp:new Date().toISOString(),est_total_cost:'60',est_fee:'0.1'}};
 else if(action==='submit'||action==='cancel')result={canceled_by_user:true};
 else result={};
 setTimeout(()=>window.LaplaceBroker.receive(id,{ok:true,result}),10);
};
window.LaplaceBridge.fetchEF004Archive=function(id){setTimeout(()=>window.LaplaceEF004Archive.receive(id,
 {ok:true,commit:'ARCHIVO-REAL-EMPAQUETADO-PUENTE-SIMULADO',captures_raw:window.LAPLACE_EF004_ARCHIVE.captures.map(JSON.stringify)}),10);};
`;
const http=require('node:http');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.mp4':'video/mp4','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(name==='favicon.ico'){res.writeHead(204);res.end();return}
  if(!/^[A-Za-z0-9.-]+$/.test(name)){res.writeHead(404);res.end();return}
  const file=path.join(root,name);
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',mime[path.extname(name)]??'application/octet-stream');
  if(name==='index.html')res.end(read(name).replace('<head>','<head><script>'+mock+mockXN01+mockBroker+'</script>'));
  else res.end(fs.readFileSync(file));
});
const chromePaths=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium',
  '/opt/google/chrome/chrome'].filter(Boolean);
const chrome=chromePaths.find(p=>fs.existsSync(p));
assert.ok(chrome,'Chromium/Chrome no está disponible: no saltar el test de UI');
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text())});
  try{
    await page.goto(origin,{waitUntil:'networkidle'});
    fs.mkdirSync(path.resolve(__dirname,'../build/ux-previews'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../build/ux-previews/LAPLACE-3.9-INICIO-SIMULADO.png')});
    const ready=await page.evaluate(()=>window.LaplaceUIHealth?.initialized===true);
    assert.ok(ready,'La app no alcanzó la inicialización: posible botón muerto');
    assert.equal(await page.locator('[data-tab]').count(),5);
    assert.equal(await page.locator('#asset option').count(),31);
    assert.equal(await page.evaluate(()=>window.LaplaceUIHealth.version),'4.0');
    assert.equal(await page.locator('#regimeStudy').count(),1);
    assert.equal(await page.locator('#asset optgroup').count(),3);
    assert.match(await page.locator('#robinhoodLink').getAttribute('href'),/robinhood\.com/);
    assert.match(await page.locator('#selectedProvider').innerText(),/Coinbase|SIMULACION|público/i);
    const navHeight=await page.locator('.tabs').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(navHeight>=55&&navHeight<=100,'Barra móvil fuera de escala: '+navHeight);
    assert.equal(await page.locator('[data-minutes]').count(),16);
    assert.equal(await page.locator('#horizonSelect option').count(),16);
    await page.locator('[data-tab="world"]').click();
    await page.locator('#quoteDetails > summary').click();
    // La carga inicial está simulada, pero el controller debe recibir datos.
    await page.waitForFunction(()=>document.querySelector('#quoteBTC').textContent!=='—'&&
      !document.querySelector('#refresh').disabled,{timeout:25000});
    assert.match(await page.locator('#quoteBTC').innerText(),/61/);
    await page.waitForFunction(()=>document.querySelector('#liveStatus').textContent==='WebSocket conectado',null,{timeout:10000});
    assert.match(await page.locator('#liveCount').innerText(),/3 operaciones/);
    assert.match(await page.locator('#quoteBTCStatus').innerText(),/EN VIVO/);
    assert.match(await page.locator('#quoteETHStatus').innerText(),/EN VIVO/);
    assert.match(await page.locator('#quoteSOLStatus').innerText(),/EN VIVO/);
    assert.match(await page.locator('#quoteBTC').innerText(),/61,\d+/);
    await page.locator('#marketDetails > summary').click();
    assert.match(await page.locator('#liveGraphLabel').innerText(),/operaci/);
    assert.match(await page.locator('#quoteTrace').innerText(),/Coinbase/i);
    await page.locator('#marketDetails > summary').click();
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
    await page.locator('#studyDetails > summary').click();
    assert.match(await page.locator('#regimeStatus').innerText(),/Estado calculado|régimen|velas/i);
    assert.match(await page.locator('#regimeVol').innerText(),/Alta|Media|Baja/);
    await page.locator('#regimeStudy').click();
    await page.waitForFunction(()=>!document.querySelector('#regimeStudy').disabled,
      null,{timeout:20000});
    assert.match(await page.locator('#regimeRaw').textContent(),/laplace-m004-regime-learning-v1/);
    assert.match(await page.locator('#regimeEvidence').innerText(),/MAE amplitud|resultados evaluados/i);
    assert.match(await page.locator('#regimeEvidence').innerText(),/referencia/i);
    await page.locator('[data-tab="panel"]').click();
    await page.locator('#smartRun').click();
    await page.waitForFunction(()=>document.querySelector('#smartResult').dataset.state!=='working',null,{timeout:20000});
    assert.equal(await page.locator('#smartResult').getAttribute('data-state'),'complete',
      'El botón principal debe producir un candidato real desde M001');
    assert.match(await page.locator('#smartSummary').innerText(),/USD|\$/);
    assert.match(await page.locator('#smartExplain').innerText(),/persistencia|muestras/i);
    const captures=path.resolve(__dirname,'../build/ux-previews');
    fs.mkdirSync(captures,{recursive:true});
    await page.locator('[data-tab="panel"]').click();
    await page.screenshot({path:path.join(captures,'LAPLACE-4.0-MOVIL-SIMULADO.png')});
    await page.locator('.xn01-card > summary').click();
    await page.locator('#xn01Run').click();
    await page.waitForFunction(()=>document.querySelector('#xn01Confidence').textContent==='54.00 %',null,{timeout:20000});
    assert.equal(await page.locator('#xn01PUp').innerText(),'0.54');
    assert.match(await page.locator('#xn01Raw').textContent(),/SIMULATED XI ONLY/);
    await page.locator('.advanced-actions > summary').click();
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
    await page.locator('[data-tab="world"]').click();
    await page.locator('#jumpSignals').click();
    assert.equal(await page.locator('#signals').isVisible(),true);
    assert.equal(await page.locator('[data-tab="world"]').getAttribute('aria-current'),'page');
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
    await page.locator('#capabilityFilter').selectOption('usable');
    const usable=await page.locator('#capabilityRows .signal-row').count();
    assert.ok(usable>0&&usable<20,'Filtrar fuentes debe cambiar la lista realmente');
    await page.locator('#capabilityFilter').selectOption('pending');
    assert.ok(await page.locator('#capabilityRows .signal-row').count()>0);
    await page.locator('#capabilityRefresh').click();
    assert.equal(await page.locator('#capabilityRows .signal-row').count(),20);
    await page.screenshot({path:path.join(captures,'LAPLACE-4.0-FUENTES-SIMULADO.png')});
    const overflowSources=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflowSources<=3,'Fuentes desbordan ancho de 393 px: '+overflowSources);
    await page.locator('#openMath').click();
    await page.selectOption('#pdePreset','quadratic');
    await page.locator('#pdeSolve').click();
    assert.match(await page.locator('#pdeStatus').innerText(),/resuelto/i);
    await page.locator('#graphWA').fill('3');
    await page.locator('#graphSolve').click();
    const x=Number((await page.locator('#graphValue').innerText()).replace(',','.'));
    assert.ok(Math.abs(x-25)<.01,'Grafo dejó de calcular al pulsar botón: '+x);
    await page.locator('[data-tab="integral"]').click();
    assert.match(await page.locator('#integral > article.card').first().innerText(),
      /Horizontes|F001|Cálculo de horizontes/);
    assert.equal(await page.locator('#integral > details.advanced-fold').count(),2);
    assert.equal(await page.locator('#integral > details.advanced-fold[open]').count(),0);
    assert.match(await page.locator('#f002Status').textContent(),/sin informe|Sin resultado|se abstuvo|experimental/i);
    await page.locator('#integralRun').click();
    await page.waitForFunction(()=>{
      const t=document.querySelector('#integralStatus').textContent;
      return t.includes('F001 original BTC')||t.includes('no pudo completarse');
    },{timeout:90000});
    assert.match(await page.locator('#integralStatus').innerText(),/F001 original BTC/);
    assert.equal(await page.locator('#integralTable .integral-item').count(),14);
    assert.match(await page.locator('#rawF001').textContent(),/price_candidate_unrounded/);
    assert.equal(await page.locator('#integralRun').isDisabled(),false);
    // Mercado bursátil: datos del mock exclusivamente para interacción.
    // La API de Yahoo real se comprueba aparte en Android (sin inventar éxito).
    await page.locator('[data-tab="panel"]').click();
    await page.selectOption('#asset','AAPL');
    assert.match(await page.locator('#selectedMarketTag').innerText(),/ACCIÓN/);
    assert.equal(await page.locator('#regimeTag').innerText(),'SIN ESTADO VÁLIDO');
    assert.match(await page.locator('#robinhoodLink').getAttribute('href'),/stocks\/aapl\//);
    await page.waitForFunction(()=>document.querySelector('#selectedQuote').textContent!=='—'&&
      !document.querySelector('#refresh').disabled,null,{timeout:25000});
    assert.match(await page.locator('#selectedProvider').innerText(),/YAHOO|SIMULACION/i);
    if(!await page.locator('.market-extras').evaluate(e=>e.open))await page.locator('.market-extras > summary').click();
    await page.locator('#favoriteToggle').click();
    assert.equal(await page.locator('#favoriteToggle').getAttribute('aria-pressed'),'false');
    await page.locator('#favoriteToggle').click();
    assert.equal(await page.locator('#favoriteToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#refreshQuote').click();
    await page.waitForFunction(()=>!document.querySelector('#refreshQuote').disabled,null,{timeout:10000});
    await page.locator('#autoQuoteToggle').click();
    assert.equal(await page.locator('#autoQuoteToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#autoQuoteToggle').click();
    assert.equal(await page.locator('#autoQuoteToggle').getAttribute('aria-pressed'),'false');
    await page.locator('[data-tab="panel"]').click();
    await page.locator('#smartRun').click();
    await page.waitForFunction(()=>document.querySelector('#smartResult').dataset.state!=='working',
      null,{timeout:25000});
    assert.equal(await page.locator('#smartResult').getAttribute('data-state'),'complete');
    assert.match(await page.locator('#smartExplain').innerText(),/bursátil|sesión/i);
    await page.locator('[data-tab="integral"]').click();
    assert.match(await page.locator('#integralMode').innerText(),/16 PLAZOS/);
    await page.locator('#integralRun').click();
    await page.waitForFunction(()=>!document.querySelector('#integralRun').disabled,
      null,{timeout:90000});
    assert.match(await page.locator('#integralStatus').innerText(),/M001 AAPL/);
    assert.equal(await page.locator('#integralTable .integral-item').count(),16);
    assert.match(await page.locator('#mareaIntro').textContent(),/Bitcoin|M003/);
    assert.match(await page.locator('#rawF001').textContent(),/not_same_calibrated_model_as_f001_btc/);
    assert.equal(await page.locator('#xn01Run').isDisabled(),true);
    await page.screenshot({path:path.join(captures,'LAPLACE-4.0-ACCIONES-SIMULADO.png')});
    await page.locator('[data-tab="panel"]').click();
    await page.selectOption('#asset','BTC-USD');
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,null,{timeout:25000});
    await page.locator('[data-tab="tests"]').click();
    if(!await page.locator('#backtestDetails').evaluate(e=>e.open))await page.locator('#backtestDetails > summary').click();
    await page.locator('#validationRun').click();
    await page.waitForFunction(()=>!document.querySelector('#validationRun').disabled,null,{timeout:25000});
    assert.match(await page.locator('#validationStatus').innerText(),/Evaluados|Validación/i);
    await page.locator('.history-maintenance > summary').click();
    await page.locator('#clearHistory').click();
    await page.locator('#cancelClear').click();
    assert.equal(await page.locator('#clearConfirm').isVisible(),false);
    await page.locator('#clearHistory').click();
    await page.locator('#confirmClear').click();
    assert.match(await page.locator('#history').innerText(),/Sin candidatos/);
    await page.locator('[data-tab="panel"]').click();
    await page.evaluate(()=>{window.__quote=window.LaplaceBridge.fetchQuote;window.LaplaceBridge.fetchQuote=()=>{}});
    if(!await page.locator('.market-extras').evaluate(e=>e.open))await page.locator('.market-extras > summary').click();
    await page.locator('#refresh').click();
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,null,{timeout:5000});
    assert.equal(await page.locator('#smartRun').isDisabled(),false,'El ticker no puede bloquear las velas');
    await page.evaluate(()=>{window.LaplaceBridge.fetchQuote=window.__quote});
    await page.locator('[data-tab="world"]').click();
    await page.waitForFunction(()=>window.LaplaceEF004Mobile?.state().archiveCount>0&&
      !window.LaplaceEF004Mobile.state().busy,null,{timeout:20000});
    const realArchiveCount=await page.evaluate(()=>window.LAPLACE_EF004_ARCHIVE.archive_count);
    assert.ok(realArchiveCount>=1);
    await page.locator('#ef004Train').click();
    await page.waitForFunction(()=>window.LaplaceEF004Mobile.state().executed&&!window.LaplaceEF004Mobile.state().busy,null,{timeout:25000});
    assert.match(await page.locator('#ef004Status').innerText(),/Motor ejecutado|Entrenamiento local terminado/);
    assert.match(await page.locator('#ef004Tag').innerText(),/EJECUTADO|MODELO LOCAL/);
    assert.equal(await page.evaluate(()=>window.LaplaceEF004Mobile.state().archiveCount),realArchiveCount);
    await page.locator('#ef004Refresh').click();
    await page.waitForFunction(()=>!window.LaplaceEF004Mobile.state().busy,null,{timeout:20000});
    assert.equal(await page.evaluate(()=>window.LaplaceEF004Mobile.state().archiveCount),realArchiveCount,'Actualizar no duplica capturas');
    await page.locator('#ef004Evaluate').click();
    await page.waitForFunction(()=>!window.LaplaceEF004Mobile.state().busy,null,{timeout:20000});
    await page.screenshot({path:path.join(captures,'LAPLACE-4.0-EF004-REAL-LOCAL.png')});
    await page.locator('[data-tab="orders"]').click();
    assert.equal(await page.locator('#orderMode').inputValue(),'paper');
    await page.locator('#orderQuantity').fill('0.001');
    await page.locator('#paperPlace').click();
    await page.waitForFunction(()=>document.querySelector('#paperHistory').innerText.includes('SIMULADA'),null,{timeout:10000});
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('laplace-paper-account-v1')).orders[0].status),'filled');
    await page.locator('#orderSide').selectOption('sell');
    await page.locator('#paperPlace').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('laplace-paper-account-v1')).orders.filter(o=>o.status==='filled').length===2,null,{timeout:10000});
    await page.locator('#orderSide').selectOption('buy');
    await page.locator('#orderMode').selectOption('real');
    assert.equal(await page.locator('#brokerPrepare').isDisabled(),true);
    await page.locator('#brokerSetup > summary').click();
    await page.locator('#brokerGenerate').click();
    await page.waitForFunction(()=>document.querySelector('#brokerPublicKey').value.includes('SIMULADA'));
    await page.locator('#brokerAPIKey').fill('rh-api-6148effc-c0b1-486c-8940-a1d099456be6');
    await page.locator('#brokerSave').click();
    await page.waitForFunction(()=>document.querySelector('#brokerAPIKey').value==='');
    await page.locator('#brokerConnect').click();
    await page.waitForFunction(()=>document.querySelector('#brokerAccount').value==='CUENTA-SIMULADA');
    assert.equal(await page.locator('#brokerPrepare').isDisabled(),false);
    await page.locator('#brokerPrepare').click();
    await page.waitForFunction(()=>!document.querySelector('#brokerSubmit').disabled);
    assert.equal(await page.evaluate(()=>window.__brokerCalls.filter(x=>x.action==='submit').length),0,'Preparar nunca envía la orden');
    await page.locator('#brokerSubmit').click();
    await page.waitForFunction(()=>document.querySelector('#brokerStatus').textContent.includes('cancelada por ti'));
    assert.equal(await page.evaluate(()=>window.__brokerCalls.filter(x=>x.action==='submit').length),1);
    assert.match(await page.locator('#brokerStatus').innerText(),/no se envió/);
    await page.locator('#brokerDisconnect').click();
    await page.waitForFunction(()=>!window.LaplaceBroker.state().configured);
    assert.equal(await page.locator('#brokerPrepare').isDisabled(),true);
    await page.locator('#orderMode').selectOption('paper');
    await page.screenshot({path:path.join(captures,'LAPLACE-4.0-ORDENES-SIMULADAS.png')});
    await page.locator('[data-tab="panel"]').click();
    // Cambiar resolución exige otro lote y desactiva botones hasta recibirlo.
    await page.locator('[data-tab="panel"]').click();
    await page.selectOption('#horizonSelect','129600');
    assert.equal(await page.locator('#forecast').isDisabled(),true);
    // Error de fuente REAL de interfaz: debe verse y no inventar resultado.
    await page.evaluate(()=>{window.LaplaceBridge.fetchCandles=(id,asset,step,days)=>{
      setTimeout(()=>window.LaplaceMobile.receive(id,{ok:false,error:'HTTP 429 simulado'}),15);}});
    if(!await page.locator('.market-extras').evaluate(e=>e.open))await page.locator('.market-extras > summary').click();
    await page.locator('#refresh').click();
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,{timeout:25000});
    assert.match(await page.locator('#noticeText').innerText(),/HTTP 429/i);
    assert.equal(await page.locator('#forecast').isDisabled(),true);
    await page.locator('[data-tab="panel"]').click();
    await page.locator('#smartRun').click();
    await page.waitForFunction(()=>document.querySelector('#smartResult').dataset.state==='error',null,{timeout:10000});
    assert.match(await page.locator('#smartExplain').innerText(),/HTTP 429/i);
    assert.equal(await page.locator('#estimate').innerText(),'—');
    // Pantalla estrecha: no se permite navegación horizontal recortada.
    await page.setViewportSize({width:320,height:750});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=3,'Desbordamiento horizontal de '+overflow+' px');
    // Registro prospectivo: fixtures SIMULADAS, nunca datos de mercado reales.
    await page.evaluate(()=>{
      const now=Math.floor(Date.now()/1000/300)*300;
      const f={id:'fixture',asset:'BTC-USD',minutes:5,granularity:300,market:'crypto',
        issuedAt:now-2400,sourceTime:now-2400,targetAt:now-2100,estimate:100.2,
        baseline:90,low:80,high:110,status:'verified',actual:100,observedCloseAt:now-2100};
      const records=Array.from({length:42},(_,i)=>({...f,id:'verified-'+i,
        estimate:i===0?85:100.2}));
      records.push({...f,id:'btc-pending',status:'pending',targetAt:now-600});
      records.push({...f,id:'eth-pending',asset:'ETH-USD',minutes:60,
        granularity:3600,status:'pending',issuedAt:now-14400,sourceTime:now-14400,
        targetAt:Math.floor(now/3600)*3600-3600});
      localStorage.setItem('laplace-mobile-forecasts-v2',JSON.stringify(records));
    });
    await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.LaplaceUIHealth?.initialized);
    await page.locator('[data-tab="tests"]').click();
    await page.locator('#syncHistory').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('laplace-mobile-forecasts-v2'))
      .every(f=>f.status==='verified'),null,{timeout:15000});
    assert.equal(await page.locator('#asset').inputValue(),'BTC-USD');
    assert.equal(await page.locator('.history-entry').count(),20);
    await page.locator('#historyMore').click();assert.equal(await page.locator('.history-entry').count(),40);
    await page.locator('#historyMore').click();assert.equal(await page.locator('.history-entry').count(),44);
    assert.equal(await page.locator('#historyMore').isVisible(),false);
    const allMetrics=await page.locator('#historySummary').innerText();
    await page.locator('#historyFilter').selectOption('missed');
    assert.equal(await page.locator('#historySummary').innerText(),allMetrics,
      'Filtrar aciertos no puede mejorar artificialmente las métricas');
    assert.ok(await page.locator('.history-entry').count()>=1);
    await page.locator('.history-entry > summary').first().click();
    assert.match(await page.locator('.history-entry[open]').innerText(),/Error relativo|Error absoluto/);
    await page.locator('#historyFilter').selectOption('all');
    await page.locator('#historyAsset').selectOption('ETH-USD');
    assert.equal(await page.locator('.history-entry').count(),1);
    assert.match(await page.locator('#history').innerText(),/ETH-USD/);
    await page.locator('#historyAsset').selectOption('all');
    const downloaded=page.waitForEvent('download');await page.locator('#exportHistory').click();
    const download=await downloaded,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(exported.records.length,44);assert.equal(exported.records[1].estimate,100.2);
    await page.screenshot({path:path.join(captures,'LAPLACE-4.0-REGISTRO-SIMULADO.png')});
    await page.locator('[data-tab="panel"]').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.querySelector('#portalVideo').paused&&document.querySelector('#motionToggle').disabled,null,{timeout:5000});
    assert.equal(await page.locator('#portalVideo').evaluate(v=>v.paused),true);
    assert.equal(await page.locator('#motionToggle').isDisabled(),true);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('[data-tab="world"]').click();
    assert.equal(await page.locator('#portalVideo').evaluate(v=>v.paused),true);
    await page.setViewportSize({width:393,height:852});
    await page.locator('[data-tab="panel"]').click();
    const bounds=await page.locator('#smartRun').boundingBox(),nav=await page.locator('.tabs').boundingBox();
    assert.ok(bounds.y+bounds.height<nav.y,'Analizar ahora debe ser accesible en la primera pantalla');
    assert.deepEqual(errors,[],'La interfaz emitió errores Javascript');
    console.log(JSON.stringify({ok:true,price:true,forecast:true,analyze:true,
      test:true,evaluate:true,world:true,laplacePDE:true,laplaceGraph:true,
      capabilities:20,smartAnalysis:true,moduleFilters:true,validationNow:true,F001:true,rowsF001:14,fallbackHTTP429:true,noHorizontalOverflow:true,
      stream:true,stockQuotes:true,assetCount:31,stockMultiHorizon:true,
      robinhoodLink:true,localFavorites:true,livePauseResume:true,
      streamOutOfOrderIgnored:true,ef004OriginalOnDevice:true,paperBuySell:true,brokerSetupSimulated:true,brokerPreflightDoesNotSubmit:true,nativeConfirmationCanceledInMock:true,ledgerCrossAssetAndResolution:true,ledgerExport44:true,ledgerPagination:true,reducedMotion:true,jsErrors:errors.length}));
  }catch(error){
    await page.screenshot({path:path.resolve(__dirname,'../build/ux-previews/LAPLACE-3.9-FAILURE.png')});
    throw error;
  }finally{
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
