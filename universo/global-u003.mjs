/* U003 — segunda expansión mundial.
 * Parte de U002/369 y agrega dominios económicos y logísticos sin alterar
 * todavía los predictores. Todos los grupos son fail-soft por fuente.
 */
import {observeGlobalUniverse} from './global.mjs';
import {universeSnapshot,utcTime} from './estados.mjs';
import {sellarCaptura} from './integridad.mjs';
import {
  fetchRegionalMarkets,fetchCommodityFutures,fetchPolicyRates,fetchBlsEmployment,
  fetchHighFrequencyLabour,fetchExactMacroVintages,fetchElectricity,fetchMaritime,fetchGeoNews,
  fetchAirTraffic,fetchDirectExchanges
} from './fuentes-u003.mjs';
import {fetchOfficialCentralBanks,fetchPublicDirectExchanges,fetchDatedCommodityContracts} from './fuentes-oficiales.mjs';
import {observeCapital} from './capital/global.mjs';
import {observeFinraOffExchange} from './otc/finra-regsho.mjs';
import {createFinraClient} from './otc/finra-query.mjs';
import {observeWeeklyFinra} from './otc/finra-weekly.mjs';
import {observeMonthlyBlocks} from './otc/finra-blocks.mjs';
import {observeDerivatives} from './derivados/global.mjs';
import {observeCftcWeekly} from './swaps/cftc-semanal.mjs';
import {observeEtfNport} from './fondos/global.mjs';
import {observeBisBanking} from './banca/bis-sdmx.mjs';

