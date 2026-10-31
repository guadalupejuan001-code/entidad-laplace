#!/usr/bin/env node
/* D001: one timestamped, auditable snapshot, read-only and no private accounts. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {observeDerivatives} from '../universo/derivados/global.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

function help(){
  console.log('Uso: npm run derivados:d001 -- --out=registros/derivados/actual.json [--groups=binance_usdm,hyperliquid,deribit_options]');
  console.log('Lee solo fuentes públicas. No accede a cuentas privadas ni envía órdenes.');
}
const args=process.argv.slice(2),options={};
if(args.includes('--help')||args.includes('--ayuda'))help();
else{
  try{
    for(const arg of args){
      const match=/^--(out|groups)=(.{1,160})$/.exec(arg);
      if(!match||Object.hasOwn(options,match[1]))throw Error('Parámetro inválido/repetido: '+arg);
      options[match[1]]=match[2];
    }
    if(!options.out)throw Error('Se requiere --out=archivo-nuevo.json');
    if(!options.out.endsWith('.json'))throw Error('Salida debe ser JSON');
    const groups=options.groups?options.groups.split(','):undefined;
    const result=await observeDerivatives({groups});
    if(!result.observations.length)throw Error('Ningún feed entregó datos utilizables; no crear captura ficticia');
    const snapshot=universeSnapshot(result.observations,{cutoff:result.at});
    const capture=sellarCaptura({schema:'laplace-derivatives-d001-capture-v1',at:result.at,
      universal_state:snapshot,source_status:result.sources,
      contract_metadata:result.contracts,derivatives_coverage:result.coverage,
      observed_as_of:'known_at',data_scope:'partial venue-specific sample, not global derivative market',
      funding_venue_interval_not_normalized:true,
      cross_venue_oi_sum_permitted:false,liquidations_unverified:true,
      prediction_inputs_enabled:false,automatic_trading:false});
    mkdirSync(dirname(options.out),{recursive:true,mode:0o700});
    writeFileSync(options.out,JSON.stringify(capture,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({output:options.out,observations:snapshot.known_states,
      coverage:result.coverage,read_only:true,automatic_trading:false},null,2));
  }catch(error){
    console.error('LAPLACE D001: '+String(error.message));process.exitCode=1;
  }
}
