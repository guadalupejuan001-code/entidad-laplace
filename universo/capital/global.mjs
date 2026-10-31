import {universeSnapshot,utcTime} from '../estados.mjs';
import {sellarCaptura} from '../integridad.mjs';
import {CAPITAL_SCHEMA,PROJECT_MODULES} from './catalogo.mjs';
import {fetchCot,fetchYieldCurve,fetchUSLiquidity} from './fuentes.mjs';

export async function observeCapital({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=20000,archiveResponse,
  cotTimeoutMs=45000,groups=['cot','treasury_curve','us_liquidity']}={}){
  const jobs={cot:fetchCot,treasury_curve:fetchYieldCurve,us_liquidity:fetchUSLiquidity};
  if(!Array.isArray(groups)||!groups.length||new Set(groups).size!==groups.length||
    !groups.every(name=>Object.hasOwn(jobs,name)))throw Error('grupos de capital inválidos');
  const settled=await Promise.allSettled(groups.map(name=>jobs[name]({fetchImpl,now,
    timeoutMs:name==='cot'?cotTimeoutMs:timeoutMs,archiveResponse})));
  const states=[],sources=[],coverage=[],reports=[];let yieldCurve=null,liquidity=null;
  settled.forEach((result,index)=>{
    const name=groups[index];
    if(result.status==='rejected'){
      coverage.push({group:name,status:'unavailable',signals:0});
      sources.push({name:'group-'+name,group:name,status:'unavailable',signals:0,reason:String(result.reason.message).slice(0,220)});return;
    }
    const data=result.value;states.push(...data.observations);
    sources.push(...data.sources.map(source=>({...source,group:name})));
    coverage.push({group:name,status:data.observations.length?'observed':'unavailable',signals:data.observations.length,
      sources_observed:data.sources.filter(source=>source.status==='observed').length,
      sources_failed:data.sources.filter(source=>source.status!=='observed').length});
    reports.push(...(data.reports??[]));
    if(name==='treasury_curve')yieldCurve=data.metadata;
    if(name==='us_liquidity')liquidity=data.metadata;
  });
  const at=utcTime(now()),snapshot=universeSnapshot(states,{cutoff:at});
  return sellarCaptura({schema:CAPITAL_SCHEMA,at,universal_state:snapshot,
    coverage:{known_signals:snapshot.known_states,domains:snapshot.domains.length,groups:coverage,
      observed_sources:sources.filter(source=>source.status==='observed').length,
      failed_sources:sources.filter(source=>source.status!=='observed').length},
    source_status:sources,cot_reports:reports,yield_curve:yieldCurve,us_liquidity:liquidity,
    project_modules:PROJECT_MODULES,parallel_collection_groups:groups.length,
    prediction_inputs_enabled:false,parallel_prediction_engine_validated:false,automatic_trading:false,
    availability_policy:'Fecha de referencia y recepción separadas; no inferir publicaciones históricas ni completar ausencias con cero.'});
}