export const U003_VERSION='laplace-universo-global-u003-v4';
const need=(c,m)=>{if(!c)throw Error(m)};
export async function observeWorldU003({
  fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=15000,
  includeAir=true,includeDirectExchanges=true,
  openSkyClientId=process.env.OPENSKY_CLIENT_ID,
  openSkyClientSecret=process.env.OPENSKY_CLIENT_SECRET,
  jquantsApiKey=process.env.JQUANTS_API_KEY,
  finraTradeDate=process.env.LAPLACE_FINRA_TRADE_DATE??null,
  finraWeekStart=process.env.LAPLACE_FINRA_WEEK_START??null,
  finraMonthStart=process.env.LAPLACE_FINRA_MONTH_START??null,
  includeDerivatives=process.env.LAPLACE_D001_ENABLED==='true',
  includeOtcSwaps=process.env.LAPLACE_D002_ENABLED==='true',
  includeEtfFunds=process.env.LAPLACE_C001_ENABLED==='true',
  includeBanking=process.env.LAPLACE_B001_ENABLED==='true'
}={}){
  const jobs=[
    ['regional_markets',()=>fetchRegionalMarkets({fetchImpl,now,timeoutMs})],
    ['commodity_futures',()=>fetchCommodityFutures({fetchImpl,now,timeoutMs})],
    ['policy_rates',()=>fetchPolicyRates({fetchImpl,now,timeoutMs})],
    ['official_central_banks',()=>fetchOfficialCentralBanks({fetchImpl,now,timeoutMs})],
    ['employment_monthly',()=>fetchBlsEmployment({fetchImpl,now,timeoutMs})],
    ['employment_high_frequency',()=>fetchHighFrequencyLabour({fetchImpl,now,timeoutMs})],
    ['macro_exact_vintages',()=>fetchExactMacroVintages({fetchImpl,now,timeoutMs})],
    ['electricity',()=>fetchElectricity({fetchImpl,now,timeoutMs})],
    ['maritime',()=>fetchMaritime({fetchImpl,now,timeoutMs})],
    ['geo_news',()=>fetchGeoNews({fetchImpl,now,timeoutMs})],
    ['dated_commodity_contracts',()=>fetchDatedCommodityContracts({fetchImpl,now,timeoutMs})],
    ['capital_u004',async()=>{
      const capture=await observeCapital({fetchImpl,now,timeoutMs});
      return {observations:capture.universal_state.states,sources:capture.source_status,
        capital_metadata:{capture_sha256:capture.capture_sha256,coverage:capture.coverage,
          cot_reports:capture.cot_reports,yield_curve:capture.yield_curve,us_liquidity:capture.us_liquidity,
          project_modules:capture.project_modules}};
    }]
  ];
  // B001 agrega SOLO series BIS trimestrales oficiales. LBS y CBS tienen
  // poblaciones distintas y nunca se suman ni se convierte stock en flujo.
  if(includeBanking)jobs.push(['bis_banking_b001',async()=>{
    const report=await observeBisBanking({fetchImpl,now,timeoutMs});
    return {observations:report.observations,sources:report.sources,
      banking_metadata:{coverage:report.coverage,series_catalog:report.catalog,
        rules:report.rules,global_banking_complete:false,
        prediction_inputs_enabled:false,automatic_trading:false}};
  }]);
  // C001 solo observa fondos registrados SEC. No confundir flujos N-PORT
  // trimestrales con flujos diarios de ETF ni con cambios del precio.
  if(includeEtfFunds)jobs.push(['etf_fund_flows_c001',async()=>{
    const report=await observeEtfNport({fetchImpl,now,timeoutMs});
    return {observations:report.observations,sources:report.sources,
      etf_metadata:{coverage:report.coverage,collection_status:report.collection_status,
        filings:report.filings,unsupported_trusts:report.unsupported_trusts,
        etf_daily_creations_observed:false,prediction_inputs_enabled:false,
        automatic_trading:false}};
  }]);
  // D002 recoge agregados CFTC públicos con cortes; el SDR transaccional
  // necesita un adaptador de formato del proveedor, no se conecta por defecto.
  if(includeOtcSwaps)jobs.push(['swaps_otc_d002',async()=>{
    const report=await observeCftcWeekly({fetchImpl,now,timeoutMs});
    return {observations:report.observations,sources:report.source_status,
      swaps_metadata:{coverage:report.coverage,table_semantics:report.table_semantics,
        prediction_inputs_enabled:false,automatic_trading:false}};
  }]);
  // D001 queda opt-in para no alterar la cobertura previa ni el predictor.
  if(includeDerivatives)jobs.push(['derivatives_d001',async()=>{
    const report=await observeDerivatives({fetchImpl,now,timeoutMs});
    return {observations:report.observations,sources:report.sources,
      contracts:report.contracts,derivatives_metadata:{coverage:report.coverage,
        started_at:report.started_at,at:report.at,
        prediction_inputs_enabled:false,automatic_trading:false}};
  }]);
  // FINRA O001-B no consulta sin un período solicitado.
  // Credenciales públicas de FINRA permanecen en variables del servidor.
  const finraClient=finraWeekStart||finraMonthStart?
    createFinraClient({fetchImpl,now,timeoutMs}):null;
  if(finraWeekStart)jobs.push(['finra_ats_otc_weekly',async()=>{
    const report=await observeWeeklyFinra({weekStart:finraWeekStart,
      client:finraClient,now});
    return {observations:report.observations,sources:report.sources,
      finra_weekly_metadata:{week_start:report.week_start,coverage:report.coverage,
        venue_count:report.venues?.length??0,status:report.status,
        no_double_counting:true}};
  }]);
  if(finraMonthStart)jobs.push(['finra_ats_otc_monthly_blocks',async()=>{
    const report=await observeMonthlyBlocks({monthStart:finraMonthStart,
      client:finraClient,now});
    return {observations:report.observations,sources:report.sources,
      finra_monthly_metadata:{month_start:report.month_start,
        coverage:report.coverage,venue_count:report.venues?.length??0,
        status:report.status,no_double_counting:true}};
  }]);
  // FINRA no es un feed intradía. Activar sólo para un día explícito publicado.
  // Si falla, U003 conserva el fallo sin inventar volumen ni reemplazarlo por cero.
  if(finraTradeDate)jobs.push(['finra_off_exchange',()=>observeFinraOffExchange({
    tradeDate:finraTradeDate,fetchImpl,now,timeoutMs})]);
  if(includeAir)jobs.push(['air_traffic',()=>fetchAirTraffic({fetchImpl,now,timeoutMs,clientId:openSkyClientId,clientSecret:openSkyClientSecret})]);
  if(includeDirectExchanges){
    jobs.push(['direct_exchanges',()=>fetchDirectExchanges({fetchImpl,now,timeoutMs,jquantsApiKey})]);
    jobs.push(['public_direct_exchanges',()=>fetchPublicDirectExchanges({fetchImpl,now,timeoutMs})]);
  }
  const [base,settled]=await Promise.all([observeGlobalUniverse({fetchImpl,now,timeoutMs}),Promise.all(jobs.map(async ([name,fn])=>{
    try{return {name,status:'fulfilled',value:await fn()}}
    catch(error){return {name,status:'rejected',reason:String(error.message).slice(0,220)}}
  }))]);
  const captured=utcTime(now());
  const observations=[...base.universal_state.states],sources=[...base.source_status.map(x=>({...x,group:'u002_base'}))],groups=[],contracts=[],vintages=[],alerts=[];
  let geoCoverage=null,capitalMetadata=null,finraWeeklyMetadata=null,finraMonthlyMetadata=null,derivativesMetadata=null,swapsMetadata=null,etfMetadata=null,bankingMetadata=null;
  for(const g of settled){
    if(g.status==='fulfilled'){
      observations.push(...g.value.observations);
      contracts.push(...(g.value.contracts??[]));vintages.push(...(g.value.vintages??[]));
      alerts.push(...(g.value.geolocated_alerts??[]));
      if(g.name==='geo_news')geoCoverage=g.value.coverage??null;
      if(g.name==='capital_u004')capitalMetadata=g.value.capital_metadata??null;
      if(g.name==='derivatives_d001')derivativesMetadata=g.value.derivatives_metadata??null;
      if(g.name==='swaps_otc_d002')swapsMetadata=g.value.swaps_metadata??null;
      if(g.name==='etf_fund_flows_c001')etfMetadata=g.value.etf_metadata??null;
      if(g.name==='bis_banking_b001')bankingMetadata=g.value.banking_metadata??null;
      if(g.name==='finra_ats_otc_weekly')finraWeeklyMetadata=g.value.finra_weekly_metadata??null;
      if(g.name==='finra_ats_otc_monthly_blocks')finraMonthlyMetadata=g.value.finra_monthly_metadata??null;
      sources.push(...g.value.sources.map(x=>({...x,group:g.name})));
      groups.push({group:g.name,status:g.value.observations.length?'observed':
        g.value.sources.some(x=>['requires_credentials','requires_license','requires_contact'].includes(x.status))?'requires_access':'unavailable',signals:g.value.observations.length,
        sources_ok:g.value.sources.filter(x=>x.status==='observed').length,
        sources_optional:g.value.sources.filter(x=>['requires_credentials','requires_license','requires_contact'].includes(x.status)).length,
        sources_failed:g.value.sources.filter(x=>x.status==='unavailable').length});
    }else groups.push({group:g.name,status:'unavailable',signals:0,sources_ok:0,sources_optional:0,sources_failed:1,reason:g.reason});
  }
  need(observations.length<=4096,'U003 excedió 4096 estados; requiere partición por dominio');
  const snapshot=universeSnapshot(observations,{cutoff:captured});
  const observed=sources.filter(x=>x.status==='observed'),failed=sources.filter(x=>x.status==='unavailable'),optional=sources.filter(x=>['requires_credentials','requires_license','requires_contact'].includes(x.status));
  return sellarCaptura({
    schema:U003_VERSION,at:captured,base_u002_capture_sha256:base.capture_sha256,
    universal_state:snapshot,
    coverage:{
      base_signals:base.coverage.known_signals,
      known_signals:snapshot.known_states,
      added_signals:snapshot.known_states-base.coverage.known_signals,
      domains:snapshot.domains.length,groups,
      observed_sources:observed.length,failed_sources:failed.length,optional_sources:optional.length
    },
    source_status:sources,
    contract_metadata:contracts,macro_vintages:vintages,
    geolocated_alerts:alerts,geo_news_coverage:geoCoverage,
    capital_u004:capitalMetadata,derivatives_d001:derivativesMetadata,
    swaps_otc_d002:swapsMetadata,etf_fund_flows_c001:etfMetadata,
    bis_banking_b001:bankingMetadata,
    finra_weekly:finraWeeklyMetadata,finra_monthly_blocks:finraMonthlyMetadata,
    availability_policy:{
      known_at:'momento_de_captura_o_primera_observacion_por_laplace',
      vintage_date:'ALFRED initial-release date when FRED_API_KEY is configured; day precision only',
      exact_historical_publication_time:false,
      archive_future_captures:true,
      note:'known_at es recepción real. Una fecha ALFRED no acredita una hora intradía; se conserva aparte y nunca se transforma en medianoche histórica.'
    },
    direct_exchange_policy:'TWSE diario, B3 muestra pública de mayores movimientos y MOEX índice diario son conexiones primarias públicas. JPX requiere JQUANTS_API_KEY. B3 completo y Deutsche Börse siguen pendientes de licencia.',
    prediction_inputs_enabled:false,causal_certification:false,full_universe_observed:false,automatic_trading:false
  });
}
