#!/usr/bin/env node
/* K001 public read-only snapshots. No wallets, private keys, trades or addresses. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {observeBlockchainDeFi} from '../universo/cripto/global-k001.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

const args=process.argv.slice(2);
const help=()=>console.log('Uso: npm run blockchain:k001 -- --out=registros/k001/captura.json [--groups=bitcoin,ethereum,defi]\nFuentes públicas solamente, sin claves ni direcciones personales. Los datos son estados observados, NO flujos netos ni trading.');
if(args.includes('--help')||args.includes('--ayuda'))help();
else try{
  const opts={};
  for(const arg of args){
    const m=/^--(out|groups)=(.{1,180})$/.exec(arg);
    if(!m||Object.hasOwn(opts,m[1]))throw Error('Argumento K001 inválido o repetido: '+arg);
    opts[m[1]]=m[2];
  }
  if(!opts.out?.endsWith('.json'))throw Error('Se requiere --out=archivo_nuevo.json');
  const report=await observeBlockchainDeFi({groups:opts.groups?.split(',')});
  if(!report.observations.length)throw Error('Ningún feed público produjo estados verificables; no se genera captura ficticia');
  const snapshot=universeSnapshot(report.observations,{cutoff:report.at});
  const capture=sellarCaptura({
    schema:'laplace-blockchain-k001-capture-v1',at:report.at,
    universal_state:snapshot,source_status:report.sources,
    chain_defi_metadata:report.metadata,coverage:report.coverage,rules:report.rules,
    chain_bridges_live_connected:false,
    wallet_private_identity_observed:false,
    capital_inflow_from_tvl_inferred:false,
    supply_changes_equal_token_issuance:false,
    prediction_inputs_enabled:false,automatic_trading:false
  });
  mkdirSync(dirname(opts.out),{recursive:true,mode:0o700});
  writeFileSync(opts.out,JSON.stringify(capture,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({file:opts.out,signals:snapshot.known_states,
    sources_observed:report.coverage.observed_sources,
    sources_missing:report.coverage.missing_sources,
    source_status:report.sources.map(x=>({name:x.name,status:x.status,error:x.error})),
    automatic_trading:false},null,2));
}catch(error){console.error('LAPLACE K001: '+String(error?.message??error));process.exitCode=1}
