#!/usr/bin/env node
// P005: compile a sparse Rule90 world to XI without calculating its future.
import {readFileSync,writeFileSync} from 'node:fs';
import {compilarMegaceldas,EJEMPLO} from '../escala/compilar.mjs';
const help='LAPLACE P005 — experimento exabyte en XI/Ether\n'
 +'  node tools/exabyte.mjs ejemplo SALIDA.xi MANIFIESTO.json\n'
 +'  node tools/exabyte.mjs modelo MODELO.json SALIDA.xi MANIFIESTO.json\n\n'
 +'  reverse_pc compile SALIDA.xi LAPLACE-Exabyte.rxe\n'
 +'  reverse_pc init inicio.rvp\n'
 +'  reverse_pc run LAPLACE-Exabyte.rxe inicio.rvp resultado.rvp\n'
 +'Se calculan celdas solicitadas y conteo exacto de Rule90, NO un exabyte físico.\n';
try{
 const [,,action,...args]=process.argv;
 if(!action||['help','--help','ayuda'].includes(action))process.stdout.write(help);
 else{
  let data,programPath,manifestPath;
  if(action==='ejemplo'&&args.length===2){
    data=EJEMPLO;[programPath,manifestPath]=args;
  }else if(action==='modelo'&&args.length===3){
    data=JSON.parse(readFileSync(args[0],'utf8'));
    [programPath,manifestPath]=args.slice(1);
  }else throw Error('argumentos inválidos\n'+help);
  const manifest=compilarMegaceldas(data);
  const {xi,...published}=manifest;
  // Don't overwrite existing work. Validate file destination names beforehand.
  if(programPath===manifestPath)throw Error('manifiesto y programa deben diferir');
  writeFileSync(programPath,xi,{flag:'wx'});
  writeFileSync(manifestPath,JSON.stringify(published,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({program:programPath,manifest:manifestPath,
    logical_cells:manifest.logical_cells,
    dense_bitpacked_bytes:manifest.dense_bitpacked_bytes,
    time_steps:manifest.settings.steps,queries:manifest.settings.query_count,
    original_executor:'REVERSE-PC XI Machine + Ether Memory',
    note:'Ahorro estructural para regla lineal, no prueba de ventaja sobre algoritmos clásicos optimizados'},null,2));
 }
}catch(e){console.error('LAPLACE_EXABYTE_FAIL '+e.message);process.exitCode=1}
