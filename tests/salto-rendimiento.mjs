// Controlled same-engine comparison: XI step-by-step vs XI fast exponentiation.
// Both run inside the identical REVERSE-PC QuantumRuntime with InverseMemory.
// Startup/restore costs are included in all measurements. No hardware-Q speedup claim.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {compilarSalto,leyEjemplo} from '../salto/compilar.mjs';

const binary=process.argv[2]||process.env.REVERSE_PC_BIN,output=process.argv[3];
if(!binary||!output)throw Error('uso: node tests/salto-rendimiento.mjs /ruta/reverse_pc resultado.json');
const work=mkdtempSync(join(tmpdir(),'laplace-e005-bench-'));
const STATE=7000000000600000n,TEMP=7000000000700000n,COEFF=7000000000800000n,CONST=7000000000900000n;
const initial='1011',width=initial.length;
function baselineXI(coeff,state,h){
 const src=['#!reverse-pc-machine-v1',
 '# Baseline 1 transicion por paso, SOLO XI/Inverse Ether Memory',
 '# Misma ley y entrada que salto/nucleo.xi'];
 for(let o=0;o<width;o++){
   src.push('store8 '+(CONST+BigInt(o))+' '+coeff[0][o]);
   for(let j=0;j<width;j++)src.push('store8 '+(COEFF+BigInt(o*width+j))+' '+coeff[j+1][o]);
   src.push('store8 '+(STATE+BigInt(o))+' '+state[o]);
 }
 src.push('set r0 '+h,'set r1 '+width,
 'label baseline_t','cmp r0 0','je baseline_final',
 'set r2 0','label baseline_out','cmp r2 r1','jge baseline_commit',
 'set r3 0','set r5 0','label baseline_inner','cmp r3 r1','jge baseline_store',
 'mov r6 r2','mul r6 r1','add r6 r3','add r6 '+COEFF,'load8 r7 $r6',
 'mov r8 r3','add r8 '+STATE,'load8 r9 $r8','mul r7 r9','add r5 r7',
 'add r3 1','jmp baseline_inner',
 'label baseline_store','mov r6 r2','add r6 '+CONST,'load8 r7 $r6',
 'add r5 r7','mod r5 2','mov r8 r2','add r8 '+TEMP,'store8 $r8 r5',
 'add r2 1','jmp baseline_out',
 'label baseline_commit','set r2 0','label baseline_copy',
 'cmp r2 r1','jge baseline_next',
 'mov r6 r2','add r6 '+TEMP,'load8 r7 $r6',
 'mov r8 r2','add r8 '+STATE,'store8 $r8 r7',
 'add r2 1','jmp baseline_copy',
 'label baseline_next','sub r0 1','jmp baseline_t',
 'label baseline_final','set r2 0','label baseline_read',
 'cmp r2 r1','jge baseline_exit',
 'mov r6 r2','add r6 '+STATE,'load8 r7 $r6','print r7',
 'add r2 1','jmp baseline_read',
 'label baseline_exit','mem_stats','qstats','halt');
 return src.join('\n')+'\n';
}
function call(args){
 const r=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:180000,maxBuffer:3*1024*1024});
 if(r.status!==0)throw Error('runtime failed: '+(r.stderr||r.error?.message||r.status).slice(-1000));
 return r;
}
function readResults(raw){
 const rows=raw.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const registers=rows.filter(x=>x.type==='register');
 return {state:registers.slice(0,width).map(x=>String(x.value)).join(''),
   memory:rows.find(x=>x.type==='memory_stats'),
   core:rows.find(x=>x.type==='quantum_stats'),
   matrix_products:registers.length===width+2?registers.at(-1).value:null};
}
function median(numbers){const a=[...numbers].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function runMode(src,name,origin,{samples=3}={}){
 const file=join(work,name+'.xi');writeFileSync(file,src);
 const wall=[],rss=[],all=[];
 for(let rep=-1;rep<samples;rep++){
   const after=join(work,name+'-'+rep+'.rvp');
   const stat=join(work,name+'-'+rep+'.txt');
   const args=['-f','%M','-o',stat,resolve(binary),'run',file,origin,after];
   const start=performance.now();
   const response=spawnSync('/usr/bin/time',args,{encoding:'utf8',timeout:180000,maxBuffer:3*1024*1024});
   if(response.status!==0)throw Error(name+': '+(response.stderr||response.error?.message||'exit '+response.status).slice(-900));
   const result=readResults(response.stdout);
   assert.equal(result.state,'1011','unexpected unverified result');
   assert.equal(result.core.clifford_components+result.core.adaptive_components+result.core.reduced_components,0);
   if(rep>=0){
     wall.push(Math.round((performance.now()-start)*1000)/1000);
     const peak=Number(readFileSync(stat,'utf8').trim());
     assert.ok(Number.isFinite(peak)&&peak>0,'missing Linux peak RSS');
     rss.push(peak);
     all.push(result);
   }
 }
 return {mode:name,wall_ms_median:median(wall),wall_ms_samples:wall,
   peak_rss_kib_median:median(rss),peak_rss_kib_samples:rss,
   inverse_memory_overrides:all[0].memory.overrides,
   matrix_products:all[0].matrix_products,program_bytes:Buffer.byteLength(src)};
}
const result={schema:'laplace-e005-controlled-benchmark-v1',system:'REVERSE-PC XI/InverseMemory',
 metric:'elapsed wall including executable startup and snapshot restore; Linux /usr/bin/time maximum RSS',
 hardware:'GitHub Actions runner; not Galaxy A16',law:leyEjemplo,initial,
 repetitions:3,cases:[],warnings:['No energy measured. No speedup attributed to quantum hardware.',
 'The naive algorithm and matrix composer are different XI programs on the same runtime.',
 'Elapsed time includes cold process start and serialization.']};
try{
 const origin=join(work,'start.rvp');call(['init',origin]);
 const horizons=[8,64,256,1024];
 for(const h of horizons){
   const fast=runMode(compilarSalto({coefficients:leyEjemplo,initial,steps:h}).xi,'fast-'+h,origin);
   const naive=runMode(baselineXI(leyEjemplo,initial,h),'linear-'+h,origin);
   result.cases.push({horizon:h,fast,linear:naive,
     observed_speedup:Math.round((naive.wall_ms_median/fast.wall_ms_median)*1000)/1000,
     rss_ratio:Math.round((naive.peak_rss_kib_median/fast.peak_rss_kib_median)*1000)/1000});
 }
 const h=1000000;
 const million=runMode(compilarSalto({coefficients:leyEjemplo,initial,steps:h}).xi,'fast-'+h,origin);
 result.large_horizon={horizon:h,fast:million,linear_not_run:true,
   reason:'A million literal XI transitions would exceed the fixed machine instruction budget; no direct speedup measurement.'};
}finally{
 mkdirSync(dirname(output),{recursive:true});
 writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 rmSync(work,{recursive:true,force:true});
}
console.log(JSON.stringify({suite:result.schema,cases:result.cases.map(x=>({
 horizon:x.horizon,speedup:x.observed_speedup,fast_ms:x.fast.wall_ms_median,naive_ms:x.linear.wall_ms_median,
 fast_rss_kib:x.fast.peak_rss_kib_median,naive_rss_kib:x.linear.peak_rss_kib_median
 })),million:result.large_horizon.fast.wall_ms_median},null,2));
