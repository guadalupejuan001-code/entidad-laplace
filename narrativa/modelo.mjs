/* Own probabilistic learner. Classical estimation; native Ether/XI state.
 * Prices make supervised labels only. Inference accepts narrative state only.
 */
import {canonicalLedger,timestamp,ledgerHash} from '../historia/contrato.mjs';
import {executeXI,digest,RUNTIME_REF} from '../inteligencia/laplace.mjs';
import {EXTRACTOR,EXTRACTOR_SHA256,stateFromNarratives,enumeratePatterns,matches,patternKey,validatePattern}
  from './espacio.mjs';

const need=(ok,message)=>{if(!ok)throw new Error(message)};
const HOUR=3600000,BASE=960000000000000000000000000000n;
const SCHEMA='laplace-narrative-market-v1',MAX_MODEL_BYTES=24576;
export const MAX_CANDIDATES=256,MAX_RULES=16,MAX_SAMPLES=512;
const REQUIRED=['start_at','train_end','validation_end'];
const DEFAULTS=Object.freeze({asset:'BTC-USD',currency:'USD',price_basis:'raw_close',
  horizon_hours:24,step_hours:24,cost_bps:10,narrative_hours:72,
  prior_strength:8,min_train_support:8,min_validation_support:8,min_brier_gain:0.001});

export function configuration(raw){
  need(raw&&typeof raw==='object'&&!Array.isArray(raw),'falta configuracion narrativa');
  const allowed=[...Object.keys(DEFAULTS),...REQUIRED];
  need(Object.keys(raw).every(key=>allowed.includes(key)),'campo de configuracion desconocido');
  for(const key of REQUIRED)need(Object.hasOwn(raw,key),'falta '+key);
  const config={...DEFAULTS,...raw};
  for(const key of REQUIRED)config[key]=timestamp(config[key],key);
  need(config.start_at<config.train_end&&config.train_end<config.validation_end,'cortes cronologicos invalidos');
  need(typeof config.asset==='string'&&typeof config.currency==='string'&&
    /^[A-Z0-9.^_-]{1,32}$/.test(config.asset)&&/^[A-Z]{3,12}$/.test(config.currency),'activo/moneda invalidos');
  need(config.asset==='BTC-USD'&&config.currency==='USD','Laplace de mercado se centra en Bitcoin BTC-USD');
  need(config.price_basis==='raw_close','E002 requiere raw_close, sin ajustes retrospectivos');
  for(const key of ['horizon_hours','step_hours','narrative_hours','prior_strength','min_train_support','min_validation_support']){
    need(Number.isInteger(config[key])&&config[key]>=1&&config[key]<=168,key+' debe ser entero entre 1 y 168');
  }
  need(config.step_hours>=config.horizon_hours,'las etiquetas no deben solaparse: step >= horizon');
  need(Number.isInteger(config.cost_bps)&&config.cost_bps>=0&&config.cost_bps<=10000,'coste supuesto invalido');
  need(typeof config.min_brier_gain==='number'&&Number.isFinite(config.min_brier_gain)&&
    config.min_brier_gain>=0&&config.min_brier_gain<1,'ganancia Brier minima invalida');
  need((Date.parse(config.validation_end)-Date.parse(config.start_at))/(config.step_hours*HOUR)<=MAX_SAMPLES,
    'maximo '+MAX_SAMPLES+' decisiones por entrenamiento');
  return Object.freeze(Object.fromEntries([...Object.keys(DEFAULTS),...REQUIRED].map(key=>[key,config[key]])));
}

function fixedDecimal(raw){
  need(typeof raw==='string'&&/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,8})?$/.test(raw),'precio decimal positivo invalido');
  const [whole,fraction='']=raw.split('.');
  const value=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
  need(value>0n,'precio debe ser positivo');return value;
}
export function marketOutcome(startPrice,endPrice,costBps=10){
  need(Number.isInteger(costBps)&&costBps>=0&&costBps<=10000,'coste invalido');
  const start=fixedDecimal(startPrice),end=fixedDecimal(endPrice);
  const netNumerator=10000n*(end-start)-BigInt(costBps)*start;
  return {y:netNumerator>0n?1:0,net_return_bps:Number(netNumerator)/Number(start)};
}

