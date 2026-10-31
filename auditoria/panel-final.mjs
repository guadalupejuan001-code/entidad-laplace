/* Auditoría externa del panel: Chrome real, sin inventar nuevas cotizaciones.
 * Reproduce una captura archivada; casos artificiales se etiquetan en resultados.
 * Playwright es dependencia de PRUEBA, nunca del producto. */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {crearServidor} from '../panel/servidor.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.LAPLACE_PLAYWRIGHT||'playwright');
const out=resolve(process.env.LAPLACE_AUDITORIA_SALIDA||'registros/auditoria-panel');
mkdirSync(join(out,'capturas'),{recursive:true});
const archivo=process.env.LAPLACE_AUDITORIA_CAPTURA||'registros/captura-para-pruebas.json';
const raw=JSON.parse(readFileSync(archivo,'utf8'));
const real=sellarCaptura({...raw,origen_integridad:'reproduccion_de_captura_archivada_para_pruebas'});
const dir=mkdtempSync(join(tmpdir(),'laplace-chrome-'));
let lecturas=0;
const server=crearServidor({archivo:join(dir,'registro.json'),capturar:async()=>{
  lecturas++;
  if(lecturas>1)throw Error('Fallo de fuente inducido en auditoría');
  return structuredClone(real);
}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const root='http://127.0.0.1:'+server.address().port;
const results=[],errores=[];
async function probar(id,nombre,fn){
  try{const evidencia=await fn();results.push({id,nombre,aprobado:true,evidencia:evidencia??{}})}
  catch(e){results.push({id,nombre,aprobado:false,error:e.message})}
  console.log(JSON.stringify(results.at(-1)));
}
const browser=await chromium.launch({headless:true,
  ...(process.env.LAPLACE_CHROME?{executablePath:process.env.LAPLACE_CHROME}:{}),args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1366,height:1000},locale:'es-MX',timezoneId:'America/New_York',acceptDownloads:true});
ctx.on('page',p=>p.on('pageerror',e=>errores.push(e.message)));
const page=await ctx.newPage();page.setDefaultTimeout(10000);
async function vista(p,n){await p.getByRole('button',{name:n,exact:true}).click()}
const lista=['Mercado','Factores observados','Historia','Validación'];
try{
  await page.goto(root);await page.waitForFunction(()=>document.querySelector('#precioFecha').textContent.includes('Pulsa'));
  await probar('B01','Inicio sin cifras ficticias',async()=>{
    assert.equal(await page.locator('#precioObservado').innerText(),'—');
    assert.equal(await page.locator('#exportar').isVisible(),false);
    assert.equal(lecturas,0);
  });
  await probar('B02','Actualización con captura real archivada y sello completo',async()=>{
    await page.getByRole('button',{name:'Actualizar lectura',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#precioObservado').textContent!=='—');
    const datos=await page.evaluate(()=>estado);
    assert.equal(datos.ultima.capture_sha256,real.capture_sha256);assert.equal(datos.historial.length,1);
    return {captura:real.at,origen:'Reproducción de captura real; no cotización nueva'};
  });
  await probar('B03','Las cuatro secciones funcionan sin superponerse',async()=>{
    for(const nombre of lista){await vista(page,nombre);assert.equal(await page.locator('.vista:visible').count(),1)}
  });
  await probar('B04','Fuentes disponibles coinciden con la captura',async()=>{
    await vista(page,'Factores observados');
    assert.equal(await page.locator('.estado-fuente:not(.no)').count(),real.source_count);
  });
  await probar('B05','La pantalla explica el resultado de la prueba retrospectiva',async()=>{
    await vista(page,'Validación');
    const texto=await page.locator('#resultadoPrueba').innerText();
    if(real.instrument_15m.backtest.beats_persistence)assert.match(texto,/muestra corta/);
    else assert.match(texto,/NO superó/);
  });
  await probar('B06','Exportación exacta, incluida la huella de toda la captura',async()=>{
    const pendiente=page.waitForEvent('download');await page.locator('#exportar').click();
    const d=await pendiente,p=join(out,'captura-exportada.json');await d.saveAs(p);
    assert.deepEqual(JSON.parse(readFileSync(p)),real);
  });
  await probar('B07','Fallo de fuente conserva lectura y desbloquea el botón',async()=>{
    await new Promise(ok=>setTimeout(ok,2100));
    const antes=await page.locator('#precioObservado').innerText();
    await page.getByRole('button',{name:'Actualizar lectura',exact:true}).click();
    await page.locator('#aviso').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('#actualizar').disabled);
    assert.equal(await page.locator('#precioObservado').innerText(),antes);
    return {tipo:'Fallo inducido; no caída real del proveedor'};
  });
  await probar('B08','Recarga conserva la lectura y verifica la captura',async()=>{
    await page.reload();await page.waitForFunction(()=>document.querySelector('#precioObservado').textContent!=='—');
    assert.equal(await page.evaluate(()=>estado.ultima.capture_sha256),real.capture_sha256);
  });
  for(const [id,ancho,alto] of [['B09',1366,1000],['B10',390,844],['B11',360,800],['B12',844,390]]){
    await probar(id,'Sin desbordamiento en '+ancho+'×'+alto,async()=>{
      await page.setViewportSize({width:ancho,height:alto});
      for(const nombre of lista){
        await vista(page,nombre);
        const [a,b]=await page.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);
        assert.ok(b<=a+1,nombre+': '+b+' > '+a);
      }
      await vista(page,'Mercado');await page.waitForTimeout(150);
      await page.screenshot({path:join(out,'capturas',id+'.png'),fullPage:true});
      return {ancho,alto,limite:'Tamaño emulado en Chromium; no Android físico'};
    });
  }
  await page.setViewportSize({width:1366,height:1000});await vista(page,'Mercado');
  await probar('B13','La proyección parte de la cotización y fecha exactas',async()=>{
    const p=page.locator('[data-tramo="estimado"]');
    assert.equal(Number(await p.getAttribute('data-precio-origen')),real.instrument_15m.observed_price_usd);
    assert.equal(await p.getAttribute('data-fecha-origen'),real.instrument_15m.observed_at);
    assert.equal(await p.getAttribute('data-fecha-objetivo'),real.instrument_15m.target_at);
  });
  await probar('B14','Persistencia se dibuja horizontal, aunque el cierre anterior sea diferente',async()=>{
    const valores=await page.evaluate(()=>{
      const m={...estado.ultima.instrument_15m,projected_price_usd:estado.ultima.instrument_15m.observed_price_usd};
      trazar(serieHistorica(estado.ultima),m);
      const a=[...document.querySelectorAll('#grafico circle')].map(x=>Number(x.getAttribute('cy')));
      mostrarDatos();return a;
    });assert.equal(valores[0],valores[1]);
    return {tipo:'Cambio sintético de estimación solo para probar geometría'};
  });
  await probar('B15','El eje gráfico respeta los intervalos temporales reales',async()=>{
    const xy=await page.evaluate(()=>{
      const m=estado.ultima.instrument_15m,t=Date.parse(m.observed_at);
      const s=[{fecha:new Date(t-600000).toISOString(),precio:100},{fecha:new Date(t-300000).toISOString(),precio:110}];
      const a=LaplaceGrafica.calcular(s,m);s[1].fecha=new Date(t-540000).toISOString();
      const b=LaplaceGrafica.calcular(s,m);return [a.puntos[1].x,b.puntos[1].x];
    });assert.notEqual(xy[0],xy[1]);return {tipo:'Fechas artificiales para geometría, no precios nuevos'};
  });
  const relojCtx=await browser.newContext({locale:'es-MX',timezoneId:'America/New_York'});
  const reloj=await relojCtx.newPage();let solicitudes=0;
  reloj.on('request',r=>{if(r.url().includes('/api/actualizar'))solicitudes++});
  await reloj.clock.install({time:new Date(Date.parse(real.instrument_15m.observed_at)+1000)});
  await reloj.goto(root);await reloj.waitForFunction(()=>document.querySelector('#precioObservado').textContent!=='—');
  await probar('B16','La lectura caduca automáticamente a los tres minutos',async()=>{
    assert.equal(await reloj.locator('#estadoConexion').innerText(),'Lectura reciente');
    await reloj.clock.fastForward(181000);
    assert.equal(await reloj.locator('#estadoConexion').innerText(),'Captura histórica');
    return {tipo:'Reloj de navegador controlado'};
  });
  await probar('B17','El objetivo vencido queda marcado sin recargar',async()=>{
    await reloj.clock.fastForward(16*60000);
    assert.match(await reloj.locator('#fechaObjetivo').innerText(),/Vencido/);
  });
  await probar('B18','El reloj de caducidad no genera consultas externas ni nuevas capturas',async()=>{
    assert.equal(solicitudes,0);assert.equal(await reloj.evaluate(()=>estado.historial.length),1);
  });
  await relojCtx.close();
  const original=await page.evaluate(()=>estado);
  for(const [id,cantidad] of [['B19',40],['B20',144]]){
    await probar(id,'Todos los '+cantidad+' registros anunciados se pueden revisar',async()=>{
      const datos=structuredClone(original),fila=datos.historial[0];
      datos.historial=Array.from({length:cantidad},(_,i)=>({...fila,
        fecha:new Date(Date.parse(real.at)-(cantidad-1-i)*60000).toISOString()}));
      const h=await ctx.newPage();
      await h.route('**/api/estado',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(datos)}));
      await h.goto(root);await h.waitForFunction(()=>document.querySelector('#precioObservado').textContent!=='—');
      await vista(h,'Historia');assert.equal(await h.locator('#tablaHistoria tr').count(),cantidad);
      await h.locator('#tablaHistoria tr:last-child').scrollIntoViewIfNeeded();
      assert.equal(await h.locator('#tablaHistoria tr:last-child').isVisible(),true);await h.close();
      return {tipo:'Fechas sintéticas únicamente para probar la lista visual'};
    });
  }
  await probar('B21','Datos hostiles de fuente no se ejecutan como HTML',async()=>{
    const datos=structuredClone(original);datos.ultima.measured_market[0]={name:'book',status:'unavailable',reason:'<img src=x onerror="window.auditXss=1">'};
    const h=await ctx.newPage();
    await h.route('**/api/estado',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(datos)}));
    await h.goto(root);await h.waitForFunction(()=>document.querySelector('#precioObservado').textContent!=='—');
    await vista(h,'Factores observados');assert.equal(await h.locator('#fuentes img').count(),0);
    assert.equal(await h.evaluate(()=>window.auditXss??null),null);await h.close();
  });
  await probar('B22','Gráfico y controles siguen legibles en móvil compacto',async()=>{
    await page.setViewportSize({width:360,height:800});await vista(page,'Mercado');await page.waitForTimeout(200);
    const medidas=await page.evaluate(()=>({
      fuente:Math.min(...[...document.querySelectorAll('#grafico text')].map(x=>Number(x.getAttribute('font-size'))*x.getScreenCTM().a)),
      boton:document.querySelector('#actualizar').getBoundingClientRect().height}));
    assert.ok(medidas.fuente>=10.5);assert.ok(medidas.boton>=44);return medidas;
  });
  await probar('B23','No hay excepciones JavaScript durante el recorrido',async()=>{assert.deepEqual(errores,[])});
  await page.setViewportSize({width:1366,height:1000});await vista(page,'Mercado');await page.waitForTimeout(200);
  await page.screenshot({path:join(out,'capturas','escritorio-final.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await vista(page,'Mercado');await page.waitForTimeout(200);
  await page.screenshot({path:join(out,'capturas','movil-final.png'),fullPage:true});
}catch(e){
  results.push({id:'ENTORNO',nombre:'Ejecución completa del banco de navegador',aprobado:false,error:e.message});
  console.error(e);
}finally{
  const report={navegador:browser.version(),captura_reproducida:real.at,
    declaracion:'Prueba de navegador con captura real archivada y casos artificiales etiquetados. No verifica Android físico ni rentabilidad.',
    pruebas:results,aprobadas:results.filter(r=>r.aprobado).length,fallidas:results.filter(r=>!r.aprobado).length};
  writeFileSync(join(out,'resultados-navegador.json'),JSON.stringify(report,null,2)+'\n');
  await ctx.close();await browser.close();await new Promise(ok=>server.close(ok));rmSync(dir,{recursive:true,force:true});
  if(report.fallidas)process.exitCode=1;
  console.log(JSON.stringify({aprobadas:report.aprobadas,fallidas:report.fallidas}));
}
