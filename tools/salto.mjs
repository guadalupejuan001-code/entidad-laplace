#!/usr/bin/env node
// CLI de transporte: construye programa XI sin ejecutar aritmética de saltos.
import {readFileSync,writeFileSync} from 'node:fs';
import {compilarSalto,leyEjemplo} from '../salto/compilar.mjs';

const help='Salto temporal E005 sobre XI/Ether de REVERSE-PC\n\n'
 +'  node tools/salto.mjs ejemplo HORIZONTE ESTADO_BINARIO SALIDA.xi\n'
 +'  node tools/salto.mjs aprendido CHECKPOINT.json ESTADO_BINARIO HORIZONTE BIN_MUNDO_X SALIDA.xi\n\n'
 +'Compilar en REVERSE: reverse_pc compile SALIDA.xi Laplace.rxe\n'
 +'Ejecutar aislado: reverse_pc init inicial.rvp; reverse_pc run Laplace.rxe inicial.rvp despues.rvp\n';
async function main(){
 const [, ,command,...args]=process.argv;
 if(!command||['help','--help','ayuda'].includes(command)){process.stdout.write(help);return}
 let config,filename;
 if(command==='ejemplo'&&args.length===3){
  config={coefficients:leyEjemplo,steps:args[0],initial:args[1]};filename=args[2];
 }else if(command==='aprendido'&&args.length===5){
  const checkpoint=JSON.parse(readFileSync(args[0],'utf8'));
  const {affineProjection}=await import('../inteligencia/laplace.mjs');
  const projection=affineProjection(args[3],checkpoint);
  config={coefficients:projection.coefficients,initial:args[1],steps:args[2],modelo_sha256:checkpoint.xi_sha256};
  filename=args[4];
 }else throw Error('argumentos inválidos.\n'+help);
 const program=compilarSalto(config);
 writeFileSync(filename,program.xi,{flag:'wx'});
 console.log(JSON.stringify({file:filename,width:program.width,horizon:program.horizon,xi_sha256:program.xi_sha256,
  motor:'XI Machine sobre Ether/InverseMemory',old_forecast_replaced:true},null,2));
}
main().catch(e=>{console.error('LAPLACE_SALTO_FAIL '+e.message);process.exitCode=1});
