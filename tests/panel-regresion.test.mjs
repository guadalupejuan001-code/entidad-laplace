import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura,huellaContenido,verificarSelloCaptura} from '../universo/integridad.mjs';
import {registroVacio,añadirCaptura,normalizarRegistro,validarCaptura,migrarRegistroAnterior}
  from '../panel/registro.mjs';
import {crearServidor} from '../panel/servidor.mjs';
import '../panel/publico/grafica.js';
const base=Date.parse('2026-10-29T18:30:00.000Z');
function captura(i=0){
  const at=new Date(base+i*1000).toISOString();
  const m={schema:'laplace-btc-intradia-i015-v1',observed_price_usd:80700,
    projected_price_usd:80700,model_selected:'persistencia',status:'referencia_sin_ventaja_validada',
    observed_at:at,known_at:at,target_at:new Date(base+i*1000+900000).toISOString(),
    model_candidate_price_usd:80800,scenario_interval_usd:[80500,81000],
    backtest:{scored:48,beats_persistence:false,model_mae_return_pct:.3,reference_mae_return_pct:.2},
    serie_cierres_5m:[{fecha:new Date(base+i*1000-600000).toISOString(),precio:80500},
      {fecha:new Date(base+i*1000-300000).toISOString(),precio:80600}]};
  const universal_state=universeSnapshot([{id:'precio-'+i,domain:'mercado',variable:'BTC_USD_spot',
    value:80700,unit:'USD',observed_at:at,known_at:at,source_url:'https://example.org/dato-sintetico'}],{cutoff:at});
  return sellarCaptura({schema:'laplace-universo-btc-u001-v1',at,instrument_15m:m,source_count:1,
    universal_state,measured_market:['book','trades','eth','euro'].map(name=>({name,status:'unavailable'})),
    measured_space_weather:{status:'unavailable'},projected_price_usd:80700,execution_orders:0});
}
function sellarRegistro(r){const {registro_sha256,...body}=r;return {...body,registro_sha256:huellaContenido(body)}}
function anterior(){
  const a=captura();delete a.capture_sha256;
  const r=añadirCaptura(registroVacio(),sellarCaptura(a));
  const row={...r.historial[0]};delete row.huella_captura;delete row.origen_integridad;
  return {schema:'laplace-panel-v1',ultima:a,historial:[row],actualizado_en:a.at};
}
const entorno=()=>mkdtempSync(join(tmpdir(),'laplace-regresion-'));
const escuchar=s=>new Promise(ok=>s.listen(0,'127.0.0.1',ok));
const cerrar=s=>new Promise(ok=>s.close(ok));
test('R01: el sello detecta alteraciones fuera de la memoria universal',()=>{
  const cambios=[c=>c.instrument_15m.observed_price_usd=1,
    c=>c.instrument_15m.model_candidate_price_usd=1,
    c=>c.instrument_15m.serie_cierres_5m[0].precio=1,
    c=>c.instrument_15m.backtest.model_mae_return_pct=0,
    c=>c.measured_market[0].status='observed',c=>c.projected_price_usd=1];
  for(const cambiar of cambios){const c=captura();cambiar(c);assert.throws(()=>validarCaptura(c),/modificada/)}
});
test('R02: no basta con resellar un precio contradictorio con la memoria',()=>{
  const c=captura();c.instrument_15m.observed_price_usd=1;
  assert.throws(()=>validarCaptura(sellarCaptura(c)),/cotización no coincide/);
});
test('R03: rechaza retroceso de captura y no muta el registro anterior',()=>{
  const r=añadirCaptura(registroVacio(),captura(10));
  const original=JSON.stringify(r);
  assert.throws(()=>añadirCaptura(r,captura(0)),/anterior/);
  assert.equal(JSON.stringify(r),original);
});
test('R04: fechas equivalentes no permiten duplicar la misma captura',()=>{
  const c=captura(),r=añadirCaptura(registroVacio(),c);
  c.at=c.at.replace('.000Z','Z');
  assert.throws(()=>añadirCaptura(r,sellarCaptura(c)),/ya existe/);
});
test('R05: un sello del historial detecta cambios en filas ya resumidas',()=>{
  let r=añadirCaptura(registroVacio(),captura());r=añadirCaptura(r,captura(10));
  r.historial[0].precio=2;
  assert.throws(()=>normalizarRegistro(r),/registro completo está modificado/);
});
test('R06: la última fila debe concordar aunque el archivo se haya resellado',()=>{
  const r=añadirCaptura(registroVacio(),captura());r.historial[0].precio=2;
  assert.throws(()=>normalizarRegistro(sellarRegistro(r)),/última fila/);
});
test('R07: conserva exactamente las 144 últimas capturas de 150',()=>{
  let r=registroVacio();for(let i=0;i<150;i++)r=añadirCaptura(r,captura(i));
  assert.equal(r.historial.length,144);assert.equal(r.historial[0].fecha,captura(6).at);
  assert.equal(r.ultima.at,captura(149).at);
});
test('R08: el registro no comparte referencias mutables con el colector',()=>{
  const c=captura(),r=añadirCaptura(registroVacio(),c);c.instrument_15m.observed_price_usd=1;
  assert.equal(normalizarRegistro(r).ultima.instrument_15m.observed_price_usd,80700);
});
test('R09: migración explícita, con aviso de procedencia no sellada',()=>{
  const r=migrarRegistroAnterior(anterior());
  assert.equal(r.schema,'laplace-panel-v2');assert.ok(r.aviso_migracion);
  assert.equal(r.ultima.origen_integridad,'migracion_sin_sello_original');
  assert.ok(verificarSelloCaptura(r.ultima));
});
test('R10: el arranque migra sin perder el archivo original',()=>{
  const dir=entorno(),file=join(dir,'datos.json'),raw=JSON.stringify(anterior());
  writeFileSync(file,raw);const s=crearServidor({archivo:file});
  try{assert.equal(readFileSync(file+'.v1-respaldo.json','utf8'),raw);
    assert.equal(JSON.parse(readFileSync(file)).schema,'laplace-panel-v2');
  }finally{s.close();rmSync(dir,{recursive:true,force:true})}
});
test('R11: un archivo dañado nunca se convierte silenciosamente en historial vacío',()=>{
  const dir=entorno(),file=join(dir,'datos.json');writeFileSync(file,'{"incompleto":');
  try{assert.throws(()=>crearServidor({archivo:file}));assert.equal(readFileSync(file,'utf8'),'{"incompleto":')}
  finally{rmSync(dir,{recursive:true,force:true})}
});
test('R12: la gráfica parte del precio instantáneo con tiempo propio',()=>{
  const m=captura().instrument_15m,g=LaplaceGrafica.calcular(m.serie_cierres_5m,m);
  assert.equal(g.ancla.precio,m.observed_price_usd);assert.equal(g.ancla.y,g.fin.y);
  assert.notEqual(g.puntos.at(-2).precio,g.ancla.precio);
  assert.equal(g.fin.tiempo-g.ancla.tiempo,900000);
});
test('R13: separaciones temporales desiguales producen distancias desiguales',()=>{
  const m=captura().instrument_15m,series=m.serie_cierres_5m;
  const a=LaplaceGrafica.calcular(series,m);
  series[1].fecha=new Date(base-540000).toISOString();
  const b=LaplaceGrafica.calcular(series,m);
  assert.notEqual(a.puntos[1].x,b.puntos[1].x);
  assert.ok(b.puntos[1].x-b.puntos[0].x<a.puntos[1].x-a.puntos[0].x);
});
test('R14: gráfico sin velas todavía representa cotización y estimación, no cierres inventados',()=>{
  const g=LaplaceGrafica.calcular([],captura().instrument_15m);
  assert.equal(g.puntos.length,1);assert.equal(g.cierres_visibles,0);
});
test('R15: UTC inválido y objetivo distinto a 15 minutos se rechazan',()=>{
  const c=captura();c.at='2026-02-30T00:00:00Z';
  assert.throws(()=>validarCaptura(sellarCaptura(c)),/fecha UTC/);
  const d=captura();d.instrument_15m.target_at=d.at;
  assert.throws(()=>validarCaptura(sellarCaptura(d)),/quince minutos/);
});
test('R16: localhost funciona y el origen externo sigue bloqueado',async()=>{
  const dir=entorno(),s=crearServidor({archivo:join(dir,'x.json'),capturar:async()=>captura()});
  await escuchar(s);
  try{
    const port=s.address().port,root='http://127.0.0.1:'+port;
    const good=await fetch('http://localhost:'+port+'/api/actualizar',{method:'POST',headers:{Origin:'http://localhost:'+port}});
    assert.equal(good.status,200);
    const bad=await fetch(root+'/api/actualizar',{method:'POST',headers:{Origin:'https://ajeno.example'}});
    assert.equal(bad.status,403);
  }finally{await cerrar(s);rmSync(dir,{recursive:true,force:true})}
});
test('R17: orden invertido de propiedades JSON no invalida el sello completo',()=>{
  const c=captura(),otro=Object.fromEntries(Object.entries(c).reverse());
  assert.equal(validarCaptura(otro).at,c.at);
});
