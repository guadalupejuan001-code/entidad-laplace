import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {compilarSalto,leyEjemplo,HORIZONTE_MAX} from '../salto/compilar.mjs';

const bin=process.env.REVERSE_PC_BIN;
const native={skip:bin?false:'REVERSE_PC_BIN no conectado; ejecutar en CI REVERSE'};
const cli=fileURLToPath(new URL('../tools/salto.mjs',import.meta.url));
function oracleNaive(coeff,initial,steps){
  let state=initial;
  for(let t=0;t<steps;t++){
    state=Array.from({length:state.length},(_,output)=>{
      let bit=Number(coeff[0][output]);
      for(let input=0;input<state.length;input++)bit^=Number(coeff[input+1][output])*Number(state[input]);
      return String(bit);
    }).join('');
  }
  return state;
}
function runNative(coeff,initial,steps,{binary=bin,rxe=false}={}){
  const dir=mkdtempSync(join(tmpdir(),'salto-e005-'));
  try{
    const program=compilarSalto({coefficients:coeff,initial,steps});
    const source=join(dir,'salto.xi'),rxefile=join(dir,'salto.rxe');
    const start=join(dir,'start.rvp'),end=join(dir,'end.rvp');
    writeFileSync(source,program.xi);
    const call=(...args)=>spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000});
    if(rxe){const compiled=call('compile',source,rxefile,'Laplace E005');assert.equal(compiled.status,0,compiled.stderr)}
    const initialized=call('init',start);assert.equal(initialized.status,0,initialized.stderr);
    const result=call('run',rxe?rxefile:source,start,end);
    assert.equal(result.status,0,result.stderr+'\n'+result.stdout.slice(0,600));
    const records=result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    const printed=records.filter(x=>x.type==='register');
    assert.equal(printed.length,coeff.length+1,JSON.stringify(records.slice(0,10)));
    const getNumber=x=>x.value??x.integer??x.number;
    const resultBits=printed.slice(0,initial.length).map(x=>String(getNumber(x))).join('');
    const constant=getNumber(printed[initial.length]);
    const multiplies=getNumber(printed.at(-1));
    assert.equal(Number(constant),1,'coordenada constante permanece 1');
    assert.equal(resultBits.length,initial.length);
    assert.ok(Number.isInteger(Number(multiplies)),'falta contador de productos');
    return {resultBits,multiplies:Number(multiplies),records,program};
  }finally{rmSync(dir,{recursive:true,force:true})}
}

test('la entrada E005 solo compila matrices; no expande los instantes del horizonte',()=>{
  const a=compilarSalto({coefficients:leyEjemplo,initial:'1011',steps:'1'});
  const b=compilarSalto({coefficients:leyEjemplo,initial:'1011',steps:'1000000000000'});
  assert.equal(a.width,4);assert.equal(b.width,4);
  assert.ok(Math.abs(a.xi.length-b.xi.length)<100,'crecimiento por digitos del horizonte, no por transiciones');
  assert.ok(b.xi.includes('jmp laplace_multiplicar'));
  assert.ok(b.xi.includes('load8 r7 $r6'));
  assert.ok(b.xi.includes('mod r5 2'));
  assert.ok(!b.xi.includes('mem_reset'));
  assert.equal(b.matrices_almacenadas,3);
  assert.equal(b.bytes_matriz_por_banco,25);
});

test('valida horizonte, coeficientes y estado sin coercion o truncamiento',()=>{
 assert.throws(()=>compilarSalto({coefficients:leyEjemplo,initial:'1',steps:20}),/incompatible/);
 assert.throws(()=>compilarSalto({coefficients:leyEjemplo,initial:'1011',steps:-1}),/horizonte/);
 assert.throws(()=>compilarSalto({coefficients:leyEjemplo,initial:'1011',steps:1.1}),/horizonte/);
 assert.throws(()=>compilarSalto({coefficients:leyEjemplo,initial:'1011',steps:String(HORIZONTE_MAX+1n)}),/máximo/);
 assert.throws(()=>compilarSalto({coefficients:['00','00','1'],initial:'01',steps:2}),/inválida/);
 assert.throws(()=>compilarSalto({coefficients:Array.from({length:11},()=>''.padEnd(10,'0')),initial:'0'.repeat(10),steps:1}),/ancho/);
});

test('el CLI crea XI sin duplicar salidas, con archivo existente protegido',()=>{
 const dir=mkdtempSync(join(tmpdir(),'salto-cli-'));
 try{
  const file=join(dir,'ejemplo.xi');
  const run=()=>spawnSync(process.execPath,[cli,'ejemplo','1000000','1011',file],{encoding:'utf8'});
  assert.equal(run().status,0);
  const src=readFileSync(file,'utf8');assert.match(src,/set r0 1000000/);
  assert.equal(run().status,1);
  assert.equal(readFileSync(file,'utf8'),src);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('REVERSE XI calcula estados correctos con horizonte 0,1,2,3,31',native,()=>{
 for(const horizon of [0,1,2,3,31]){
  const actual=runNative(leyEjemplo,'1011',horizon);
  assert.equal(actual.resultBits,oracleNaive(leyEjemplo,'1011',horizon),'horizonte '+horizon);
  assert.ok(actual.multiplies<=2*(Math.ceil(Math.log2(horizon+1))+1));
 }
});

test('REVERSE ejecuta 1.000.000 de pasos logicos mediante pocos productos',native,()=>{
 const actual=runNative(leyEjemplo,'1011',1000000,{rxe:true});
 assert.equal(actual.resultBits,oracleNaive(leyEjemplo,'1011',1000000));
 assert.ok(actual.multiplies<=40,'potenciacion binaria requiere como máximo 40 productos para millón');
});

test('ley sin cambios, matriz identidad y estado cero no inventan movimiento',native,()=>{
 const identity=['000','100','010','001'];
 for(const initial of ['000','011','101','111']){
  assert.equal(runNative(identity,initial,1000).resultBits,initial);
 }
});

test('resultado XI textual coincide exactamente con el RXE compilado',native,()=>{
 const original=runNative(leyEjemplo,'0101',500);
 const executable=runNative(leyEjemplo,'0101',500,{rxe:true});
 assert.equal(original.resultBits,executable.resultBits);
 assert.equal(original.multiplies,executable.multiplies);
});
