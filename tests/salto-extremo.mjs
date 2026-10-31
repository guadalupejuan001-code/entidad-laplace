// E005 adversarial regression: real REVERSE/XI, independently enumerated state cycles.
// This file tests the implementation; it does not replace its XI predictive engine.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {compilarSalto,ANCHO_MAX,HORIZONTE_MAX} from '../salto/compilar.mjs';

const bin=process.argv[2]||process.env.REVERSE_PC_BIN;
const reportFile=process.argv[3];
if(!bin||!reportFile)throw Error('uso: node tests/salto-extremo.mjs /ruta/reverse_pc resultado.json');
const work=mkdtempSync(join(tmpdir(),'laplace-e005-stress-'));
const startedAt=new Date().toISOString();
let seed=0xE0052026;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
const randBits=w=>Array.from({length:w},()=>String((rand()>>>9)&1)).join('');
const law=w=>Array.from({length:w+1},()=>randBits(w));
const need=(condition,message)=>assert.ok(condition,message);
const oracleStep=(coeff,state)=>{
  return Array.from({length:state.length},(_,out)=>{
    let bit=Number(coeff[0][out]);
    for(let j=0;j<state.length;j++)bit^=Number(coeff[j+1][out])*Number(state[j]);
    return String(bit);
  }).join('');
};
// Independent reference: enumerate the finite-state graph, detect a cycle,
// and choose the future state modulo the cycle length. No matrix powers here.
function oracleCycle(coeff,initial,h){
  const seen=new Map(),path=[];let state=initial;
  while(!seen.has(state)){
    need(path.length<(1<<initial.length)+1,'cycle oracle exceeded finite-state cardinality');
    seen.set(state,path.length);path.push(state);state=oracleStep(coeff,state);
  }
  const start=seen.get(state),period=path.length-start;
  const index=h<BigInt(path.length)?Number(h):
    start+Number((h-BigInt(start))%BigInt(period));
  return {state:path[index],preperiod:start,period,visited:path.length};
}
function call(args,{maxMs=100000}={}){
 const then=performance.now(),r=spawnSync(resolve(bin),args,{encoding:'utf8',timeout:maxMs,maxBuffer:3*1024*1024});
 return {exit:r.status,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message||null,elapsed_ms:Math.round((performance.now()-then)*1000)/1000};
}
function parseRun(output,width,steps){
 const rows=output.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const printed=rows.filter(x=>x.type==='register');
 assert.equal(printed.length,width+2,'expected state bits, one fixed coordinate, and multiplication counter');
 const nums=printed.map(x=>x.value??x.number??x.integer);
 need(nums.every(Number.isSafeInteger),'unexpected register results');
 const bits=nums.slice(0,width).join('');
 assert.match(bits,new RegExp('^[01]{'+width+'}$'));
 assert.equal(nums[width],1,'affine augmented coordinate must remain constant');
 const expectedMultiplications=steps===0n?0:
   steps.toString(2).replace(/0/g,'').length+steps.toString(2).length-1;
 assert.equal(nums.at(-1),expectedMultiplications,'wrong power decomposition / product count');
 const mem=rows.filter(x=>x.type==='memory_stats');
 const core=rows.filter(x=>x.type==='quantum_stats');
 assert.equal(mem.length,1);
 assert.equal(core.length,1);
 const quantumComponents=core[0].clifford_components+core[0].adaptive_components+core[0].reduced_components;
 assert.equal(quantumComponents,0,'affine forecast must not materialize quantum components');
 need(mem[0].overrides <= 3*(width+1)**2+3*(width+1),'logical state storage exceeds the fixed matrix and vectors');
 return {bits,multiplies:nums.at(-1),memory_overrides:mem[0].overrides,
   quantum_components:quantumComponents,quantum_payload_bytes:core[0].payload_bytes};
}
const report={schema:'laplace-E005-adversarial-v1',as_of:startedAt,runtime:'REVERSE-PC / XI Machine / Inverse Ether Memory',
  reference:'independent finite-state cycle enumerator',random_seed:'0xE0052026',
  cases:[],passed:0,failed:0,failures:[],validation:null};
