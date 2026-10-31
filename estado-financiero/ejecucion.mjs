/* EF003 - ejecutor de escenarios sobre hechos que YA existen en EF001.
 * No acepta saldos ficticios como observaciones reales. Lee por SHA original,
 * aplica leyes condicionadas y guarda resultados SOLO en rama de simulación.
 */
import {readFileSync} from 'node:fs';
import {sha,need,stable} from '../input/contrato.mjs';
import {utcTime} from '../universo/estados.mjs';
import {normalizarRegla,normalizarEscenario} from './modelo.mjs';
import {guardarRegla,guardarEscenario,guardarDelta} from './repositorio.mjs';
import {aplicarLeyContable,aplicarLeyInteresSimple,propagarTransferencias}
  from './leyes.mjs';

export const EF003_EXEC_VERSION='laplace-ef003-execution-v1';
const LAW_ENGINE_SHA=sha(readFileSync(new URL('./leyes.mjs',import.meta.url)));
const time=value=>utcTime(value instanceof Date?value.toISOString():value);
async function original(store,hash,decision){
  need(typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash),'hash EF001 invalido');
  const row=(await store.db.query(
    'SELECT * FROM laplace_fin_observations WHERE assertion_sha=$1 AND observed_at<=$2 AND known_at<=$2',
    [hash,decision])).rows[0];
  need(row,'la observacion original no estaba disponible al decidir');
  need(row.value_status==='observed'&&row.value_kind==='exact_decimal',
    'las leyes contables requieren cantidades exactas observadas');
  return {...row,observed_at:time(row.observed_at),known_at:time(row.known_at)};
}
const declared=(rows,at)=>rows.map(x=>({...x,declared_at:x.declared_at??at}));
export async function ejecutarEscenarioEF003(store,plan,
  {now=()=>new Date().toISOString()}={}){
  need(store&&typeof store.transaction==='function','base EF001 requerida');
  need(plan&&typeof plan==='object'&&!Array.isArray(plan),'plan invalido');
  const decision=time(now()),target=time(plan.target_at);
  need(target>decision,'se requiere objetivo posterior a la decisión real');
  const type=plan.law;
  need(['accounting','simple_interest','transfers'].includes(type),'ley no implementada');
  need(plan.assumptions&&typeof plan.assumptions==='object'&&
    !Array.isArray(plan.assumptions),'describir supuestos del escenario');
  const scenario=normalizarEscenario({
    scenario_kind:'counterfactual',base_cutoff:decision,
    created_at:decision,assumptions:{...plan.assumptions,
      future_results_are_assumptions:true,
      decision_time_not_backdated:true}
  });
  let sources=[],result,deltaEntries=[];
  if(type==='transfers'){
    need(Array.isArray(plan.source_assertion_shas),'saldos de nodos requeridos');
    need(plan.source_assertion_shas.length>=2&&plan.source_assertion_shas.length<=4096,
      'nodos fuera de presupuesto');
    sources=await Promise.all(plan.source_assertion_shas.map(h=>original(store,h,decision)));
    result=propagarTransferencias({balances:sources,
      transfers:declared(plan.transfers??[],decision),
      cutoff:decision,target_at:target,scenario_id:scenario.scenario_id,
      allow_overdraft:plan.allow_overdraft===true});
    if(result.status==='conditional_model_result')
      deltaEntries=result.balances.map(x=>({
        state_key:'EF003/'+x.subject_id+'/balance',
        state_value:x.value_text,state_unit:x.unit}));
  }else{
    need(plan.source_assertion_sha,'saldo original requerido');
    sources=[await original(store,plan.source_assertion_sha,decision)];
    if(type==='accounting'){
      result=aplicarLeyContable({base:sources[0],
        flows:declared(plan.flows??[],decision),cutoff:decision,target_at:target,
        scenario_id:scenario.scenario_id,
        complete_flow_scope:plan.complete_flow_scope===true,
        allow_negative_balance:plan.allow_negative_balance===true});
      if(result.status==='conditional_model_result')
        deltaEntries=[{state_key:'EF003/'+sources[0].subject_id+'/balance',
          state_value:result.result.value_text,state_unit:sources[0].unit}];
    }else{
      result=aplicarLeyInteresSimple({base:sources[0],rate:plan.rate_per_period,
        periods:plan.periods,cutoff:decision,target_at:target,
        scenario_id:scenario.scenario_id});
      deltaEntries=[{state_key:'EF003/'+sources[0].subject_id+'/simple_interest',
        state_value:result.result_text,state_unit:sources[0].unit}];
    }
  }
  if(result.status==='abstained')
    return {schema:EF003_EXEC_VERSION,status:'abstained',reason:result.reason,
      decision_at:decision,scenario_id:null,persisted:false,
      no_observations_modified:true,automatic_trading:false};
  const rule=normalizarRegla({rule_kind:'deterministic',execution_engine:'classical',
    code_sha256:LAW_ENGINE_SHA,discovered_at:decision,recorded_at:decision,
    law:{name:type,implementation:EF003_EXEC_VERSION},
    assumptions:plan.assumptions,
    evidence:{source_assertions:sources.map(x=>x.assertion_sha),
      results_conditional:true},
    verification:'synthetic_only'});
  const saved=await store.transaction(async tx=>{
    await guardarRegla(tx,rule);
    await guardarEscenario(tx,{scenario_kind:'counterfactual',
      base_cutoff:decision,created_at:decision,assumptions:scenario.assumptions});
    let written=0;
    for(const d of deltaEntries)
      written+=Number(await guardarDelta(tx,{...d,
        scenario_id:scenario.scenario_id,rule_sha:rule.rule_sha,
        operation:'set',logical_address:null,state_kind:'exact',
        observed_at:decision,known_at:decision,
        origin:'derived',evidence_sha:result.result_sha256}));
    return written;
  });
  return {schema:EF003_EXEC_VERSION,status:result.status,scenario_id:scenario.scenario_id,
    rule_sha:rule.rule_sha,decision_at:decision,target_at:target,
    result,stored_sparse_deltas:saved,persisted:true,
    derived_only_no_ground_truth_update:true,not_validated_for_forecast:true,
    automatic_trading:false};
}
