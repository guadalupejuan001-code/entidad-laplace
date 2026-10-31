import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {
 DEFAULT,EJEMPLO,compilarMegaceldas,validarExperimento,
 leerResultado,programaLecturaResultados,verificarResultadosPersistidos,
 posicionesEjemplo,MAX_QUERIES,STATE_ADDRESSES
} from '../escala/compilar.mjs';

const binary=process.env.REVERSE_PC_BIN;
const native={skip:binary?false:'CI requiere REVERSE-PC original'};
function call(...args){
 const p=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000,maxBuffer:7*1024*1024});
 assert.equal(p.status,0,(p.stderr||p.error?.message||String(p.status)).slice(-1200));
 return p.stdout;
}
function runModel(config,{rxe=false,readMemory=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'p005-exabyte-'));
 try{
  const manifest=compilarMegaceldas(config);
  const src=join(dir,'world.xi'),exe=join(dir,'world.rxe'),
    base=join(dir,'base.rvp'),out=join(dir,'out.rvp');
  writeFileSync(src,manifest.xi);
  call('init',base);
  if(rxe)call('compile',src,exe,'LAPLACE P005 EXABYTE');
  const result=leerResultado(call('run',rxe?exe:src,base,out),manifest);
  if(readMemory){
    const query=join(dir,'read.xi'),after=join(dir,'read.rvp');
    writeFileSync(query,programaLecturaResultados(manifest));
    const read=call('run',query,out,after);
    assert.ok(verificarResultadosPersistidos(read,result),
      'bits persistidos en Ether diferentes de registros XI');
  }
  return {manifest,result};
 }finally{rmSync(dir,{recursive:true,force:true})}
}
function naiveRing({cell_bits,seed_count,steps}){
 const n=2**cell_bits,spacing=n/seed_count;
 let grid=new Uint8Array(n);
 for(let s=0;s<seed_count;s++)grid[s*spacing]=1;
 for(let i=0;i<Number(steps);i++){
   const next=new Uint8Array(n);
   for(let cell=0;cell<n;cell++)
     next[cell]=grid[(cell+n-1)%n]^grid[(cell+1)%n];
   grid=next;
 }
 return grid;
}
function bigLucasOracle(m){
 const n=BigInt(m.logical_cells),t=BigInt(m.settings.steps),
   half=n/2n,seeds=m.source_seed_positions.map(BigInt);
 const expected=[];
 for(const qstr of m.queries){
  const q=BigInt(qstr);
  let parity=0;
  for(const s of seeds){
   let diff=q-s;
   if(diff>=half)diff-=n;
   if(diff< -half)diff+=n;
   const u=t+diff;
   if(u<0n||u>2n*t||u%2n!==0n)continue;
   const k=u/2n;
   if((k & ~t)===0n)parity^=1;
  }
  expected.push(parity);
 }
 let pop=0;
 for(let i=t;i>0n;i>>=1n)if(i&1n)pop++;
 const total=BigInt(m.settings.seed_count)*(1n<<BigInt(pop));
 return {expected,total};
}
test('P005 fuente XI no materializa exabyte ni itera 10^15 pasos',()=>{
 const c=compilarMegaceldas(EJEMPLO);
 assert.equal(c.logical_cells,'1152921504606846976');
 assert.equal(c.dense_bitpacked_bytes,'144115188075855872');
 assert.equal(c.settings.seed_count,16);
 assert.equal(c.settings.query_count,224);
 assert.equal(c.schema,'LAPLACE_P005_RULE90_EXABYTE_XI');
 assert.ok(c.xi.includes('label exa_lucas'));
 assert.ok(c.xi.includes('label exa_population'));
 assert.ok(c.xi.includes('load8 r14 $r14'));
 assert.ok(c.xi.includes('store8 $r14 r5'));
 assert.ok(!c.xi.includes('mem_reset'));
 assert.ok(c.xi.length<1024*1024);
 assert.ok(c.queries.every(x=>/^[0-9]+$/.test(x)));
 assert.ok(BigInt(c.settings.steps)>1000000000000000n);
});
test('P005 protege rangos, presupuesto y entradas grandes',()=>{
 const base={...DEFAULT,queries:['0']};
 for(const scenario of [
   {...base,cell_bits:61}, {...base,cell_bits:7},
   {...base,seed_count:3}, {...base,seed_count:17},
   {...base,steps:'1125899906842624'},
   {...base,steps:'123\nhalt'},
   {...base,queries:['1152921504606846976']},
   {...base,queries:[]},
   {...base,queries:Array.from({length:MAX_QUERIES+1},()=> '0')},
   {...base,steps:5}, // deliberately requires exact decimal STRING for >2^53 only; this one accepted
   {...base,bad:'arbitrary'},
   {...base,steps:'1125899906842623'}
 ]) {
  if(scenario.steps===5)assert.doesNotThrow(()=>compilarMegaceldas(scenario));
  else assert.throws(()=>compilarMegaceldas(scenario));
 }
 const overlap={cell_bits:8,seed_count:4,steps:'32',queries:['0']};
 assert.throws(()=>compilarMegaceldas(overlap),/disjuntos/);
 const expensive={cell_bits:60,seed_count:16,
   steps:((1n<<50n)-1n).toString(),queries:['0']};
 assert.throws(()=>compilarMegaceldas(expensive),/JSON seguros/);
 assert.deepEqual(posicionesEjemplo(DEFAULT),EJEMPLO.queries);
});
test('P005 formato de salida no confunde una coordenada >2^53 con Number',()=>{
 const c=compilarMegaceldas({...DEFAULT,queries:['0','1152921504606846975']});
 assert.ok(c.queries.at(-1).length>16);
 assert.throws(()=>leerResultado('[]',c));
 assert.throws(()=>verificarResultadosPersistidos('',{schema:c.schema,queries:[{bit:1}]}));
 assert.notEqual(STATE_ADDRESSES.field_base,STATE_ADDRESSES.queries_base);
});
test('P005 XI coincide bit a bit con evolución densa y conteo directo',native,()=>{
 for(const t of [0,1,3,7,13,25]){
  const options={cell_bits:8,seed_count:4,steps:String(t),
    queries:Array.from({length:256},(_,i)=>String(i))};
  const {result}=runModel(options,{rxe:t===25});
  const brute=naiveRing(options);
  for(let i=0;i<brute.length;i++)assert.equal(result.queries[i].bit,brute[i],
    'divergencia en t='+t+' celda '+i);
  assert.equal(result.active_cells,brute.reduce((a,b)=>a+b,0),
    'población errónea t='+t);
  assert.equal(result.quantum_stats.clifford_components+
    result.quantum_stats.adaptive_components+
    result.quantum_stats.reduced_components,0);
 }
});
test('P005 exabyte exacto: 224 consultas y población global en XI vs Lucas independiente',native,()=>{
 const {manifest,result}=runModel(EJEMPLO,{rxe:true});
 const reference=bigLucasOracle(manifest);
 assert.deepEqual(result.queries.map(x=>x.bit),reference.expected);
 assert.equal(result.active_cells,Number(reference.total));
 assert.equal(result.active_cells,2251799813685248);
 assert.equal(result.memory_stats.model,'inverse-ether-memory');
 assert.ok(result.memory_stats.overrides>0);
 assert.ok(result.memory_stats.overrides<2500);
 const ones=result.queries.filter(x=>x.bit===1).length;
 const zeros=result.queries.length-ones;
 assert.ok(ones>30&&zeros>30,'la prueba debe incluir posiciones encendidas y apagadas');
});
test('P005 XI fuente y RXE binario ofrecen el mismo resultado de exabyte',native,()=>{
 const options={...DEFAULT,queries:EJEMPLO.queries.slice(0,48)};
 const raw=runModel(options,{rxe:false,readMemory:false});
 const bin=runModel(options,{rxe:true,readMemory:false});
 assert.deepEqual(bin.result.queries,raw.result.queries);
 assert.equal(bin.result.active_cells,raw.result.active_cells);
});
test('P005 REVERSE no guarda un resultado cuando el programa tiene un opcode inválido',native,()=>{
 const dir=mkdtempSync(join(tmpdir(),'p005-rollback-'));
 try{
  const sample=compilarMegaceldas({...DEFAULT,queries:['0']});
  const source=join(dir,'invalid.xi'),start=join(dir,'start.rvp'),
    output=join(dir,'should-not-exist.rvp');
  writeFileSync(source,sample.xi.replace('\nmem_stats\n',
    '\nunknown_exabyte_command\n'));
  call('init',start);
  const result=spawnSync(resolve(binary),['run',source,start,output],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.equal(existsSync(output),false);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
