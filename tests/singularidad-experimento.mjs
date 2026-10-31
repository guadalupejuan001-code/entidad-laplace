/**
 * P004 native laboratory — preserves a P003 ΛCDM history in the SAME RVPC2
 * before calculating a classical radiation singularity limit in XI Machine.
 * No alternate physics engine, no imaginary state at a=0.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {compilarCosmologia,interpretarCosmos,
  leerProgramaMemoria as leerCosmos,decodificarMemoria as decodificarCosmos}
  from '../cosmos/lcdm.mjs';
import {compilarSingularidad,interpretarSingularidad,
  leerProgramaMemoria as leerSingularidad,
  decodificarMemoria as decodificarSingularidad,
  magnitudLog10,PLANCK_TIME_S} from '../cosmos/singularidad.mjs';

const [,,bin,reportFile]=process.argv;
if(!bin||!reportFile)throw Error('uso: node tests/singularidad-experimento.mjs REVERSE_PC_BIN RESULTADO.json');
const folder=dirname(resolve(reportFile));
mkdirSync(folder,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
function exec(...args){
 const begin=performance.now();
 const p=spawnSync(resolve(bin),args,{encoding:'utf8',timeout:120000,maxBuffer:18*1024*1024});
 assert.equal(p.status,0,(p.stderr||p.error?.message||String(p.status)).slice(-1100));
 return {output:p.stdout,stderr:p.stderr,ms:Math.round((performance.now()-begin)*1000)/1000};
}
const p003=compilarCosmologia();
const p004=compilarSingularidad();
const initial=join(folder,'start.rvp'),past=join(folder,'p003-background.rvp');
const final=join(folder,'p004-frontera.rvp'),lastRead=join(folder,'read.rvp');
const p003Source=join(folder,'background-p003.xi');
const p004Source=join(folder,'singularidad-p004.xi'),rxe=join(folder,'Laplace-Singularidad-P004.rxe');
const manifest={
 schema:'LAPLACE_P004_CLASSICAL_SINGULARITY_EVIDENCE',
 started_at:new Date().toISOString(),physical_hardware:'CPU-only',
 model:'radiation-dominated FLRW classical extrapolation, NOT quantum gravity',
 source_sha256:p004.xi_sha256,
 earlier_P003_sha256:p003.xi_sha256,
 singularity_at_a_zero:{numerically_simulated:false,formal_boundary:p004.formal_boundary},
 notes:['Planck cutoff marks failure of classical prediction, NOT a discovered physical state',
  'The old model P003 and new P004 share the original REVERSE-PC state authority']
};
writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
writeFileSync(p003Source,p003.xi,{flag:'wx'});
writeFileSync(p004Source,p004.xi,{flag:'wx'});
const modelInfo=exec('compile',p004Source,rxe,'LAPLACE P004 SINGULARIDAD');
writeFileSync(join(folder,'compiled.json'),modelInfo.output,{flag:'wx'});
const xinfo=exec('inspect-rxe',rxe);
writeFileSync(join(folder,'rxe.json'),xinfo.output,{flag:'wx'});
exec('init',initial);
const former=exec('run',p003Source,initial,past);
const background=interpretarCosmos(former.output,p003);
const now=exec('run',rxe,past,final);
const approach=interpretarSingularidad(now.output,p004);
writeFileSync(join(folder,'xi-observaciones.jsonl'),now.output,{flag:'wx'});
// Probe BOTH logical regions after P004 to prove P003 did not disappear.
const p003Read=join(folder,'read-old.xi'),p004Read=join(folder,'read-new.xi');
writeFileSync(p003Read,leerCosmos(p003),{flag:'wx'});
writeFileSync(p004Read,leerSingularidad(p004),{flag:'wx'});
const pastRead=exec('run',p003Read,final,join(folder,'old-probe.rvp'));
const laterRead=exec('run',p004Read,final,lastRead);
assert.deepEqual(decodificarCosmos(pastRead.output,p003),background.epochs,
 'El nuevo experimento no debe destruir el estado P003');
assert.deepEqual(decodificarSingularidad(laterRead.output,p004),approach.epochs,
 'La historia singular de XI debe reconstituirse exactamente');
const at=k=>approach.epochs.find(x=>x.a_exp===k);
const mantissaLog=(obj,type)=>magnitudLog10(obj[type+'_mantissa'],obj[type+'_exponent']);
const planck=approach.epochs.find(x=>x.below_planck_time===1);
assert.equal(planck.a_exp,-32,'la frontera discretizada debe cruzarse entre 10^-31 y 10^-32');
const lambdaAt30=background.epochs.find(x=>x.a_log10_exponent===-30&&x.a_digit===1);
assert.ok(lambdaAt30,'se requiere P003 a=10^-30');
const comparison={};
for(const type of ['H','T','energy']){
 const k=type==='energy'?'energy':type;
 const ref=magnitudLog10(lambdaAt30[k+'_mantissa'],lambdaAt30[k+'_exponent']);
 const got=mantissaLog(at(-30),k);
 comparison[k]={P003_log10:ref,P004_log10:got,difference_log10:Math.abs(ref-got)};
 assert.ok(comparison[k].difference_log10<0.003,'P003 vs P004 no coincide en frontera '+k);
}
const selected=[-30,-31,-32,-35,-40,-50,-60,-70,-80].map(k=>{
 const row=at(k);
 return {scale_factor:'1e'+k,below_planck_time:row.below_planck_time===1,
  H:{mantissa:row.H_mantissa,exponent:row.H_exponent,unit:'s^-1'},
  T:{mantissa:row.T_mantissa,exponent:row.T_exponent,unit:'K'},
  energy_density:{mantissa:row.energy_mantissa,exponent:row.energy_exponent,unit:'J/m^3'},
  radiation_age:{mantissa:row.t_rad_mantissa,exponent:row.t_rad_exponent,unit:'s'},
  kretschmann:{mantissa:row.kretschmann_mantissa,exponent:row.kretschmann_exponent,unit:'m^-4'}};
});
const results={
 ...manifest,
 passed:true,
 epoch_count:p004.epoch_count,packed_logical_bytes:p004.logical_state_bytes,
 memory_overrides:approach.memory.overrides,
 elapsed_ms:now.ms,
 rxe:JSON.parse(xinfo.output),
 planck_time_s:PLANCK_TIME_S,
 first_flagged_scale_factor:'1e'+planck.a_exp,
 formal_limit:{
  scale_factor:'a -> 0+',
  H:'+infinity in classical radiation FLRW',
  T:'+infinity in simplified thermal extrapolation',
  energy_density:'+infinity in classical radiation FLRW',
  Kretschmann:'diverges even when Ricci scalar vanishes for pure radiation',
  age:'0+',
  physical_status:'not an established state of the real universe'
 },
 matched_previous_P003:true,matched_memory_after_P004:true,
 compatibility_at_a_1e_minus30:comparison,
 selected_epochs:selected,
 timeline:approach.epochs,
 SHA256_of_XI_output:sha(now.output),
 source_of_equations:'FLRW pure radiation approximation; CODATA Planck threshold; previous P003 LCDM'
};
writeFileSync(reportFile,JSON.stringify(results,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:results.passed,
 epochs:results.epoch_count,
 compact_bytes:results.packed_logical_bytes,
 first_below_Planck:results.first_flagged_scale_factor,
 p003_preserved:results.matched_previous_P003,
 physical_singularity_resolved:false,
 time_ms:results.elapsed_ms,
 earliest:results.selected_epochs[0],
 latest:results.selected_epochs.at(-1)},null,2));
