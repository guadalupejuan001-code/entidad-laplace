/* Comparación emparejada: los dos modelos deben compartir activo, referencia
 * y cierre objetivo. No convierte una diferencia de fechas en un acierto. */
import {verificarPronosticoC03} from '../prediccion/conjunta-c03.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m)};
export function validarContextoC04(context,record){
  const f=context?.forecast;if(!f)return true;
  verificarPronosticoC03(f);
  need(f.asset===record.asset&&Date.parse(f.issued_at)/1000<=record.issuedAt,
    'C04: contexto de otro activo o emitido después del registro');
  return true;
}
export function compararPronosticosC04(record,actualPrice,observedCloseAt){
  const f=record.jointContext?.forecast;
  if(!f)return {status:'context_forecast_not_issued'};
  validarContextoC04(record.jointContext,record);
  if(record.targetCloseAt===null||Date.parse(f.target_at)/1000!==record.targetCloseAt||
    f.reference_price!==record.reference)return {status:'different_reference_or_target',
      native_target:record.targetCloseAt,context_target:Date.parse(f.target_at)/1000};
  need(Number.isFinite(actualPrice)&&actualPrice>0&&observedCloseAt===record.targetCloseAt&&
    observedCloseAt>record.issuedAt,'C04: resultado anterior a la emisión o cierre incorrecto');
  const nativeError=Math.abs(record.outputs[0].predicted-actualPrice),contextError=Math.abs(f.estimated_price-actualPrice);
  const up=Number(actualPrice>record.reference);
  return {schema:'laplace-paired-c04-v1',status:'paired_evaluated',asset:record.asset,
    forecast_sha256:f.forecast_sha256,checkpoint_sha256:record.checkpointSHA256,
    reference_price:record.reference,target_close_at:record.targetCloseAt,actual_price:actualPrice,
    native_price_error:nativeError,context_price_error:contextError,
    paired_improvement: nativeError-contextError,
    native_brier:(record.probabilityUp-up)**2,context_brier:(f.probability_up-up)**2,
    automatic_trading:false};
}
