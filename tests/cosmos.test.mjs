import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 DEFAULT_PARAMETERS,EJEMPLO,compilarCosmologia,validarCosmologia,
 interpretarCosmos,leerProgramaMemoria,decodificarMemoria,valorCientifico
} from '../cosmos/lcdm.mjs';

const binary=process.env.REVERSE_PC_BIN;
const native={skip:binary?false:'REVERSE_PC_BIN requiere el REVERSE real de CI'};
const H0=67.4/3.0856775814913673e19;
const rho0=7.668947767821908e-10;
const close=(a,b,rtol,message)=>assert.ok(
  Number.isFinite(a)&&Number.isFinite(b)&&b!==0&&Math.abs(a/b-1)<=rtol,
  message+': observado='+a+', referencia='+b+', error_rel='+Math.abs(a/b-1));

function run(...args){
 const r=spawnSync(resolve(binary),args,{encoding:'utf8',maxBuffer:6*1024*1024,timeout:120000});
 assert.equal(r.status,0,r.stderr||r.error?.message||String(r.status));
 return r.stdout;
}
function withCosmos(parameters,callback){
 const dir=mkdtempSync(join(tmpdir(),'laplace-cosmos-'));
 try{
  const compiled=compilarCosmologia(parameters),source=join(dir,'expansion.xi');
  const start=join(dir,'base.rvp'),end=join(dir,'universe.rvp');
  writeFileSync(source,compiled.xi);
  run('init',start);
  const output=run('run',source,start,end);
  const analyzed=interpretarCosmos(output,compiled);
  return callback({dir,source,start,end,compiled,analyzed});
 }finally{rmSync(dir,{recursive:true,force:true})}
}
function reference(row,params){
 const a=row.a_digit*10**row.a_log10_exponent;
 const radiation=params.omega_r_micro/1000000*a**-4;
 const matter=params.omega_m_micro/1000000*a**-3;
 const vacuum=params.omega_lambda_micro/1000000;
 const E2=radiation+matter+vacuum;
 return {H:H0*Math.sqrt(E2),T:2.7255/a,energy:rho0*E2,
  hubble_time:1/(H0*Math.sqrt(E2)),
  fractions:[radiation,matter,vacuum].map(v=>100000*v/E2),E2};
}
function resultToPhysical(row){
 const sci=(type)=>valorCientifico(row[type+'_mantissa'],row[type+'_exponent']);
 return {H:sci('H'),T:sci('T'),energy:sci('energy'),
  hubble_time:sci('hubble_time'),
  fractions:[row.radiation_parts_100000,row.matter_parts_100000,row.vacuum_parts_100000]};
}

