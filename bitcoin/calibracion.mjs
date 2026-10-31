/* Rolling, four-part calibration. Numerical fitting stays classical; each
 * narrative model is frozen and materialized by the original Ether/XI. */
import {canonicalLedger,timestamp,ledgerHash} from '../historia/contrato.mjs';
import {digest} from '../inteligencia/laplace.mjs';
import {trainNarrative,restoreNarrative,marketSamples,inferNarrative,scores,marketOutcome} from '../narrativa/modelo.mjs';
const DAY=86400000,need=(ok,message)=>{if(!ok)throw Error(message)};
export const CALIBRATION_VERSION='laplace-bitcoin-calibration-v1';
const PLAN=Object.freeze({training_days:28,validation_days:8,calibration_days:8,test_days:7,step_days:7});
export const MODES=Object.freeze(['strict','exploratory_close_availability']);
function validPrediction(row){
  need(row.probability===null||(Number.isFinite(row.probability)&&row.probability>0&&row.probability<1),'probabilidad invalida');
  need(row.y===0||row.y===1,'etiqueta invalida');
}
export function fitCalibration(rows,{start,end}){
  const begin=timestamp(start),until=timestamp(end);need(begin<until,'cortes de calibracion invalidos');
  for(const row of rows){validPrediction(row);
    need(row.decision_at>=begin&&row.decision_at<until&&row.due_at<=until&&row.target_known_at<=until,
      'la calibracion contiene etiquetas futuras o fuera de su particion')}
  const selected=rows.filter(row=>row.probability!==null);
  const identity={method:'identity',lambda:1,prior:null,support:selected.length,start:begin,end:until};
  if(selected.length<8)return {...identity,status:'soporte_calibracion_insuficiente'};
  const prior=(selected.reduce((sum,row)=>sum+row.y,0)+1)/(selected.length+2);
  // Fixed grid and tie preference were declared before seeing the held-out test.
  const candidates=[1,0.75,0.5,0.25,0].map(lambda=>({lambda,
    brier:selected.reduce((sum,row)=>sum+(lambda*row.probability+(1-lambda)*prior-row.y)**2,0)/selected.length}));
  candidates.sort((a,b)=>a.brier-b.brier||b.lambda-a.lambda);
  return {...identity,method:'shrinkage_to_calibration_prior',status:'ajustada_solo_en_calibracion',
    lambda:candidates[0].lambda,prior,candidates};
}
export function calibratedProbability(probability,calibrator){
  if(probability===null)return null;
  need(Number.isFinite(probability)&&probability>0&&probability<1,'probabilidad invalida');
  need(Number.isFinite(calibrator.lambda)&&calibrator.lambda>=0&&calibrator.lambda<=1,'lambda invalida');
  if(calibrator.lambda===1)return probability;
  need(Number.isFinite(calibrator.prior)&&calibrator.prior>0&&calibrator.prior<1,'referencia de calibracion invalida');
  return calibrator.lambda*probability+(1-calibrator.lambda)*calibrator.prior;
}
export function historicalView(history,mode='strict'){
  need(MODES.includes(mode),'modo historico desconocido');
  const records=canonicalLedger([...history.records]);
  need(ledgerHash(records)===history.ledger_sha256,'hash historico invalido');
  if(mode==='strict')return records;
  // Explicit experimental assumption, never a replacement of the source ledger.
  return canonicalLedger(records.map(row=>row.kind==='precio'&&row.price_basis==='raw_close'
    ?{...row,known_at:row.observed_at}:row));
}
function forecastRows(model,rows){
  return rows.map(row=>({decision_at:row.decision_at,due_at:row.due_at,target_known_at:row.target_known_at,
    narrative_state_sha256:row.state.state_sha256,...inferNarrative(model,row.state),y:row.y}));
}
export function calibrateHistory(binary,history,{mode='strict'}={}){
  const records=historicalView(history,mode),start=timestamp(history.start),end=timestamp(history.end);
  const add=(when,days)=>new Date(Date.parse(when)+days*DAY).toISOString();
  const total=PLAN.training_days+PLAN.validation_days+PLAN.calibration_days+PLAN.test_days;
  const folds=[],rawScores=[],adjustedScores=[],patterns=new Map();
  for(let first=start;add(first,total)<=end;first=add(first,PLAN.step_days)){
    const trainEnd=add(first,PLAN.training_days),validationEnd=add(trainEnd,PLAN.validation_days),
      testStart=add(validationEnd,PLAN.calibration_days),testEnd=add(testStart,PLAN.test_days);
    const config={start_at:first,train_end:trainEnd,validation_end:validationEnd,narrative_hours:24};
    const training=trainNarrative(binary,records,config);
    const partition={training:[first,trainEnd],validation:[trainEnd,validationEnd],calibration:[validationEnd,testStart],test:[testStart,testEnd]};
    if(!training.checkpoint){folds.push({partitions:partition,status:training.status,training_samples:training.training_samples,
      validation_samples:training.validation_samples});continue}
    const {model}=restoreNarrative(binary,training.checkpoint);
    const calibration=marketSamples(records,model.config,validationEnd,testStart,testStart);
    const calibrationRows=forecastRows(model,calibration.rows);
    const calibrator=fitCalibration(calibrationRows,{start:validationEnd,end:testStart});
    const frozen={model_state_sha256:training.checkpoint.state_sha256,calibrator,
      calibration_sha256:digest(JSON.stringify(calibrationRows)),frozen_at:testStart};
    const held=marketSamples(records,model.config,testStart,testEnd,testEnd);
    const predictions=forecastRows(model,held.rows);
    // Seal the forecasts independently of actual test outcomes before scoring.
    const forecasts=predictions.map(({y,target_known_at,...row})=>({...row,
      calibrated_probability:calibratedProbability(row.probability,calibrator),
      frozen_state_sha256:digest(JSON.stringify(frozen))}));
    const observations=predictions.map(row=>({decision_at:row.decision_at,due_at:row.due_at,y:row.y,target_known_at:row.target_known_at}));
    const raw=predictions.map(row=>({probability:row.probability,y:row.y}));
    const adjusted=predictions.map(row=>({probability:calibratedProbability(row.probability,calibrator),y:row.y}));
    const rawMetrics=scores(raw,training.training_prior),adjustedMetrics=scores(adjusted,training.training_prior);
    // Across folds the reference remains the prior that was frozen for that fold.
    rawScores.push({metrics:rawMetrics});adjustedScores.push({metrics:adjustedMetrics});
    for(let i=0;i<forecasts.length;i++){
      const row=forecasts[i],actual=observations[i];
      const key=digest(JSON.stringify({model:training.checkpoint.state_sha256,pattern:row.chosen_pattern}));
      if(!patterns.has(key))patterns.set(key,{id:key,model_state_sha256:training.checkpoint.state_sha256,
        pattern:row.chosen_pattern,status:row.probability===null?'abstencion':'patron_validado',count:0,positives:0,negatives:0,
        raw_brier_sum:0,calibrated_brier_sum:0});
      const group=patterns.get(key);group.count++;group.positives+=actual.y;group.negatives+=1-actual.y;
      group.raw_brier_sum+=((row.probability??training.training_prior)-actual.y)**2;
      group.calibrated_brier_sum+=((row.calibrated_probability??training.training_prior)-actual.y)**2;
    }
    folds.push({partitions:partition,status:training.status,training_samples:training.training_samples,
      validation_samples:training.validation_samples,validated_rules:training.validated_rules,
      training_prior:training.training_prior,pattern_audit:training.pattern_audit,frozen,
      native:training.native,checkpoint:training.checkpoint,
      calibration_samples:calibration.rows.length,missing_calibration_labels:calibration.missing.length,
      raw:rawMetrics,calibrated:adjustedMetrics,missing_test_labels:held.missing.length,
      forecasts_sha256:digest(JSON.stringify(forecasts)),forecasts,observations});
  }
  const aggregate=entries=>{
    const count=entries.reduce((sum,item)=>sum+item.metrics.count,0);
    if(!count)return {count:0,brier:null,baseline_brier:null,log_loss:null,coverage:0,brier_skill:null};
    const average=field=>entries.reduce((sum,item)=>sum+item.metrics.count*item.metrics[field],0)/count;
    const brier=average('brier'),baseline=average('baseline_brier');
    return {count,brier,baseline_brier:baseline,log_loss:average('log_loss'),coverage:average('coverage'),
      brier_skill:baseline===0?null:1-brier/baseline};
  };
  const raw=aggregate(rawScores),calibrated=aggregate(adjustedScores);
  return {schema:CALIBRATION_VERSION,generated_at:new Date().toISOString(),asset:'BTC-USD',synthetic:history.synthetic===true,
    mode,status:raw.count?'prueba_retrospectiva_completada':'evidencia_insuficiente',
    certified_point_in_time:false,historical_price_vintages_verified:false,
    availability_assumption:mode==='strict'?null:'Daily raw close assumed available at bucket end; original vintage is not verified. Source known_at is preserved in the ledger.',
    inference_inputs:['geopolitica','humanitaria'],target:{horizon_hours:24,cost_bps:10},plan:PLAN,
    source_ledger_sha256:history.ledger_sha256,evaluation_ledger_sha256:ledgerHash(records),
    raw,calibrated,folds,pattern_results:[...patterns.values()],
    calibration_improved_held_out:raw.count?calibrated.brier<raw.brier:null,
    narrative_beats_baseline:raw.count?raw.brier<raw.baseline_brier:null,
    live_activation:false,financial_edge_demonstrated:false,orders_executed:0,
    interpretation:'Short exploratory checks do not certify accuracy, causality, profitability or live calibration.'};
}