const narrativeRows=records=>records.filter(row=>['geopolitica','humanitaria'].includes(row.kind));
function pricesAsOf(records,config,knownCutoff){
  const prices=new Map();
  for(const row of records){
    if(row.kind!=='precio'||row.asset!==config.asset||row.currency!==config.currency||
      row.price_basis!==config.price_basis||row.known_at>knownCutoff)continue;
    const previous=prices.get(row.observed_at);
    need(!previous||previous.known_at!==row.known_at||previous.value===row.value,
      'precios contradictorios en el mismo instante de disponibilidad');
    prices.set(row.observed_at,row);
  }
  return prices;
}
function outcomeFromPrices(prices,config,when,due){
  const first=prices.get(when),last=prices.get(due);
  if(!first||!last)return null;
  return {decision_at:when,due_at:due,
    target_known_at:first.known_at>last.known_at?first.known_at:last.known_at,
    price_ids:[first.id,last.id],...marketOutcome(first.value,last.value,config.cost_bps)};
}
export function marketObservation(records,config,cutoff,knownCutoff){
  const when=timestamp(cutoff),known=timestamp(knownCutoff);
  const due=new Date(Date.parse(when)+config.horizon_hours*HOUR).toISOString();
  return outcomeFromPrices(pricesAsOf(records,config,known),config,when,due);
}
export function marketSamples(records,config,start,end,labelCutoff){
  const prices=pricesAsOf(records,config,labelCutoff),news=narrativeRows(records);
  const out=[],missing=[];
  for(let t=Date.parse(start);t<Date.parse(end);t+=config.step_hours*HOUR){
    need(out.length+missing.length<MAX_SAMPLES,'demasiadas decisiones de evaluacion');
    const when=new Date(t).toISOString(),due=new Date(t+config.horizon_hours*HOUR).toISOString();
    if(due>end)break; // purge targets crossing the next partition
    const target=outcomeFromPrices(prices,config,when,due);
    if(!target){missing.push(when);continue}
    out.push({...target,
      state:stateFromNarratives(news,when,config.narrative_hours)});
  }
  return {rows:out,missing};
}

const squared=(probability,y)=>(probability-y)**2;
const probability=(rule,prior,strength)=>(rule.successes+strength*prior)/(rule.count+strength);
const priorOf=model=>(model.global.successes+1)/(model.global.count+2);

export function scores(predictions,prior){
  need(Number.isFinite(prior)&&prior>0&&prior<1,'referencia probabilistica invalida');
  if(!predictions.length)return {count:0,brier:null,log_loss:null,baseline_brier:null,brier_skill:null,
    coverage:0,conditional_brier:null,conditional_baseline_brier:null,calibration:[]};
  let brier=0,baseline=0,logLoss=0,covered=0,conditional=0,conditionalBaseline=0;
  const bins=Array.from({length:10},()=>({count:0,probability_sum:0,positives:0}));
  for(const item of predictions){
    // Abstentions use the frozen training prior for full-stream scoring; never
    // remove hard cases to make the reported model score look better.
    need(item.probability===null||(Number.isFinite(item.probability)&&item.probability>0&&item.probability<1),
      'probabilidad ausente o invalida');
    const p=item.probability??prior;
    need(Number.isFinite(p)&&p>0&&p<1&&(item.y===0||item.y===1),'pronostico probabilistico invalido');
    const loss=squared(p,item.y),base=squared(prior,item.y);
    brier+=loss;baseline+=base;logLoss-=item.y*Math.log(p)+(1-item.y)*Math.log(1-p);
    if(item.probability!==null){covered++;conditional+=loss;conditionalBaseline+=base}
    const bin=bins[Math.min(9,Math.floor(p*10))];
    bin.count++;bin.probability_sum+=p;bin.positives+=item.y;
  }
  const n=predictions.length;
  return {count:n,brier:brier/n,log_loss:logLoss/n,baseline_brier:baseline/n,
    brier_skill:baseline===0?null:1-brier/baseline,coverage:covered/n,
    conditional_brier:covered?conditional/covered:null,
    conditional_baseline_brier:covered?conditionalBaseline/covered:null,
    calibration:bins.map((bin,i)=>({lower:i/10,upper:(i+1)/10,count:bin.count,
      mean_probability:bin.count?bin.probability_sum/bin.count:null,
      observed_frequency:bin.count?bin.positives/bin.count:null}))};
}

