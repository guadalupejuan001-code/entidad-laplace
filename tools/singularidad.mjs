#!/usr/bin/env node
// LaPlaceDIG P004 — compiler and export only. All physics is executed inside XI.
import {readFileSync,writeFileSync} from 'node:fs';
import {compilarSingularidad,DEFAULT} from '../cosmos/singularidad.mjs';
const usage='LAPLACE P004 / frontera de la singularidad clasica (a→0)\n'
  +'  node tools/singularidad.mjs ejemplo SALIDA.xi\n'
  +'  node tools/singularidad.mjs rango EXP_INICIAL EXP_FINAL SALIDA.xi\n'
  +'  node tools/singularidad.mjs modelo PARAMETROS.json SALIDA.xi\n\n'
  +'  reverse_pc compile SALIDA.xi Laplace-P004.rxe\n'
  +'  reverse_pc init inicial.rvp\n'
  +'  reverse_pc run Laplace-P004.rxe inicial.rvp resultado.rvp\n'
  +'No se simula el estado t=0: se calcula el limite clasico y la frontera de Planck.\n';
try{
 const [,,cmd,...args]=process.argv;
 if(!cmd||['help','ayuda','--help'].includes(cmd))process.stdout.write(usage);
 else{
   let configuration,out;
   if(cmd==='ejemplo'&&args.length===1){
     configuration=DEFAULT;out=args[0];
   }else if(cmd==='rango'&&args.length===3){
     configuration={start_exp:Number(args[0]),end_exp:Number(args[1])};out=args[2];
   }else if(cmd==='modelo'&&args.length===2){
     configuration=JSON.parse(readFileSync(args[0],'utf8'));out=args[1];
   }else throw Error('argumentos inválidos\n'+usage);
   const compiled=compilarSingularidad(configuration);
   writeFileSync(out,compiled.xi,{flag:'wx'});
   console.log(JSON.stringify({file:out,schema:compiled.schema,
     epochs:compiled.epoch_count,logical_bytes:compiled.logical_state_bytes,
     sha256:compiled.xi_sha256,physics:compiled.physical_validity,
     executor:'XI Machine original REVERSE-PC / Inverse Ether Memory'},null,2));
 }
}catch(err){console.error('LAPLACE_P004_FAIL '+err.message);process.exitCode=1}
