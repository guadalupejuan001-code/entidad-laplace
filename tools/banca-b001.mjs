#!/usr/bin/env node
/* BIS B001: authenticated-free public quarterly statistics, read-only,
 * no users or private account data, no global LBS+CBS sum.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {BIS_SERIES} from '../universo/banca/catalogo-bis.mjs';
import {observeBisBanking} from '../universo/banca/bis-sdmx.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
const args=process.argv.slice(2);
function usage(){
  console.log('Uso: npm run banca:b001 -- --out=registros/banca/bis.json [--ids=LBS_US_RESIDENCE_CROSS_BORDER_CLAIMS,CBS_ALL_REPORTERS_TOTAL_CLAIMS]');
  console.log('Consulta solo series trimestrales públicas del BIS. No son flujos instantáneos ni datos de cuentas bancarias.');
}
if(args.includes('--help')||args.includes('--ayuda'))usage();
else{
  try{
    const opts={};
    for(const arg of args){
      const match=/^--(out|ids)=(.{1,180})$/.exec(arg);
      if(!match||Object.hasOwn(opts,match[1]))throw Error('B001 argumento inválido o repetido: '+arg);
      opts[match[1]]=match[2];
    }
    if(!opts.out?.endsWith('.json'))throw Error('B001 requiere --out=ARCHIVO_NUEVO.json');
    const ids=opts.ids?.split(',')??BIS_SERIES.map(x=>x.id);
    if(!ids.length||ids.length>4||new Set(ids).size!==ids.length)
      throw Error('B001 ids de series faltantes/repetidos');
    const series=ids.map(id=>{
      const found=BIS_SERIES.find(x=>x.id===id);
      if(!found)throw Error('B001 serie no incluida en catálogo oficial: '+id);
      return found;
    });
    const result=await observeBisBanking({series});
    if(result.observations.length===0)
      throw Error('BIS no produjo observaciones verificadas; no se crea captura falsa');
    const snapshot=universeSnapshot(result.observations,{cutoff:result.at});
    const report=sellarCaptura({
      schema:'laplace-banking-b001-capture-v1',at:result.at,
      universal_state:snapshot,
      source_status:result.sources,series_metadata:result.catalog,
      banking_coverage:result.coverage,
      banking_rules:result.rules,
      public_statistical_data_only:true,
      cbs_lbs_combined_total:false,
      flow_from_stock_change:false,retrospective_release_time_assumed:false,
      international_banking_complete:false,automatic_trading:false,
      prediction_inputs_enabled:false
    });
    mkdirSync(dirname(opts.out),{recursive:true,mode:0o700});
    writeFileSync(opts.out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({file:opts.out,records:report.universal_state.known_states,
      data_sources:report.banking_coverage.series_observed,
      sources_missing:report.banking_coverage.series_missing,
      counts_are_independent_not_aggregate:true,automatic_trading:false},null,2));
  }catch(error){
    console.error('LAPLACE B001: '+String(error.message));process.exitCode=1;
  }
}