export function inferNarrative(model,state){
  const prior=priorOf(model);
  const applicable=model.rules.filter(rule=>matches(rule.pattern,state));
  // Pick one validated condition rather than multiply correlated probabilities.
  const chosen=state.coverage.classified?applicable[0]:null;
  return {status:chosen?'probabilidad_narrativa':'abstencion_sin_patron_validado',
    probability:chosen?probability(chosen,prior,model.config.prior_strength):null,
    reference_probability:prior,
    chosen_pattern:chosen?.pattern??null,
    support:chosen?{training:chosen.count,positive:chosen.successes,
      validation:chosen.validation_count,validation_brier_gain:chosen.validation_brier_gain}:null,
    considered_patterns:applicable.map(rule=>({pattern:rule.pattern,
      probability:probability(rule,prior,model.config.prior_strength)}))};
}

function pack(binary,model){
  const bytes=Buffer.from(JSON.stringify(model),'utf8');
  need(bytes.length>0&&bytes.length<=MAX_MODEL_BYTES,'estado aprendido excede 24 KiB; reducir reglas');
  const source=['# Laplace E002: estado probabilistico clasico en Ether original','mem_reset 0'];
  for(let i=0;i<bytes.length;i++)if(bytes[i])source.push('mem_store '+(BASE+BigInt(i))+' '+bytes[i]);
  source.push('mem_materialize '+BASE+' '+bytes.length,'mem_stats','stats');
  const xi=source.join('\n')+'\n';
  const checkpoint={schema:SCHEMA,runtime_ref:RUNTIME_REF,bytes:bytes.length,
    state_sha256:digest(bytes),xi_sha256:digest(xi),xi};
  const restored=restoreNarrative(binary,checkpoint);
  need(JSON.stringify(restored.model)===bytes.toString(),'el estado aprendido no se recupera fielmente');
  return {checkpoint,native:restored.native};
}

export function restoreNarrative(binary,checkpoint){
  need(checkpoint?.schema===SCHEMA&&checkpoint.runtime_ref===RUNTIME_REF,'checkpoint narrativo incompatible');
  need(Number.isInteger(checkpoint.bytes)&&checkpoint.bytes>=1&&checkpoint.bytes<=MAX_MODEL_BYTES,'tamano invalido');
  need(typeof checkpoint.xi==='string'&&digest(checkpoint.xi)===checkpoint.xi_sha256,'hash XI invalido');
  const run=executeXI(binary,checkpoint.xi);
  const views=run.output.filter(row=>row.type==='memory_materialization');
  const mem=run.output.filter(row=>row.type==='memory_stats'),core=run.output.filter(row=>row.type==='stats');
  need(views.length===1&&views[0].address===String(BASE)&&views[0].bytes===checkpoint.bytes&&
    typeof views[0].hex==='string'&&views[0].hex.length===checkpoint.bytes*2&&/^[a-f0-9]+$/i.test(views[0].hex),
    'materializacion narrativa XI invalida');
  const bytes=Buffer.from(views[0].hex,'hex');
  need(digest(bytes)===checkpoint.state_sha256,'hash del estado probabilistico invalido');
  need(mem.length===1&&mem[0].model==='inverse-ether-memory'&&mem[0].overrides===checkpoint.bytes&&
    mem[0].quantum_bindings===0&&core.length===1&&core[0].active_qubits===0,
    'el modelo clasico no debe crear enlaces ni qubits implicitos');
  const model=JSON.parse(bytes.toString('utf8'));
  need(model.schema===SCHEMA&&model.extractor===EXTRACTOR&&model.extractor_sha256===EXTRACTOR_SHA256,
    'modelo/extractor incompatible; no reinterpretar leyes con otro clasificador');
  configuration(model.config);
  need(Number.isInteger(model.global.count)&&model.global.count>0&&
    Number.isInteger(model.global.successes)&&model.global.successes>=0&&model.global.successes<=model.global.count,
    'estadistica global invalida');
  need(Array.isArray(model.rules)&&model.rules.length<=MAX_RULES,'demasiadas leyes');
  for(const rule of model.rules){
    validatePattern(rule.pattern);
    need(Number.isInteger(rule.count)&&rule.count>=model.config.min_train_support&&
      Number.isInteger(rule.successes)&&rule.successes>=0&&rule.successes<=rule.count&&
      Number.isInteger(rule.validation_count)&&rule.validation_count>=model.config.min_validation_support&&
      Number.isFinite(rule.validation_brier_gain)&&rule.validation_brier_gain>model.config.min_brier_gain,
      'ley probabilistica sin soporte validado');
  }
  return {model,native:{backend:mem[0].model,materialized_bytes:bytes.length,
    overrides:mem[0].overrides,active_qubits:core[0].active_qubits,exact_roundtrip:true}};
}

