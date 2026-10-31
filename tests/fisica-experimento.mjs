/*
 * LaPlaceDIG P001: pronostico fisico sellado antes de revelar un impulso.
 * Todas las trayectorias son ejecutadas por XI/REVERSE-PC y observadas
 * mediante registros provenientes del runtime, no fabricadas por el anfitrion.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {compilarSistema,escenarioPrueba,leerSalida} from '../fisica/compilar.mjs';

const [,,binary,reportPath]=process.argv;
if(!binary||!reportPath)throw Error('uso: node tests/fisica-experimento.mjs REVERSE_PC_BIN RESULTADO.json');
const base={...escenarioPrueba,ancho_mm:1500,alto_mm:900,masa_kg:2,
  x_mm:120,y_mm:210,vx_mm_s:17,vy_mm_s:11};
const shock={instante_s:9,delta_vx_mm_s:5,delta_vy_mm_s:-7};
const dir=mkdtempSync(join(tmpdir(),'laplace-phys-'));
const digest=value=>createHash('sha256').update(value).digest('hex');
function execute(...args){
 const started=performance.now();
 const p=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
 assert.equal(p.status,0,p.stderr||p.error?.message||'REVERSE-PC failed');
 return {text:p.stdout,elapsed_ms:Math.round((performance.now()-started)*1000)/1000};
}
let serial=0;
function predict(config,start,{rxe=false}={}){
 const n=serial++,m=compilarSistema(config);
 const src=join(dir,'frame-'+n+'.xi'),out=join(dir,'frame-'+n+'.rvp');
 writeFileSync(src,m.xi);
 let source=src;
 if(rxe){
   source=join(dir,'frame-'+n+'.rxe');
   execute('compile',src,source,'Laplace Fisica P001');
 }
 const result=execute('run',source,start,out),parsed=leerSalida(result.text);
 return {frame:Number(m.configuration.horizonte_s),estado:parsed.estado,energia_joules:parsed.energia_joules,
  xi_sha256:m.xi_sha256,elapsed_ms:result.elapsed_ms,persistent_rvp:out,mem_overrides:parsed.mem_stats.overrides};
}
const report={schema:'LAPLACE_FISICA_P001_LAB',world:'2D ideal elastic billiard, SI derived from integer mm/s/kg',
  horizon_test_s:'1000000000000',shock,
  evidence:{},closed_forecast:[],external_event:[],conditional_forecast:[],limits:[]};
try{
 const start=join(dir,'start.rvp');execute('init',start);
 // Step 1: publish every closed-world forecast before introducing the shock.
 for(let h=0;h<=32;h++)report.closed_forecast.push(predict({...base,horizonte_s:h},start));
 report.evidence.sealed_forecast_sha256=digest(JSON.stringify(report.closed_forecast.map(x=>({
   time:x.frame,state:x.estado,xi_sha256:x.xi_sha256}))));
 // Step 2: execute reality WITH an unannounced external momentum impulse at t=9.
 for(let h=0;h<=32;h++){
   const c=h>=shock.instante_s?{...base,horizonte_s:h,impulso:shock}:{...base,horizonte_s:h};
   report.external_event.push(predict(c,start));
 }
 let first=null,unchanged=0,changed=0;
 for(let h=0;h<=32;h++){
   const predicted=report.closed_forecast[h].estado,actual=report.external_event[h].estado;
   const same=Object.keys(predicted).every(key=>predicted[key]===actual[key]);
   if(same)unchanged++;
   else{changed++;if(first===null)first=h;}
 }
 assert.equal(first,9,'el evento externo no aparecio en el instante correcto');
 assert.equal(unchanged,9,'el mundo cerrado divergio antes del choque');
 report.evidence.unknown_impulse={first_divergence_s:first,matching_frames:unchanged,
   different_frames:changed,frames:33};
 // Step 3: calculate CONDITIONAL trajectory with known cause, before contrasting.
 for(let h=0;h<=32;h++){
   const c=h>=shock.instante_s?{...base,horizonte_s:h,impulso:shock}:{...base,horizonte_s:h};
   report.conditional_forecast.push(predict(c,start,{rxe:h===32}));
 }
 const matching=report.conditional_forecast.filter((p,i)=>
   Object.keys(p.estado).every(k=>p.estado[k]===report.external_event[i].estado[k])).length;
 assert.equal(matching,33,'la causa revelada no restauro la coincidencia');
 report.evidence.known_impulse={matching_frames:matching,total_frames:33};
 const E=base.masa_kg*(base.vx_mm_s**2+base.vy_mm_s**2);
 assert.ok(report.closed_forecast.every(f=>f.estado.energia_doble===E));
 assert.equal(report.external_event[8].estado.energia_doble,E);
 assert.notEqual(report.external_event[9].estado.energia_doble,E);
 report.evidence.energy={initial_twice_energy:E,conserved_without_impulse:true,
   energy_changed_only_by_external_impulse:true};
 // Fast-forward without simulating intermediate collisions.
 const billion=predict({...base,horizonte_s:'1000000000000'},start,{rxe:true});
 report.evidence.large_horizon={horizon_s:billion.frame,
   state:billion.estado,xi_sha256:billion.xi_sha256,elapsed_ms:billion.elapsed_ms,
   memory_overrides:billion.mem_overrides};
 assert.ok(billion.estado.x_mm>=0&&billion.estado.x_mm<=base.ancho_mm);
 assert.ok(billion.estado.y_mm>=0&&billion.estado.y_mm<=base.alto_mm);
 assert.equal(billion.estado.energia_doble,E);
 report.evidence.comparison={closed_at_32:report.closed_forecast.at(-1).estado,
   impulse_at_32:report.external_event.at(-1).estado,units:'mm, mm/s, kg, double kinetic energy'};
 report.pass=true;
}finally{
 mkdirSync(dirname(reportPath),{recursive:true});
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 rmSync(dir,{recursive:true,force:true});
}
console.log(JSON.stringify({suite:report.schema,pass:report.pass,closed:report.closed_forecast.length,
  first_divergence_s:report.evidence.unknown_impulse.first_divergence_s,
  conditional_matching:report.evidence.known_impulse.matching_frames,
  horizon_max:report.evidence.large_horizon.horizon_s,
  state_after_1e12:report.evidence.large_horizon.state,
  sha256:report.evidence.sealed_forecast_sha256},null,2));
