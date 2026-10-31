#!/usr/bin/env node
/* XG01 crudo con muestras suministradas. Sin red ni trading.
 * Escribe archivo NUEVO y no falsea predicciones financieras.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {experimentOneRaw} from '../experimentos/xg01-raw-trace.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output){
 console.error('Uso: node tools/xg01-raw.mjs ENTRADA.json SALIDA-RAW.json');
 process.exitCode=2;
}else try{
 const data=JSON.parse(readFileSync(input,'utf8'));
 const result=experimentOneRaw(data.samples,data.target,
   data.plan?{plan:data.plan}:{});
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output,rows:result.test_decisions,
    evaluated:result.evaluated_decisions,model_unchanged:true,
    source:'user_supplied_samples',automatic_trading:false}));
}catch(e){console.error('XG01 raw: '+e.message);process.exitCode=1}
