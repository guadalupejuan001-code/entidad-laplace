const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Engine=require('../app/src/main/assets/engine.js');
const root=path.resolve(__dirname,'../app/src/main/assets');
function bars(count,granularity=300){
  const start=Math.floor(1700000000/granularity)*granularity;
  let price=30000;
  const out=[];
  for(let i=0;i<count;i++){
    const logR=.0035*Math.sin(i*.13)+.0021*Math.cos(i*.037)+.0004;
    price*=Math.exp(logR);
    out.push([start+i*granularity,price*.99,price*1.01,price,price,3+.7*Math.sin(i*.11)**2]);
  }
  return out;
}
test('M001 original + horizontes nuevos y tres fuentes temporales verificables',()=>{
  assert.deepEqual(Engine.HORIZONS.map(h=>h.minutes),
    [5,15,30,60,120,240,300,480,720,1440,2880,4320,10080,20160,43200,129600]);
  assert.equal(Engine.selectResolution(15),300);
  assert.equal(Engine.selectResolution(240),3600);
  assert.equal(Engine.selectResolution(300),3600);
  assert.equal(Engine.selectResolution(1440),3600);
  assert.equal(Engine.selectResolution(20160),86400);
  assert.deepEqual(Object.keys(Engine.HISTORICAL_CONFIG).sort(),
    ['300','3600','86400'].sort());
});
test('M001 muestra cinco rasgos del código histórico y no utiliza AR(1)',()=>{
  const f=Engine.featureAt(Engine.candlesFromCoinbase(bars(50),300),49,300);
  assert.equal(f.length,5);
  assert.ok(f.every(Number.isFinite));
  const src=fs.readFileSync(path.join(root,'engine.js'),'utf8');
  assert.match(src,/M001_analogos_ponderados/);
  assert.match(src,/Math\.log\(bars\[index\]\.close\/bars\[index-3\]\.close\)/);
  assert.match(src,/1\/\(1\+a\.distance\)/);
  assert.doesNotMatch(src,/fitAR1|ar1_ridge/);
});
test('Cotizaciones ordenadas, duplicado idempotente, no se rellenan saltos ni datos corruptos',()=>{
  const initial=bars(60),duplicate=[...initial.slice().reverse(),initial[0]];
  const parsed=Engine.candlesFromCoinbase(duplicate,300);
  assert.equal(parsed.length,60);
  assert.equal(parsed.at(-1).time-initial[0][0],59*300);
  const conflict=initial[0].slice();conflict[4]+=100;conflict[2]+=100;
  assert.throws(()=>Engine.candlesFromCoinbase([...initial,conflict],300),
    /contradictorias/);
  assert.throws(()=>Engine.candlesFromCoinbase([],300),/Sin velas/);
  assert.throws(()=>Engine.candlesFromCoinbase('falso',300),/no entregó/);
});
test('15 min: patrones, retornos ponderados, sin imponer ±1 USD',()=>{
  const input=bars(2016,300);
  const model=Engine.analyze(input,{granularity:300,horizonMinutes:15,asset:'BTC-USD'});
  assert.equal(model.ready,true);
  assert.equal(model.algorithm,'M001_analogos_ponderados');
  assert.ok(model.patterns>=8&&model.patterns<=18);
  assert.ok(model.validation.evaluated>=3);
  assert.equal(model.noArtificialReturnFloor,true);
  assert.equal(model.worldwideSignalsUsedForModel,false);
  const basis=35214.78;
  const p=Engine.forecast(model,{basePrice:basis,sourceTime:1700000000,sourceType:'ticker'});
  assert.ok(Math.abs(p.estimate-basis*Math.exp(model.returnLog))<1e-8);
  assert.equal(p.fromPrice,basis);
  assert.equal(p.baseline,basis);
  assert.equal(p.sourceType,'ticker');
  assert.equal(p.prospectivelyValidated,false);
  assert.equal(p.automaticTrading,false);
  assert.ok(p.lower<=p.upper);
});
test('4 horas usan velas horarias F001 y comprobación cronológica',()=>{
  const model=Engine.analyze(bars(1080,3600),
    {granularity:3600,horizonMinutes:240,asset:'BTC-USD'});
  assert.ok(model.ready);
  assert.equal(model.horizonBars,4);
  assert.ok(model.validation.evaluated>=3);
  assert.equal(model.validation.method,'walk_forward_chronological_non_overlapping_targets');
  const entries=model.validation.results;
  for(let i=1;i<entries.length;i++)
    assert.ok(entries[i].decidedAt-entries[i-1].decidedAt>=240*60);
  for(const item of entries)assert.ok(item.decidedAt<item.observedAt);
});
test('5h 12h y 24h con histórico horario, no 5m extrapolados sin fuente',()=>{
  const input=bars(1200,3600);
  for(const minutes of [300,720,1440]){
    const m=Engine.analyze(input,{granularity:3600,horizonMinutes:minutes});
    assert.equal(m.ready,true);
    assert.equal(m.horizonBars,minutes/60);
  }
});
test('7d, 14d, 30d y 90d usan cierres diarios medidos',()=>{
  const input=bars(1000,86400);
  for(const minutes of [10080,20160,43200,129600]){
    const m=Engine.analyze(input,{granularity:86400,horizonMinutes:minutes});
    assert.equal(m.horizonBars,minutes/1440);
    if(minutes===129600){
      // 1000 velas NO garantizan ocho analogías independientes para 90 días.
      assert.ok(m.ready||/patrones independientes/.test(m.reason));
    }else{
      assert.equal(m.ready,true);
      assert.ok(m.validation.evaluated>=1);
    }
  }
});
test('Ningún resultado conocido después de la decisión alimenta el mismo pronóstico',()=>{
  const original=Engine.candlesFromCoinbase(bars(1100),300);
  const first=Engine.analogsAt(original,900,300,3);
  const changed=original.map(x=>({...x}));
  for(let i=905;i<changed.length;i++){
    changed[i].close*=1.20;changed[i].open*=1.20;
    changed[i].low*=1.20;changed[i].high*=1.20;
  }
  const later=Engine.analogsAt(changed,900,300,3);
  assert.equal(later.returnLog,first.returnLog);
  assert.deepEqual(later.analogs.map(x=>x.index),first.analogs.map(x=>x.index));
});
test('Falla cerrado cuando hay huecos recientes o muestras insuficientes',()=>{
  assert.throws(()=>Engine.analyze(bars(20),{granularity:300,horizonMinutes:15}),
    /insuficiente/);
  assert.throws(()=>Engine.analyze(bars(500),{granularity:300,horizonMinutes:20160}),
    /resolución/);
  assert.throws(()=>Engine.analyze(bars(500),{granularity:300,horizonMinutes:15,asset:'SPY'}),
    /Activo no autorizado/);
  const input=bars(2016);
  input.splice(input.length-3,1);
  const m=Engine.analyze(input,{granularity:300,horizonMinutes:15});
  assert.equal(m.ready,false);
  assert.match(m.reason,/seis velas/);
  assert.throws(()=>Engine.forecast(m,{basePrice:1,sourceTime:1}),/patrones/);
});
test('Android restringe URL, permisos, periodos y fuentes; conserva la PDE',()=>{
  const code=fs.readFileSync(path.resolve(__dirname,
    '../app/src/main/java/com/entidadlaplace/mobile/MainActivity.java'),'utf8');
  const manifest=fs.readFileSync(path.resolve(__dirname,
    '../app/src/main/AndroidManifest.xml'),'utf8');
  assert.match(code,/fetchCandles\(String requestId,String asset,int granularity,int days\)/);
  assert.match(code,/granularity==300\?14:granularity==3600\?45/);
  assert.match(code,/days!=expectedDays/);
  assert.match(code,/fetchCoinbaseHistory/);
  assert.match(code,/api\.exchange\.coinbase\.com\/products\//);
  assert.match(code,/ASSETS\.contains\(asset\)/);
  assert.match(code,/Coinbase HTTP 429/);
  assert.equal((code.match(/@JavascriptInterface/g)||[]).length,5);
  assert.match(code,/setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(code,/setMixedContentMode\(WebSettings\.MIXED_CONTENT_NEVER_ALLOW\)/);
  assert.match(manifest,/android\.permission\.INTERNET/);
  assert.doesNotMatch(manifest,/READ_EXTERNAL_STORAGE|CAMERA|RECORD_AUDIO/);
});