export function trainNarrative(binary,rawRecords,rawConfig){
  const config=configuration(rawConfig),records=canonicalLedger([...rawRecords]);
  const train=marketSamples(records,config,config.start_at,config.train_end,config.train_end);
  const validation=marketSamples(records,config,config.train_end,config.validation_end,config.validation_end);
  const minimum=Math.max(16,config.min_train_support*2);
  if(train.rows.length<minimum||validation.rows.length<Math.max(8,config.min_validation_support)){
    return {status:'evidencia_insuficiente',checkpoint:null,training_samples:train.rows.length,
      validation_samples:validation.rows.length,missing_training_labels:train.missing.length,
      missing_validation_labels:validation.missing.length};
  }
  const global={count:train.rows.length,successes:train.rows.reduce((sum,row)=>sum+row.y,0)};
  const prior=(global.successes+1)/(global.count+2),candidates=new Map();
  for(const row of train.rows)for(const pattern of enumeratePatterns(row.state)){
    const key=patternKey(pattern);
    if(!candidates.has(key))candidates.set(key,{pattern,count:0,successes:0});
    const rule=candidates.get(key);rule.count++;rule.successes+=row.y;
  }
  const eligible=[...candidates.values()].filter(rule=>rule.count>=config.min_train_support)
    .sort((a,b)=>b.count-a.count||patternKey(a.pattern).localeCompare(patternKey(b.pattern)));
  const supported=eligible.slice(0,MAX_CANDIDATES);
  const ranked=[],audit=new Map();
  for(const rule of candidates.values())audit.set(patternKey(rule.pattern),{...rule,
    probability:probability(rule,prior,config.prior_strength),validation_count:null,
    validation_brier_gain:null,status:rule.count<config.min_train_support
      ?'soporte_entrenamiento_insuficiente':'fuera_presupuesto_candidatos'});
  for(const rule of supported){
    const p=probability(rule,prior,config.prior_strength);
    const applicable=validation.rows.filter(row=>matches(rule.pattern,row.state));
    const entry=audit.get(patternKey(rule.pattern));
    entry.validation_count=applicable.length;
    if(applicable.length<config.min_validation_support){entry.status='soporte_validacion_insuficiente';continue}
    const gain=applicable.reduce((sum,row)=>sum+squared(prior,row.y)-squared(p,row.y),0)/applicable.length;
    entry.validation_brier_gain=gain;
    entry.status=gain>config.min_brier_gain?'fuera_presupuesto_leyes':'sin_mejora_validada';
    if(gain>config.min_brier_gain)ranked.push({...rule,validation_count:applicable.length,
      validation_brier_gain:gain});
  }
  ranked.sort((a,b)=>b.validation_brier_gain-a.validation_brier_gain||
    a.pattern.terms.length-b.pattern.terms.length||patternKey(a.pattern).localeCompare(patternKey(b.pattern)));
  const model={schema:SCHEMA,extractor:EXTRACTOR,extractor_sha256:EXTRACTOR_SHA256,
    config,global,rules:ranked.slice(0,MAX_RULES),
    training_samples:train.rows.length,validation_samples:validation.rows.length,
    candidates_examined:supported.length,candidates_discarded_by_budget:Math.max(0,eligible.length-supported.length),
    training_sha256:digest(JSON.stringify(train.rows)),validation_sha256:digest(JSON.stringify(validation.rows)),
    known_evidence_sha256:ledgerHash(records.filter(row=>row.known_at<=config.validation_end)),
    labels:'return_after_assumed_cost_positive',inference_inputs:['geopolitica','humanitaria']};
  let validationScores=scores(validation.rows.map(row=>({...inferNarrative(model,row.state),y:row.y})),prior);
  // Validation approves the complete dispatch policy as well as each rule.
  // No test labels enter selection, ranking, shrinkage or this guard.
  if(validationScores.brier>=validationScores.baseline_brier){
    for(const rule of model.rules)audit.get(patternKey(rule.pattern)).status='politica_sin_mejora';
    model.rules=[];
    validationScores=scores(validation.rows.map(row=>({...inferNarrative(model,row.state),y:row.y})),prior)}
  for(const rule of model.rules)audit.get(patternKey(rule.pattern)).status='seleccionado';
  const packed=pack(binary,model);
  return {status:model.rules.length?'modelo_narrativo_entrenado':'sin_senal_validada',...packed,
    target:{asset:config.asset,horizon_hours:config.horizon_hours,cost_bps:config.cost_bps},
    training_samples:train.rows.length,validation_samples:validation.rows.length,
    candidates_examined:supported.length,validated_rules:model.rules.length,
    candidates_generated:candidates.size,
    pattern_audit:[...audit.values()].sort((a,b)=>patternKey(a.pattern).localeCompare(patternKey(b.pattern))),
    rules:model.rules.map(rule=>({...rule,probability:probability(rule,prior,config.prior_strength)})),
    validation:validationScores,training_prior:prior,
    missing_labels:{training:train.missing.length,validation:validation.missing.length},
    financial_edge_demonstrated:false};
}

