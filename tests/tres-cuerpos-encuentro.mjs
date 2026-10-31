/*
 * P002.B — forecast first close approach among three gravitating masses.
 * Computes all trajectories in XI and records a predeclared 0.25-unit threshold.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {compilarGravedad,leerObservaciones,ESCALA} from '../fisica/tres-cuerpos.mjs';
const [,,binary,resultFile]=process.argv;
if(!binary||!resultFile)throw Error('uso: node tests/tres-cuerpos-encuentro.mjs REVERSE_PC_BIN RESULTADO.json');
const folder=dirname(resolve(resultFile));mkdirSync(folder,{recursive:true});
const base={modo:'iniciar',pasos:0,cuerpos:[
 {x:-18000,y:0,vx:40000,vy:3000,masa:20000},
 {x:18000,y:0,vx:-40000,vy:-3000,masa:20000},
 {x:0,y:90000,vx:0,vy:-12000,masa:15000}
]};
const perturbed={...base,cuerpos:base.cuerpos.map((p,i)=>
  i===1?{...p,vy:p.vy+100}:p)};
const sha=s=>createHash('sha256').update(s).digest('hex');
function execute(...args){
 const result=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,(result.stderr||result.error?.message||'error').slice(-1200));
 return result.stdout;
}
function trajectory(prefix,input){
 let src=join(folder,prefix+'-initial.rvp');
 execute('init',src);
 const series=[];
 let t=0;
 for(const next of [0,32,64,96,128,160,192,224,240]){
   const cfg=next===0?{...input,pasos:0}:{modo:'continuar',pasos:next-t};
   const program=compilarGravedad(cfg);
   const file=join(folder,prefix+'-'+next+'.xi');
   const out=join(folder,prefix+'-'+next+'.rvp');
   writeFileSync(file,program.xi,{flag:'wx'});
   const observation=leerObservaciones(execute('run',file,src,out));
   assert.equal(observation.pasos_acumulados,next);
   const a=observation.cuerpos[0],b=observation.cuerpos[1];
   const distance=Math.hypot(a.x-b.x,a.y-b.y)/ESCALA;
   series.push({step:next,t:next/1024,body1:a,body2:b,body3:observation.cuerpos[2],
     distance_12:distance,first_approach:observation.primer_acercamiento_paso,
     memory_overrides:observation.inverse_memory.overrides});
   src=out;t=next;
 }
 return series;
}
// Independent floating-point physics reference; validation only, not simulation authority.
function crossingReference(input){
 const bodies=input.cuerpos.map(b=>({x:b.x/ESCALA,y:b.y/ESCALA,
   vx:b.vx/ESCALA,vy:b.vy/ESCALA,m:b.masa/ESCALA}));
 const h=1/1024,epsilon=0.05;
 for(let step=0;step<=240;step++){
   const p=bodies[0],q=bodies[1];
   if(Math.hypot(p.x-q.x,p.y-q.y)<=0.25)return step;
   const acc=bodies.map((a,i)=>{
     let ax=0,ay=0;
     for(let j=0;j<3;j++){
       if(i===j)continue;
       const b=bodies[j],dx=b.x-a.x,dy=b.y-a.y;
       const dist=dx*dx+dy*dy+epsilon*epsilon;
       const factor=b.m/(dist*Math.sqrt(dist));
       ax+=dx*factor;ay+=dy*factor;
     }
     return {ax,ay};
   });
   for(let i=0;i<3;i++){
     bodies[i].vx+=h*acc[i].ax;bodies[i].vy+=h*acc[i].ay;
     bodies[i].x+=h*bodies[i].vx;bodies[i].y+=h*bodies[i].vy;
   }
 }
 return null;
}
const evidence={schema:'LAPLACE_P002_ENCOUNTER_B',threshold_distance:0.25,
 baseline:[],perturbed:[],pass:false};
try{
 evidence.baseline=trajectory('cercania-prevista',base);
 evidence.seal_sha256=sha(JSON.stringify(evidence.baseline));
 evidence.perturbed=trajectory('cercania-perturbada',perturbed);
 assert.equal(sha(JSON.stringify(evidence.baseline)),evidence.seal_sha256,
   'sealed baseline changed after perturbation');
 const a=evidence.baseline.at(-1),b=evidence.perturbed.at(-1);
 assert.ok(evidence.baseline[0].distance_12>0.25,'event must not be present at t=0');
 assert.notEqual(a.first_approach,null,'the three-body model never reached the event threshold');
 assert.ok(a.first_approach>0&&a.first_approach<240,'event occurred outside observation window');
 const floatTick=crossingReference(base);
 assert.ok(floatTick!==null,'independent reference did not reach the event');
 assert.ok(Math.abs(a.first_approach-floatTick)<=2,
   'XI and independent gravitational reference disagree on approach time');
 assert.ok(evidence.baseline.some(p=>p.distance_12<0.25),'sampled trajectory did not approach');
 evidence.summary={
   first_approach_tick:a.first_approach,
   independent_float_reference_tick:floatTick,
   first_approach_time:a.first_approach/1024,
   first_approach_perturbed_tick:b.first_approach,
   initial_distance:evidence.baseline[0].distance_12,
   final_distance:a.distance_12,
   min_sampled_distance:Math.min(...evidence.baseline.map(x=>x.distance_12)),
   separation_final_body_3:Math.hypot(a.body3.x-b.body3.x,a.body3.y-b.body3.y)/ESCALA,
   energy_is_not_exactly_conserved:'symplectic numerical integration plus fixed-point rounding'};
 evidence.pass=true;
}finally{
 writeFileSync(resultFile,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({pass:evidence.pass,summary:evidence.summary,seal:evidence.seal_sha256},null,2));
