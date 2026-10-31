/**
 * Stress P004 through the ORIGINAL XI executor. 128 bounded singular
 * approaches, with independently calculated log10 of all observables.
 * No imaginary observation at t=0 or beyond the Planck scale is claimed.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {compilarSingularidad,interpretarSingularidad,magnitudLog10,PLANCK_TIME_S}
  from '../cosmos/singularidad.mjs';
const [,,bin,file]=process.argv;
if(!bin||!file)throw Error('uso: node tests/singularidad-extremo.mjs REVERSE_PC_BIN RESULT.json');
const folder=mkdtempSync(join(tmpdir(),'laplace-p004-stress-'));
const result={schema:'LAPLACE_P004_STRESS',cases:128,passed:0,failed:0,
 states_checked:0,first_failure:null,peak_log10_curvature:null,
 max_log10_error:{H:0,T:0,energy:0,t_rad:0,kretschmann:0},
 elapsed_ms:[],rss_kib:[]};
const Hrad=67.4/3.0856775814913673e19*Math.sqrt(92e-6);
const rho0=7.668947767821908e-10*92e-6,c=299792458;
function expected(k){
 return {H:Math.log10(Hrad)-2*k,T:Math.log10(2.7255)-k,
 energy:Math.log10(rho0)-4*k,
 t_rad:-Math.log10(2*Hrad)+2*k,
 kretschmann:Math.log10(24)+4*(Math.log10(Hrad)-2*k-Math.log10(c))};
}
const call=(...args)=>{
 const t=performance.now();
 const p=spawnSync(resolve(bin),args,{encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
 return {...p,wall_ms:Math.round((performance.now()-t)*1000)/1000};
};
try{
 for(let i=0;i<result.cases;i++){
  const p=compilarSingularidad({start_exp:-25-i%11,end_exp:-40-i%41});
  const code=join(folder,'case-'+i+'.xi'),a=join(folder,'a-'+i+'.rvp'),b=join(folder,'b-'+i+'.rvp');
  try{
   writeFileSync(code,p.xi);
   assert.equal(call('init',a).status,0);
   const run=call('run',code,a,b);
   assert.equal(run.status,0,run.stderr||run.error?.message||'XI error');
   const output=interpretarSingularidad(run.stdout,p);
   assert.equal(output.epochs.length,p.epoch_count);
   assert.ok(output.memory.overrides>0&&output.memory.overrides<=p.logical_state_bytes);
   result.elapsed_ms.push(run.wall_ms);
   for(const e of output.epochs){
    const theoretical=expected(e.a_exp);
    for(const field of Object.keys(theoretical)){
      const actual=magnitudLog10(e[field+'_mantissa'],e[field+'_exponent']);
      const err=Math.abs(actual-theoretical[field]);
      result.max_log10_error[field]=Math.max(result.max_log10_error[field],err);
      assert.ok(err<0.005,'error de '+field+' en a=1e'+e.a_exp+' '+err);
    }
    const age=magnitudLog10(e.t_rad_mantissa,e.t_rad_exponent);
    assert.equal(e.below_planck_time,age<Math.log10(PLANCK_TIME_S)?1:0);
    const k=magnitudLog10(e.kretschmann_mantissa,e.kretschmann_exponent);
    result.peak_log10_curvature=Math.max(result.peak_log10_curvature??-Infinity,k);
    result.states_checked++;
   }
   result.passed++;
  }catch(error){
   result.failed++;
   if(!result.first_failure)result.first_failure={case:i,options:p.options,error:String(error.message)};
   break;
  }
 }
 if(result.failed===0){
  // Three true peak resident memory samples (Linux), NOT logical Ether bytes.
  const m=compilarSingularidad(),code=join(folder,'profile.xi'),start=join(folder,'start.rvp');
  writeFileSync(code,m.xi);assert.equal(call('init',start).status,0);
  for(let j=0;j<3;j++){
   const stats=join(folder,'rss-'+j+'.txt'),out=join(folder,'profile-'+j+'.rvp');
   const p=spawnSync('/usr/bin/time',['-f','%M','-o',stats,resolve(bin),
     'run',code,start,out],{encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
   assert.equal(p.status,0,p.stderr||p.error?.message||String(p.status));
   const value=Number(readFileSync(stats,'utf8').trim());
   assert.ok(Number.isFinite(value)&&value>0);
   result.rss_kib.push(value);
  }
 }
}finally{
 result.passed_all=result.failed===0&&result.passed===result.cases;
 const arr=[...result.elapsed_ms].sort((a,b)=>a-b);
 result.median_runtime_ms=arr.length?arr[Math.floor(arr.length/2)]:null;
 const rss=[...result.rss_kib].sort((a,b)=>a-b);
 result.median_rss_kib=rss.length?rss[1]:null;
 mkdirSync(dirname(resolve(file)),{recursive:true});
 writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 rmSync(folder,{recursive:true,force:true});
}
console.log(JSON.stringify({passed:result.passed,failed:result.failed,
 states:result.states_checked,median_ms:result.median_runtime_ms,
 rss_kib:result.median_rss_kib,peak_log10_K:result.peak_log10_curvature,
 max_log_error:result.max_log10_error,first_failure:result.first_failure},null,2));
if(!result.passed_all)process.exitCode=1;
