const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Engine=require('../app/src/main/assets/engine.js');
const root=path.resolve(__dirname,'../app/src/main/assets');
function rows(count,period=3600,seed=0){
  const out=[];let price=100;
  for(let i=0;i<count;i++){
    const returnValue=.01*Math.sin(i*.39)+.002*Math.cos(i*.11);
    price*=Math.exp(returnValue);
    const high=price*1.006,low=price*.994;
    out.push([1700000000+i*period,low,high,price,price,2+i*.2]);
  }
  return out;
}
test('LAPLACE Android presenta exactamente los ocho horizontes solicitados',()=>{
  assert.deepEqual(Engine.HORIZONS.map(x=>x.hours),[1,5,12,24,48,72,168,336]);
  assert.equal(Engine.selectResolution(1),1);
  assert.equal(Engine.selectResolution(24),1);
  assert.equal(Engine.selectResolution(48),24);
  assert.equal(Engine.selectResolution(336),24);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const ui=[...html.matchAll(/data-hours="(\d+)"/g)].map(x=>Number(x[1]));
  assert.deepEqual(ui,[1,5,12,24,48,72,168,336]);
  assert.ok(html.includes('class="portal"'));
  assert.ok(html.includes('id="train"'));
  assert.ok(html.includes('id="test"'));
  assert.ok(html.includes('id="forecast"'));
});
test('Velas Coinbase ordenadas, duplicados eliminados y ceros no inventados',()=>{
  const input=rows(55).reverse();
  input.push(input[0]);
  const candles=Engine.candlesFromCoinbase(input,3600);
  assert.equal(candles.length,55);
  assert.ok(candles[0].time<candles.at(-1).time);
  assert.throws(()=>Engine.candlesFromCoinbase([[1,0,1,1,1,0]],3600),/Sin velas/);
  assert.throws(()=>Engine.candlesFromCoinbase('invalid',3600),/no entregó/);
});
test('Entrenamiento local usa histórico observado y holdout cronológico',()=>{
  const model=Engine.analyze(rows(250),{intervalHours:1});
  assert.equal(model.candlesUsed,250);
  assert.equal(model.asset,'BTC-USD');
  assert.ok(model.trainPairs>25);
  assert.ok(model.holdoutPairs>25);
  assert.ok(Number.isFinite(model.modelMAE));
  assert.ok(Number.isFinite(model.referenceMAE));
  assert.ok(['ar1_ridge','persistence'].includes(model.selected));
  assert.equal(model.prospectiveValidation,false);
  assert.equal(model.worldwideFinancialModel,false);
  assert.equal(model.automaticTrading,false);
});
test('Los ocho horizontes se proyectan sin etiquetas de certeza inventadas',()=>{
  const modelH=Engine.analyze(rows(260),{intervalHours:1});
  const modelD=Engine.analyze(rows(260,86400),{intervalHours:24});
  for(const {hours} of Engine.HORIZONS){
    const model=hours<=24?modelH:modelD;
    const p=Engine.forecast(model,hours);
    assert.equal(p.hours,hours);
    assert.ok(p.steps>=1);
    assert.ok(p.estimate>0&&Number.isFinite(p.estimate));
    assert.ok(p.lower<=p.estimate&&p.upper>=p.estimate);
    assert.equal(p.trace.length,p.steps);
    assert.equal(p.isGuarantee,false);
    assert.equal(p.prospectivelyValidated,false);
    assert.equal(p.automaticTrading,false);
    assert.match(p.rangeLabel,/NO calibrado/);
  }
});
test('14 días = 14 pasos diarios y 5 horas = 5 pasos horarios',()=>{
  const h=Engine.analyze(rows(150),{intervalHours:1});
  const d=Engine.analyze(rows(150,86400),{intervalHours:24});
  assert.equal(Engine.forecast(h,5).steps,5);
  assert.equal(Engine.forecast(d,336).steps,14);
  assert.equal(Engine.forecast(d,72).steps,3);
});
test('No entrena sin muestras históricas reales o activos autorizados',()=>{
  assert.throws(()=>Engine.analyze(rows(10),{intervalHours:1}),/Historial insuficiente/);
  assert.throws(()=>Engine.analyze(rows(200),{intervalHours:1,asset:'SPY'}),/no autorizado/);
  assert.throws(()=>Engine.forecast(null,336),/Entrena antes/);
  assert.throws(()=>Engine.forecast({intervalHours:24},999),/Horizonte desconocido/);
});
test('Android WebView sólo permite la fuente pública y no pide permisos financieros',()=>{
  const main=fs.readFileSync(path.resolve(__dirname,'../app/src/main/java/com/entidadlaplace/mobile/MainActivity.java'),'utf8');
  const manifest=fs.readFileSync(path.resolve(__dirname,'../app/src/main/AndroidManifest.xml'),'utf8');
  assert.match(main,/api\.exchange\.coinbase\.com/);
  assert.match(main,/setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(main,/setMixedContentMode\(WebSettings.MIXED_CONTENT_NEVER_ALLOW\)/);
  assert.match(main,/ExecutorService/);
  assert.match(main,/fetchCandles/);
  assert.ok(!manifest.includes('READ_EXTERNAL_STORAGE'));
  assert.ok(!manifest.includes('android.permission.CAMERA'));
  assert.ok(!manifest.includes('android.permission.RECORD_AUDIO'));
  assert.ok(manifest.includes('android.permission.INTERNET'));
  assert.equal((main.match(/@JavascriptInterface/g)||[]).length,1);
});
