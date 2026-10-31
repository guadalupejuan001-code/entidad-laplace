#!/usr/bin/env node
/* D002: official CFTC single-count public reports only, no private SDR feeds. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {observeCftcWeekly} from '../universo/swaps/cftc-semanal.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

const args=process.argv.slice(2);
function help(){
  console.log('Uso: npm run swaps:d002 -- --out=registros/swaps/cftc.json [--kinds=gross_notional,trade_dollars,trade_tickets]');
  console.log('Tres páginas públicas CFTC, reportes semanales; NO opera swaps, NO identifica contrapartes.');
}
if(args.includes('--help')||args.includes('--ayuda'))help();
else{
  try{
    const opts={};
    for(const arg of args){
      const m=/^--(out|kinds)=(.{1,180})$/.exec(arg);
      if(!m||Object.hasOwn(opts,m[1]))throw Error('Parámetro D002 inválido/repetido: '+arg);
      opts[m[1]]=m[2];
    }
    if(!opts.out||!opts.out.endsWith('.json'))throw Error('D002 exige --out=ARCHIVO_NUEVO.json');
    const result=await observeCftcWeekly({kinds:opts.kinds?.split(',')});
    if(!result.observations.length)throw Error('Fuentes CFTC no compatibles o inaccesibles; no crear captura vacía');
    const at=new Date().toISOString();
    const snapshot=universeSnapshot(result.observations,{cutoff:at});
    const report=sellarCaptura({
      schema:'laplace-swaps-otc-d002-capture-v1',at,
      universal_state:snapshot,source_status:result.source_status,
      cftc_weekly_coverage:result.coverage,
      table_semantics:result.table_semantics,reported_assets:result.reported_assets,
      source_snapshot_type:result.source_snapshot_type,
      sdr_live_transactions_connected:false,
      public_part43_parser_available:true,
      original_publication_time_certified:false,
      customer_identification:false,otc_global_coverage:false,
      prediction_inputs_enabled:false,automatic_trading:false
    });
    mkdirSync(dirname(opts.out),{recursive:true,mode:0o700});
    writeFileSync(opts.out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({file:opts.out,known_at:at,
      signals:snapshot.known_states,coverage:result.coverage,
      automatic_trading:false},null,2));
  }catch(error){console.error('LAPLACE D002: '+String(error.message));process.exitCode=1}
}
