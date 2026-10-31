/*
 * P003 real-executor cosmological laboratory.
 * All physical trajectories come from REVERSE-PC/XI. The independent
 * reference is for verification only; no values are sent back into XI.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {compilarCosmologia,EJEMPLO,interpretarCosmos,valorCientifico,
  decodificarMemoria,leerProgramaMemoria} from '../cosmos/lcdm.mjs';

const [,,binary,filename,resolution]=process.argv;
if(resolution&&resolution!=='fino')throw Error('resolucion debe ser fino');
if(!binary||!filename)throw Error('uso: node tests/cosmos-experimento.mjs REVERSE_PC_BIN RESULT.json');
const dir=dirname(resolve(filename));mkdirSync(dir,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
function invoke(...args){
 const start=performance.now();
 const p=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 assert.equal(p.status,0,(p.stderr||p.error?.message||String(p.status)).slice(-1400));
 return {stdout:p.stdout,stderr:p.stderr,wall_ms:Math.round((performance.now()-start)*1000)/1000};
}
const initial=join(dir,'universe-initial.rvp');
const final=join(dir,'universe-final.rvp');
const xiFile=join(dir,'universe.xi');
const rxeFile=join(dir,'Laplace-Cosmos-P003.rxe');
const readXIFile=join(dir,'read-ether.xi');
const readRvp=join(dir,'read-ether.rvp');
const compiled=compilarCosmologia(resolution==='fino'?{...EJEMPLO,detalle:'digitos'}:EJEMPLO);
writeFileSync(xiFile,compiled.xi,{flag:'wx'});
const startManifest={schema:compiled.schema,as_of:new Date().toISOString(),
  parameters:compiled.configuration,xi_sha256:compiled.xi_sha256,
  record_bytes:compiled.record_bytes,records:compiled.epoch_count};
writeFileSync(join(dir,'manifest.json'),JSON.stringify(startManifest,null,2)+'\n',{flag:'wx'});
const ci=invoke('compile',xiFile,rxeFile,'LAPLACE COSMOS P003');
writeFileSync(join(dir,'rxe-compiler.json'),ci.stdout,{flag:'wx'});
const description=invoke('inspect-rxe',rxeFile);
writeFileSync(join(dir,'rxe.json'),description.stdout,{flag:'wx'});
invoke('init',initial);
const executed=invoke('run',rxeFile,initial,final);
writeFileSync(join(dir,'universe-observations.jsonl'),executed.stdout,{flag:'wx'});
const universe=interpretarCosmos(executed.stdout,compiled);
const seal=sha(executed.stdout);
writeFileSync(readXIFile,leerProgramaMemoria(compiled),{flag:'wx'});
const read=invoke('run',readXIFile,final,readRvp);
const fromEther=decodificarMemoria(read.stdout,compiled);
assert.deepEqual(fromEther,universe.epochs,'Inverse Ether Memory lost cosmic history');
const report={schema:'LAPLACE_P003_LCDM_EVIDENCE_1',
 model:'Flat ΛCDM homogeneous background; limited high-temperature extrapolation',
 as_of:startManifest.as_of,source_sha256:compiled.xi_sha256,
 binary:JSON.parse(description.stdout),
 expected_observations:compiled.epoch_count,
 actual_observations:universe.epochs.length,
 packed_logical_bytes:compiled.logical_output_bytes,
 memory_overrides:universe.memory.overrides,
 physical_quantum_hardware:false,
 runtime_seconds:executed.wall_ms/1000,
 output_sha256:seal,
 calibration:{H0_km_s_Mpc:67.4,T0_K:2.7255,
  parameters:compiled.configuration},
 limits:['Not the quantum gravitational singularity or inflation',
  'Early radiation degrees of freedom and thermal history are extrapolated',
  'Only background average expansion; no perturbations or galaxy formation',
  'Hubble time 1/H is not the age since Big Bang'],
 epochs:[],
 landmarks:{},pass:false};
function get(key){
 return universe.epochs.find(x=>x.a_log10_exponent===key[0]&&x.a_digit===key[1]);
}
const sci=(e,name)=>valorCientifico(e[name+'_mantissa'],e[name+'_exponent']);
for(const e of universe.epochs){
 const a=e.a_digit*10**e.a_log10_exponent;
 const obs={
  scale_factor:a,a_exponent:e.a_log10_exponent,a_digit:e.a_digit,
  H_s_inv:sci(e,'H'),T_K:sci(e,'T'),
  energy_density_J_m3:sci(e,'energy'),
  hubble_time_s:sci(e,'hubble_time'),
  fractions:{
   radiation:e.radiation_parts_100000/100000,
   matter:e.matter_parts_100000/100000,
   vacuum:e.vacuum_parts_100000/100000
  },raw:e
 };
 report.epochs.push(obs);
}
const event=(name,k,b,description)=>{
 const e=get([k,b]);assert.ok(e,'missing selected epoch '+name);
 const item=report.epochs.find(x=>x.a_exponent===k&&x.a_digit===b);
 report.landmarks[name]={description,...item};
};
event('early_expansion',-30,1,'Formal early homogeneous epoch, not Planck singularity');
event('primordial_hot',-10,1,'Hot radiation-dominated universe; does not solve nucleosynthesis');
event('radiation_matter_switch',-4,3,'Scale near Ωr/Ωm equality');
event('near_recombination_temperature',-4,9,'T around 3000 K; not a photon transport/recombination engine');
event('today',0,1,'a normalized to one; H0 and present CMB T input parameters');
assert.ok(report.landmarks.radiation_matter_switch.fractions.matter>
  report.landmarks.radiation_matter_switch.fractions.radiation);
assert.ok(report.landmarks.near_recombination_temperature.T_K>2800&&
  report.landmarks.near_recombination_temperature.T_K<3300);
assert.ok(report.landmarks.today.H_s_inv>2.17e-18&&report.landmarks.today.H_s_inv<2.20e-18);
assert.ok(report.landmarks.early_expansion.T_K>1e30);
report.pass=true;
writeFileSync(filename,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({
 result:report.pass,experiment:report.schema,epochs:report.epochs.length,
 packed_bytes:report.packed_logical_bytes,
 wall_ms:executed.wall_ms,
 earliest:report.landmarks.early_expansion,
 today:report.landmarks.today,
 sha256:report.output_sha256
},null,2));
