/* U002 — expansión mundial de Laplace.
 * Ejecuta colectores independientes, conserva fallos por fuente y produce un
 * único snapshot cronológico U001/U002 compatible con Ether/XI.
 */
import {universeSnapshot,utcTime} from './estados.mjs';
import {sellarCaptura} from './integridad.mjs';
import {fetchGlobalMarkets,fetchGlobalCrypto,fetchGlobalMacro,fetchGlobalWeather,fetchGlobalPhysical} from './fuentes-globales.mjs';
import {EXPECTED_SIGNAL_BUDGET,MARKET_SYMBOLS,CRYPTO_PRODUCTS,MACRO_ECONOMIES,WEATHER_GRID} from './catalogo-global.mjs';

export const U002_VERSION='laplace-universo-global-u002-v1';
const need=(c,m)=>{if(!c)throw Error(m)};
export async function observeGlobalUniverse({
  fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=12000,
  groups=['markets','crypto','macro','weather','physical'],additionalObservations=[]
}={}){
  const allowed=new Set(['markets','crypto','macro','weather','physical']);
  need(Array.isArray(groups)&&groups.length&&groups.every(x=>allowed.has(x)),'grupos globales inválidos');
  const jobs={
    markets:()=>fetchGlobalMarkets({fetchImpl,now,timeoutMs}),
    crypto:()=>fetchGlobalCrypto({fetchImpl,now,timeoutMs}),
    macro:()=>fetchGlobalMacro({fetchImpl,now,timeoutMs}),
    weather:()=>fetchGlobalWeather({fetchImpl,now,timeoutMs}),
    physical:()=>fetchGlobalPhysical({fetchImpl,now,timeoutMs})
  };
  const settled=await Promise.all(groups.map(async name=>{
    try{return {name,status:'fulfilled',value:await jobs[name]()}}
    catch(error){return {name,status:'rejected',reason:String(error.message).slice(0,220)}}
  }));
  const captured=utcTime(now());
  const observations=[...additionalObservations],sources=[],groupSummary=[];
  for(const g of settled){
    if(g.status==='fulfilled'){
      observations.push(...g.value.observations);sources.push(...g.value.sources.map(x=>({...x,group:g.name})));
      groupSummary.push({group:g.name,status:g.value.observations.length?'observed':'unavailable',signals:g.value.observations.length,
        sources_ok:g.value.sources.filter(x=>x.status==='observed').length,
        sources_failed:g.value.sources.filter(x=>x.status!=='observed').length});
    }else groupSummary.push({group:g.name,status:'unavailable',signals:0,sources_ok:0,sources_failed:1,reason:g.reason});
  }
  need(observations.length<=4096,'U002 excedió el presupuesto de 4096 estados; particionar la captura');
  const snapshot=universeSnapshot(observations,{cutoff:captured});
  const successful=sources.filter(x=>x.status==='observed'),failed=sources.filter(x=>x.status!=='observed');
  return sellarCaptura({
    schema:U002_VERSION,at:captured,universal_state:snapshot,
    coverage:{
      known_signals:snapshot.known_states,domains:snapshot.domains.length,
      requested_groups:groups,groups:groupSummary,
      observed_sources:successful.length,failed_sources:failed.length,
      market_assets_catalogued:MARKET_SYMBOLS.length,crypto_assets_catalogued:CRYPTO_PRODUCTS.length,
      macro_economies_catalogued:MACRO_ECONOMIES.length,weather_cells_catalogued:WEATHER_GRID.length,
      nominal_signal_budget:EXPECTED_SIGNAL_BUDGET
    },
    source_status:sources,
    causal_certification:false,full_universe_observed:false,
    prediction_inputs_enabled:false,automatic_trading:false,
    policy:'Toda señal entra como estado observado. Solo una validación temporal posterior puede promoverla a entrada predictiva.'
  });
}
