const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
test('Panel real conserva cotizaciones, vórtice, modelo, mundo y ecuación',()=>{
  const html=read('index.html');
  for(const tab of ['panel','tests','world','equation','integral'])
    assert.ok(html.includes('data-tab="'+tab+'"'));
  for(const code of ['BTC-USD','ETH-USD','SOL-USD'])
    assert.ok(html.includes('data-quote-asset="'+code+'"'));
  for(const id of ['train','test','evaluate','forecast','refresh','worldSearch',
    'worldObservations','worldCaptureCount','worldSourceCount','history'])
    assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.indexOf('class="quote-console"')<html.indexOf('class="hero"'));
  assert.equal((html.match(/data-minutes="\d+"/g)||[]).length,16);
  assert.match(html,/5 min/);assert.match(html,/90 d/);
  assert.match(html,/id="notice"/);
  assert.match(html,/ÚLTIMO CIERRE VERIFICADO/);
  for(const id of ['xn01Run','xn01Raw','xn01Confidence','xn01PUp','xn01Prior','xn01Rows','rawM001','rawF001'])
    assert.ok(html.includes('id="'+id+'"'),id);
  for(const id of ['liveToggle','liveStatus','liveAge','liveCount','liveChart','livePreview'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(html.includes('src="live-feed.js"'));
  assert.ok(html.includes('id="horizonSelect"'));
  assert.ok(html.indexOf('class="card selector"')<html.indexOf('class="hero"'));
  assert.ok(html.indexOf('class="actions legacy-actions"')<html.indexOf('class="two-metrics"'));
  for(const id of ['smartRun','smartResult','validationRun','capabilityFilter','jumpSignals'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/details class="advanced-actions"/);
});
test('La UI separa ticker, velas, referencia y candidato; no simula datos mundiales',()=>{
  const app=read('app.js'),world=fs.readFileSync(path.resolve(__dirname,'../prepare-world.mjs'),'utf8');
  assert.match(app,/function refresh\(\)/);
  assert.match(app,/async function runSmart\(\)/);
  assert.match(app,/async function runValidation\(\)/);
  assert.match(app,/function smartMessage\(/);
  assert.match(app,/const epoch=\+\+refreshEpoch,requested=asset,m=minutes/);
  assert.match(app,/epoch!==refreshEpoch\|\|requested!==asset\|\|m!==minutes/);
  assert.match(app,/fetchCandles\(id,request\.asset,request\.granularity,request\.days\)/);
  assert.match(app,/function renderQuotes\(\)/);
  assert.match(app,/function changeAsset\(next\)/);
  assert.match(app,/function showTests\(\)/);
  assert.match(app,/function renderWorldObservations\(\)/);
  assert.match(app,/M001/);
  assert.match(app,/function runIntegral\(\)/);
  assert.match(app,/async function runXN01\(\)/);
  assert.match(app,/LaplaceBridge\.analyzeXN01/);
  assert.match(app,/function liveMessage\(event\)/);
  assert.match(app,/LaplaceLiveBridge\.start/);
  assert.match(app,/function drawLiveChart\(\)/);
  assert.match(app,/window\.LaplaceUIHealth/);
  assert.match(app,/setActionAvailability/);
  assert.match(app,/aplicarLaplaceAHorizontes/);
  assert.match(app,/Sin precio verificable/);
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
  assert.equal((java.match(/@JavascriptInterface/g)||[]).length,5);
});