test('P003 compila 33 estados cósmicos en XI sin representar un universo denso',()=>{
 const a=compilarCosmologia();
 const b=compilarCosmologia({...EJEMPLO,min_exp:-20,max_exp:0});
 assert.equal(a.epoch_count,33);
 assert.equal(a.record_bytes,27);
 assert.equal(a.logical_output_bytes,891);
 assert.ok(a.xi.includes('label cosmos_epoch'));
 assert.ok(a.xi.includes('label cosmos_sqrt'));
 assert.ok(a.xi.includes('mem_stats'));
 assert.ok(a.xi.includes('qstats'));
 assert.ok(!a.xi.includes('mem_reset'));
 assert.ok(a.xi.length<15_000);
 assert.equal(b.epoch_count,23);
 assert.equal(DEFAULT_PARAMETERS.H0_km_s_Mpc,67.4);
 assert.equal(DEFAULT_PARAMETERS.T0_K,2.7255);
});
test('P003 rechaza singularidad, parámetros cosmológicos incoherentes y entradas maliciosas',()=>{
 const invalid=[
  {min_exp:-40},{max_exp:1},{min_exp:0,max_exp:-1},
  {omega_r_micro:0},{omega_r_micro:1000},
  {omega_m_micro:999999},{omega_lambda_micro:0},
  {omega_r_micro:'92\nmem_reset 255'},
  {min_exp:'-30\nhalt'}, {min_exp:1.1}, {bad:'new cosmology'}
 ];
 for(const p of invalid)assert.throws(()=>validarCosmologia(p),'configuracion deberia rechazarse');
});
test('P003 mantisas científicas muestran más de treinta órdenes de expansión',()=>{
 const m=compilarCosmologia();
 assert.match(m.xi,/set r0 -30/);
 assert.match(m.xi,/set r1 1/);
 assert.match(m.xi,/cmp r0 -4/);
 assert.equal(m.configuration.omega_r_micro+m.configuration.omega_m_micro+
   m.configuration.omega_lambda_micro,1_000_000);
 assert.equal(m.configuration.max_exp,0);
 assert.equal(m.configuration.min_exp,-30);
});
test('XI calcula H, temperatura y densidad energética contra Friedmann independiente',native,()=>{
 withCosmos(EJEMPLO,({analyzed,compiled})=>{
   assert.equal(analyzed.epochs.length,33);
   const dates=new Set();
   let lastT=Infinity,lastH=Infinity,lastDensity=Infinity;
   for(const e of analyzed.epochs){
     const key=e.a_digit+'e'+e.a_log10_exponent;
     assert.ok(!dates.has(key),'escala repetida: '+key);
     dates.add(key);
     const o=resultToPhysical(e),r=reference(e,compiled.configuration);
     close(o.H,r.H,0.003,'H(a) '+key);
     close(o.T,r.T,0.0001,'T(a) '+key);
     close(o.energy,r.energy,0.002,'rho c² '+key);
     close(o.hubble_time,r.hubble_time,0.003,'1/H '+key);
     for(let component=0;component<3;component++){
       assert.ok(Math.abs(o.fractions[component]-r.fractions[component])<35,
         'fracciones '+key+' '+component+' xi='+o.fractions[component]+' ref='+r.fractions[component]);
     }
     assert.ok(Math.abs(o.fractions.reduce((a,b)=>a+b,0)-100000)<=35);
     assert.ok(o.T<=lastT && o.H<=lastH && o.energy<=lastDensity,
       'el universo no se enfría/expande monotonicamente '+key);
     lastT=o.T;lastH=o.H;lastDensity=o.energy;
   }
   assert.equal(analyzed.quantum.clifford_components+
     analyzed.quantum.adaptive_components+analyzed.quantum.reduced_components,0);
   assert.ok(analyzed.memory.overrides>0);
   assert.ok(analyzed.memory.overrides<=compiled.logical_output_bytes);
 });
});
test('P003 recupera los 891 bytes de Inverse Ether Memory sin pérdida',native,()=>{
 withCosmos(EJEMPLO,({dir,end,analyzed,compiled})=>{
  const query=join(dir,'read.xi'),snapshot=join(dir,'read.rvp');
  writeFileSync(query,leerProgramaMemoria(compiled));
  const observed=run('run',query,end,snapshot);
  assert.deepEqual(decodificarMemoria(observed,compiled),analyzed.epochs);
 });
});
test('P003 alcanza igualdad radiación/materia y escala térmica ~3000 K',native,()=>{
 withCosmos(EJEMPLO,({analyzed})=>{
  const at=(k,d)=>analyzed.epochs.find(x=>x.a_log10_exponent===k&&x.a_digit===d);
  const early=at(-30,1),now=at(0,1),rad=at(-4,1),eq=at(-4,3),cmb=at(-4,9);
  assert.ok(early&&now&&rad&&eq&&cmb);
  assert.ok(rad.radiation_parts_100000>rad.matter_parts_100000);
  assert.ok(eq.radiation_parts_100000<eq.matter_parts_100000);
  assert.ok(now.vacuum_parts_100000>now.matter_parts_100000);
  assert.ok(now.matter_parts_100000>now.radiation_parts_100000);
  close(resultToPhysical(now).T,2.7255,0.0001,'CMB actual');
  close(resultToPhysical(cmb).T,3028.333333333333,0.0001,'Temperatura de epoch recomb approximate');
  assert.ok(resultToPhysical(early).energy>1e100);
  assert.ok(resultToPhysical(early).H>1e39);
  assert.ok(resultToPhysical(now).hubble_time>4e17);
 });
});
test('P003 escenario alternativo produce cambios reales de H(a), mismo H0 presente',native,()=>{
 const shifted={omega_r_micro:120,omega_m_micro:350000,omega_lambda_micro:649880,
   min_exp:-6,max_exp:0};
 withCosmos(shifted,({analyzed})=>{
  assert.equal(analyzed.epochs.length,9);
  for(const e of analyzed.epochs){
   const o=resultToPhysical(e),r=reference(e,shifted);
   close(o.H,r.H,0.005,'cosmología parametrizada');
  }
  close(resultToPhysical(analyzed.epochs.at(-1)).H,H0,0.00001,'H0 de universo plano');
 });
});
test('P003 equivalencia bytecode RXE y XI y rechazo transaccional',native,()=>{
 withCosmos({min_exp:-10,max_exp:-1},({dir,source,start,compiled,analyzed})=>{
   const rxe=join(dir,'cosmos.rxe'),end=join(dir,'cosmos-rxe.rvp');
   run('compile',source,rxe,'LAPLACE P003 COSMOS');
   const x=interpretarCosmos(run('run',rxe,start,end),compiled);
   assert.deepEqual(x.epochs,analyzed.epochs);
   const corrupted=join(dir,'corrupt.xi'),bad=join(dir,'must-not-exist.rvp');
   writeFileSync(corrupted,compiled.xi.replace('mem_stats\nqstats\nhalt',
     'mem_stats\nbroken_causality_command\nqstats\nhalt'));
   const p=spawnSync(resolve(binary),['run',corrupted,start,bad],{encoding:'utf8'});
   assert.notEqual(p.status,0,'programa inválido indebidamente aceptado');
   assert.equal(existsSync(bad),false,'rollback no evitó persistencia');
 });
});
