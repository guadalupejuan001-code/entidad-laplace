const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
test('Panel real conserva cotizaciones, vórtice, modelo, mundo y ecuación',()=>{
  const html=read('index.html');
  for(const tab of ['panel','signals','tests','world','equation'])
    assert.ok(html.includes('data-tab="'+tab+'"'));
  for(const code of ['BTC-USD','ETH-USD','SOL-USD'])
    assert.ok(html.includes('data-quote-asset="'+code+'"'));
  for(const id of ['train','test','evaluate','forecast','refresh','worldSearch',
    'worldObservations','worldCaptureCount','worldSourceCount','history'])
    assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.indexOf('class="quote-console"')<html.indexOf('class="hero"'));
  assert.equal((html.match(/data-minutes="\d+"/g)||[]).length,11);
  assert.match(html,/15 min/);assert.match(html,/14 días/);
  assert.match(html,/id="notice"/);
  assert.match(html,/ÚLTIMO CIERRE VERIFICADO/);
});
test('La UI separa ticker, velas, referencia y candidato; no simula datos mundiales',()=>{
  const app=read('app.js'),world=fs.readFileSync(path.resolve(__dirname,'../prepare-world.mjs'),'utf8');
  assert.match(app,/function refresh\(\)/);
  assert.match(app,/const epoch=\+\+refreshEpoch,requested=asset,m=minutes/);
  assert.match(app,/epoch!==refreshEpoch\|\|requested!==asset\|\|m!==minutes/);
  assert.match(app,/fetchCandles\(id,request\.asset,request\.granularity,request\.days\)/);
  assert.match(app,/function renderQuotes\(\)/);
  assert.match(app,/function changeAsset\(next\)/);
  assert.match(app,/function showTests\(\)/);
  assert.match(app,/function renderWorldObservations\(\)/);
  assert.match(app,/M001/);
  assert.match(app,/Sin ticker disponible/);
  assert.match(app,/no se fabrica predicción/i);
  assert.match(world,/verifyUniverseSnapshot/);
  assert.match(world,/verificarSelloCaptura/);
  assert.match(world,/world-ef002-verified-v2/);
  assert.match(world,/forecast_model_uses_world:false/);
});
test('Vórtice animado mantiene acceso reducido',()=>{
  const html=read('index.html'),css=read('style.css');
  assert.match(html,/class="swirl"/);
  assert.match(html,/class="moving-particles"/);
  assert.equal((html.match(/<animateMotion /g)||[]).length,4);
  assert.match(css,/@keyframes dataFlow/);
  assert.match(css,/@keyframes rotateVortex/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/moving-particles\{display:none\}/);
});
test('PDE sigue funcionando sin contaminar M001 ni añadir un 3er puente',()=>{
  const html=read('index.html'),js=read('app.js');
  const java=fs.readFileSync(path.resolve(__dirname,
    '../app/src/main/java/com/entidadlaplace/mobile/MainActivity.java'),'utf8');
  for(const n of ['math-pde.js','pde-panel.js'])assert.ok(html.includes(n));
  assert.match(html,/id="pdeSolve"/);
  assert.match(html,/id="graphSolve"/);
  assert.match(js,/function show\(page\)/);
  assert.equal((java.match(/@JavascriptInterface/g)||[]).length,2);
});
