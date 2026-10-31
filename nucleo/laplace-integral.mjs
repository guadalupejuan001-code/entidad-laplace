/**
 * Núcleo integral de laboratorio: ejecuta F001, audita todos los estados
 * EF002/U003 conocidos al corte, aplica el Laplaciano armónico real, y
 * ejecuta EF004 sólo cuando se proporcionen capturas temporales verificables.
 * El resto del código se inventaría como conectado si no tiene ejecutor:
 * por eso se informa separadamente la disponibilidad de cada familia.
 */
import {fusionTemporal} from '../prediccion/fusion-temporal.mjs';
import {aprenderNucleoEF004} from '../demonio/finanzas-ef004.mjs';
import {resolverLaplaceGrafo} from '../ecuacion/laplace-grafo.mjs';
import {aplicarLaplaceAHorizontes,auditarUniversoLaplace} from '../ecuacion/laplace-financiero.mjs';
export const INTEGRAL_SCHEMA='laplace-integral-investigacion-v1';
const modules=Object.freeze([
  {id:'M001',category:'historical_analogs',engine:'F001'},
  {id:'F001',category:'multihorizon_fusion',engine:'F001'},
  {id:'X002',category:'native_temporal_training',engine:null},
  {id:'XN01',category:'original_XI_Ether',engine:null},
  {id:'EF001',category:'bitemporal_financial_storage',engine:null},
  {id:'EF002',category:'world_snapshots',engine:'world_audit'},
  {id:'EF003',category:'declared_transition_laws',engine:null},
  {id:'EF004',category:'multi_state_statistical_learning',engine:'EF004'},
  {id:'EF005',category:'scalable_archival',engine:null},
  {id:'U002/U003/U004',category:'world_observation',engine:'world_audit'},
  {id:'C001',category:'etf_fund_flows',engine:'world_audit'},
  {id:'O001',category:'finra_off_exchange',engine:'world_audit'},
  {id:'D001/D002',category:'derivatives_swaps',engine:'world_audit'},
  {id:'B001',category:'international_banking',engine:'world_audit'},
  {id:'K001',category:'blockchain_defi',engine:'world_audit'},
  {id:'LAPLACE_PDE',category:'harmonic_graph_equation',engine:'field'}
]);
export function ejecutarLaplaceIntegral({quote,series={},world=null,asOf,captures=null}={}){
  const fusion=fusionTemporal({quote,series,world,asOf});
  const field=aplicarLaplaceAHorizontes(fusion.horizons,{
    quotePrice:Number(quote.value),asset:'BTC-USD',solver:resolverLaplaceGrafo});
  const coverage=auditarUniversoLaplace(world,{asOf});
  let ef004;
  if(Array.isArray(captures)&&captures.length>=2)
    ef004=aprenderNucleoEF004(captures);
  else
    ef004={status:'abstained',reason:'independent_ef002_history_unavailable',
      model_ready:false,production_activation_allowed:false};
  const groups=world?.coverage?.groups??world?.groups??[];
  const countGroup=id=>Number(groups.find(g=>g.group===id)?.signals??0);
  const availability=modules.map(m=>{
    let status;
    if(m.engine==='F001')status='executed';
    else if(m.engine==='field')status=field.status;
    else if(m.engine==='EF004')status=ef004.status;
    else if(m.id==='C001')
      status=coverage.etf_fund_flow_signals>0?'observed':'not_observed';
    else if(m.id==='D001/D002')
      status=countGroup('derivatives_d001')>0&&countGroup('swaps_otc_d002')>0?
        'observed_in_archive':'incomplete_or_missing';
    else if(m.id==='B001')
      status=countGroup('bis_banking_b001')>0?'observed_in_archive':'not_observed';
    else if(m.id==='K001')
      status=countGroup('blockchain_defi_k001')>0?'observed_in_archive':'not_observed';
    else if(m.id==='O001')
      status=coverage.domains.some(d=>/finra|off.exchange|otc/i.test(d.domain))?
        'observed_in_archive':'not_observed';
    else if(m.engine==='world_audit')
      status=coverage.valid_at_cut?'observed_not_all_predictive':'no_valid_capture';
    else status='code_not_executed_in_this_entrypoint';
    return {id:m.id,category:m.category,status};
  });
  return {schema:INTEGRAL_SCHEMA,as_of:asOf,quote:fusion.quote,
    F001:fusion,laplace_field:field,world:coverage,EF004:ef004,
    modules:availability,global_price_predictive_skill_proven:false,
    all_financial_sources_available:false,no_auto_trading:true};
}
