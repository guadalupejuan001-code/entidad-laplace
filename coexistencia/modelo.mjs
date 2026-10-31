/* Two outputs for ONE objective. No averaging and no trading decisions. */
import {canonicalLedger,timestamp} from '../historia/contrato.mjs';
import {learn,predict,planReduction,digest,MAX_TRANSITIONS,RUNTIME_REF} from '../inteligencia/laplace.mjs';
import {configuration,trainNarrative,restoreNarrative,marketSamples,inferNarrative} from '../narrativa/modelo.mjs';
import {THEMES,EXTRACTOR_SHA256,stateFromNarratives} from '../narrativa/espacio.mjs';
import {storeObject,restoreObject} from './estado-xi.mjs';

const SCHEMA='laplace-dual-v1';
const need=(ok,message)=>{if(!ok)throw new Error(message)};
const narratives=records=>records.filter(row=>['geopolitica','humanitaria'].includes(row.kind));
const encode=(features,state)=>features.map(feature=>state.atoms.includes(feature)?'1':'0').join('');

// A small row basis preserves the complete input design. Selection never
// reads labels. Redundant/complementary narrative features are not mistaken
// for missing experimental rank. New contexts must remain in this domain.
function inputDesign(vectors){
  const design=[];
  for(const vector of vectors){
    if(planReduction([...design,vector]).rank>design.length)design.push(vector);
  }
  const columns=[];
  let rank=1;
  for(let col=0;col<vectors[0].length;col++){
    const candidate=[...columns,col];
    const next=planReduction(design.map(vector=>candidate.map(i=>vector[i]).join(''))).rank;
    if(next>rank){columns.push(col);rank=next}
  }
  return {design,columns,rank};
}

export function trainDual(binary,rawRecords,rawConfig){
  const config=configuration(rawConfig),records=canonicalLedger([...rawRecords]);
  const probabilistic=trainNarrative(binary,records,config);
  const train=marketSamples(records,config,config.start_at,config.train_end,config.train_end);
  const validation=marketSamples(records,config,config.train_end,config.validation_end,config.validation_end);
  const samples=[...train.rows,...validation.rows];
  const features=Object.keys(THEMES).sort(),vectors=samples.map(row=>encode(features,row.state));
  const design=vectors.length?inputDesign(vectors):{design:[],columns:[],rank:0};
  const selected=design.columns.map(i=>features[i]);
  let deterministic={status:'evidencia_insuficiente',checkpoint:null,reason:'ninguna variable narrativa independiente'};
  const representatives=new Map();
  if(selected.length){
    for(const row of samples){
      const before=encode(selected,row.state),after=String(row.y)+'0'.repeat(selected.length-1);
      const key=before+'|'+after;
      // Identical equations can be compressed. Opposing outcomes remain as
      // TWO rows, so noise cannot disappear through deduplication.
      if(!representatives.has(key))representatives.set(key,{
        id:'dual-'+digest(row.decision_at+'|'+key).slice(0,32),before,after,
        observed_at:row.due_at,known_at:row.target_known_at});
    }
    deterministic=representatives.size>MAX_TRANSITIONS
      ?{status:'presupuesto_determinista_excedido',checkpoint:null}
      :learn(binary,[...representatives.values()],config.validation_end);
  }
  const context={schema:SCHEMA,extractor_sha256:EXTRACTOR_SHA256,config,
    objective:{asset:config.asset,currency:config.currency,price_basis:config.price_basis,
      horizon_hours:config.horizon_hours,cost_bps:config.cost_bps,definition:'return_after_assumed_cost_positive'},
    features,selected_features:selected,input_design:design.design,input_rank:design.rank,
    known_samples:samples.length,representative_equations:representatives.size,
    evidence_sha256:digest(JSON.stringify(samples)),deterministic_status:deterministic.status,
    deterministic_xi_sha256:deterministic.checkpoint?.xi_sha256??null,
    probabilistic_status:probabilistic.status,
    probabilistic_state_sha256:probabilistic.checkpoint?.state_sha256??null,
    deterministic_target_bit:0,
    deterministic_scope:'ley afin sobre temas narrativos; consecuencia condicional, no certeza fisica del mercado'};
  const stored=storeObject(binary,context);
  const body={schema:SCHEMA,runtime_ref:RUNTIME_REF,context:stored.checkpoint,
    deterministic:deterministic.checkpoint,probabilistic:probabilistic.checkpoint??null};
  const checkpoint={...body,sha256:digest(JSON.stringify(body))};
  return {status:deterministic.checkpoint||probabilistic.checkpoint?'rutas_integradas':'rutas_sin_evidencia',
    checkpoint,target:context.objective,
    deterministic:{status:deterministic.status,samples:samples.length,
      representatives:representatives.size,selected_features:selected,
      rules:deterministic.rules??[],contradictions:deterministic.contradictions??0},
    probabilistic:{status:probabilistic.status,validated_rules:probabilistic.validated_rules??0,
      training_samples:probabilistic.training_samples,validation_samples:probabilistic.validation_samples},
    context_native:stored.native};
}

