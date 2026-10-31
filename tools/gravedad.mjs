#!/usr/bin/env node
// LAPLACE P002 — program compiler and scenario validator. NO physics in JS.
import {readFileSync,writeFileSync} from 'node:fs';
import {compilarGravedad,ESCENARIO_OCHO} from '../fisica/tres-cuerpos.mjs';
const usage='LaPlaceDIG P002 / tres cuerpos gravitacionales en XI/Ether\n'
 +'  node tools/gravedad.mjs ejemplo PASOS SALIDA.xi\n'
 +'  node tools/gravedad.mjs continuar PASOS SALIDA.xi\n'
 +'  node tools/gravedad.mjs compilar ESCENARIO.json SALIDA.xi\n\n'
 +'  reverse_pc compile SALIDA.xi Gravedad-P002.rxe\n'
 +'  reverse_pc init start.rvp\n'
 +'  reverse_pc run Gravedad-P002.rxe start.rvp evolved.rvp\n'
 +'Las continuaciones usan evolved.rvp como entrada, sin borrar la memoria previa.\n';
try{
 const [, ,op,...args]=process.argv;
 if(!op||['--help','ayuda','help'].includes(op)){
   process.stdout.write(usage);
 }else{
   let scenario,output;
   if(op==='ejemplo'&&args.length===2){
     scenario={...ESCENARIO_OCHO,pasos:Number(args[0])};output=args[1];
   }else if(op==='continuar'&&args.length===2){
     scenario={modo:'continuar',pasos:Number(args[0])};output=args[1];
   }else if(op==='compilar'&&args.length===2){
     scenario=JSON.parse(readFileSync(args[0],'utf8'));output=args[1];
   }else throw Error('argumentos invalidos\n'+usage);
   const result=compilarGravedad(scenario);
   writeFileSync(output,result.xi,{flag:'wx'});
   console.log(JSON.stringify({schema:result.schema,path:output,mode:result.modo,
     ticks:result.pasos,source_bytes:Buffer.byteLength(result.xi),
     xi_sha256:result.xi_sha256,
     state:'XI Machine en REVERSE-PC y Inverse Ether Memory',
     approximation:'gravedad Plummer, punto material, simplificacion numerica y tiempo discreto'},null,2));
 }
}catch(e){console.error('LAPLACE_P002_FAIL '+e.message);process.exitCode=1}
