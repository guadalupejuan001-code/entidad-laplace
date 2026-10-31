/*
 * P002 native experiment: forecast vs small hidden perturbation, preserving
 * snapshots and hashes. All trajectories calculated in XI/REVERSE-PC.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {compilarGravedad,ESCENARIO_OCHO,ESCALA,leerObservaciones} from '../fisica/tres-cuerpos.mjs';

const [,,binary,reportFile]=process.argv;
if(!binary||!reportFile)throw Error('uso: node tests/tres-cuerpos-experimento.mjs REVERSE_PC_BIN RESULTADO.json');
const directory=dirname(resolve(reportFile));mkdirSync(directory,{recursive:true});
const sha=text=>createHash('sha256').update(text).digest('hex');
const call=(...args)=>{
 const start=performance.now();
 const result=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000,maxBuffer:5*1024*1024});
 assert.equal(result.status,0,(result.stderr||result.error?.message||'REVERSE-PC error').slice(-1400));
 return {stdout:result.stdout,elapsed_ms:Math.round((performance.now()-start)*1000)/1000};
};
const metric=bodies=>{
 const b=bodies.map(x=>({x:x.x/ESCALA,y:x.y/ESCALA,vx:x.vx/ESCALA,vy:x.vy/ESCALA,m:x.masa/ESCALA}));
 let kinetic=0,potential=0,px=0,py=0;
 for(let i=0;i<3;i++){
   const p=b[i];
   kinetic+=p.m*(p.vx*p.vx+p.vy*p.vy)/2;
   px+=p.m*p.vx;py+=p.m*p.vy;
   for(let j=i+1;j<3;j++){
     const q=b[j];potential-=p.m*q.m/
       Math.sqrt((q.x-p.x)**2+(q.y-p.y)**2+0.05**2);
   }
 }
 return {energy:kinetic+potential,kinetic,potential,momentum:[px,py]};
};
const report={suite:'LAPLACE_P002_3BODY_XI',model:'Plummer-softened G=1, symplectic Euler, 3 massive bodies',
 execution:'native XI Machine / REVERSE-PC / Ether Memory',
 unit_scale:ESCALA,time_step:'1/1024 normalized time',
 baseline:[],perturbed:[],comparison:[],pass:false,
 integrity:{},limitations:['No gravitational observations from reality',
  'No proof of chaos or Lyapunov exponent from one perturbed orbit',
  'Steps computed iteratively; no E005 non-linear fast-forward']};
try{
 function trajectory(name,scene){
   const initialFile=join(directory,name+'-initial.rvp');
   call('init',initialFile);
   let current=initialFile,elapsed=0;
   const states=[];
   const times=[0,8,16,24,32,48,64];
   for(let idx=0;idx<times.length;idx++){
     const steps=times[idx]-elapsed;
     const input=idx===0?{...scene,modo:'iniciar',pasos:steps}:{modo:'continuar',pasos:steps};
     const generated=compilarGravedad(input),source=join(directory,name+'-'+times[idx]+'.xi');
     const final=join(directory,name+'-'+times[idx]+'.rvp');
     writeFileSync(source,generated.xi,{flag:'wx'});
     let toRun=source;
     if(idx===1){
       toRun=join(directory,name+'-'+times[idx]+'.rxe');
       call('compile',source,toRun,'LAPLACE P002 3 cuerpos');
     }
     const executed=call('run',toRun,current,final);
     const result=leerObservaciones(executed.stdout);
     assert.equal(result.pasos_acumulados,times[idx],'invalid persistent clock');
     states.push({tick:times[idx],t:times[idx]/1024,
       bodies:result.cuerpos,earliest_close_approach:result.primer_acercamiento_paso,
       diagnostics:metric(result.cuerpos),state_file:final,
       xi_sha256:generated.xi_sha256,elapsed_ms:executed.elapsed_ms,
       memory_overrides:result.inverse_memory.overrides,
       quantum_components:result.quantum_stats.clifford_components+
         result.quantum_stats.adaptive_components+
         result.quantum_stats.reduced_components});
     current=final;elapsed=times[idx];
   }
   return states;
 }
 // First branch forecast, sealed before the second branch is computed.
 report.baseline=trajectory('prevision',ESCENARIO_OCHO);
 const seal=sha(JSON.stringify(report.baseline.map(x=>({
   tick:x.tick,states:x.bodies,xi_sha256:x.xi_sha256
 }))));
 report.integrity.forecast_seal_sha256=seal;
 const change={...ESCENARIO_OCHO,cuerpos:ESCENARIO_OCHO.cuerpos.map((b,i)=>
   i===2?{...b,x:b.x+50}:b)};
 report.perturbed=trajectory('realidad_perturbada',change);
 report.comparison=report.baseline.map((s,i)=>{
   const t=report.perturbed[i];
   const each=s.bodies.map((b,j)=>Math.hypot(b.x-t.bodies[j].x,b.y-t.bodies[j].y)/ESCALA);
   return {tick:s.tick,separation_by_body:each,max_separation:Math.max(...each)};
 });
 assert.equal(sha(JSON.stringify(report.baseline.map(x=>({
   tick:x.tick,states:x.bodies,xi_sha256:x.xi_sha256
 })))),seal,'sealed forecast mutated');
 assert.ok(report.comparison.at(-1).max_separation>0,'perturbation had no observable consequence');
 assert.ok(report.baseline.every(s=>s.quantum_components===0),'no quantum states should be claimed');
 assert.ok(report.perturbed.every(s=>s.quantum_components===0));
 const initialEnergy=report.baseline[0].diagnostics.energy;
 const finalEnergy=report.baseline.at(-1).diagnostics.energy;
 report.summary={total_ticks:64,final_baseline:report.baseline.at(-1).bodies,
   final_perturbed:report.perturbed.at(-1).bodies,
   max_separation:Math.max(...report.comparison.map(x=>x.max_separation)),
   final_separation:report.comparison.at(-1).max_separation,
   initial_energy:initialEnergy,final_energy:finalEnergy,
   relative_energy_drift:Math.abs(finalEnergy-initialEnergy)/Math.max(1e-12,Math.abs(initialEnergy)),
   max_memory_overrides:Math.max(...[...report.baseline,...report.perturbed].map(x=>x.memory_overrides))};
 report.pass=true;
}finally{
 writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({pass:report.pass,suite:report.suite,
 tick:report.summary?.total_ticks,drift:report.summary?.relative_energy_drift,
 max_separation:report.summary?.max_separation,
 final_state:report.summary?.final_baseline,
 sha256:report.integrity.forecast_seal_sha256},null,2));
