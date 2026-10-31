#!/usr/bin/env node
/* F001 - una captura simultánea, un resultado F001, sin órdenes financieras. */
import {writeFileSync} from 'node:fs';
import {ejecutarFusionEnVivo} from '../prediccion/fuentes-paralelas.mjs';
const args=process.argv.slice(2);
if(args.includes('--ayuda')||args.includes('--help')){
  console.log('Uso: node tools/fusion.mjs [ARCHIVO_NUEVO.json] [--sin-mundo]');
  process.exit(0);
}
try{
  const report=await ejecutarFusionEnVivo({includeWorld:!args.includes('--sin-mundo')});
  const output=JSON.stringify(report,null,2)+'\n';
  const file=args.find(x=>!x.startsWith('--'));
  if(file){
    writeFileSync(file,output,{flag:'wx',mode:0o600});
    console.log(JSON.stringify({file,as_of:report.as_of,
      horizons:report.horizons.length,
      modeled:report.horizons.filter(h=>h.price_candidate!==null).length,
      world_signals:report.context.usable,lanes:report.collection.lanes,
      automatic_trading:false},null,2));
  }else process.stdout.write(output);
}catch(error){
  console.error('F001: '+String(error.message));
  process.exitCode=1;
}
