import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {compilarSistema,validarSistema,escenarioPrueba,MAX_HORIZON_S,
  leerSalida,recuperarEstadoMemory,generarLecturaMemory} from '../fisica/compilar.mjs';

const binary=process.env.REVERSE_PC_BIN;
const native={skip:binary?false:'requiere el REVERSE-PC XI original fijado en CI'};
const run=(...args)=>spawnSync(resolve(binary),args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
function ejecutar(config,{rxe=false,leermemoria=true}={}){
  const dir=mkdtempSync(join(tmpdir(),'laplace-fisica-'));
  try{
    const m=compilarSistema(config),source=join(dir,'mundo.xi'),exe=join(dir,'mundo.rxe'),
      before=join(dir,'base.rvp'),after=join(dir,'after.rvp');
    writeFileSync(source,m.xi);
    const initialized=run('init',before);assert.equal(initialized.status,0,initialized.stderr);
    if(rxe){const compiled=run('compile',source,exe,'Laplace Fisica P001');assert.equal(compiled.status,0,compiled.stderr)}
    const result=run('run',rxe?exe:source,before,after);
    assert.equal(result.status,0,result.stderr);
    const parsed=leerSalida(result.stdout);
    assert.ok(parsed.quantum_stats,'deben informarse estadisticas XI reales');
    if(leermemoria){
      const query=join(dir,'read.xi'),recovered=join(dir,'recovered.rvp');
      writeFileSync(query,generarLecturaMemory());
      const inspect=run('run',query,after,recovered);assert.equal(inspect.status,0,inspect.stderr);
      const reads=inspect.stdout.trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
      const persistent=recuperarEstadoMemory(reads);
      assert.deepEqual(persistent,parsed.estado,'datos Ether diferentes del registro computado');
    }
    return {...parsed,manifest:m};
  }finally{rmSync(dir,{recursive:true,force:true})}
}
function normalizar(L,pos,vel){
  if(pos===0&&vel<0)return {p:pos,v:-vel};
  if(pos===L&&vel>0)return {p:pos,v:-vel};
  return {p:pos,v:vel};
}
function avanzar(L,axis){
  let p=axis.p+axis.v, v=axis.v;
  let safety=0;
  while(p<0||p>L){
    assert.ok(++safety<100000,'stepwise oracle failed to converge');
    if(p<0){p=-p;v=-v;}
    if(p>L){p=2*L-p;v=-v;}
  }
  return normalizar(L,p,v);
}
function gcd(a,b){while(b){const tmp=a%b;a=b;b=tmp}return a}
function ejeOracle(L,axis,t){
  const original=normalizar(L,axis.p,axis.v);
  const period=axis.v===0?1:(2*L)/gcd(2*L,Math.abs(axis.v));
  // A separate per-second collision solver, not XI and not the mirrored formula.
  const times=Number(BigInt(t)%BigInt(period));
  let state=original;
  for(let i=0;i<times;i++)state=avanzar(L,state);
  return {...state,period};
}
export function oracleFisico(config){
  const c=validarSistema(config);
  const p={x:{p:c.x_mm,v:c.vx_mm_s},y:{p:c.y_mm,v:c.vy_mm_s}};
  const first=c.impulso?.at_s??c.horizonte_s;
  let x=ejeOracle(c.ancho_mm,p.x,first),y=ejeOracle(c.alto_mm,p.y,first);
  if(c.impulso){
    x=ejeOracle(c.ancho_mm,normalizar(c.ancho_mm,x.p,x.v+c.impulso.delta_vx_mm_s),
      c.horizonte_s-c.impulso.at_s);
    y=ejeOracle(c.alto_mm,normalizar(c.alto_mm,y.p,y.v+c.impulso.delta_vy_mm_s),
      c.horizonte_s-c.impulso.at_s);
  }
  const vx=x.v,vy=y.v,energy2=c.masa_kg*(vx*vx+vy*vy);
  return {x_mm:x.p,y_mm:y.p,vx_mm_s:vx,vy_mm_s:vy,masa_kg:c.masa_kg,energia_doble:energy2};
}

test('P001 compila cantidades fisicas sin desplegar un billon de segundos',()=>{
 const near=compilarSistema({...escenarioPrueba,horizonte_s:'1'});
 const far=compilarSistema({...escenarioPrueba,horizonte_s:MAX_HORIZON_S.toString()});
 assert.equal(near.configuration.ancho_mm,1500);
 assert.ok(Math.abs(near.xi.length-far.xi.length)<100);
 assert.ok(far.xi.includes('jmp fisica_eje'));
 assert.ok(far.xi.includes('store8 $r5 r6'));
 assert.ok(far.xi.includes('mod r6 r5'));
 assert.ok(!far.xi.includes('mem_reset'));
 assert.equal(far.materialization_bytes,48);
 assert.notEqual(near.xi_sha256,far.xi_sha256);
});
test('P001 rechaza entradas fisicas imposibles, sobreflujo e inyecciones XI',()=>{
 const base={...escenarioPrueba};
 const fails=[
  {...base,ancho_mm:0},{...base,alto_mm:1000001},
  {...base,x_mm:2000},{...base,y_mm:-1},{...base,masa_kg:0},
  {...base,masa_kg:1001},{...base,vx_mm_s:1000001},
  {...base,horizonte_s:'1000000000001'},
  {...base,horizonte_s:'1\nmem_reset 255'},
  {...base,impulso:{instante_s:1000001,delta_vx_mm_s:1,delta_vy_mm_s:0},horizonte_s:100},
  {...base,impulso:{instante_s:1,delta_vx_mm_s:1000000,delta_vy_mm_s:0}},
  {...base,impulso:{instante_s:1,delta_vx_mm_s:'5\nhalt',delta_vy_mm_s:0}}
 ];
 for(const c of fails)assert.throws(()=>compilarSistema(c),'expected invalid physical input rejection');
});
test('P001 exige salida interpretable y 48 bytes de lectura Ether por direccion',()=>{
 assert.throws(()=>leerSalida('{"type":"register","value":1}'),/faltan/);
 assert.throws(()=>leerSalida('not-json'),/JSONL/);
 assert.throws(()=>recuperarEstadoMemory([]),/48/);
 const program=generarLecturaMemory();
 assert.equal(program.match(/^mem_read /gm).length,48);
});
test('la referencia mecanica paso-a-paso recupera energía ideal',()=>{
 const c={...escenarioPrueba,horizonte_s:1234};
 const reference=oracleFisico(c);
 assert.equal(reference.energia_doble,c.masa_kg*(c.vx_mm_s**2+c.vy_mm_s**2));
 assert.ok(reference.x_mm>=0&&reference.x_mm<=c.ancho_mm);
 assert.ok(reference.y_mm>=0&&reference.y_mm<=c.alto_mm);
});
test('P001 XI predice estados 2D y lee exactamente su estado Ether',native,()=>{
 for(const horizon of [0,1,2,9,10,31,100,1000000,1000000000000]){
  const input={...escenarioPrueba,horizonte_s:String(horizon)};
  const observed=ejecutar(input,{rxe:horizon===1000000000000});
  assert.deepEqual(observed.estado,oracleFisico(input),'horizonte '+horizon);
  assert.equal(observed.quantum_stats.clifford_components+observed.quantum_stats.adaptive_components+
    observed.quantum_stats.reduced_components,0);
 }
});
test('P001 choque externo aparece en el futuro y causa divergencia verificable',native,()=>{
 const normal={...escenarioPrueba,horizonte_s:70};
 const altered={...normal,impulso:{instante_s:9,delta_vx_mm_s:5,delta_vy_mm_s:-7}};
 const predicted=ejecutar(normal),reality=ejecutar(altered,{rxe:true});
 assert.deepEqual(predicted.estado,oracleFisico(normal));
 assert.deepEqual(reality.estado,oracleFisico(altered));
 assert.notDeepEqual(predicted.estado,reality.estado,'evento oculto deberia modificar el estado');
 assert.equal(reality.estado.energia_doble,
  altered.masa_kg*(reality.estado.vx_mm_s**2+reality.estado.vy_mm_s**2));
 const earlier={...normal,horizonte_s:8};
 assert.deepEqual(ejecutar(earlier).estado,oracleFisico(earlier),'no debe haber fuga del evento futuro');
});
test('P001 rebotes en paredes, reposo y eventos en t=0 y t=T',native,()=>{
 const variants=[
  {...escenarioPrueba,x_mm:0,vx_mm_s:-13,y_mm:900,vy_mm_s:5,horizonte_s:0},
  {...escenarioPrueba,x_mm:1500,vx_mm_s:13,y_mm:0,vy_mm_s:-8,horizonte_s:1},
  {...escenarioPrueba,x_mm:0,vx_mm_s:0,y_mm:0,vy_mm_s:0,horizonte_s:MAX_HORIZON_S.toString()},
  {...escenarioPrueba,horizonte_s:90,impulso:{instante_s:0,delta_vx_mm_s:-7,delta_vy_mm_s:5}},
  {...escenarioPrueba,horizonte_s:90,impulso:{instante_s:90,delta_vx_mm_s:-7,delta_vy_mm_s:5}},
  {...escenarioPrueba,horizonte_s:MAX_HORIZON_S.toString(),impulso:{
    instante_s:'999999999999',delta_vx_mm_s:-7,delta_vy_mm_s:5}}
 ];
 for(const c of variants)assert.deepEqual(ejecutar(c).estado,oracleFisico(c),JSON.stringify(c));
});
test('P001 integridad y rollback: un opcode inválido no crea estado nuevo',native,()=>{
 const dir=mkdtempSync(join(tmpdir(),'laplace-fisica-rollback-'));
 try{
  const p=compilarSistema(escenarioPrueba),file=join(dir,'fault.xi'),before=join(dir,'init.rvp'),
    after=join(dir,'should-not-exist.rvp');
  writeFileSync(file,p.xi.replace('\nmem_stats\n','\nunknown_physical_command\n'));
  const initialized=run('init',before);assert.equal(initialized.status,0);
  const failure=run('run',file,before,after);
  assert.notEqual(failure.status,0);
  assert.equal(existsSync(after),false);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
