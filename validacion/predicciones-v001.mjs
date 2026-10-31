/* V001 — paired evaluation with NO retrospective invented predictions.
 * M001 journal events must be checked by leerDiario() before scoring.
 * F001 central price is unchanged by world snapshots: no paired ablation
 * exists until a second model is truly frozen and emitted in advance.
 */
import {utcTime} from '../universo/estados.mjs';
import {huellaContenido} from '../universo/integridad.mjs';
import {verificarPronostico,evaluarPronostico} from '../seguimiento/modelo.mjs';

export const V001_EVALUATION='laplace-v001-paired-evaluation-v1';
const need=(ok,m)=>{if(!ok)throw Error(m)};
const date=utcTime;
const average=x=>x.reduce((s,v)=>s+v,0)/x.length;
const rmse=x=>Math.sqrt(average(x.map(v=>v*v)));
const relativeSkill=(model,base)=>base===0?null:1-model/base;
const finitePositive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const round=(x,d=6)=>x===null?null:Number(x.toFixed(d));
const DIR=(p,t)=>p>t?'up':p<t?'down':'flat';

export function evaluarJournalM001(eventos,{asOf=new Date().toISOString(),
  minEvaluations=30}={}){
  const cut=date(asOf);
  need(Array.isArray(eventos)&&eventos.length<=50000,'V001 diario demasiado grande');
  need(Number.isInteger(minEvaluations)&&minEvaluations>=2&&minEvaluations<=5000,
    'V001 mínimo de pares inválido');
  const predictions=new Map(),outcomes=new Map();
  let nEvents=0,recordedErrors=0,recordedMissing=0;
  for(const e of eventos){
    need(e&&typeof e==='object'&&typeof e.tipo==='string'&&
      typeof e.registrado_en==='string','V001 evento de diario inválido');
    if(date(e.registrado_en)>cut)continue;
    nEvents++;
    if(e.tipo==='pronostico'){
      const p=e.datos;
      verificarPronostico(p);
      need(date(p.emitido_en)<=date(e.registrado_en)&&date(e.registrado_en)<date(p.objetivo_en),
        'V001 un pronóstico fue archivado después del objetivo');
      need(!predictions.has(p.id),'V001 pronóstico repetido');predictions.set(p.id,p);
    }else if(e.tipo==='resultado'){
      const r=e.datos,p=predictions.get(r?.pronostico_id);
      need(p&&!outcomes.has(r.pronostico_id),
        'V001 resultado sin pronóstico previo o duplicado');
      need(date(r.consultado_en)<=cut&&
        date(r.consultado_en)>=date(p.criterio.fin_vela),
        'V001 resultado antes del cierre o futuro');
      const verified=evaluarPronostico(p,r.vela_completa,{
        consultadoEn:r.consultado_en,fuente:r.fuente});
      need(huellaContenido(verified)===huellaContenido(r),
        'V001 resultado alterado respecto al código de evaluación');
      outcomes.set(r.pronostico_id,r);
    }else if(e.tipo==='dato_ausente')recordedMissing++;
    else if(e.tipo==='error_fuente')recordedErrors++;
  }
  const groups=new Map(),evalPairs=[];
  for(const p of predictions.values()){
    const key=[p.modelo,p.codigo_sha256,p.horizonte_minutos].join('|');
    if(!groups.has(key))groups.set(key,{modelo:p.modelo,codigo_sha256:p.codigo_sha256,
      horizonte_minutos:p.horizonte_minutos,emitted:0,abstained:0,
      unresolved:0,rows:[]});
    const g=groups.get(key);g.emitted++;
    if(p.precio_predicho===null){g.abstained++;continue}
    const r=outcomes.get(p.id);
    if(!r){g.unresolved++;continue}
    need(finitePositive(p.precio_inicial)&&finitePositive(p.precio_predicho)&&
      finitePositive(r.precio_observado),'V001 precios de comparación inválidos');
    const row={id:p.id,emitted_at:date(p.emitido_en),target_at:date(p.objetivo_en),
      horizon_min:p.horizonte_minutos,
      price_at_emission:p.precio_inicial,candidate:p.precio_predicho,
      actual:r.precio_observado,reference:p.referencia_persistencia,
      error:Math.abs(p.precio_predicho-r.precio_observado),
      reference_error:Math.abs(p.referencia_persistencia-r.precio_observado),
      within_10bp:r.acierto_precio,
      correct_direction:r.acierto_direccion,
      candidate_better_than_persistence:r.mejora_referencia};
    need(p.referencia_persistencia===p.precio_inicial,
      'V001 baseline de persistencia cambió');
    g.rows.push(row);evalPairs.push(row);
  }
  const metrics=g=>{
    if(!g.rows.length)return {modelo:g.modelo,codigo_sha256:g.codigo_sha256,
      horizon_minutes:g.horizonte_minutos,emitted:g.emitted,unresolved:g.unresolved,
      abstained:g.abstained,evaluated:0,mae_usd:null,rmse_usd:null,
      persistence_mae_usd:null,mae_skill_vs_persistence:null,
      direction_accuracy:null,within_10bp:null,better_than_persistence:null,
      statistical_validation:'not_possible_no_results'};
    const rows=g.rows,err=rows.map(x=>x.error),ref=rows.map(x=>x.reference_error);
    return {modelo:g.modelo,codigo_sha256:g.codigo_sha256,
      horizon_minutes:g.horizonte_minutos,emitted:g.emitted,unresolved:g.unresolved,
      abstained:g.abstained,evaluated:rows.length,
      mae_usd:round(average(err)),rmse_usd:round(rmse(err)),
      persistence_mae_usd:round(average(ref)),
      mae_skill_vs_persistence:round(relativeSkill(average(err),average(ref))),
      direction_accuracy:round(average(rows.map(x=>Number(x.correct_direction)))),
      within_10bp:rows.filter(x=>x.within_10bp).length,
      better_than_persistence:rows.filter(x=>x.candidate_better_than_persistence).length,
      statistical_validation:rows.length<minEvaluations?
        'insufficient_paired_outcomes':'descriptive_only_no_independence_or_bootstrap'};
  };
  const byHorizon=[...groups.values()].sort((a,b)=>a.horizonte_minutos-b.horizonte_minutos).map(metrics);
  const pooled=evalPairs.length?{
    mae_usd:round(average(evalPairs.map(x=>x.error))),
    persistence_mae_usd:round(average(evalPairs.map(x=>x.reference_error))),
    mae_skill_vs_persistence:round(relativeSkill(average(evalPairs.map(x=>x.error)),
      average(evalPairs.map(x=>x.reference_error)))),
    direction_hits:evalPairs.filter(x=>x.correct_direction).length,
    price_hits_10bp:evalPairs.filter(x=>x.within_10bp).length,
    wins_vs_persistence:evalPairs.filter(x=>x.candidate_better_than_persistence).length
  }:null;
  return {schema:V001_EVALUATION,as_of:cut,
    journal_events_scored:nEvents,emitted:predictions.size,
    evaluated:evalPairs.length,unresolved:[...groups.values()].reduce((s,x)=>s+x.unresolved,0),
    abstained:[...groups.values()].reduce((s,x)=>s+x.abstained,0),
    unavailable_result_events:recordedMissing,source_errors:recordedErrors,
    by_horizon:byHorizon,pooled_descriptive_only:pooled,
    min_paired_evaluations:minEvaluations,
    overlapping_horizons_are_not_independent:true,
    post_hoc_data_is_not_forward_forecast:true,
    no_synthetic_outcomes_added:true,brier_not_applicable_without_probabilities:true,
    out_of_sample_world_edge_demonstrated:false,
    price_center_world_ablations_available:false,
    production_activation_allowed:false,
    audit_status:evalPairs.length<minEvaluations?'insufficient_sample':
      'descriptive_only_independence_not_proven'};
}

