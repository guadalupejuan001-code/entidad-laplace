import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {compilarCosmologia,interpretarCosmos,leerProgramaMemoria,
 decodificarMemoria,valorCientifico} from '../cosmos/lcdm.mjs';
const bin=process.env.REVERSE_PC_BIN;
const native={skip:bin?false:'se necesita REVERSE-PC nativo'};

function run(...args){
 const p=spawnSync(resolve(bin),args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
 assert.equal(p.status,0,p.stderr||p.error?.message||String(p.status));
 return p.stdout;
}
test('P003 resolución fina produce 271 épocas en exactamente 7317 bytes lógicos',()=>{
 const c=compilarCosmologia({detalle:'digitos'});
 assert.equal(c.epoch_count,271);
 assert.equal(c.logical_output_bytes,7317);
 assert.ok(c.xi.includes('mul r2 9'));
 assert.ok(c.xi.includes('add r1 1'));
 assert.ok(c.xi.includes('cmp r1 9'));
 assert.ok(!c.xi.includes('cosmos_digit3'));
 const small=compilarCosmologia({min_exp:-3,max_exp:0,detalle:'digitos'});
 assert.equal(small.epoch_count,28); // 9*3 + the current epoch
 assert.throws(()=>compilarCosmologia({detalle:'ultra-infinito'}),/detalle/);
});
test('P003 compara 271 estados y reconstituye exactamente los registros Ether',native,()=>{
 const dir=mkdtempSync(join(tmpdir(),'p003-fino-'));
 try{
  const c=compilarCosmologia({detalle:'digitos'});
  const src=join(dir,'universe.xi'),origin=join(dir,'before.rvp'),out=join(dir,'after.rvp');
  writeFileSync(src,c.xi);
  run('init',origin);
  const result=interpretarCosmos(run('run',src,origin,out),c);
  assert.equal(result.epochs.length,271);
  assert.ok(result.memory.overrides>0&&result.memory.overrides<=c.logical_output_bytes);
  assert.equal(result.quantum.clifford_components+
    result.quantum.adaptive_components+result.quantum.reduced_components,0);
  let previousA=0,lastT=Infinity,lastH=Infinity;
  for(const e of result.epochs){
   const a=e.a_digit*10**e.a_log10_exponent;
   assert.ok(a>previousA);
   previousA=a;
   const refR=92e-6*a**-4,refM=0.315*a**-3,refL=0.684908;
   const refSum=refR+refM+refL;
   const H=valorCientifico(e.H_mantissa,e.H_exponent);
   const T=valorCientifico(e.T_mantissa,e.T_exponent);
   const E=valorCientifico(e.energy_mantissa,e.energy_exponent);
   const refH=67.4/3.0856775814913673e19*Math.sqrt(refSum);
   const refT=2.7255/a,refE=7.668947767821908e-10*refSum;
   assert.ok(Math.abs(H/refH-1)<0.007,'H(a) at '+a);
   assert.ok(Math.abs(T/refT-1)<0.00002,'T(a) at '+a);
   assert.ok(Math.abs(E/refE-1)<0.002,'E density at '+a);
   assert.ok(H<=lastH&&T<=lastT);
   lastH=H;lastT=T;
  }
  assert.equal(result.epochs.at(-1).a_log10_exponent,0);
  assert.equal(result.epochs.at(-1).a_digit,1);
  const query=join(dir,'read.xi'),readState=join(dir,'read.rvp');
  writeFileSync(query,leerProgramaMemoria(c));
  const restored=decodificarMemoria(run('run',query,out,readState),c);
  assert.deepEqual(restored,result.epochs);
  const epoch=(exp,digit)=>restored.find(x=>x.a_log10_exponent===exp&&x.a_digit===digit);
  assert.ok(epoch(-4,2).radiation_parts_100000>epoch(-4,2).matter_parts_100000);
  assert.ok(epoch(-4,3).radiation_parts_100000<epoch(-4,3).matter_parts_100000);
  assert.ok(epoch(-1,7).vacuum_parts_100000<epoch(-1,7).matter_parts_100000);
  assert.ok(epoch(-1,9).vacuum_parts_100000>epoch(-1,9).matter_parts_100000);
  const temp=valorCientifico(epoch(-4,9).T_mantissa,epoch(-4,9).T_exponent);
  assert.ok(temp>2900&&temp<3100);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
