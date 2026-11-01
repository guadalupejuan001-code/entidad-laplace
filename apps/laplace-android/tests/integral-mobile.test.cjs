const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const read=x=>fs.readFileSync(path.join(assets,x),'utf8');
const scope={window:{}};vm.createContext(scope);
vm.runInContext(read('math-pde.js'),scope);
vm.runInContext(read('fusion-integral.js'),scope);
const f=scope.window.LaplaceIntegral,graph=scope.window.LaplacePDE;
function candles(n,step,end){
  const start=Math.floor(end/step)*step-(n+1)*step;let p=100;
  return Array.from({length:n},(_,i)=>{
    p*=Math.exp(.006*Math.sin(i*.15)+.003*Math.cos(i*.039));
    return [start+i*step,p*.99,p*1.01,p,p,4+i*.001]});
}
test('F001 canónico Android tiene 14 horizontes de 5m a 90d',()=>{
 assert.equal(f.HORIZON_PLAN.length,14);
 assert.deepEqual(Array.from(f.HORIZON_PLAN,x=>x.minutes),
   [5,15,30,60,120,240,480,720,1440,4320,10080,20160,43200,129600]);
 assert.equal(f.LAPLACE_FIN_VERSION,'laplace-financial-field-v1');
 assert.equal(f.CAPABILITY_CATALOG.length,20);
 const capabilities=f.resumirCapacidades();
 assert.equal(capabilities.items.length,20);
 assert.equal(capabilities.counts.executed,0);
});
test('F001 + campo financiero real en WebView no modifican los precios candidato',()=>{
 const end=Date.parse('2026-10-31T16:00:00Z')/1000;
 const q={asset:'BTC-USD',value:115,
   observed_at:new Date((end-60)*1000).toISOString(),
   known_at:new Date((end-30)*1000).toISOString()};
 const series={300:candles(4000,300,end),3600:candles(1070,3600,end),
   86400:candles(990,86400,end)};
 const report=f.fusionTemporal({quote:q,series,world:null,asOf:new Date(end*1000).toISOString()});
 assert.equal(report.horizons.length,14);
 const field=f.aplicarLaplaceAHorizontes(report.horizons,{
   quotePrice:q.value,solver:graph.resolverLaplaceGrafo});
 assert.ok(['calculated','abstained'].includes(field.status));
 assert.equal(field.candidate_prices_unchanged,true);
 assert.equal(field.automatic_trading,false);
 assert.equal(report.automatic_trading,false);
});
test('la app no inventa fuentes: la matemática y los controles están conectados',()=>{
 const html=read('index.html'),app=read('app.js');
 assert.ok(html.indexOf('math-pde.js')<html.indexOf('fusion-integral.js'));
 assert.ok(html.indexOf('fusion-integral.js')<html.indexOf('app.js'));
 assert.match(html,/data-tab="integral"/);
 assert.match(html,/id="integralRun"/);
 assert.match(html,/id="capabilityQuery"/);
 assert.match(html,/id="capabilityRefresh"/);
 assert.match(html,/id="worldShowMore"/);
 assert.match(app,/function renderCapabilities\(\)/);
 assert.match(app,/F\.resumirCapacidades/);
 assert.equal((html.match(/data-minutes="\d+"/g)||[]).length,16);
 assert.match(app,/async function runIntegral\(\)/);
 assert.match(app,/F\.fusionTemporal/);
 assert.match(app,/F\.aplicarLaplaceAHorizontes/);
 assert.match(app,/F\.auditarUniversoLaplace/);
 assert.match(app,/window\.LaplacePDE\.resolverLaplaceGrafo/);
});
test('el archivo F001 empaquetado coincide con el código del repositorio',()=>{
 const root=path.resolve(__dirname,'../../..');
 const strip=s=>s.replace(/\bexport\s+(?=(?:const|function|async function)\s)/g,'');
 const bundle=read('fusion-integral.js');
 for(const file of ['prediccion/fusion-temporal.mjs','ecuacion/laplace-financiero.mjs','nucleo/registro-capacidades.mjs']){
  const code=strip(fs.readFileSync(path.resolve(root,file),'utf8'));
  assert.ok(bundle.includes(code));
 }
});
