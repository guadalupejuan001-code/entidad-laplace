/*
 * P002.C — bounded ensemble of nine declared initial conditions.
 * All trajectories and encounter events are computed within XI/REVERSE-PC.
 * The host counts scenario outcomes; counts are NOT calibrated probabilities.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {compilarGravedad,leerObservaciones} from '../fisica/tres-cuerpos.mjs';
const [,,binary,resultFile]=process.argv;
if(!binary||!resultFile)throw Error('uso: node tests/tres-cuerpos-escenarios.mjs REVERSE_BIN RESULT.json');
const dir=dirname(resolve(resultFile));mkdirSync(dir,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const base=[
 {x:-18000,y:0,vx:40000,vy:3000,masa:20000},
 {x:18000,y:0,vx:-40000,vy:-3000,masa:20000},
 {x:0,y:90000,vx:0,vy:-12000,masa:15000}
];
function run(...args){
 const p=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 assert.equal(p.status,0,String(p.stderr||p.error?.message||p.status).slice(-700));
 return p.stdout;
}
const evidence={suite:'LAPLACE_P002_ENSAYO_ESCENARIOS',threshold:0.25,
  horizon_ticks:176,scenario_assumption:'nine equally weighted, user-declared initial states',
  scenarios:[],pass:false};
for(const deltaVx of [-7000,0,7000]){
 for(const deltaVy of [-3000,0,3000]){
  const id='dx'+(deltaVx+7000)+'-dy'+(deltaVy+3000);
  const bodies=base.map((x,i)=>i===0?{...x,vx:x.vx+deltaVx,vy:x.vy+deltaVy}:{...x});
  const origin=join(dir,id+'-start.rvp');run('init',origin);
  let state=origin,step=0,event=null,output=null;
  for(const next of [64,128,176]){
    const model=step===0?{modo:'iniciar',pasos:64,cuerpos:bodies}:
      {modo:'continuar',pasos:next-step};
    const program=compilarGravedad(model);
    const input=join(dir,id+'-'+next+'.xi'),out=join(dir,id+'-'+next+'.rvp');
    writeFileSync(input,program.xi,{flag:'wx'});
    output=leerObservaciones(run('run',input,state,out));
    assert.equal(output.pasos_acumulados,next,'scenario did not carry cumulative XI clock');
    state=out;step=next;event=output.primer_acercamiento_paso;
  }
  evidence.scenarios.push({id,initial_delta_velocity_ticks:[deltaVx,deltaVy],
    first_approach_tick:event,first_approach_time:event===null?null:event/1024,
    final_state:output.cuerpos,ether_overrides:output.inverse_memory.overrides});
 }
}
const known=evidence.scenarios.filter(s=>s.first_approach_tick!==null)
  .map(s=>s.first_approach_tick);
const counts=Object.fromEntries([...new Set(known)].sort((a,b)=>a-b).map(x=>
 [String(x),known.filter(t=>t===x).length]));
const by=deadline=>known.filter(x=>x<=deadline).length;
evidence.summary={
  crossed_by_end:known.length,
  no_crossing:evidence.scenarios.length-known.length,
  earliest_tick:known.length?Math.min(...known):null,
  latest_tick:known.length?Math.max(...known):null,
  histogram:counts,by_tick_108:by(108),by_tick_114:by(114),
  by_tick_120:by(120),by_tick_128:by(128),
  denominator:evidence.scenarios.length,
  interpretation:'fraction of 9 declared hypotheses, NOT a measured natural probability'
};
assert.equal(evidence.scenarios.length,9);
assert.ok(known.length>0,'all scenarios abstained');
evidence.seal_sha256=sha(JSON.stringify(evidence.scenarios.map(x=>({
 id:x.id,input:x.initial_delta_velocity_ticks,event:x.first_approach_tick
}))));
evidence.pass=true;
writeFileSync(resultFile,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pass:evidence.pass,summary:evidence.summary,
 hash:evidence.seal_sha256},null,2));
