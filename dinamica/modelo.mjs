/* Chronological evidence adapter. Counting, fitting and ALL propagation are
 * executed by laplace_temporal on the original QuantumRuntime/InverseMemory.
 * JS never multiplies the learned transition matrix to produce a forecast. */
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {canonicalLedger,timestamp,ledgerHash} from '../historia/contrato.mjs';
import {THEMES,EXTRACTOR_SHA256,narrativeState} from '../narrativa/espacio.mjs';
import {marketObservation,scores} from '../narrativa/modelo.mjs';
import {historicalView} from '../bitcoin/calibracion.mjs';
import {digest,RUNTIME_REF} from '../inteligencia/laplace.mjs';
export const DYNAMIC_VERSION='laplace-native-temporal-v1';
export const EXECUTOR_SOURCE_SHA256=digest(readFileSync(new URL('../native/laplace_temporal.cpp',import.meta.url)));
export const FEATURES=Object.freeze(Object.keys(THEMES).sort());
export const HORIZONS=Object.freeze([0,1,2,3,4,5,6,7]);
export const PLAN=Object.freeze({training_days:42,validation_days:14,test_days:14,step_days:14,alphas:[0,1,4,16],prior_strength:8});
const DAY=86400000,BASE=1000000,need=(ok,message)=>{if(!ok)throw Error(message)};
const target={asset:'BTC-USD',currency:'USD',price_basis:'raw_close',horizon_hours:24,cost_bps:10};
export const addDays=(date,days)=>new Date(Date.parse(date)+days*DAY).toISOString();
export const themesMask=themes=>FEATURES.reduce((mask,feature,i)=>mask|(themes.includes(feature)?1<<i:0),0);
export const maskThemes=mask=>FEATURES.filter((_,i)=>mask&(1<<i));
export function frameAt(records,date){
  const state=narrativeState(records,date,24),themes=state.atoms.filter(atom=>!atom.includes('@'));
  return {date:timestamp(date),mask:state.coverage.classified?themesMask(themes):65535,themes,
    state_sha256:state.state_sha256,news_ids:state.events.map(event=>event.id)};
}
export function trainingFrames(rawRecords,{start,end,label_cutoff=end}){
  const records=canonicalLedger([...rawRecords]),first=timestamp(start),last=timestamp(end),known=timestamp(label_cutoff);
  need(first<last&&last<=known,'cortes de aprendizaje temporal invalidos');
  const rows=[];
  for(let time=Date.parse(first);time<=Date.parse(last);time+=DAY){
    need(rows.length<256,'maximo 256 estados por aprendizaje nativo');
    const date=new Date(time).toISOString(),row=frameAt(records,date);
    const outcome=addDays(date,1)<=last?marketObservation(records,target,date,known):null;
    rows.push({...row,y:outcome?.y??null,target_known_at:outcome?.target_known_at??null,
      price_ids:outcome?.price_ids??[],link:time+DAY<=Date.parse(last)});
  }
  return rows;
}
export function executeTemporal(binary,xi){
  need(typeof binary==='string'&&binary.length&&typeof xi==='string'&&Buffer.byteLength(xi)<=2*1024*1024,'ejecutor o programa temporal invalido');
  const run=spawnSync(resolve(binary),['-'],{input:xi,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
  if(run.error)throw run.error;need(run.status===0,'fallo temporal nativo: '+String(run.stderr||run.stdout).slice(0,700));
  try{return run.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}catch{throw Error('salida temporal nativa invalida')}
}
function checkpointProgram(rows,alpha,strength){
  need(Array.isArray(rows)&&rows.length>=1&&rows.length<=256,'evidencia temporal vacia o excesiva');
  const bytes=Buffer.alloc(rows.length*4);
  for(let i=0;i<rows.length;i++){
    const row=rows[i];need(Number.isInteger(row.mask)&&(row.mask===65535||row.mask>=0&&row.mask<2048),'mascara narrativa invalida');
    need(row.y===null||row.y===0||row.y===1,'etiqueta temporal invalida');
    bytes.writeUInt16LE(row.mask,i*4);bytes[i*4+2]=row.y??2;bytes[i*4+3]=i+1<rows.length&&row.link?1:0;
  }
  const source=['# LaPlaceDIG temporal: evidencia en Ether original, ajuste nativo','mem_reset 0'];
  for(let i=0;i<bytes.length;i++)if(bytes[i])source.push(`mem_store ${BASE+i} ${bytes[i]}`);
  source.push(`laplace_fit ${BASE} ${rows.length} ${alpha} ${strength}`);
  return source.join('\n')+'\n';
}
function validateCheckpoint(checkpoint){
  const {checkpoint_sha256,...body}=checkpoint??{};
  need(digest(JSON.stringify(body))===checkpoint_sha256,'hash de metadatos temporales invalido');
  need(checkpoint?.schema===DYNAMIC_VERSION&&checkpoint.runtime_ref===RUNTIME_REF&&
    checkpoint.executor_source_sha256===EXECUTOR_SOURCE_SHA256&&checkpoint.extractor_sha256===EXTRACTOR_SHA256,'checkpoint temporal incompatible');
  need(digest(checkpoint.xi)===checkpoint.xi_sha256,'hash de programa temporal invalido');
  timestamp(checkpoint.cutoff);return checkpoint;
}
export function fitTemporal(binary,rows,{alpha=4,prior_strength=8,cutoff}={}){
  need(Number.isInteger(alpha)&&alpha>=0&&alpha<=64&&Number.isInteger(prior_strength)&&prior_strength>=1&&prior_strength<=64,'regularizacion temporal invalida');
  const when=timestamp(cutoff);
  for(let i=0;i<rows.length;i++){
    const row=rows[i],date=timestamp(row.date);
    need(date<=when&&(!row.target_known_at||timestamp(row.target_known_at)<=when),'evidencia futura en aprendizaje temporal');
    need(i===0||date>timestamp(rows[i-1].date),'estados temporales fuera de orden');
    need(typeof row.link==='boolean'&&(!row.link||i+1<rows.length&&timestamp(rows[i+1].date)===addDays(date,1)),
      'enlace temporal incompleto o no diario');
    if(row.y!==null)need(typeof row.target_known_at==='string'&&timestamp(row.target_known_at)>=addDays(date,1),
      'etiqueta conocida antes de terminar su horizonte');
  }
  const xi=checkpointProgram(rows,alpha,prior_strength);
  const body={schema:DYNAMIC_VERSION,runtime_ref:RUNTIME_REF,executor_source_sha256:EXECUTOR_SOURCE_SHA256,
    extractor_sha256:EXTRACTOR_SHA256,cutoff:when,training_sha256:digest(JSON.stringify(rows)),xi_sha256:digest(xi),xi};
  const checkpoint={...body,checkpoint_sha256:digest(JSON.stringify(body))};
  const output=executeTemporal(binary,xi+'laplace_report\nmem_stats\nstats\n');
  const learned=output.find(row=>row.type==='temporal_model'),memory=output.find(row=>row.type==='memory_stats'),core=output.find(row=>row.type==='stats');
  need(learned?.backend==='original-inverse-ether-memory'&&memory?.model==='inverse-ether-memory'&&core?.active_qubits===0,'procedencia nativa temporal incorrecta');
  return {checkpoint,learned,native:{backend:learned.backend,arithmetic:learned.arithmetic,active_qubits:core.active_qubits,
    memory_overrides:memory.overrides,learned_in_native:true,propagation_backend:'native-classical'}};
}
export function queryTemporal(binary,checkpoint,queries){
  validateCheckpoint(checkpoint);need(Array.isArray(queries)&&queries.length<=256,'presupuesto de consultas temporales excedido');
  for(const query of queries){
    need(Number.isInteger(query.mask)&&query.mask>=0&&query.mask<2048&&Number.isInteger(query.steps)&&query.steps>=0&&query.steps<=0xffffffff,'consulta temporal invalida');
    if(query.origin_at)need(timestamp(query.origin_at)>=checkpoint.cutoff,'el modelo contiene informacion posterior al origen solicitado');
  }
  const xi=checkpoint.xi+queries.map(query=>`laplace_evolve ${query.mask} ${query.steps}`).join('\n')+'\nmem_stats\nstats\n';
  const output=executeTemporal(binary,xi),forecasts=output.filter(row=>row.type==='temporal_evolution');
  need(forecasts.length===queries.length,'respuestas temporales incompletas');
  return {forecasts,xi,xi_sha256:digest(xi),output_sha256:digest(JSON.stringify(forecasts)),
    memory:output.find(row=>row.type==='memory_stats'),core:output.find(row=>row.type==='stats')};
}
function validationStates(binary,checkpoint,records,start,end,learned){
  const rows=[];for(let date=start;addDays(date,1)<=end;date=addDays(date,1)){
    const first=frameAt(records,date),next=frameAt(records,addDays(date,1));
    if(first.mask!==65535&&next.mask!==65535)rows.push({first,next});
  }
  const run=queryTemporal(binary,checkpoint,rows.map(row=>({mask:row.first.mask,steps:1,origin_at:row.first.date})));
  let loss=0,baseLoss=0,abstentions=0;
  for(let i=0;i<rows.length;i++){
    const forecast=run.forecasts[i],index=learned.state_masks.indexOf(rows[i].next.mask),base=index<0?0:learned.state_reference[index];
    const p=forecast.trace[1]&&index>=0?forecast.trace[1].distribution[index]:base;
    if(!forecast.trace.length)abstentions++;
    loss-=Math.log(Math.max(1e-12,p));baseLoss-=Math.log(Math.max(1e-12,base));
  }
  return {count:rows.length,log_loss:rows.length?loss/rows.length:null,baseline_log_loss:rows.length?baseLoss/rows.length:null,abstentions};
}
function evaluateWindow(binary,checkpoint,learned,records,start,end){
  const frames=[];for(let date=start;date<end;date=addDays(date,1))frames.push(frameAt(records,date));
  const valid=frames.filter(frame=>frame.mask!==65535),run=queryTemporal(binary,checkpoint,valid.map(frame=>({mask:frame.mask,steps:7,origin_at:frame.date})));
  const map=new Map(valid.map((frame,i)=>[frame.date,run.forecasts[i]])),forecasts=[],observations=[];
  for(const frame of frames){
    for(const horizon of HORIZONS){
      const decision=addDays(frame.date,horizon),due=addDays(decision,1);if(due>end)continue;
      const native=map.get(frame.date),result=native?.trace[horizon];
      const observation=marketObservation(records,target,decision,end);
      const entry={origin_at:frame.date,decision_at:decision,due_at:due,horizon_days:horizon,initial_mask:frame.mask,
        probability:result?.probability??null,negative_probability:result?.negative_probability??null,status:result?'estimacion_nativa':native?.status??'abstencion_sin_narrativa',
        narrative_distribution:result?.distribution??null,model_xi_sha256:checkpoint.xi_sha256};
      forecasts.push(entry);if(observation)observations.push({origin_at:frame.date,horizon_days:horizon,y:observation.y,target_known_at:observation.target_known_at,price_ids:observation.price_ids});
    }
  }
  const sealed=digest(JSON.stringify(forecasts)),byHorizon=[];
  for(const horizon of HORIZONS){
    const scored=[];for(const forecast of forecasts.filter(row=>row.horizon_days===horizon)){
      const actual=observations.find(row=>row.origin_at===forecast.origin_at&&row.horizon_days===horizon);
      if(actual)scored.push({probability:forecast.probability,y:actual.y});
    }
    byHorizon.push({horizon_days:horizon,...scores(scored,learned.training_prior)});
  }
  return {forecasts,observations,forecasts_sha256:sealed,native_program_sha256:run.xi_sha256,native_output_sha256:run.output_sha256,by_horizon:byHorizon};
}
export function temporalExperiment(binary,history,{mode='strict'}={}){
  const records=historicalView(history,mode),folds=[];
  for(let start=timestamp(history.start);addDays(start,70)<=history.end;start=addDays(start,14)){
    const trainEnd=addDays(start,42),validationEnd=addDays(trainEnd,14),testEnd=addDays(validationEnd,14);
    const rows=trainingFrames(records,{start,end:trainEnd}),candidates=[];
    for(const alpha of PLAN.alphas){
      const fitted=fitTemporal(binary,rows,{alpha,cutoff:trainEnd});
      const validation=validationStates(binary,fitted.checkpoint,records,trainEnd,validationEnd,fitted.learned);
      candidates.push({alpha,validation,fitted});
    }
    candidates.sort((a,b)=>(a.validation.log_loss??Infinity)-(b.validation.log_loss??Infinity)||b.alpha-a.alpha);
    const chosen=candidates[0];
    const {checkpoint_sha256,...beforeSelection}=chosen.fitted.checkpoint;
    const selectedCheckpoint={...beforeSelection,training_cutoff:trainEnd,cutoff:validationEnd,
      selection_sha256:digest(JSON.stringify(candidates.map(({alpha,validation})=>({alpha,validation}))))};
    chosen.fitted.checkpoint={...selectedCheckpoint,checkpoint_sha256:digest(JSON.stringify(selectedCheckpoint))};
    const test=evaluateWindow(binary,chosen.fitted.checkpoint,chosen.fitted.learned,records,validationEnd,testEnd);
    folds.push({partitions:{training:[start,trainEnd],validation:[trainEnd,validationEnd],test:[validationEnd,testEnd]},
      selected_alpha:chosen.alpha,candidates:candidates.map(({fitted,...row})=>row),native:{...chosen.fitted.native,propagated_in_native:true},
      learned:chosen.fitted.learned,checkpoint:chosen.fitted.checkpoint,...test});
  }
  const horizons=HORIZONS.map(h=>{
    const rows=folds.map(f=>f.by_horizon.find(row=>row.horizon_days===h)),count=rows.reduce((sum,row)=>sum+row.count,0);
    const avg=key=>count?rows.reduce((sum,row)=>sum+row.count*(row[key]??0),0)/count:null;
    const brier=avg('brier'),baseline=avg('baseline_brier');
    return {horizon_days:h,count,brier,baseline_brier:baseline,coverage:avg('coverage'),
      eligible_for_confirmation:mode==='strict'&&count>=16&&brier<baseline,
      retrospective_improvement:count>0&&brier<baseline};
  });
  return {schema:DYNAMIC_VERSION,generated_at:new Date().toISOString(),mode,plan:PLAN,source_ledger_sha256:history.ledger_sha256,
    executor_source_sha256:EXECUTOR_SOURCE_SHA256,runtime_ref:RUNTIME_REF,folds,horizons,
    horizon_days_tested:HORIZONS,certified_price_vintages:false,independent_fresh_holdout:false,
    live_activation:false,financial_edge_demonstrated:false,
    computation:'native Laplace domain operations; unmodified original QuantumRuntime/InverseMemory; classical arithmetic',
    interpretation:'Retrospective periods were explored earlier; this is a new temporal model test, not independent confirmation.'};
}
export function liveTemporalProfile(binary,history,report,{as_of=new Date().toISOString()}={}){
  need(report.schema===DYNAMIC_VERSION&&report.source_ledger_sha256===history.ledger_sha256,'informe dinamico incompatible');
  const records=canonicalLedger([...history.records]),known=timestamp(as_of);
  need(records.every(row=>row.known_at<=known),'el perfil vivo no puede usar registros aun desconocidos');
  const alpha=report.folds.at(-1)?.selected_alpha??4;
  const fitted=fitTemporal(binary,trainingFrames(records,{start:history.start,end:history.end,label_cutoff:known}),{alpha,cutoff:known});
  const news=records.filter(row=>['geopolitica','humanitaria'].includes(row.kind));
  const lastSeen=news.map(row=>row.known_at).sort().at(-1),initial=frameAt(records,lastSeen);
  const rangeEnd='2030-12-31',projectionSteps=Math.round((Date.parse(rangeEnd+'T00:00:00Z')-Date.parse(lastSeen.slice(0,10)+'T00:00:00Z'))/DAY);
  need(projectionSteps>=0,'el calendario de proyeccion termina antes de los datos');
  const run=queryTemporal(binary,fitted.checkpoint,fitted.learned.state_masks.map(mask=>({mask,steps:projectionSteps})));
  const supported=report.horizons.filter(row=>row.eligible_for_confirmation).map(row=>row.horizon_days);
  const prices=new Map(records.filter(row=>row.kind==='precio'&&row.price_basis==='raw_close').map(row=>[row.observed_at,row]));
  const historical=[];
  for(const fold of report.folds)for(const forecast of fold.forecasts.filter(row=>row.horizon_days===1)){
    const observation=fold.observations.find(row=>row.origin_at===forecast.origin_at&&row.horizon_days===1);
    if(!observation)continue;
    historical.push({...forecast,actual:observation.y,start_price:prices.get(forecast.decision_at)?.value??null,
      end_price:prices.get(forecast.due_at)?.value??null,raw_correct:forecast.probability===null?null:Number(forecast.probability>0.5)===observation.y,
      model_xi_sha256:fold.checkpoint.xi_sha256,forecast_sha256:fold.forecasts_sha256,
      state_masks:fold.learned.state_masks,model_training_samples:fold.learned.samples,
      model_labels:fold.learned.labels,model_cutoff:fold.checkpoint.cutoff,
      narrative_themes:forecast.initial_mask===65535?[]:maskThemes(forecast.initial_mask)});
  }
  const body={schema:DYNAMIC_VERSION,as_of:known,origin_date:addDays(known.slice(0,10)+'T00:00:00Z',1).slice(0,10),last_observed_date:lastSeen.slice(0,10),
    range_start:historical[0]?.decision_at.slice(0,10)??history.start.slice(0,10),range_end:rangeEnd,
    max_computed_horizon_days:projectionSteps,tested_horizon_days:HORIZONS,validated_horizon_days:supported,features:FEATURES,default_mask:initial.mask,
    default_themes:initial.themes,native:{...fitted.native,propagated_in_native:true},model:fitted.learned,
    checkpoint_xi_sha256:fitted.checkpoint.xi_sha256,executor_source_sha256:EXECUTOR_SOURCE_SHA256,
    source_ledger_sha256:ledgerHash(records),native_program:run.xi,native_program_sha256:run.xi_sha256,native_output_sha256:run.output_sha256,
    forecasts:run.forecasts,history:historical,backtest:report.horizons,
    historical_programs:Object.fromEntries(report.folds.map(fold=>[fold.checkpoint.xi_sha256,fold.checkpoint.xi])),
    initial_narrative_sources:news.filter(row=>initial.news_ids.includes(row.id)).map(row=>({id:row.id,url:row.source_url,known_at:row.known_at})),
    live_activation:false,financial_edge_demonstrated:false,temporal_model:'learned finite-state Markov transitions',
    target:'BTC-USD return above 10 bps during the 24h AFTER the selected date',
    long_horizon_status:'proyeccion_nativa_disponible',projection_assumptions:['learned_transition_matrix_held_constant','daily_BTC_target_held_constant'],original_runtime_modified:false};
  return {...body,profile_sha256:digest(JSON.stringify(body))};
}
