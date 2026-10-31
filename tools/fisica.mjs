#!/usr/bin/env node
// P001 CLI: solo transporta un escenario fisico JSON a una fuente XI.
import {readFileSync,writeFileSync} from 'node:fs';
import {compilarSistema,escenarioPrueba} from '../fisica/compilar.mjs';

const help='LaPlaceDIG FISICA P001 -- billar elastico 2D sobre XI/Ether\n'
 +'  node tools/fisica.mjs ejemplo HORIZONTE_S OUTPUT.xi\n'
 +'  node tools/fisica.mjs compilar ESCENARIO.json OUTPUT.xi\n\n'
 +'  reverse_pc compile OUTPUT.xi Escenario-Fisico.rxe\n'
 +'  reverse_pc init inicial.rvp\n'
 +'  reverse_pc run Escenario-Fisico.rxe inicial.rvp evolucion.rvp\n'
 +'La masa, posiciones, dimensiones y velocidades del modelo estan expresadas en kg, mm, mm/s.\n';
try{
  const [, ,command,...args]=process.argv;
  if(!command||['ayuda','help','--help'].includes(command)){
    process.stdout.write(help);
  }else{
    let config,output;
    if(command==='ejemplo'&&args.length===2){
      config={...escenarioPrueba,horizonte_s:args[0]};
      output=args[1];
    }else if(command==='compilar'&&args.length===2){
      config=JSON.parse(readFileSync(args[0],'utf8'));
      output=args[1];
    }else throw new Error('argumentos invalidos\n'+help);
    const model=compilarSistema(config);
    writeFileSync(output,model.xi,{flag:'wx'});
    process.stdout.write(JSON.stringify({file:output,mode:model.schema,
      configuration_sha256:model.configuration_sha256,xi_sha256:model.xi_sha256,
      horizon_s:model.configuration.horizonte_s,
      impulso:model.configuration.impulso,
      motor:'XI Machine / REVERSE-PC / Inverse Ether Memory',
      note:'Prediccion exacta solamente dentro del modelo fisico ideal definido'},null,2)+'\n');
  }
}catch(error){console.error('LAPLACE_FISICA_FAIL '+error.message);process.exitCode=1}