/* Optional companion score for genuinely frozen paired forecasts.
 * A backfilled forecast at historical decision_at is forbidden.
 * Even a passing mathematical comparison is DESCRIPTIVE until independent
 * source provenance, embargo and sequential holdout are audited.
 */
export function compararAblacionesPareadas(rows,{asOf=new Date().toISOString(),
  minPairs=50}={}){
  const cut=date(asOf);
  need(Number.isSafeInteger(minPairs)&&minPairs>=10,'V001 minPairs inválido');
  need(Array.isArray(rows)&&rows.length<=10000,'V001 ablations exceeds limit');
  if(!rows.length)return {status:'no_frozen_world_forecasts',
    paired:0,mae_without_world:null,mae_with_world:null,
    improvement:null,production_activation_allowed:false,
    reason:'F001 currently changes only scenario width, not central price; no valid paired world-vs-no-world price forecasts'};
  const ids=new Set(),scores=[];
  for(const x of rows){
    need(x&&typeof x==='object'&&
      typeof x.forecast_id==='string'&&!ids.has(x.forecast_id),
      'V001 ablation ID duplicado');ids.add(x.forecast_id);
    const decision=date(x.decision_at),target=date(x.target_at),
      known=date(x.target_known_at),features=date(x.features_known_at),
      frozen=date(x.models_frozen_at);
    need(x.held_out===true&&frozen<=decision&&features<=decision&&
      decision<target&&target<=known&&known<=cut,
      'V001 fuga temporal/partición no reservada en ablación');
    need(['U003','O001','D001','D002','C001','B001','K001'].includes(x.world_family)&&
      typeof x.baseline_model_hash==='string'&&/^[a-f0-9]{64}$/.test(x.baseline_model_hash)&&
      /^[a-f0-9]{64}$/.test(x.world_model_hash),
      'V001 ablation not tied to frozen model hashes');
    need([x.price_without_world,x.price_with_world,x.actual_price].every(finitePositive),
      'V001 ablation price inválido');
    scores.push({baseline:Math.abs(x.price_without_world-x.actual_price),
      world:Math.abs(x.price_with_world-x.actual_price),target});
  }
  const before=average(scores.map(x=>x.baseline)),after=average(scores.map(x=>x.world));
  const days=new Set(scores.map(x=>x.target.slice(0,10))).size;
  return {status:scores.length<minPairs||days<10?'insufficient_independent_holdout':
      'descriptive_paired_only',
    paired:scores.length,distinct_target_days:days,
    mae_without_world:round(before),mae_with_world:round(after),
    improvement:round(relativeSkill(after,before)),
    significance_proven:false,source_archive_validated_externally:false,
    production_activation_allowed:false,
    caution:'Feature timing and pair arithmetic checked; no real-world edge can be certified from supplied pairs alone'};
}
