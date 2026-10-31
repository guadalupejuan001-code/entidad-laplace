#!/usr/bin/env node
/* C001: public SEC fund flows, read-only, first seen timestamps.
 * No ETF price-based flow estimates and no hidden brokerage transactions.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {NPORT_FUNDS} from '../universo/fondos/catalogo.mjs';
import {observeEtfNport} from '../universo/fondos/global.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
const args=process.argv.slice(2);
const help=()=>console.log('Uso: SEC_USER_AGENT="Nombre Organizacion contacto@dominio" npm run fondos:c001 -- --out=registros/fondos/c001.json [--funds=SPY,SPYM]\nEl usuario configura su propio contacto para consultas públicas SEC; ningún dato se inventa ni se ejecutan órdenes.');
if(args.includes('--help')||args.includes('--ayuda'))help();
else try{
  const opts={};
  for(const arg of args){
    const m=/^--(out|funds)=(.{1,180})$/.exec(arg);
    if(!m||Object.hasOwn(opts,m[1]))throw Error('C001 parámetro inválido/repetido: '+arg);
    opts[m[1]]=m[2];
  }
  if(!opts.out?.endsWith('.json'))throw Error('C001 requiere --out=ARCHIVO_NUEVO.json');
  const ids=opts.funds?.split(',')??NPORT_FUNDS.map(f=>f.id);
  if(ids.length<1||ids.length>2||new Set(ids).size!==ids.length)throw Error('Fondos duplicados/fuera de límite');
  const funds=ids.map(id=>{
    const fund=NPORT_FUNDS.find(x=>x.id===id);
    if(!fund)throw Error('Fondo no cubierto por C001: '+id);
    return fund;
  });
  const report=await observeEtfNport({funds});
  if(!report.observations.length)throw Error('SEC no aportó N-PORT público verificable; consultar fuente y SEC_USER_AGENT. No se publica captura de ceros');
  const snapshot=universeSnapshot(report.observations,{cutoff:report.at});
  const capture=sellarCaptura({schema:'laplace-etf-nport-c001-capture-v1',
    at:report.at,universal_state:snapshot,source_status:report.sources,
    nport_filings:report.filings,coverage:report.coverage,
    original_filing_publication_time_certified:false,
    shares_outstanding_available:false,
    fund_flow_is_daily:false,secondary_market_volume_as_inflow:false,
    btc_trust_ibit_supported:false,automatic_trading:false,
    prediction_inputs_enabled:false});
  mkdirSync(dirname(opts.out),{recursive:true,mode:0o700});
  writeFileSync(opts.out,JSON.stringify(capture,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({file:opts.out,signals:snapshot.known_states,
    funds_observed:report.coverage.funds_observed,funds_missing:report.coverage.funds_missing,
    period_types:'report-level quarterly',automatic_trading:false},null,2));
}catch(error){console.error('LAPLACE C001: '+String(error.message));process.exitCode=1}