export function restoreDual(binary,checkpoint){
  need(checkpoint?.schema===SCHEMA&&checkpoint.runtime_ref===RUNTIME_REF,'checkpoint dual incompatible');
  const {sha256,...body}=checkpoint;
  need(digest(JSON.stringify(body))===sha256,'hash del conjunto dual invalido');
  const {value:context}=restoreObject(binary,checkpoint.context);
  need(context.schema===SCHEMA&&context.extractor_sha256===EXTRACTOR_SHA256,'contexto/extractor incompatible');
  const model=checkpoint.probabilistic?restoreNarrative(binary,checkpoint.probabilistic).model:null;
  configuration(context.config);
  need(context.probabilistic_state_sha256===(checkpoint.probabilistic?.state_sha256??null)&&
    (!model||JSON.stringify(context.config)===JSON.stringify(model.config)),'objetivos probabilisticos incompatibles');
  need(context.deterministic_xi_sha256===(checkpoint.deterministic?.xi_sha256??null),
    'ley determinista ajena al objetivo compartido');
  need(Array.isArray(context.features)&&context.features.length>0&&context.features.length<=16&&
    context.features.every(feature=>Object.hasOwn(THEMES,feature)),'vocabulario dual invalido');
  need(Array.isArray(context.selected_features)&&context.selected_features.every(feature=>context.features.includes(feature)),
    'base narrativa invalida');
  if(checkpoint.deterministic)need(checkpoint.deterministic.width===context.selected_features.length&&
    checkpoint.deterministic.cutoff===context.config.validation_end,'codificacion determinista incompatible');
  return {context,probabilistic_model:model};
}

export function compareOutputs(deterministic,probabilistic){
  const y=deterministic.value,p=probabilistic.probability;
  const comparable=(y===0||y===1)&&typeof p==='number';
  const favored=p===null||p===0.5?null:Number(p>0.5);
  return {same_objective:true,two_results:comparable,
    probability_assigned_to_calculated_result:comparable?(y===1?p:1-p):null,
    probability_favored_value:favored,
    different_directions:comparable&&favored!==null?y!==favored:null,
    combined_result:null};
}

export function predictDual(binary,checkpoint,rawRecords,cutoff){
  const {context,probabilistic_model:model}=restoreDual(binary,checkpoint),when=timestamp(cutoff);
  need(when>=context.config.validation_end,'checkpoint dual contiene evidencia posterior al corte');
  const records=canonicalLedger([...rawRecords]);
  const state=stateFromNarratives(narratives(records),when,context.config.narrative_hours);
  const full=encode(context.features,state),input=encode(context.selected_features,state);
  let deterministic={status:context.deterministic_status,value:null,
    scope:context.deterministic_scope,model_xi_sha256:context.deterministic_xi_sha256};
  if(checkpoint.deterministic){
    const inDomain=planReduction([...context.input_design,full]).rank===context.input_rank;
    if(inDomain&&state.coverage.classified){
      const calculated=predict(binary,checkpoint.deterministic,input,1);
      deterministic={...deterministic,status:'consecuencia_condicional',
        value:Number(calculated.states[0][context.deterministic_target_bit]),
        input,calculated_state:calculated.states[0],rules:calculated.rules,
        native_forecast_sha256:calculated.forecast_sha256};
    }else deterministic={...deterministic,status:state.coverage.classified
      ?'abstencion_fuera_del_dominio':'abstencion_sin_narrativa'};
  }
  const probabilistic=model?{...inferNarrative(model,state),model_state_sha256:checkpoint.probabilistic.state_sha256}
    :{status:context.probabilistic_status,probability:null,reference_probability:null,chosen_pattern:null,
      support:null,considered_patterns:[],model_state_sha256:null};
  const definition={objective:context.objective,extractor_sha256:context.extractor_sha256,
    lookback_hours:state.lookback_hours,atoms:state.atoms,sequences:state.sequences};
  const pattern={id:digest(JSON.stringify(definition)),definition,
    chosen_probabilistic_condition:probabilistic.chosen_pattern};
  const forecast={schema:'laplace-dual-forecast-v1',cutoff:when,
    due_at:new Date(Date.parse(when)+context.config.horizon_hours*3600000).toISOString(),
    objective:context.objective,model_sha256:checkpoint.sha256,pattern,
    narrative_state_sha256:state.state_sha256,narrative_sources:state.events,
    results:{deterministic,probabilistic},comparison:compareOutputs(deterministic,probabilistic)};
  return {...forecast,forecast_sha256:digest(JSON.stringify(forecast))};
}
