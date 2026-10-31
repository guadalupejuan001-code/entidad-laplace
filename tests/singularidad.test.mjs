import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {compilarSingularidad,validarSingularidad,interpretarSingularidad,
 leerProgramaMemoria,decodificarMemoria,magnitudLog10,BRANCH_RULES,PLANCK_TIME_S}
 from '../cosmos/singularidad.mjs';

const BIN=process.env.REVERSE_PC_BIN;
const native={skip:BIN?false:'REVERSE_PC_BIN no está conectado en esta etapa'};
const H0=67.4/3.0856775814913673e19,HR=H0*Math.sqrt(92e-6),C=299792458;
const rho0=7.668947767821908e-10;
const expected=k=>({
 H:Math.log10(HR)-2*k,
 T:Math.log10(2.7255)-k,
 energy:Math.log10(rho0*92e-6)-4*k,
 t_rad:-Math.log10(2*HR)+2*k,
 kretschmann:Math.log10(24)+4*(Math.log10(HR)-2*k-Math.log10(C))
});
const logs=e=>Object.fromEntries(['H','T','energy','t_rad','kretschmann'].map(n=>
 [n,magnitudLog10(e[n+'_mantissa'],e[n+'_exponent'])]));
function run(...args){
 const r=spawnSync(resolve(BIN),args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(r.status,0,r.stderr||r.error?.message||String(r.status));
 return r.stdout;
}
function session(config,callback){
 const dir=mkdtempSync(join(tmpdir(),'p004-laplace-'));
 try{
   const manifest=compilarSingularidad(config),src=join(dir,'singularity.xi'),
    start=join(dir,'start.rvp'),end=join(dir,'end.rvp');
   writeFileSync(src,manifest.xi);
   run('init',start);
   const output=interpretarSingularidad(run('run',src,start,end),manifest);
   return callback({dir,src,start,end,manifest,output});
 }finally{rmSync(dir,{recursive:true,force:true})}
}
test('P004 compila un límite clásico a→0 sin inventar el estado t=0',()=>{
 const m=compilarSingularidad();
 assert.equal(m.epoch_count,51);
 assert.equal(m.logical_state_bytes,4896);
 assert.ok(m.xi.includes('label sing_epoch'));
 assert.ok(m.xi.includes('store8 $r13 r15'));
 assert.ok(m.xi.includes('qstats'));
 assert.ok(!m.xi.includes('mem_reset'));
 assert.ok(m.xi.length<20000);
 assert.equal(m.formal_boundary.t_zero,'NOT_A_NUMERICAL_OR_PHYSICAL_STATE');
 assert.equal(m.formal_boundary.classical_density,'diverges_as_a^-4');
});
test('P004 valida los rangos físicos, no acepta inyección ni calcula un cero singular',()=>{
 for(const bad of [{start_exp:0},{end_exp:0},{start_exp:-24},{start_exp:-36},
   {end_exp:-39},{end_exp:-81},{start_exp:-35,end_exp:-30},
   {start_exp:'-30\nmem_reset 255'},{end_exp:-40.5},
   {extra:'whatever'},[],null]){
   assert.throws(()=>validarSingularidad(bad));
 }
});
test('P004 fija la frontera de Planck como criterio de interpretación',()=>{
 assert.equal(PLANCK_TIME_S,5.391247e-44);
 assert.equal(BRANCH_RULES.limit,'a->0+');
 assert.equal(BRANCH_RULES.classical_K,'diverges_as_a^-8');
});
test('P004 XI reproduce H,T,rho,t,K de 51 épocas con referencia independiente',native,()=>{
 session({},({output,manifest})=>{
  assert.equal(output.epochs.length,51);
  assert.ok(output.memory.overrides>0);
  assert.ok(output.memory.overrides<=manifest.logical_state_bytes);
  assert.equal(output.quantum.clifford_components+
    output.quantum.adaptive_components+output.quantum.reduced_components,0);
  for(const epoch of output.epochs){
   const ref=expected(epoch.a_exp),observed=logs(epoch);
   for(const key of Object.keys(ref)){
    assert.ok(Math.abs(ref[key]-observed[key])<0.004,
     'diferencia log10 de '+key+' para a=10^'+epoch.a_exp+
     ' valor='+observed[key]+' referencia='+ref[key]);
   }
   assert.equal(epoch.below_planck_time,
     observed.t_rad<Math.log10(PLANCK_TIME_S)?1:0);
  }
  const at=k=>output.epochs.find(x=>x.a_exp===k);
  assert.equal(at(-31).below_planck_time,0);
  assert.equal(at(-32).below_planck_time,1);
  assert.ok(logs(at(-80)).kretschmann>500);
  assert.ok(logs(at(-80)).t_rad<-80);
 });
});
test('P004 pendiente de divergencia de cada magnitud coincide con la ley simbólica',native,()=>{
 session({},({output})=>{
  const slopes={H:2,T:1,energy:4,t_rad:-2,kretschmann:8};
  for(let i=1;i<output.epochs.length;i++){
   const before=logs(output.epochs[i-1]),after=logs(output.epochs[i]);
   for(const [key,slope] of Object.entries(slopes))
    assert.ok(Math.abs(after[key]-before[key]-slope)<0.00001,
      'ley de potencias errónea: '+key);
  }
 });
});
test('P004 restaura exactamente los 4896 bytes de Inverse Ether Memory',native,()=>{
 session({},({dir,manifest,output,end})=>{
  const read=join(dir,'read.xi'),after=join(dir,'after-read.rvp');
  writeFileSync(read,leerProgramaMemoria(manifest));
  const recovered=decodificarMemoria(run('run',read,end,after),manifest);
  assert.deepEqual(recovered,output.epochs);
 });
});
test('P004 compilado RXE es equivalente a XI y realiza rollback ante error',native,()=>{
 session({start_exp:-30,end_exp:-43},({dir,src,start,output,manifest})=>{
  const rxe=join(dir,'limit.rxe'),done=join(dir,'done.rvp');
  run('compile',src,rxe,'Laplace P004');
  const compiled=interpretarSingularidad(run('run',rxe,start,done),manifest);
  assert.deepEqual(compiled.epochs,output.epochs);
  const file=join(dir,'wrong.xi'),bad=join(dir,'bad.rvp');
  writeFileSync(file,manifest.xi.replace('mem_stats\nqstats\nhalt',
    'mem_stats\nunknown_universe_opcode\nqstats\nhalt'));
  const p=spawnSync(resolve(BIN),['run',file,start,bad],{encoding:'utf8'});
  assert.notEqual(p.status,0);
  assert.equal(existsSync(bad),false);
 });
});
test('P004 las consultas más largas conservan exactamente sus predicciones anteriores',native,()=>{
 let short=[];
 session({start_exp:-30,end_exp:-45},({output})=>short=output.epochs);
 session({start_exp:-30,end_exp:-65},({output})=>
   assert.deepEqual(output.epochs.slice(0,short.length),short));
});
