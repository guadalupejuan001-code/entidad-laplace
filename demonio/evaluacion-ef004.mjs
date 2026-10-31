/* EF004: evaluación prospectiva de pronósticos YA congelados.
 * Se escribe un evento independiente después del vencimiento, nunca
 * modifica el pronóstico ni rellena precios de objetivos ausentes.
 */
import {sha,stable,need} from '../input/contrato.mjs';
import {estadoDeCaptura} from './series.mjs';

export const EF004_EVAL='laplace-ef004-prospective-evaluation-v1';
export function verificarPronosticoEF004(f){
  need(f&&f.status==='experimental_model_frozen'&&
    typeof f.forecast_sha256==='string','no es pronóstico EF004 congelado');
  const {forecast_sha256,...body}=f;
  need(sha(stable(body))===forecast_sha256,'pronóstico fue modificado');
  need(f.production_activation_allowed===false&&f.automatic_trading===false,
    'pronóstico de trading no admitido');
  return true;
}
export function evaluarPronosticoEF004(pronostico,capturas,{
  toleranceHours=2.75
}={}){
  verificarPronosticoEF004(pronostico);
  need(Array.isArray(capturas)&&capturas.length<=2500,'historico fuera de presupuesto');
  need(Number.isFinite(toleranceHours)&&toleranceHours>=0&&toleranceHours<=4,
    'tolerancia de evaluación inválida');
  const target=Date.parse(pronostico.first_target_at),
    decision=Date.parse(pronostico.decision_at);
  need(Number.isFinite(target)&&Number.isFinite(decision)&&target>decision,
    'objetivo no posterior a decisión');
  const later=capturas.map(estadoDeCaptura)
    .filter(c=>Date.parse(c.at)>decision)
    .sort((a,b)=>a.at.localeCompare(b.at));
  const outcome=later.find(c=>Date.parse(c.at)>=target);
  if(!outcome)return {schema:EF004_EVAL,status:'waiting_for_outcome',
    forecast_sha256:pronostico.forecast_sha256,required_target_at:pronostico.first_target_at,
    evaluated:0,automatic_trading:false};
  if(Date.parse(outcome.at)-target>toleranceHours*3600000)
    return {schema:EF004_EVAL,status:'unscorable_missed_capture_window',
      forecast_sha256:pronostico.forecast_sha256,
      first_later_capture_at:outcome.at,evaluated:0,
      missing_is_not_zero:true,automatic_trading:false};
  const steps=pronostico.trajectory[0];
  need(steps.target_at===pronostico.first_target_at,'primer paso no coincide con el objetivo');
  const comparisons=[],unavailable=[];
  for(const prediction of steps.states){
    if(!['experimental_estimate','persistence'].includes(prediction.status)){
      unavailable.push({key:prediction.key,reason:prediction.reason??'abstained'});
      continue;
    }
    const actual=outcome.state.get(prediction.key);
    const model=pronostico.model.models.find(s=>s.key===prediction.key);
    if(!actual||!model){
      unavailable.push({key:prediction.key,reason:'no_matching_public_observation'});
      continue;
    }
    const first=pronostico.decision_at,
      origin=Number(prediction.origin_value),
      estimate=Number(prediction.estimated_value),
      y=actual.value;
    // Una cifra macro repetida no es un resultado nuevo independiente.
    if(Date.parse(actual.observed_at)<=Date.parse(first)){
      unavailable.push({key:prediction.key,reason:'stale_actual_observation'});
      continue;
    }
    const denominator=Math.max(1e-9,model.scale);
    const modelError=Math.abs(estimate-y)/denominator;
    const baselineError=Math.abs(origin-y)/denominator;
    comparisons.push({key:prediction.key,
      domain:model.domain,variable:model.variable,unit:model.unit,
      source_url:actual.source_url,
      actual_observed_at:actual.observed_at,actual_known_at:actual.known_at,
      estimated_value:estimate,persistence_value:origin,actual_value:y,
      normalized_model_abs_error:modelError,
      normalized_persistence_abs_error:baselineError,
      paired_baseline_minus_model_error:baselineError-modelError,
      model_kind:prediction.status==='experimental_estimate'?'candidate':'persistence'});
  }
  const learned=comparisons.filter(c=>c.model_kind==='candidate');
  const candidateError=learned.length?
    learned.reduce((s,x)=>s+x.normalized_model_abs_error,0)/learned.length:null;
  const baselineError=learned.length?
    learned.reduce((s,x)=>s+x.normalized_persistence_abs_error,0)/learned.length:null;
  const body={schema:EF004_EVAL,status:learned.length?
    'prospective_outcomes_measured':'no_comparable_learned_outcomes',
    forecast_sha256:pronostico.forecast_sha256,
    model_sha256:pronostico.model_sha256,
    input_capture_sha256:pronostico.input_capture_sha256,
    outcome_capture_sha256:outcome.capture_sha256,
    decision_at:pronostico.decision_at,target_at:pronostico.first_target_at,
    outcome_captured_at:outcome.at,
    pairs_evaluated:learned.length,
    all_comparable_observations:comparisons.length,
    excluded:unavailable,comparisons,
    mean_normalized_candidate_mae:candidateError,
    mean_normalized_persistence_mae:baselineError,
    improvement_vs_persistence:baselineError>0?
      1-candidateError/baselineError:null,
    production_activation_allowed:false,
    confidence_not_certified:true,automatic_trading:false,
    note:'Una evaluación prospectiva aislada no certifica capacidad predictiva'};
  return {...body,evaluation_sha256:sha(stable(body))};
}
