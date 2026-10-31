#!/usr/bin/env node
/* FINRA O001-B: reproducible, read-only, explicit period, no hidden credentials */
import {writeFileSync} from 'node:fs';
import {createFinraClient} from '../universo/otc/finra-query.mjs';
import {checkTargets,observeWeeklyFinra} from '../universo/otc/finra-weekly.mjs';
import {observeMonthlyBlocks} from '../universo/otc/finra-blocks.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

const args=process.argv.slice(2),options={};
function help(){
  console.log('Uso: npm run finra:o001b -- --week=YYYY-MM-DD --month=YYYY-MM-01 --targets=AAPL:T1,SPY:T1 --out=RUTA_NUEVA.json');
  console.log('Se admite --week o --month por separado. Requiere FINRA_API_CLIENT_ID y FINRA_API_CLIENT_SECRET en el entorno del servidor.');
  console.log('NO identificar clientes ni ejecutar órdenes. Semanas publicadas con retraso.');
}
try{
  if(args.includes('--help')||args.includes('--ayuda'))help();
  else{
    for(const arg of args){
      const m=/^--(week|month|targets|out)=(.+)$/.exec(arg);
      if(!m||options[m[1]])throw Error('Parámetro inválido o repetido: '+arg);
      options[m[1]]=m[2];
    }
    if(!options.week&&!options.month)throw Error('Se requiere --week o --month');
    if(!options.out)throw Error('Se requiere --out y archivo nuevo');
    const targets=options.targets?checkTargets(options.targets.split(',').map(s=>{
      const p=s.split(':');if(p.length!==2)throw Error('Formato de --targets SYMBOL:TIER');
      return {symbol:p[0],tier:p[1]};
    })):undefined;
    const client=createFinraClient();
    if(!client.enabled)throw Error('FINRA Public API Credential no configurada: exportar FINRA_API_CLIENT_ID y FINRA_API_CLIENT_SECRET en el servidor; no enviarlas al chat');
    const jobs=[];
    if(options.week)jobs.push(observeWeeklyFinra({weekStart:options.week,targets,client}));
    if(options.month)jobs.push(observeMonthlyBlocks({monthStart:options.month,client}));
    const reports=await Promise.all(jobs),at=new Date().toISOString();
    const observations=reports.flatMap(r=>r.observations),sources=reports.flatMap(r=>r.sources);
    if(!observations.length)throw Error('No hay observaciones publicables (verifica permisos, fechas y límites); cero no equivale a ausencia de actividad');
    const snapshot=universeSnapshot(observations,{cutoff:at});
    const body={
      schema:'laplace-finra-o001b-capture-v1',at,universal_state:snapshot,
      weekly:reports.find(r=>r.schema==='laplace-finra-otc-weekly-o001b-v1')??null,
      monthly_blocks:reports.find(r=>r.schema==='laplace-finra-monthly-blocks-o001b-v1')??null,
      source_status:sources,coverage:{
        known_signals:snapshot.known_states,domains:snapshot.domains.length,
        sources_observed:sources.filter(s=>s.status==='observed').length,
        sources_missing:sources.filter(s=>s.status!=='observed').length,
        coverage_is_global:false
      },private_counterparty_identity_inferred:false,
      publication_time_precision:'day',point_in_time_basis:'first_observed_by_laplace',
      prediction_inputs_enabled:false,automatic_trading:false
    };
    const capture=sellarCaptura(body);
    writeFileSync(options.out,JSON.stringify(capture,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({path:options.out,at,
      signals:capture.coverage.known_signals,sources_observed:capture.coverage.sources_observed,
      sources_missing:capture.coverage.sources_missing,prediction_inputs_enabled:false},null,2));
  }
}catch(error){console.error('FINRA O001-B: '+String(error.message));process.exitCode=1}
