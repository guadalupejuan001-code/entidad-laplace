#!/usr/bin/env node
// P003: transforma una configuración ΛCDM en un programa XI/RXE reproducible.
import {readFileSync,writeFileSync} from 'node:fs';
import {compilarCosmologia,EJEMPLO} from '../cosmos/lcdm.mjs';
const usage='LAPLACE P003 / historia del universo en XI/Ether\n'
 +'  node tools/cosmos.mjs universo SALIDA.xi\n'
 +'  node tools/cosmos.mjs fino SALIDA.xi\n'
 +'  node tools/cosmos.mjs rango MIN_EXP MAX_EXP SALIDA.xi\n'
 +'  node tools/cosmos.mjs modelo PARAMETROS.json SALIDA.xi\n\n'
 +'  reverse_pc compile SALIDA.xi Cosmos-P003.rxe\n'
 +'  reverse_pc init universo-inicial.rvp\n'
 +'  reverse_pc run Cosmos-P003.rxe universo-inicial.rvp universo-calculado.rvp\n'
 +'El modelo de fondo ΛCDM no simula la singularidad, inflación ni materia individual.\n';
try{
 const [, ,action,...args]=process.argv;
 if(!action||['help','ayuda','--help'].includes(action))process.stdout.write(usage);
 else{
  let source,out;
  if(action==='universo'&&args.length===1){
    source=EJEMPLO;out=args[0];
  }else if(action==='fino'&&args.length===1){
    source={...EJEMPLO,detalle:'digitos'};out=args[0];
  }else if(action==='rango'&&args.length===3){
    source={...EJEMPLO,min_exp:Number(args[0]),max_exp:Number(args[1])};out=args[2];
  }else if(action==='modelo'&&args.length===2){
    source=JSON.parse(readFileSync(args[0],'utf8'));out=args[1];
  }else throw Error('argumentos no válidos\n'+usage);
  const program=compilarCosmologia(source);
  writeFileSync(out,program.xi,{flag:'wx'});
  console.log(JSON.stringify({source:out,schema:program.schema,
    epoch_count:program.epoch_count,
    logical_output_bytes:program.logical_output_bytes,
    model:program.configuration,
    xi_sha256:program.xi_sha256,
    executor:'XI Machine de REVERSE-PC / Inverse Ether Memory',
    note:program.physical_scope},null,2));
 }
}catch(error){console.error('LAPLACE_COSMOS_FAIL '+error.message);process.exitCode=1}