export function predictNarrative(binary,checkpoint,rawRecords,cutoff){
  const {model,native}=restoreNarrative(binary,checkpoint),when=timestamp(cutoff);
  need(when>=model.config.validation_end,'el modelo usa evidencia posterior al corte solicitado');
  const records=canonicalLedger([...rawRecords]);
  const state=stateFromNarratives(narrativeRows(records),when,model.config.narrative_hours);
  const forecast={schema:'laplace-narrative-forecast-v1',cutoff:when,
    target:{asset:model.config.asset,horizon_hours:model.config.horizon_hours,cost_bps:model.config.cost_bps},
    model_state_sha256:checkpoint.state_sha256,narrative_state_sha256:state.state_sha256,
    ...inferNarrative(model,state),narrative_sources:state.events,coverage:state.coverage};
  return {...forecast,forecast_sha256:digest(JSON.stringify(forecast)),native};
}

export function evaluateNarrative(binary,checkpoint,rawRecords,end){
  const {model}=restoreNarrative(binary,checkpoint),records=canonicalLedger([...rawRecords]);
  const until=timestamp(end,'test end'),start=model.config.validation_end;
  need(until>start,'test debe ser posterior a validacion');
  const held=marketSamples(records,model.config,start,until,until),prior=priorOf(model);
  const predictions=held.rows.map(row=>({decision_at:row.decision_at,due_at:row.due_at,
    ...inferNarrative(model,row.state),y:row.y,net_return_bps:row.net_return_bps,
    narrative_state_sha256:row.state.state_sha256,price_ids:row.price_ids,target_known_at:row.target_known_at}));
  return {schema:'laplace-narrative-evaluation-v1',test_start:start,test_end:until,
    frozen_model_state_sha256:checkpoint.state_sha256,training_prior:prior,
    metrics:scores(predictions,prior),missing_labels:held.missing.length,predictions,
    paper_trading_orders:0,financial_edge_demonstrated:false,
    interpretation:'probabilidad condicional estimada; asociaciones observacionales, no leyes causales demostradas'};
}
