#!/usr/bin/env node
/* O001: capture confirmed public FINRA day; emit observations, not trade signals.
 * A --date is required because a missing/unpublished day is not a zero volume.
 */
import {writeFileSync} from 'node:fs';
import {observeFinraOffExchange} from '../universo/otc/finra-regsho.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

const args=process.argv.slice(2);
function usage(){
  console.log('Uso: npm run finra:o001 -- YYYYMMDD NUEVO_RESULTADO.json [--symbols=AAPL,SPY,...]');
  console.log('No usa credenciales ni entrega identidades o órdenes; no sobrescribe resultados.');
}
if(args.includes('--help')||args.includes('--ayuda')){usage();process.exit(0)}
const [date,file]=args;
if(!date||!file||file.startsWith('--')){usage();process.exitCode=2}
else {
  try{
    const rawSymbols=args.find(x=>x.startsWith('--symbols='));
    const symbols=rawSymbols?rawSymbols.slice(10).split(',').map(x=>x.trim().toUpperCase()):undefined;
    const data=await observeFinraOffExchange({tradeDate:date,symbols});
    const at=new Date().toISOString();
    const snapshot=universeSnapshot(data.observations,{cutoff:at});
    const output=sellarCaptura({
      schema:'laplace-finra-offexchange-o001-capture-v1',at,
      universal_state:snapshot,source_status:data.sources,trade_date:data.trade_date,
      coverage:{known_signals:snapshot.known_states,domains:snapshot.domains.length,
        observed_sources:data.sources.filter(x=>x.status==='observed').length,
        failed_sources:data.sources.filter(x=>x.status==='unavailable').length},
      interpretation:'daily_finra_reported_off_exchange_short_sale_volume',
      publication_timestamp_verified:false,prediction_inputs_enabled:false,
      identifiable_counterparties:false,automatic_trading:false
    });
    writeFileSync(file,JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({path:file,trade_date:date,signals:output.coverage.known_signals,
      observed_sources:output.coverage.observed_sources,
      missing_sources:output.coverage.failed_sources,prediction_inputs_enabled:false},null,2));
  }catch(error){console.error('FINRA O001: '+String(error.message));process.exitCode=1}
}