try{
 const base=join(work,'base.rvp');
 const init=call(['init',base]);assert.equal(init.exit,0,init.stderr);
 let id=0;
 function runCase(width,coeff,initial,h,{rxe=false}={}){
  const label='case-'+String(++id).padStart(3,'0'),file=join(work,label+'.xi');
  const compiled=compilarSalto({coefficients:coeff,initial,steps:h.toString()});
  writeFileSync(file,compiled.xi);
  let source=file;
  if(rxe){
    source=join(work,label+'.rxe');
    const build=call(['compile',file,source,'Laplace stress']);
    assert.equal(build.exit,0,build.stderr);
  }
  const result=call(['run',source,base,join(work,label+'.rvp')],{maxMs:100000});
  if(result.exit!==0)throw Error(label+' w='+width+' h='+h+' runtime='+result.exit+' '+result.stderr.slice(-900)+' '+String(result.error));
  const actual=parseRun(result.stdout,width,h),expected=oracleCycle(coeff,initial,h);
  assert.equal(actual.bits,expected.state,label+' does not agree with independent cycle oracle');
  report.cases.push({label,width,horizon:h.toString(),compiled_rxe:rxe,correct:true,
    oracle_period:expected.period,oracle_preperiod:expected.preperiod,
    xi_source_bytes:Buffer.byteLength(compiled.xi),duration_ms:result.elapsed_ms,...actual});
  report.passed++;
 }
 const horizons=[0n,1n,2n,3n,31n,1000000n,1000000000000n];
 for(let w=1;w<=ANCHO_MAX;w++){
   // One unique random law per horizon, across all supported bit widths.
   for(const h of horizons){
     const coeff=law(w),initial=randBits(w);
     try{runCase(w,coeff,initial,h,{rxe:h===HORIZONTE_MAX})}
     catch(error){report.failed++;report.failures.push({width:w,horizon:h.toString(),message:String(error.message)});}
   }
 }
 for(let w=1;w<=ANCHO_MAX;w++){
   const identities=['0'.repeat(w),...Array.from({length:w},(_,j)=>
     '0'.repeat(j)+'1'+'0'.repeat(w-j-1))];
   const zeros=Array.from({length:w+1},()=> '0'.repeat(w));
   const allOnes=Array.from({length:w+1},()=> '1'.repeat(w));
   for(const [variant,coeff] of [['identity',identities],['constant-zero',zeros],['all-ones',allOnes]]){
     const h=HORIZONTE_MAX,initial=randBits(w);
     try{runCase(w,coeff,initial,h)}
     catch(error){report.failed++;report.failures.push({width:w,horizon:h.toString(),variant,message:String(error.message)});}
   }
 }
 for(let i=0;i<12;i++){
   const w=1+(rand()%ANCHO_MAX),h=(BigInt(rand())*BigInt(rand()%200000+1))%(HORIZONTE_MAX+1n);
   try{runCase(w,law(w),randBits(w),h,{rxe:(i%4===0)})}
   catch(error){report.failed++;report.failures.push({width:w,horizon:h.toString(),kind:'random',message:String(error.message)});}
 }
 // Input isolation: reject a newline in metadata before it can become executable XI.
 const injected={coefficients:['0','1'],initial:'1',steps:2,
   modelo_sha256:'document\nmem_reset 255\n'};
 try{
   assert.throws(()=>compilarSalto(injected),/modelo|identificador|sha|procedencia/i);
   report.validation={metadata_injection_rejected:true};
 }catch(error){report.failed++;report.failures.push({kind:'metadata-injection',message:error.message});report.validation={metadata_injection_rejected:false};}
 // Atomic REVERSE persistence: a program with a bad opcode must not publish an output.
 const good=compilarSalto({coefficients:['0','1'],initial:'1',steps:10});
 const faulty=join(work,'invalid.xi'),failedState=join(work,'must-not-exist.rvp');
 writeFileSync(faulty,good.xi.replace('\nmem_stats\n','\ncommand_invalid_for_rollback\n'));
 const faultyRun=call(['run',faulty,base,failedState]);
 try{
   need(faultyRun.exit!==0,'malformed program accepted');
   need(!existsSync(failedState),'transaction saved corrupted state');
   report.validation={...report.validation,rejected_program_rollback:true};
 }catch(error){report.failed++;report.failures.push({kind:'rollback',message:error.message});report.validation={...report.validation,rejected_program_rollback:false};}
}finally{
 report.total=report.passed+report.failed;report.completed_at=new Date().toISOString();
 report.summary={coverage_widths:'1..8',max_horizon:HORIZONTE_MAX.toString(),
  max_observed_xi_ms:Math.max(0,...report.cases.map(x=>x.duration_ms)),
  max_memory_overrides:Math.max(0,...report.cases.map(x=>x.memory_overrides)),
  all_native_xi_true:report.failed===0};
 mkdirSync(join(reportFile,'..'),{recursive:true});
 writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
 rmSync(work,{recursive:true,force:true});
}
console.log(JSON.stringify({suite:report.schema,passed:report.passed,failed:report.failed,total:report.total,
  max_horizon:report.summary.max_horizon,max_ms:report.summary.max_observed_xi_ms,failures:report.failures.slice(0,6)}));
if(report.failed)process.exitCode=1;