export function pastComparisons(history,report){
  need(ledgerHash(history.records)===report.source_ledger_sha256,'el informe no corresponde a esta historia');
  const prices=new Map(history.records.filter(row=>row.kind==='precio'&&row.asset==='BTC-USD'&&row.price_basis==='raw_close')
    .map(row=>[row.observed_at,row]));
  const rows=report.folds.flatMap((fold,index)=>(fold.forecasts??[]).map((forecast,i)=>{
    const actual=fold.observations[i],first=prices.get(forecast.decision_at),last=prices.get(forecast.due_at);
    need(first&&last&&actual.decision_at===forecast.decision_at,'comparacion historica incompleta');
    const outcome=marketOutcome(first.value,last.value,report.target.cost_bps);
    need(outcome.y===actual.y,'el resultado observado no coincide con los cierres');
    return {fold:index+1,decision_at:forecast.decision_at,due_at:forecast.due_at,probability:forecast.probability,
      calibrated_probability:forecast.calibrated_probability,pattern:forecast.chosen_pattern,actual:actual.y,
      start_price:first.value,end_price:last.value,net_return_bps:outcome.net_return_bps,
      raw_correct:forecast.probability===null?null:Number(forecast.probability>0.5)===actual.y,
      calibrated_correct:forecast.calibrated_probability===null?null:Number(forecast.calibrated_probability>0.5)===actual.y,
      model_state_sha256:fold.frozen.model_state_sha256,forecasts_sha256:fold.forecasts_sha256};
  }));
  return {schema:'laplace-bitcoin-past-comparisons-v1',mode:report.mode,certified_point_in_time:false,
    procedure:'At each old cutoff use only the preceding narrative window and a frozen model; compare the next daily close only after producing the forecast.',
    source_ledger_sha256:report.source_ledger_sha256,target:report.target,rows};
}
