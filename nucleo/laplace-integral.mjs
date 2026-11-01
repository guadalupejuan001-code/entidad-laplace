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
import {resumirCapacidades} from './registro-capacidades.mjs';
import {aplicarLaplaceAHorizontes,auditarUniversoLaplace} from '../ecuacion/laplace-financiero.mjs';
export const INTEGRAL_SCHEMA='laplace-integral-investigacion-v1';

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
  // Un solo registro de capacidades para CLI, pruebas y APK.
  // Disponibilidad de código NO equivale a observación ni ejecución real.
  const capabilities=resumirCapacidades({world,ef004,
    executed:{f001:true},asOf});
  const availability=capabilities.items.map(x=>({
    id:x.key,number:x.id,category:x.title,status:x.state,
    reason:x.reason,source:x.source
  }));
  return {schema:INTEGRAL_SCHEMA,as_of:asOf,quote:fusion.quote,
    F001:fusion,laplace_field:field,world:coverage,EF004:ef004,
    modules:availability,capabilities,global_price_predictive_skill_proven:false,
    all_financial_sources_available:false,no_auto_trading:true};
}
