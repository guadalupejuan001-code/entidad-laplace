const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('La consola de precios esta ANTES del vórtice y ofrece BTC ETH SOL',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf('class="quote-console"')<html.indexOf('class="hero"'));
  for(const [asset,id] of [['BTC-USD','quoteBTC'],['ETH-USD','quoteETH'],['SOL-USD','quoteSOL']]){
    assert.ok(html.includes('data-quote-asset="'+asset+'"'));
    assert.ok(html.includes('id="'+id+'"'));
    assert.ok(html.includes('id="'+id+'Status"'));
  }
  assert.ok(html.includes('id="quoteTime"'));
  assert.ok(html.includes('ÚLTIMO CIERRE DE VELA'));
  assert.ok(html.includes('id="notice"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('Vortice tiene luces en movimiento y modo reducido accesible',()=>{
  const html=read('index.html'),style=read('style.css');
  assert.ok(html.includes('class="swirl"'));
  assert.ok(html.includes('class="moving-particles"'));
  assert.equal((html.match(/<animateMotion /g)||[]).length,4);
  assert.match(style,/@keyframes dataFlow/);
  assert.match(style,/@keyframes rotateVortex/);
  assert.match(style,/prefers-reduced-motion:reduce/);
  assert.match(style,/moving-particles\{display:none\}/);
});
test('El controlador no mezcla datos de activos y muestra feedback contextual',()=>{
  const app=read('app.js');
  assert.match(app,/const epoch=\+\+refreshEpoch,requested=asset/);
  assert.match(app,/epoch!==refreshEpoch\|\|requested!==asset/);
  assert.match(app,/remoteCandles\(1,requested\)/);
  assert.match(app,/remoteQuote\(symbol\)/);
  assert.match(app,/function renderQuotes\(\)/);
  assert.match(app,/function changeAsset\(next\)/);
  assert.match(app,/noticeText/);
  assert.match(app,/ticker no disponible/i);
});
test('El puente Java solo consulta ticker HTTPS de activos permitidos',()=>{
  const java=fs.readFileSync(path.resolve(__dirname,
    '../app/src/main/java/com/entidadlaplace/mobile/MainActivity.java'),'utf8');
  assert.match(java,/fetchQuote\(String requestId,String asset\)/);
  assert.match(java,/fetchCoinbaseQuote\(String asset\)/);
  assert.match(java,/api\.exchange\.coinbase\.com\/products\//);
  assert.match(java,/ASSETS\.contains\(asset\)/);
  assert.match(java,/Double\.isFinite\(price\)/);
  assert.equal((java.match(/@JavascriptInterface/g)||[]).length,2);
});
