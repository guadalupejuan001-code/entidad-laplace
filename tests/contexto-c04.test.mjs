import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {normalizarCapturaU003} from '../estado-financiero/modelo.mjs';
import {crearMarcoMercadoC04,verificarMarcoMercadoC04,incorporarMarcosC04,ejecutarContextoVivoC04}
 from '../estado-financiero/contexto-mercado-c04.mjs';
import {ejecutarConjuntoC03} from '../prediccion/conjunta-c03.mjs';
import {compararPronosticosC04} from '../nucleo/comparacion-c04.mjs';

const H=3600000,T=Date.parse('2026-08-01T00:00:00Z'),iso=t=>new Date(t).toISOString();
const sha=s=>createHash('sha256').update(s).digest('hex');
function base(n=4){
 const at=iso(T),states=Array.from({length:n},(_,i)=>({id:'macro-'+i,domain:'banca_bis',
  variable:'claims-'+i,value:100+i,unit:'USD_million',observed_at:iso(T-30*86400000),known_at:at,
  source_url:'https://data.bis.org/series/'+i}));
 states.push({id:'old-btc',domain:'cripto_global',variable:'BTC_USD_spot',value:50000,unit:'USD',
  observed_at:at,known_at:at,source_url:'https://api.exchange.coinbase.com/products/BTC-USD/ticker'});
 return sellarCaptura({schema:'laplace-universo-global-u003-v4',at,
  universal_state:universeSnapshot(states,{cutoff:at}),source_status:[],coverage:{known_signals:states.length,groups:[]},
  prediction_inputs_enabled:false,automatic_trading:false});
}
function market(asset='BTC-USD',time=T+H,price=50001){
 const parts={ticker:{price:price.toFixed(8),time:iso(time-20)},
  book:{bids:Array.from({length:10},(_,i)=>[(price-1-i).toFixed(8),'1',1]),
   asks:Array.from({length:10},(_,i)=>[(price+1+i).toFixed(8),'2',1])},
  trades:[{trade_id:123,side:'buy',price:price.toFixed(8),size:'0.1',time:iso(time-30)}]};
 return {schema:'laplace-market-context-c04-v1',asset,captured_at:iso(time),components:Object.fromEntries(
  Object.entries(parts).map(([name,data])=>[name,{status:'observed',data,received_at:iso(time),
   raw_sha256:sha(JSON.stringify(data)),source_url:'https://api.exchange.coinbase.com/products/'+asset+'/'+
     (name==='book'?'book?level=2':name)}]))};
}

test('C04 conserva ocho medidas nuevas y referencia compacta sin copiar el mundo',()=>{
 const b=base(1000),p=market(),f=crearMarcoMercadoC04(p,b,{asOf:p.captured_at});
 assert.equal(f.observations.length,8);assert.equal(f.base_capture_sha256,b.capture_sha256);
 assert.ok(!Object.hasOwn(f,'universal_state'));
 assert.ok(JSON.stringify(f).length<JSON.stringify(b).length/20);
 const r=incorporarMarcosC04([b],[JSON.parse(JSON.stringify(f))],{asOf:p.captured_at});
 const latest=r.captures.at(-1);normalizarCapturaU003(latest);
 const macro=latest.universal_state.states.find(x=>x.variable==='claims-0');
 assert.equal(macro.known_at,b.at);assert.equal(macro.observed_at,b.universal_state.states[0].observed_at);
 assert.equal(latest.universal_state.states.find(x=>x.variable==='BTC_USD_spot').value,50001);
 assert.equal(r.frames_materialized,1);
});

test('C04 rechaza marco alterado, datos futuros, cambio de activo y URL arbitraria',()=>{
 const b=base(),p=market(),f=crearMarcoMercadoC04(p,b,{asOf:p.captured_at});
 const broken=structuredClone(f);broken.observations[0].value++;
 assert.throws(()=>verificarMarcoMercadoC04(broken,{asOf:p.captured_at}),/alterado/);
 assert.throws(()=>verificarMarcoMercadoC04(f,{asOf:iso(T)}),/futura/);
 const bad=structuredClone(p);bad.asset='ETH-USD';
 assert.throws(()=>crearMarcoMercadoC04(bad,b,{asOf:p.captured_at}),/origen/);
 const badURL=structuredClone(p);badURL.components.ticker.source_url='https://example.org/ticker';
 assert.throws(()=>crearMarcoMercadoC04(badURL,b,{asOf:p.captured_at}),/origen/);
});

test('C04 no inventa profundidad si falla el libro y conserva bases faltantes como pendientes',()=>{
 const b=base(),p=market();p.components.book={status:'unavailable'};
 const f=crearMarcoMercadoC04(p,b,{asOf:p.captured_at});assert.equal(f.observations.length,4);
 assert.equal(f.observations.some(x=>x.domain==='liquidez'),false);
 const r=incorporarMarcosC04([], [f],{asOf:p.captured_at});
 assert.equal(r.frames_materialized,0);assert.equal(r.unresolved.length,1);
});

