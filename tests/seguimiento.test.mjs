import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {emitirPronosticos,evaluarPronostico,verificarPronostico,validarHorizontes,HORIZONTES} from '../seguimiento/modelo.mjs';
import {leerDiario,añadirEvento,resumir} from '../seguimiento/diario.mjs';
import {ejecutarCiclo,consultarVelas} from '../seguimiento/ciclo.mjs';
const origin=Date.parse('2026-10-29T18:00:10.000Z');
const iso=t=>new Date(t).toISOString();
function datos(n=4032){
  const fin=Math.floor(origin/300000)*300000,raw=[];let p=80000;
  for(let i=0;i<n;i++){
    const o=p;p*=Math.exp(.00001+.0002*Math.sin(i/13));
    raw.push([(fin-(n-i)*300000)/1000,Math.min(o,p)*.9999,Math.max(o,p)*1.0001,o,p,10+i%9]);
  }
  return raw;
}
const raw=datos();
const q={asset:'BTC-USD',value:String(raw.at(-1)[4]),price_basis:'spot_quote',observed_at:iso(origin),known_at:iso(origin+1000)};
const emitir=(h=HORIZONTES)=>emitirPronosticos(raw,q,{emitidoEn:iso(origin+2000),horizontes:h,revision:'test'});
const vela=(p,precio)=>[Date.parse(p.criterio.inicio_vela)/1000,precio-1,precio+1,precio,precio,2];
const comparar=(p,precio)=>evaluarPronostico(p,vela(p,precio),{consultadoEn:iso(Date.parse(p.criterio.fin_vela)+30000),fuente:'https://example.org/prueba'});
const dir=()=>mkdtempSync(join(tmpdir(),'laplace-seguimiento-'));
test('M01: genera los cinco horizontes sin filtros de rentabilidad',()=>{
  const ps=emitir();assert.deepEqual(ps.map(x=>x.horizonte_minutos),[15,30,60,240,1440]);
  for(const p of ps){assert.ok(p.precio_predicho>0);assert.ok(p.analogos>0);assert.ok(verificarPronostico(p));
    assert.equal(Date.parse(p.objetivo_en)-origin,p.horizonte_minutos*60000);}
});
test('M02: mismo estado y parámetros producen mismo pronóstico',()=>{assert.deepEqual(emitir(),emitir())});
test('M03: la historia futura no altera la predicción emitida',()=>{
  const a=emitir();const futura=[...raw,[Math.floor(origin/300000)*300,1,999999,2,999998,1]];
  assert.deepEqual(emitirPronosticos(futura,q,{emitidoEn:iso(origin+2000),revision:'test'}),a);
});
test('M04: resultados de análogos anteriores y sin solapar dentro del conjunto',()=>{
  for(const p of emitir()){
    for(const x of p.ultimos_resultados_conocidos)assert.ok(Date.parse(x.fin)<origin);
    const xs=p.ultimos_resultados_conocidos.slice().sort((a,b)=>a.inicio.localeCompare(b.inicio));
    for(let i=1;i<xs.length;i++)assert.ok(Date.parse(xs[i].inicio)>=Date.parse(xs[i-1].fin));
  }
});
test('M05: no sustituye un candidato nulo por un precio inventado',()=>{
  const [p]=emitirPronosticos(raw.slice(-6),q,{emitidoEn:iso(origin+2000),horizontes:[1440]});
  assert.equal(p.precio_predicho,null);assert.equal(p.estado_modelo,'sin_patrones');
});
test('M06: horizonte configurable más allá de 24h, con soporte explícito',()=>{
  const [p]=emitir([10080]);assert.equal(p.horizonte_minutos,10080);
  assert.ok(['experimental_poco_soporte','sin_patrones'].includes(p.estado_modelo));
  assert.throws(()=>validarHorizontes([15,15]),/duplicados/);
  assert.throws(()=>validarHorizontes([0]),/múltiplos/);
});
test('M07: rechaza precio atrasado, futuro o datos inválidos',()=>{
  assert.throws(()=>emitirPronosticos(raw,q,{emitidoEn:iso(origin+190000)}),/antigua/);
  assert.throws(()=>emitirPronosticos(raw,q,{emitidoEn:iso(origin-1000)}),/antigua/);
  const bad=structuredClone(raw);bad[1][1]=-1;
  assert.throws(()=>emitirPronosticos(bad,q,{emitidoEn:iso(origin+2000)}),/OHLCV/);
});
test('M08: cambiar un precio o criterio invalida el pronóstico sellado',()=>{
  const [p]=emitir([15]);p.precio_predicho=1;assert.throws(()=>verificarPronostico(p),/modificado/);
});
test('M09: no puntúa objetivos que todavía no han cerrado',()=>{
  const [p]=emitir([15]);assert.throws(()=>evaluarPronostico(p,vela(p,80000),{consultadoEn:p.objetivo_en,fuente:'https://example.org'}),/disponible/);
});
test('M10: nunca usa una vela de otro minuto',()=>{
  const [p]=emitir([15]),v=vela(p,80000);v[0]-=60;
  assert.throws(()=>evaluarPronostico(p,v,{consultadoEn:iso(origin+1200000),fuente:'https://example.org'}),/otro objetivo/);
});
test('M11: acierto de precio y dirección se contabilizan por separado',()=>{
  const [p]=emitir([15]);
  const near=comparar(p,p.precio_predicho);assert.equal(near.acierto_precio,true);assert.equal(near.error_absoluto_usd,0);
  const far=comparar(p,p.precio_inicial*(p.precio_predicho>p.precio_inicial?.9:1.1));
  assert.equal(far.acierto_direccion,false);assert.equal(far.acierto_precio,false);
  assert.equal(far.precio_al_segundo_exacto,false);assert.equal(far.tolerancia_precio_pb,10);
});
test('M12: no se pueden insertar predicciones después del objetivo',()=>{
  const d=dir();try{const [p]=emitir([15]);assert.throws(()=>añadirEvento(d,[],'pronostico',p,p.objetivo_en),/tarde/)}finally{rmSync(d,{recursive:true})}
});
test('M13: diario conserva perdedores, rechaza duplicados y cambios',()=>{
  const d=dir(),es=[];
  try{
    const [p]=emitir([15]);añadirEvento(d,es,'pronostico',p,iso(origin+3000));
    assert.throws(()=>añadirEvento(d,es,'pronostico',p,iso(origin+4000)),/repetido/);
    const r=comparar(p,p.precio_predicho*1.1);añadirEvento(d,es,'resultado',r,r.consultado_en);
    assert.equal(resumir(es).por_horizonte[0].fallos_precio,1);
    assert.throws(()=>añadirEvento(d,es,'resultado',r,r.consultado_en),/ya registrado/);
    assert.deepEqual(leerDiario(d),es);
    const text=readFileSync(join(d,'diario.jsonl'),'utf8');writeFileSync(join(d,'diario.jsonl'),text.replace('"tolerancia_precio_pb":10','"tolerancia_precio_pb":99'));
    assert.throws(()=>leerDiario(d),/Integridad/);
  }finally{rmSync(d,{recursive:true})}
});
test('M14: dato ausente se conserva pendiente, no como fallo predictivo',()=>{
  const d=dir(),es=[];try{const [p]=emitir([15]);añadirEvento(d,es,'pronostico',p,iso(origin+3000));
    añadirEvento(d,es,'dato_ausente',{pronostico_id:p.id,motivo:'sin vela'},iso(origin+1500000));
    const s=resumir(es);assert.equal(s.evaluados,0);assert.equal(s.por_horizonte[0].fallos_precio,0);
    assert.equal(s.ultimos[0].estado,'pendiente_datos');
  }finally{rmSync(d,{recursive:true})}
});
test('M15: reinicio no borra ni repite pronósticos de la misma hora',async()=>{
  const d=dir();let at=origin+2000;
  const opts={directorio:d,horizontes:[15],now:()=>iso(at),leerHistoria:async()=>raw,leerCotizacion:async()=>q};
  try{await ejecutarCiclo(opts);at+=3000;await ejecutarCiclo(opts);
    assert.equal(leerDiario(d).filter(e=>e.tipo==='pronostico').length,1);
  }finally{rmSync(d,{recursive:true})}
});
test('M16: ciclo posterior puntúa exactamente lo emitido y no reescribe',async()=>{
  const d=dir();let at=origin+2000;
  try{
    const opts={directorio:d,horizontes:[15],now:()=>iso(at),leerHistoria:async()=>raw,leerCotizacion:async()=>q};
    await ejecutarCiclo(opts);const text=readFileSync(join(d,'diario.jsonl'),'utf8');
    at=origin+1200000;
    await ejecutarCiclo({...opts,leerObjetivo:async p=>({raw:[vela(p,p.precio_predicho*1.01)],fuente:'https://example.org'})});
    assert.ok(readFileSync(join(d,'diario.jsonl'),'utf8').startsWith(text));
    const s=resumir(leerDiario(d));assert.equal(s.evaluados,1);assert.equal(s.por_horizonte[0].fallos_precio,1);
  }finally{rmSync(d,{recursive:true})}
});
test('M17: caídas de red se registran sin fabricar un pronóstico',async()=>{
  const d=dir();try{await ejecutarCiclo({directorio:d,now:()=>iso(origin+2000),leerHistoria:async()=>{throw Error('sin red')}});
    const es=leerDiario(d);assert.equal(es.filter(x=>x.tipo==='pronostico').length,0);
    assert.equal(es.filter(x=>x.tipo==='error_fuente').length,1);
    assert.ok(existsSync(join(d,'resumen.json')));
  }finally{rmSync(d,{recursive:true})}
});
test('M18: no pisa otro proceso con seguimiento activo',async()=>{
  const d=dir();writeFileSync(join(d,'.en-curso'),'otro proceso');
  try{await assert.rejects(()=>ejecutarCiclo({directorio:d}),/ocupado/);
    assert.equal(readFileSync(join(d,'.en-curso'),'utf8'),'otro proceso');
  }finally{rmSync(d,{recursive:true})}
});
test('M19: no ignora ni repara silenciosamente una escritura parcial',()=>{
  const d=dir();try{writeFileSync(join(d,'diario.jsonl'),'{"schema":');assert.throws(()=>leerDiario(d),/incompleto/)}finally{rmSync(d,{recursive:true})}
});
test('M20: respuesta de red maliciosa se corta por presupuesto',async()=>{
  await assert.rejects(()=>consultarVelas({inicio:origin,fin:origin+60000,granularidad:60,
    fetchImpl:async()=>new Response('x'.repeat(600000))}),/512 KiB/);
});
