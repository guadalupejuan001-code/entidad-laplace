/* X002: entrenamiento nativo, selección y calibración con cuatro particiones.
 * El histórico descargado hoy NO demuestra disponibilidad intradía histórica.
 * Las señales U003/U004 first-seen hoy no se retroproyectan al entrenamiento.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validarVelas,emitirPronosticos,PARAMETROS} from '../seguimiento/modelo.mjs';
import {stateAt,nativeProgram,nativeRun} from './mercado-xi-x001.mjs';
import {fitCalibration,calibratedProbability} from '../bitcoin/calibracion.mjs';

const DAY=86400000,STEP=300000,need=(ok,message)=>{if(!ok)throw Error(message)};
export const X002_SCHEMA='laplace-entrenamiento-x002-v1';
export const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export const SOURCE_SHA256=hash(Buffer.concat([
  readFileSync(new URL(import.meta.url)),readFileSync(new URL('./mercado-xi-x001.mjs',import.meta.url)),
  readFileSync(new URL('../bitcoin/calibracion.mjs',import.meta.url)),readFileSync(new URL('../seguimiento/modelo.mjs',import.meta.url)),
  readFileSync(new URL('../native/laplace_temporal.cpp',import.meta.url))]));
export const TRAINING_PLAN=Object.freeze({training_days:14,validation_days:3,calibration_days:3,test_days:5,
  horizons_minutes:Object.freeze([15,30,60,240,1440]),prior_strengths:Object.freeze([1,4,16,64]),
  max_native_rows:256,minimum_calibration_rows:8,evaluation_stride:'horizon_nonoverlapping',
  training_sampling:'uniform_from_nonoverlapping_eligible_labels',selection_metric:'brier_on_common_supported_states',
  historical_availability:'exploratory_close_assumption_not_authenticated_vintages'});
const iso=n=>new Date(n).toISOString(),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;

export function partitionPlan(cutoff){
  const end=Date.parse(cutoff);need(Number.isFinite(end)&&end%STEP===0,'Corte X002 inválido');
  const testStart=end-TRAINING_PLAN.test_days*DAY,calStart=testStart-TRAINING_PLAN.calibration_days*DAY,
    valStart=calStart-TRAINING_PLAN.validation_days*DAY,start=valStart-TRAINING_PLAN.training_days*DAY;
  return {training:[iso(start),iso(valStart)],validation:[iso(valStart),iso(calStart)],
    calibration:[iso(calStart),iso(testStart)],test:[iso(testStart),iso(end)]};
}
export function horizonRows(bars,horizon,start,end){
  need(TRAINING_PLAN.horizons_minutes.includes(horizon),'Horizonte X002 inválido');
  const begin=Date.parse(start),until=Date.parse(end),duration=horizon/5,out=[];
  need(Number.isFinite(begin)&&Number.isFinite(until)&&begin<until,'Partición X002 inválida');
  const gaps=[0];for(let i=1;i<bars.length;i++)gaps.push(gaps[i-1]+Number(bars[i][0]!==bars[i-1][0]+300));
  for(let i=6;i+duration<bars.length;i++){
    const decision=(bars[i][0]+300)*1000,due=decision+horizon*60000;
    if(decision<begin||decision>=until||due>until||(decision-begin)%(horizon*60000)!==0)continue;
    if(gaps[i+duration]!==gaps[i]||(bars[i+duration][0]+300)*1000!==due)continue;
    const mask=stateAt(bars,i);if(mask===null)continue;
    out.push({index:i,mask,y:Number(bars[i+duration][4]>bars[i][4]),link:false,
      decision_at:decision,due_at:due,target_known_at:due,initial:bars[i][4],actual:bars[i+duration][4]});
  }
  return out;
}
export function sampleTraining(rows,max=TRAINING_PLAN.max_native_rows){
  need(Number.isInteger(max)&&max>=1&&max<=256,'Presupuesto de entrenamiento inválido');
  if(rows.length<=max)return rows.map(x=>({...x}));
  if(max===1)return [{...rows[0]}];
  return Array.from({length:max},(_,i)=>({...rows[Math.floor(i*(rows.length-1)/(max-1))]}));
}
function nativePredict(binary,train,rows,strength){
  const run=nativeRun(binary,train,rows.map(r=>({mask:r.mask,steps:0})),0,strength);
  return {run,rows:rows.map((r,i)=>({...r,probability:run.forecasts[i].trace?.[0]?.probability??null}))};
}
function binaryMetrics(rows,key='probability'){
  const valid=rows.filter(r=>Number.isFinite(r[key]));
  return {eligible:rows.length,count:valid.length,abstentions:rows.length-valid.length,
    brier:mean(valid.map(r=>(r[key]-r.y)**2)),
    binary_accuracy:mean(valid.map(r=>Number(Number(r[key]>=0.5)===r.y))),
    direction_accuracy:mean(valid.map(r=>Number((r[key]>=0.5?1:-1)===Math.sign(r.actual-r.initial))))};
}
function m001Predictions(bars,rows,horizon){
  return rows.map(r=>{
    const at=iso(r.decision_at),quote={asset:'BTC-USD',value:String(r.initial),observed_at:at,known_at:at};
    const history=bars.slice(Math.max(0,r.index+1-14*288),r.index+1);
    const [p]=emitirPronosticos(history,quote,{emitidoEn:at,horizontes:[horizon],revision:'x002-retrospectivo'});
    return {decision_at:r.decision_at,due_at:r.due_at,predicted_price:p.precio_predicho,
      analogs:p.analogos,input_sha256:p.huella_entradas,prediction_sha256:p.id};
  });
}
function priceMetrics(rows,predictions){
  const valid=rows.map((r,i)=>({...r,p:predictions[i].predicted_price})).filter(r=>r.p!==null);
  return {eligible:rows.length,count:valid.length,abstentions:rows.length-valid.length,
    direction_accuracy:mean(valid.map(r=>Number(Math.sign(r.p-r.initial)===Math.sign(r.actual-r.initial)))),
    mae_usd:mean(valid.map(r=>Math.abs(r.p-r.actual))),
    persistence_mae_usd:mean(valid.map(r=>Math.abs(r.initial-r.actual))),
    price_within_10_bps:mean(valid.map(r=>Number(Math.abs(r.p-r.actual)/r.actual<=0.001)))};
}
function directionComparison(rows,m001){
  const common=rows.map((r,i)=>({...r,m001:m001[i]})).filter(r=>r.probability!==null&&r.m001.predicted_price!==null);
  return {count:common.length,native:mean(common.map(r=>Number((r.probability>=0.5?1:-1)===Math.sign(r.actual-r.initial)))),
    calibrated:mean(common.map(r=>Number((r.calibrated_probability>=0.5?1:-1)===Math.sign(r.actual-r.initial)))),
    m001:mean(common.map(r=>Number(Math.sign(r.m001.predicted_price-r.initial)===Math.sign(r.actual-r.initial)))),
    persistence:mean(common.map(r=>Number(r.actual===r.initial)))};
}

export function trainExperiment(binary,raw,{cutoff,compareM001=true}={}){
  const bars=validarVelas(raw,{corte:cutoff,maximo:10000}),partitions=partitionPlan(cutoff),horizons=[];
  need(bars.length&&bars[0][0]*1000<=Date.parse(partitions.training[0])-6*STEP,'Historia X002 insuficiente');
  for(const horizon of TRAINING_PLAN.horizons_minutes){
    const training=sampleTraining(horizonRows(bars,horizon,...partitions.training));
    const validation=horizonRows(bars,horizon,...partitions.validation);
    const calibration=horizonRows(bars,horizon,...partitions.calibration);
    const test=horizonRows(bars,horizon,...partitions.test);
    if(training.length<8||!validation.length||!test.length){
      horizons.push({horizon_minutes:horizon,status:'insufficient_training_or_evaluation',
        training_count:training.length,validation_count:validation.length,test_count:test.length});continue;
    }
    const candidates=TRAINING_PLAN.prior_strengths.map(strength=>{
      const p=nativePredict(binary,training,validation,strength);
      return {prior_strength:strength,...binaryMetrics(p.rows),xi_sha256:p.run.xi_sha256};
    }).sort((a,b)=>(a.brier??Infinity)-(b.brier??Infinity)||b.prior_strength-a.prior_strength);
    need(candidates[0].count>0,'Ningún estado de validación soportado');
    const strength=candidates[0].prior_strength;
    // Fijar los hiperparámetros en validación. Reentrenar solo con etiquetas
    // cerradas antes de la calibración, usando una ventana de 14 días.
    const refitStart=iso(Date.parse(partitions.calibration[0])-14*DAY);
    const refit=sampleTraining(horizonRows(bars,horizon,refitStart,partitions.calibration[0]));
    const cal=nativePredict(binary,refit,calibration,strength);
    const calibrator=fitCalibration(cal.rows.map(r=>({...r,decision_at:iso(r.decision_at),due_at:iso(r.due_at),
      target_known_at:iso(r.target_known_at)})),{start:partitions.calibration[0],end:partitions.calibration[1]});
    const xi=nativeProgram(refit,[],0,strength);
    const frozen={schema:X002_SCHEMA,horizon_minutes:horizon,source_sha256:SOURCE_SHA256,
      fitted_through:partitions.calibration[0],logical_freeze_boundary:partitions.test[0],prior_strength:strength,
      cutoff_semantics:'logical_backtest_boundary_not_actual_past_execution',
      training_sha256:hash(refit),xi_sha256:hash(xi),xi,calibrator,
      historical_availability:TRAINING_PLAN.historical_availability,
      calibration_arithmetic:'host_classical_scalar_shrinkage',prediction_arithmetic:'native_classical_in_original_ether'};
    const frozenHash=hash(frozen);
    const held=nativePredict(binary,refit,test,strength);
    const scored=held.rows.map(r=>({...r,calibrated_probability:calibratedProbability(r.probability,calibrator)}));
    const forecasts=scored.map(({y,actual,target_known_at,...r})=>({...r,frozen_sha256:frozenHash}));
    // El candidato se sella antes de unir sus resultados en el informe.
    const forecastsHash=hash(forecasts),observations=test.map(({decision_at,due_at,y,actual,initial})=>({decision_at,due_at,y,actual,initial}));
    const m001=compareM001?m001Predictions(bars,test,horizon):[];
    const prior=(refit.reduce((s,r)=>s+r.y,0)+1)/(refit.length+2);
    const supported=scored.filter(r=>r.probability!==null);
    horizons.push({horizon_minutes:horizon,status:'retrospective_evaluation_only',training_count:training.length,
      refit_count:refit.length,validation_count:validation.length,calibration_count:calibration.length,
      selected_prior_strength:strength,validation:candidates,calibrator,frozen,frozen_sha256:frozenHash,
      calibration_retains_state_information:calibrator.lambda>0,
      forecasts,forecasts_sha256:forecastsHash,observations,observations_sha256:hash(observations),
      native:binaryMetrics(scored),calibrated:binaryMetrics(scored,'calibrated_probability'),
      prior_baseline:binaryMetrics(supported.map(r=>({...r,probability:prior}))),
      neutral_baseline:binaryMetrics(supported.map(r=>({...r,probability:0.5}))),
      m001:compareM001?{...priceMetrics(test,m001),predictions:m001}:null,
      common_direction:compareM001?directionComparison(scored,m001):null,
      flat_outcomes:test.filter(r=>r.actual===r.initial).length,
      native_proof:{backend:held.run.learned.backend,active_qubits:held.run.core.active_qubits,
        memory_model:held.run.memory.model,query_xi_sha256:held.run.xi_sha256}});
  }
  const report={schema:X002_SCHEMA,generated_at:new Date().toISOString(),cutoff,source_sha256:SOURCE_SHA256,
    input_sha256:hash(bars),bars:bars.length,partitions,plan:TRAINING_PLAN,horizons,
    calibration_grid:[1,0.75,0.5,0.25,0],m001_parameters:PARAMETROS,
    target:'probabilidad_subida_vs_no_subida_y_exactitud_direccional_tres_clases',
    evaluation:'retrospective_chronological_not_fresh_prospective_holdout',
    availability_assumption:TRAINING_PLAN.historical_availability,
    observations_independent_across_horizons:false,financial_edge_demonstrated:false,
    production_changed:false,orders_executed:0,
    excluded_inputs:{u003_u004:'Sin vintages intradía verificables anteriores a cada decisión. First-seen actual no se retrofecha.'}};
  return {...report,report_sha256:hash(report)};
}

export function verifyTrainingReport(report){
  const {report_sha256,...body}=report??{};need(hash(body)===report_sha256,'Informe X002 alterado');
  need(body.schema===X002_SCHEMA&&body.production_changed===false,'Informe X002 incompatible');
  for(const h of report.horizons.filter(x=>x.frozen)){
    need(hash(h.frozen)===h.frozen_sha256&&hash(h.frozen.xi)===h.frozen.xi_sha256,'Modelo X002 alterado');
    need(hash(h.forecasts)===h.forecasts_sha256&&hash(h.observations)===h.observations_sha256,'Pronósticos X002 alterados');
  }
  return true;
}