test('C04 mantiene otros activos y no retrocede al recibir un ticker más antiguo',()=>{
 const b=base(),first=market('BTC-USD',T+H,50001),second=market('ETH-USD',T+H+1000,2000);
 const stale=market('BTC-USD',T+H+2000,49990),last=market('SOL-USD',T+H+3000,100);
 stale.components.ticker.data.time=iso(T+H-1000);
 const frames=[first,second,stale,last].map(p=>crearMarcoMercadoC04(p,b,{asOf:last.captured_at}));
 const r=incorporarMarcosC04([b],frames,{asOf:last.captured_at});
 const states=r.captures.at(-1).universal_state.states;
 for(const [variable,value]of [['BTC_USD_spot',50001],['ETH_USD_spot',2000],['SOL_USD_spot',100]])
  assert.equal(states.find(x=>x.variable===variable).value,value);
 assert.equal(states.find(x=>x.variable==='claims-0').known_at,b.at);
});

test('C04 deduplica sin sobrescribir capturas contradictorias ni multiplicar objetivos',()=>{
 const b=base(),p=market(),f=crearMarcoMercadoC04(p,b,{asOf:p.captured_at});
 assert.equal(incorporarMarcosC04([b],[f,f],{asOf:p.captured_at}).frames_materialized,1);
 const conflict=crearMarcoMercadoC04(market('BTC-USD',T+H,50002),b,{asOf:p.captured_at});
 assert.throws(()=>incorporarMarcosC04([b],[f,conflict],{asOf:p.captured_at}),/contradictorios/);
 const frames=Array.from({length:5},(_,i)=>{
  const m=market('BTC-USD',T+H+i*1000);return crearMarcoMercadoC04(m,b,{asOf:m.captured_at});
 });
 const asOf=iso(T+3*H),rows=Array.from({length:36},(_,i)=>[T/1000+i*300,49990,50010,50000,50000,1]);
 const r=ejecutarContextoVivoC04([b],frames,null,{asOf,horizonHours:1,
  targetCandles:{asset:'BTC-USD',granularity:300,rows}},ejecutarConjuntoC03);
 assert.ok(r.counts.matched_outcomes<=2);
 assert.equal(r.context_journal.frames_verified,5);
});

function trained(asset){
 const b=base(),frames=Array.from({length:150},(_,i)=>{
  const p=market(asset,T+(i+1)*6*H,2000+10*Math.sin(i*.5));
  return crearMarcoMercadoC04(p,b,{asOf:p.captured_at});
 });
 const asOf=frames.at(-1).captured_at,g=3600;
 const rows=Array.from({length:902},(_,i)=>{const p=2000+10*Math.sin(i*.1);
  return [T/1000+i*g,p-1,p+1,p,p,2];});
 const result=ejecutarContextoVivoC04([b],frames,null,{asOf,asset,horizonHours:6,
  targetCandles:{asset,granularity:g,rows}},ejecutarConjuntoC03);
 return {result,asOf,frames,base:b,rows};
}
test('C03 entrena y emite candidatos ETH y SOL sin reutilizar etiquetas BTC',()=>{
 for(const asset of ['ETH-USD','SOL-USD']){
  const {result:r,asOf,rows,base:b}=trained(asset);
  assert.equal(r.model_ready,true,JSON.stringify(r.counts));
  assert.equal(r.forecast.asset,asset);assert.ok(r.contributions.some(x=>x.variable===asset.replace('-','_')+'_spot'));
  assert.throws(()=>ejecutarConjuntoC03([b],{asOf,asset,horizonHours:6,
   targetCandles:{asset:'BTC-USD',granularity:3600,rows}}),/activo/);
 }
});

test('C04 compara emisiones selladas solo con el mismo activo, referencia y cierre',()=>{
 const {result:r}=trained('ETH-USD'),f=r.forecast;
 const record={asset:'ETH-USD',reference:f.reference_price,issuedAt:Date.parse(f.issued_at)/1000+.1,
  targetCloseAt:Date.parse(f.target_at)/1000,checkpointSHA256:sha('native'),probabilityUp:.6,
  outputs:[{predicted:f.estimated_price+2}],jointContext:{forecast:f}};
 const actual=f.estimated_price+1,c=compararPronosticosC04(record,actual,record.targetCloseAt);
 assert.equal(c.status,'paired_evaluated');assert.equal(c.context_price_error,1);assert.equal(c.native_price_error,1);
 const mismatch={...record,targetCloseAt:record.targetCloseAt+300};
 assert.equal(compararPronosticosC04(mismatch,actual,mismatch.targetCloseAt).status,'different_reference_or_target');
 const changed=structuredClone(record);changed.jointContext.forecast.estimated_price++;
 assert.throws(()=>compararPronosticosC04(changed,actual,record.targetCloseAt),/alterado/);
});
