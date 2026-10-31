/*
 * P003 stress: run 128 distinct flat universes on actual REVERSE-PC XI
 * and compare all 4224 epoch outputs against an independent float oracle.
 * The production physics remains exclusively in XI, not in this test.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';
import {compilarCosmologia,interpretarCosmos,valorCientifico} from '../cosmos/lcdm.mjs';

const [,,binary,path]=process.argv;
if(!binary||!path)throw Error('uso: node tests/cosmos-extremo.mjs REVERSE_PC_BIN RESULT.json');
let seed=0xC05A001;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
const H0=67.4/3.0856775814913673e19,rho0=7.668947767821908e-10;
const root=mkdtempSync(join(tmpdir(),'laplace-p003-stress-'));
const results={schema:'LAPLACE_P003_LCDM_STRESS_V1',seed:'0xC05A001',
  cases:1024,epochs_per_case:33,cosmic_states_calculated:0,passed:0,failed:0,
  first_failure:null,max_relative_error:{H:0,T:0,energy:0,hubble_time:0},
  max_fraction_error_parts_100000:0,min_memory_overrides:null,
  max_memory_overrides:0,xi_elapsed_ms:[],rss_kib:[],sample:null};
const call=(...args)=>{
 const start=performance.now();
 const p=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
 return {...p,wall_ms:Math.round((performance.now()-start)*1000)/1000};
};
try{
 for(let id=0;id<results.cases;id++){
  const input={min_exp:-30,max_exp:0,
    omega_r_micro:50+(random()%600),omega_m_micro:180000+(random()%400000)};
  input.omega_lambda_micro=1000000-input.omega_r_micro-input.omega_m_micro;
  const config=compilarCosmologia(input);
  const src=join(root,'universe-'+id+'.xi'),before=join(root,'start-'+id+'.rvp'),
    after=join(root,'final-'+id+'.rvp');
  try{
   writeFileSync(src,config.xi);
   assert.equal(call('init',before).status,0);
   const res=call('run',src,before,after);
   assert.equal(res.status,0,res.stderr||res.error?.message||'XI failed');
   const parsed=interpretarCosmos(res.stdout,config);
   assert.equal(parsed.epochs.length,33);
   assert.equal(parsed.quantum.clifford_components+
     parsed.quantum.adaptive_components+parsed.quantum.reduced_components,0);
   assert.ok(parsed.memory.overrides<=config.logical_output_bytes);
   for(const epoch of parsed.epochs){
     const a=epoch.a_digit*10**epoch.a_log10_exponent;
     const r=input.omega_r_micro/1e6*a**-4;
     const m=input.omega_m_micro/1e6*a**-3;
     const l=input.omega_lambda_micro/1e6;
     const density=r+m+l;
     const expected={H:H0*Math.sqrt(density),T:2.7255/a,
       energy:rho0*density,hubble_time:1/(H0*Math.sqrt(density))};
     for(const key of Object.keys(expected)){
       const actual=valorCientifico(epoch[key+'_mantissa'],epoch[key+'_exponent']);
       const error=Math.abs(actual/expected[key]-1);
       results.max_relative_error[key]=Math.max(results.max_relative_error[key],error);
       assert.ok(error<0.007,'case '+id+' '+key+' at '+epoch.a_digit+'e'+epoch.a_log10_exponent+' error '+error);
     }
     const observed=[epoch.radiation_parts_100000,epoch.matter_parts_100000,
       epoch.vacuum_parts_100000];
     const reference=[r,m,l].map(x=>100000*x/density);
     for(let i=0;i<3;i++){
       const error=Math.abs(observed[i]-reference[i]);
       results.max_fraction_error_parts_100000=Math.max(results.max_fraction_error_parts_100000,error);
       assert.ok(error<120,'fraction mismatch '+id+' '+error);
     }
   }
   results.cosmic_states_calculated+=parsed.epochs.length;
   results.passed++;results.xi_elapsed_ms.push(res.wall_ms);
   results.min_memory_overrides=Math.min(results.min_memory_overrides??Infinity,
     parsed.memory.overrides);
   results.max_memory_overrides=Math.max(results.max_memory_overrides,parsed.memory.overrides);
   if(id===0||id===results.cases-1)results.sample={id,config:input,
     first:parsed.epochs[0],last:parsed.epochs.at(-1),
     program_bytes:Buffer.byteLength(config.xi),
     memory_overrides:parsed.memory.overrides};
  }catch(error){
    results.failed++;
    if(!results.first_failure)results.first_failure={case:id,input,message:String(error.message)};
    break;
  }
 }
 if(results.failed===0){
  const config=compilarCosmologia(),src=join(root,'profile.xi');
  writeFileSync(src,config.xi);
  const before=join(root,'profile-before.rvp');
  assert.equal(call('init',before).status,0);
  for(let i=0;i<3;i++){
   const stat=join(root,'rss-'+i+'.txt'),out=join(root,'profile-after-'+i+'.rvp');
   const p=spawnSync('/usr/bin/time',['-f','%M','-o',stat,resolve(binary),
     'run',src,before,out],{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
   assert.equal(p.status,0,p.stderr||p.error?.message||'time failed');
   const max=Number(readFileSync(stat,'utf8').trim());
   assert.ok(Number.isFinite(max)&&max>0,'RSS not measured');
   results.rss_kib.push(max);
  }
 }
}finally{
 results.duration_median_ms=results.xi_elapsed_ms.length?
   [...results.xi_elapsed_ms].sort((a,b)=>a-b)[Math.floor(results.xi_elapsed_ms.length/2)]:null;
 results.rss_median_kib=results.rss_kib.length?
   [...results.rss_kib].sort((a,b)=>a-b)[1]:null;
 results.pass=results.failed===0&&results.passed===results.cases;
 mkdirSync(dirname(resolve(path)),{recursive:true});
 writeFileSync(path,JSON.stringify(results,null,2)+'\n');
 rmSync(root,{recursive:true,force:true});
}
console.log(JSON.stringify({pass:results.pass,cases:results.cases,
 passed:results.passed,failed:results.failed,observed_epochs:results.cosmic_states_calculated,
 max_relative_error:results.max_relative_error,
 max_fraction_error:results.max_fraction_error_parts_100000,
 wall_median_ms:results.duration_median_ms,
 rss_median_kib:results.rss_median_kib,first_failure:results.first_failure},null,2));
if(!results.pass)process.exitCode=1;
