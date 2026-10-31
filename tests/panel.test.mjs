import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura,huellaContenido} from '../universo/integridad.mjs';
import {registroVacio,añadirCaptura,normalizarRegistro,MAX_CAPTURAS}
  from '../panel/registro.mjs';
import {crearServidor} from '../panel/servidor.mjs';

const instante='2026-10-29T18:30:00.000Z';
function captura(fecha=instante){
  const observacion={id:'precio-'+fecha,domain:'mercado',variable:'BTC_USD_spot',
    value:80700,unit:'USD',observed_at:fecha,known_at:fecha,
    source_url:'https://api.exchange.coinbase.com/products/BTC-USD/ticker'};
  const memoria=universeSnapshot([observacion],{cutoff:fecha});
  return sellarCaptura({schema:'laplace-universo-btc-u001-v1',at:fecha,
    instrument_15m:{schema:'laplace-btc-intradia-i015-v1',observed_price_usd:80700,
      projected_price_usd:80700,model_candidate_price_usd:80720,
      observed_at:fecha,known_at:fecha,target_at:new Date(Date.parse(fecha)+900000).toISOString(),
      status:'referencia_sin_ventaja_validada',backtest:{scored:48,
        model_mae_return_pct:0.25,reference_mae_return_pct:0.24,beats_persistence:false},
      serie_cierres_5m:[]},
    source_count:1,universal_state:memoria,
    measured_market:['book','trades','eth','euro'].map(name=>({name,status:'unavailable'})),
    measured_space_weather:{status:'unavailable'},
    projected_price_usd:80700,execution_orders:0});
}
function entorno(){
  const dir=mkdtempSync(join(tmpdir(),'laplace-panel-'));
  return {dir,archivo:join(dir,'datos.json'),eliminar:()=>rmSync(dir,{recursive:true,force:true})};
}
const escuchar=server=>new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const cerrar=server=>new Promise((ok,rechazar)=>server.close(err=>err?rechazar(err):ok()));
const ruta=server=>'http://127.0.0.1:'+server.address().port;
test('el contrato de memoria respeta marcas temporales, huellas y límite de 144 capturas',()=>{
  const vacio=registroVacio();
  const c=captura(),uno=añadirCaptura(vacio,c);
  assert.equal(uno.historial.length,1);
  assert.equal(uno.ultima.instrument_15m.observed_price_usd,80700);
  assert.throws(()=>añadirCaptura(uno,c),/ya existe/);
  assert.throws(()=>normalizarRegistro({...uno,ultima:{...c,
    universal_state:{...c.universal_state,known_states:99}}}),/modificado/);
  const {registro_sha256,...body}=uno;
  const largo={...body,historial:Array.from({length:MAX_CAPTURAS+1},()=>uno.historial[0])};
  largo.registro_sha256=huellaContenido(largo);
  assert.throws(()=>normalizarRegistro(largo),/Demasiadas capturas/);
});
test('interfaz en español: sin cifras inventadas ni textos de marca extranjeros',()=>{
  const base=new URL('../panel/publico/',import.meta.url);
  const pagina=readFileSync(new URL('index.html',base),'utf8');
  const script=readFileSync(new URL('panel.js',base),'utf8');
  assert.match(pagina,/<html lang="es">/);
  assert.match(pagina,/>Factores observados</);
  assert.match(pagina,/>Validación</);
  assert.match(pagina,/>Actualizar lectura</);
  assert.doesNotMatch(pagina,/Universal Observatory|Live trading|Mockup|Market dashboard/i);
  assert.match(script,/function estadoModelo/);
  assert.match(script,/Sin mejora demostrada/);
  assert.doesNotMatch(pagina,/\$80,741|\$80,664/);
});
test('servidor solo local: estado vacío, captura real inyectada, exportación y persistencia',async()=>{
  const e=entorno();let llamadas=0;
  const server=crearServidor({archivo:e.archivo,capturar:async()=>{llamadas++;return captura()}});
  await escuchar(server);
  try{
    let response=await fetch(ruta(server)+'/');
    assert.equal(response.status,200);
    assert.match(await response.text(),/Panel de análisis causal/);
    assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
    response=await fetch(ruta(server)+'/api/estado');
    const anterior=await response.json();
    assert.equal(anterior.ultima,null);
    assert.equal(anterior.actualizacion_automatica,false);
    assert.equal(llamadas,0);
    assert.equal((await fetch(ruta(server)+'/api/exportar')).status,404);
    const ajeno=await fetch(ruta(server)+'/api/actualizar',{method:'POST',
      headers:{Origin:'https://atacante.example'}});
    assert.equal(ajeno.status,403);assert.equal(llamadas,0);
    response=await fetch(ruta(server)+'/api/actualizar',{method:'POST'});
    assert.equal(response.status,200);
    const nuevo=await response.json();
    assert.equal(nuevo.historial.length,1);
    assert.equal(nuevo.ultima.instrument_15m.observed_price_usd,80700);
    assert.equal(nuevo.horizonte_disponible_minutos,15);
    assert.equal(llamadas,1);
    response=await fetch(ruta(server)+'/api/exportar');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-disposition'),/attachment/);
    assert.equal((await response.json()).execution_orders,0);
    assert.equal(JSON.parse(readFileSync(e.archivo,'utf8')).historial.length,1);
  }finally{await cerrar(server)}
  const reopened=crearServidor({archivo:e.archivo,capturar:async()=>{throw Error('No se llama')}});
  await escuchar(reopened);
  try{const state=await (await fetch(ruta(reopened)+'/api/estado')).json();
    assert.equal(state.historial.length,1);
    assert.equal(state.ultima.universal_state.known_states,1);
  }finally{await cerrar(reopened);e.eliminar()}
});
test('rechaza lecturas demasiado seguidas y conserva la última válida tras un error',async()=>{
  const e=entorno();let t=Date.parse(instante)+1000,llamadas=0;
  const server=crearServidor({archivo:e.archivo,ahora:()=>t,capturar:async()=>{
    llamadas++;if(llamadas===2)throw Error('Coinbase sin respuesta');
    return captura();
  }});
  await escuchar(server);
  try{
    const root=ruta(server);
    assert.equal((await fetch(root+'/api/actualizar',{method:'POST'})).status,200);
    assert.equal((await fetch(root+'/api/actualizar',{method:'POST'})).status,429);
    t+=2500;
    const failed=await fetch(root+'/api/actualizar',{method:'POST'});
    assert.equal(failed.status,502);
    assert.equal((await failed.json()).ultima_lectura_conservada,true);
    const state=await (await fetch(root+'/api/estado')).json();
    assert.equal(state.historial.length,1);
    assert.equal(llamadas,2);
  }finally{await cerrar(server);e.eliminar()}
});
test('no permite dos lecturas simultáneas',async()=>{
  const e=entorno();
  let resolver,comenzo;
  const listo=new Promise(ok=>{comenzo=ok});
  const capturaPendiente=new Promise(ok=>{resolver=ok});
  const server=crearServidor({archivo:e.archivo,capturar:async()=>{
    comenzo();return capturaPendiente;
  }});
  await escuchar(server);
  try{
    const root=ruta(server);
    const primero=fetch(root+'/api/actualizar',{method:'POST'});
    await listo;
    const segundo=await fetch(root+'/api/actualizar',{method:'POST'});
    assert.equal(segundo.status,409);
    resolver(captura());
    assert.equal((await primero).status,200);
  }finally{await cerrar(server);e.eliminar()}
});
