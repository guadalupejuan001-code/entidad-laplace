#!/usr/bin/env node
/* Reproduce cálculos con un corte existente; NO consulta API ni negocia dinero. */
import {readFileSync,writeFileSync} from 'node:fs';
import {ejecutarLaplaceIntegral} from '../nucleo/laplace-integral.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output){
  console.error('Uso: node tools/calcular-integral.mjs CORTE.json RESULTADO.json');
  process.exitCode=2;
}else{
  try{
    const raw=JSON.parse(readFileSync(input,'utf8'));
    const result=ejecutarLaplaceIntegral(raw);
    writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({output,field_status:result.laplace_field.status,
      horizons:result.F001.horizons.length,world_states:result.world.valid_at_cut,
      EF004:result.EF004.status,no_auto_trading:true}));
  }catch(e){console.error('Cálculo rechazado: '+e.message);process.exitCode=1}
}
