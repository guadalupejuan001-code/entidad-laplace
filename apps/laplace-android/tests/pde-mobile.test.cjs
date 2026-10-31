const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../app/src/main/assets');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const code=read('math-pde.js');
const context={window:{}};
vm.runInNewContext(code,context,{filename:'math-pde.js'});
const mobile=context.window.LaplacePDE;
const bounds=(n,f)=>Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>
  x===0||y===0||x===n-1||y===n-1?f(x/(n-1),y/(n-1)):null));
test('APK contiene fuentes PDE/Grafo canonicas sin alterar sus fórmulas',()=>{
  const src=path.resolve(__dirname,'../../../ecuacion/laplace-pde.mjs');
  const graph=path.resolve(__dirname,'../../../ecuacion/laplace-grafo.mjs');
  const strip=s=>s.replace(/\bexport\s+(?=(?:const|function)\s)/g,'');
  assert.ok(code.includes(strip(fs.readFileSync(src,'utf8'))));
  assert.ok(code.includes(strip(fs.readFileSync(graph,'utf8'))));
  assert.equal(mobile.LAPLACE_PDE_VERSION,'laplace-pde-dirichlet-v1');
  assert.equal(mobile.LAPLACE_GRAFO_VERSION,'laplace-grafo-dirichlet-v1');
});
test('campo lineal exacto dentro del teléfono, sin usar fuentes externas',()=>{
  const grid=bounds(21,(x,y)=>100*x);
  const r=mobile.resolverEcuacionDeLaplace({grid,dx:1/20,dy:1/20,
    tolerance:1e-6,omega:1.7,maxIterations:20000});
  assert.equal(r.converged,true);
  assert.equal(r.forecasts_future,false);
  assert.equal(r.automatic_trading,false);
  assert.ok(r.max_residual<=1e-6);
  for(let y=0;y<21;y++)for(let x=0;x<21;x++)
    assert.ok(Math.abs(r.solution[y][x]-100*x/20)<.0001);
});
test('campo cuadratico armonico x²-y², fórmula bidimensional real',()=>{
  const grid=bounds(21,(x,y)=>100*(x*x-y*y));
  const r=mobile.resolverEcuacionDeLaplace({grid,dx:1/20,dy:1/20,
    tolerance:1e-6,omega:1.7,maxIterations:20000});
  assert.equal(r.converged,true);
  assert.ok(Math.abs(r.solution[8][13]-100*((13/20)**2-(8/20)**2))<.0001);
});
test('grafo ponderado calculado sin prediccion ni acceso a dinero',()=>{
  const r=mobile.resolverLaplaceGrafo({nodes:[{id:'A',value:0},{id:'X',value:null},
    {id:'B',value:100}],edges:[{from:'A',to:'X',weight:3},{from:'B',to:'X',weight:1}]});
  assert.equal(r.converged,true);
  assert.ok(Math.abs(r.nodes[1].value-25)<1e-7);
  assert.equal(r.automatic_trading,false);
  assert.equal(r.forecasts_future,false);
});
test('rechaza falta de fronteras y restricciones de grafo',()=>{
  assert.throws(()=>mobile.resolverEcuacionDeLaplace({
    grid:[[null,0,0],[0,null,0],[0,0,0]]}),/frontera/);
  assert.throws(()=>mobile.resolverLaplaceGrafo({
    nodes:[{id:'A',value:null},{id:'B',value:null}],
    edges:[{from:'A',to:'B',weight:1}]}),/sin frontera/);
});
test('UI funcional enlaza pestaña, controles, visualizacion y libreria sin cambiar M001',()=>{
  const html=read('index.html'),panel=read('pde-panel.js'),engine=read('engine.js');
  const app=read('app.js');
  assert.match(html,/data-tab="equation"/);
  assert.match(html,/<section id="equation" class="tabpage" hidden>/);
  for(const name of ['math-pde.js','pde-panel.js'])assert.ok(html.includes('src="'+name+'"'));
  for(const id of ['pdePreset','pdeSize','pdeSolve','pdeCanvas','pdeIterations',
    'pdeResidual','pdeConverged','graphSolve','graphA','graphB','graphWA',
    'graphWB','graphValue'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(panel,/resolverEcuacionDeLaplace/);
  assert.match(panel,/resolverLaplaceGrafo/);
  assert.match(panel,/paintHeatmap/);
  assert.match(panel,/pdeSolve'\)\.addEventListener\('click',runField\)/);
  assert.match(panel,/graphSolve'\)\.addEventListener\('click',runGraph\)/);
  assert.match(engine,/function forecast\(/);
  assert.match(app,/function refresh\(/);
  assert.ok(html.includes('data-tab="panel"'));
  assert.ok(html.includes('data-quote-asset="BTC-USD"'));
  assert.ok(html.includes('data-minutes="20160"'));
});
test('APK tiene versionCode incrementado y sin permisos adicionales',()=>{
  const gradle=fs.readFileSync(path.resolve(__dirname,'../app/build.gradle'),'utf8');
  const java=fs.readFileSync(path.resolve(__dirname,
    '../app/src/main/java/com/entidadlaplace/mobile/MainActivity.java'),'utf8');
  assert.match(gradle,/versionCode 4/);
  assert.match(gradle,/versionName '2\.0\.0-M001-EF002'/);
  assert.equal((java.match(/@JavascriptInterface/g)||[]).length,2);
  assert.ok(!read('pde-panel.js').includes('LaplaceBridge'));
});
