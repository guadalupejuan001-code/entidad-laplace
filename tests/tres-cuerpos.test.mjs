import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {compilarGravedad,ESCENARIO_OCHO,ESCALA,DT_DENOMINADOR,
 MAX_PASOS_POR_PROGRAMA,leerObservaciones,programaLecturaMemoria,
 reconstruirMemoria} from '../fisica/tres-cuerpos.mjs';

const binary=process.env.REVERSE_PC_BIN;
const native={skip:!binary?'El binario REVERSE original se compila en CI':false};

function run(dir,...args){
  const r=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  assert.equal(r.status,0,'REVERSE failed: '+(r.stderr||r.error?.message||r.status));
  return r.stdout;
}
function project(scene){
  const dir=mkdtempSync(join(tmpdir(),'laplace-p002-'));
  const init=join(dir,'init.rvp');
  run(dir,'init',init);
  return {dir,init};
}
function compute(dir,initial,scene,{rxe=false}={}){
  const body=compilarGravedad(scene);
  const label=scene.modo+'-'+scene.pasos+'-'+Math.random().toString(16).slice(2);
  const src=join(dir,label+'.xi'),compiled=join(dir,label+'.rxe'),out=join(dir,label+'.rvp');
  writeFileSync(src,body.xi);
  if(rxe)run(dir,'compile',src,compiled,'LAPLACE P002');
  const observed=leerObservaciones(run(dir,'run',rxe?compiled:src,initial,out));
  const query=join(dir,label+'-read.xi'),after=join(dir,label+'-read.rvp');
  writeFileSync(query,programaLecturaMemoria());
  const memory=reconstruirMemoria(run(dir,'run',query,out,after));
  assert.deepEqual(memory,observed.cuerpos,'XI registers and persistent Ether bytes differ');
  assert.ok(observed.inverse_memory.overrides>0);
  return {...observed,out,manifest:body};
}
function floatOracle(scene,steps){
  const positions=scene.cuerpos.map(b=>({
    x:b.x/ESCALA,y:b.y/ESCALA,vx:b.vx/ESCALA,vy:b.vy/ESCALA,m:b.masa/ESCALA
  }));
  const delta=1/DT_DENOMINADOR, eps=0.05;
  for(let tick=0;tick<steps;tick++){
    const forces=positions.map((body,i)=>{
      let ax=0,ay=0;
      for(let j=0;j<3;j++){
        if(j===i)continue;
        const neighbor=positions[j];
        const dx=neighbor.x-body.x,dy=neighbor.y-body.y;
        const r2=dx*dx+dy*dy+eps*eps;
        const factor=neighbor.m/(r2*Math.sqrt(r2));
        ax+=dx*factor;ay+=dy*factor;
      }
      return {ax,ay};
    });
    for(let i=0;i<3;i++){
      const p=positions[i],a=forces[i];
      p.vx+=a.ax*delta;p.vy+=a.ay*delta;
      p.x+=p.vx*delta;p.y+=p.vy*delta;
    }
  }
  return positions;
}
function invariants(bodies){
  const positions=bodies.map(b=>({
    x:b.x/ESCALA,y:b.y/ESCALA,vx:b.vx/ESCALA,vy:b.vy/ESCALA,m:b.masa/ESCALA
  }));
  let kinetic=0,potential=0,momentumX=0,momentumY=0;
  for(let i=0;i<3;i++){
    const a=positions[i];
    kinetic+=0.5*a.m*(a.vx*a.vx+a.vy*a.vy);
    momentumX+=a.m*a.vx;momentumY+=a.m*a.vy;
    for(let j=i+1;j<3;j++){
      const b=positions[j],dx=b.x-a.x,dy=b.y-a.y;
      potential-=a.m*b.m/Math.sqrt(dx*dx+dy*dy+0.05*0.05);
    }
  }
  return {kinetic,potential,energy:kinetic+potential,momentumX,momentumY};
}
test('P002 solo compila una ley no lineal en XI y mantiene memoria declarada',()=>{
 const x=compilarGravedad(ESCENARIO_OCHO),y=compilarGravedad({...ESCENARIO_OCHO,pasos:64});
 assert.equal(x.schema,'LAPLACE_P002_TRES_CUERPOS_XI_1');
 assert.match(x.xi,/div r10 r8/);
 assert.match(x.xi,/label p002_bucle/);
 assert.match(x.xi,/mem_stats/);
 assert.match(x.xi,/qstats/);
 assert.ok(Math.abs(x.xi.length-y.xi.length)<100);
 assert.ok(x.xi.length<1024*1024);
 assert.ok(x.xi_sha256!==y.xi_sha256);
 assert.ok(!x.xi.includes('mem_reset'));
 assert.equal(compilarGravedad({modo:'continuar',pasos:10}).modo,'continuar');
});
test('P002 rechaza configuraciones inválidas y extensión de comando por datos',()=>{
 const scene=ESCENARIO_OCHO;
 const failures=[
  {...scene,pasos:-1},{...scene,pasos:MAX_PASOS_POR_PROGRAMA+1},
  {...scene,pasos:'10\nmem_reset 255'},
  {...scene,cuerpos:[scene.cuerpos[0],scene.cuerpos[1]]},
  {...scene,cuerpos:scene.cuerpos.map(x=>({...x,masa:0}))},
  {...scene,cuerpos:[{...scene.cuerpos[0],x:400000},...scene.cuerpos.slice(1)]},
  {...scene,extra:true},
  {modo:'continuar',pasos:2,cuerpos:scene.cuerpos}
 ];
 for(const v of failures)assert.throws(()=>compilarGravedad(v),'must reject malformed physical scene');
});
test('P002 genera 123 lecturas exactas de memoria para reinicio',()=>{
 const script=programaLecturaMemoria();
 assert.equal((script.match(/^mem_read /gm)||[]).length,123);
 assert.throws(()=>reconstruirMemoria(''),/faltan bytes/);
});
test('P002 realmente integra fuerzas entre las tres masas',native,()=>{
 const testScene={modo:'iniciar',pasos:1,cuerpos:[
  {x:-100000,y:0,vx:0,vy:0,masa:100000},
  {x:100000,y:0,vx:0,vy:0,masa:100000},
  {x:0,y:120000,vx:0,vy:0,masa:100000}
 ]};
 const {dir,init}=project(testScene);
 try{
   const state=compute(dir,init,testScene,{rxe:true});
   assert.ok(state.cuerpos[0].vx>0&&state.cuerpos[1].vx<0);
   assert.ok(state.cuerpos[2].vy<0);
   assert.equal(state.pasos_acumulados,1);
   assert.equal(state.quantum_stats.clifford_components+
    state.quantum_stats.adaptive_components+state.quantum_stats.reduced_components,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('P002 coincide con referencia gravitacional flotante y acota energía',native,()=>{
 const scene={...ESCENARIO_OCHO,pasos:32};
 const {dir,init}=project(scene);
 try{
   const state=compute(dir,init,scene,{rxe:true});
   const oracle=floatOracle(scene,32),error=[];
   for(let i=0;i<3;i++){
     for(const f of ['x','y','vx','vy']){
       const difference=Math.abs(state.cuerpos[i][f]-oracle[i][f]*ESCALA);
       error.push(difference);
       assert.ok(difference<=1200,'observable '+i+'.'+f+' difference '+difference);
     }
   }
   const before=invariants(scene.cuerpos),after=invariants(state.cuerpos);
   assert.ok(Math.abs(after.energy-before.energy)<0.12,
     'non-physical energy drift '+(after.energy-before.energy));
   assert.ok(Math.hypot(after.momentumX-before.momentumX,after.momentumY-before.momentumY)<0.05);
   assert.equal(state.pasos_acumulados,32);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('P002 64 pasos seguidos equivalen a 32+32 mediante snapshots Ether',native,()=>{
 const {dir,init}=project(ESCENARIO_OCHO);
 try{
   const full=compute(dir,init,{...ESCENARIO_OCHO,pasos:64});
   const first=compute(dir,init,{...ESCENARIO_OCHO,pasos:32});
   const resumed=compute(dir,first.out,{modo:'continuar',pasos:32},{rxe:true});
   assert.deepEqual(resumed.cuerpos,full.cuerpos);
   assert.equal(resumed.pasos_acumulados,64);
   assert.equal(full.primer_acercamiento_paso,resumed.primer_acercamiento_paso);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('P002 detecta primer acercamiento y sensibilidad a cambio de estado',native,()=>{
 const near={modo:'iniciar',pasos:1,cuerpos:[
  {x:0,y:0,vx:0,vy:0,masa:100000},
  {x:20000,y:0,vx:0,vy:0,masa:100000},
  {x:0,y:150000,vx:0,vy:0,masa:100000}
 ]};
 const {dir,init}=project(near);
 try{
   const result=compute(dir,init,near);
   assert.equal(result.primer_acercamiento_paso,0);
   const base=compute(dir,init,{...ESCENARIO_OCHO,pasos:64});
   const modified={...ESCENARIO_OCHO,pasos:64,
    cuerpos:ESCENARIO_OCHO.cuerpos.map((b,i)=>i===2?{...b,x:b.x+30}:b)};
   const altered=compute(dir,init,modified);
   const distance=Math.hypot(...['x','y'].map(f=>(base.cuerpos[2][f]-altered.cuerpos[2][f])/ESCALA));
   assert.ok(distance>0,'perturbation must have a measurable effect');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('P002 rechaza reanudación sin marca y mantiene atomicidad al fallar',native,()=>{
 const {dir,init}=project(ESCENARIO_OCHO);
 try{
   const continuation=compilarGravedad({modo:'continuar',pasos:1});
   const file=join(dir,'continue.xi'),dest=join(dir,'rejected.rvp');
   writeFileSync(file,continuation.xi);
   const bad=spawnSync(resolve(binary),['run',file,init,dest],{encoding:'utf8'});
   assert.notEqual(bad.status,0,'missing session marker was not rejected');
   assert.equal(existsSync(dest),false);
   const healthy=compute(dir,init,{...ESCENARIO_OCHO,pasos:1});
   const invalid=join(dir,'invalid.xi'),invalidResult=join(dir,'invalid.rvp');
   writeFileSync(invalid,compilarGravedad({modo:'continuar',pasos:1}).xi.replace(
    '\nmem_stats\n','\nunknown_force_instruction\n'));
   const outcome=spawnSync(resolve(binary),['run',invalid,healthy.out,invalidResult],{encoding:'utf8'});
   assert.notEqual(outcome.status,0);
   assert.equal(existsSync(invalidResult),false,'bad code must not publish state');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
