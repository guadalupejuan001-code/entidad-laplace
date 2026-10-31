/* E002 is explicitly SYNTHETIC. It tests learning, not market predictability. */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonicalLedger,stringifyJSONL} from '../historia/contrato.mjs';
import {trainNarrative,predictNarrative,evaluateNarrative} from './modelo.mjs';
import {digest} from '../inteligencia/laplace.mjs';

const need=(ok,message)=>{if(!ok)throw new Error(message)};
const DAY=86400000,START=Date.UTC(2020,0,1);
const date=day=>new Date(START+day*DAY).toISOString();
const decimal=value=>(value/100000000n)+'.'+(value%100000000n).toString().padStart(8,'0');
const source='https://example.org/laplace-e002-synthetic-not-market-data/';

export function syntheticNarrativeData(){
  let seed=0x1A91ACE;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const records=[],days=256;
  let price=50000n*100000000n;
  const addPrice=day=>records.push({id:'synthetic-price-'+day,kind:'precio',asset:'BTC-USD',
    currency:'USD',price_basis:'raw_close',observed_at:date(day),known_at:date(day),
    value:decimal(price),source_url:source+'price/'+day});
  addPrice(0);
  const contexts=[];
  for(let day=0;day<days;day++){
    // Four balanced contexts, each repeated with stochastic outcomes. The
    // useful information is an INTERACTION, not a predetermined theme sign.
    const context=day%4;
    const geo=context<2?'CONFLICT_ESCALATION':'CEASEFIRE';
    const hum=context%2===0?'AID_BLOCKED':'RELIEF_ACCESS';
    const geoText=geo==='CONFLICT_ESCALATION'?'Military escalation and airstrike reported.':'Ceasefire and peace agreement reported.';
    const humText=hum==='AID_BLOCKED'?'Aid blocked; humanitarian access denied.':'Humanitarian corridor opened; aid delivered.';
    for(const [kind,summary,offset] of [['geopolitica',geoText,2],['humanitaria',humText,1]]){
      const known=new Date(START+day*DAY-offset*3600000).toISOString();
      records.push({id:'synthetic-story-'+day+'-'+kind,kind,event_code:'TEXT_ONLY',
        region:'GLOBAL',summary,observed_at:known,known_at:known,
        source_url:source+'story/'+day+'/'+kind});
    }
    const probability=[0.15,0.8,0.8,0.15][context];
    const y=random()<probability?1:0;
    price=y?price*1008n/1000n:price*994n/1000n;
    addPrice(day+1);
    contexts.push({decision_at:date(day),context,generating_probability:probability,y});
  }
  return {records:canonicalLedger(records),contexts,
    config:{start_at:date(0),train_end:date(128),validation_end:date(192),narrative_hours:24},
    test_end:date(days)};
}

export function narrativeExperiment(binary,directory){
  const out=resolve(directory);mkdirSync(out,{recursive:true});
  const save=(name,value)=>writeFileSync(join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
  const data=syntheticNarrativeData();
  const trained=trainNarrative(binary,data.records,data.config);
  need(trained.status==='modelo_narrativo_entrenado','no se aprendio el patron sintetico');
  need(trained.rules.some(rule=>['pair','sequence'].includes(rule.pattern.type)),
    'el aprendiz no recupero ninguna interaccion narrativa');
  save('00_configuracion_sintetica.json',{...data.config,test_end:data.test_end,synthetic:true});
  save('00_hechos_sinteticos.jsonl',stringifyJSONL(data.records));
  save('01_checkpoint.json',trained.checkpoint);
  save('01_estado_aprendido.xi',trained.checkpoint.xi);
  const {checkpoint:storedCheckpoint,...trainingReport}=trained;
  save('01_entrenamiento_y_patrones.json',trainingReport);
  const checkpoint=JSON.parse(readFileSync(join(out,'01_checkpoint.json'),'utf8'));
  // Freeze before evaluation. Training/selection functions have temporal
  // boundaries and are tested against mutations of all future outcomes.
  const forecast=predictNarrative(binary,checkpoint,data.records,data.config.validation_end);
  save('02_pronostico_sellado.json',forecast);
  const seal=digest(readFileSync(join(out,'02_pronostico_sellado.json')));
  const evaluation=evaluateNarrative(binary,checkpoint,data.records,data.test_end);
  save('03_evaluacion_reservada.json',evaluation);
  need(seal===digest(readFileSync(join(out,'02_pronostico_sellado.json'))),'pronostico modificado');
  const withoutNews=data.records.filter(row=>!['geopolitica','humanitaria'].includes(row.kind));
  const ablation=evaluateNarrative(binary,checkpoint,withoutNews,data.test_end);
  need(ablation.metrics.coverage===0,'se infirio una narrativa desde precios');
  need(evaluation.metrics.brier<evaluation.metrics.baseline_brier,'no se recupero la relacion sintetica');
  const summary={suite:'LAPLACE_E002_PROBABILIDAD_NARRATIVA',synthetic:true,
    target:trained.target,formula:'p_j=(s_j+kappa*p0)/(n_j+kappa); p0=(S+1)/(N+2)',
    inference_inputs:['geopolitica','humanitaria'],prices_used_only_for_labels:true,
    host_computation:'extraccion simbolica, conteos, suavizado Beta y seleccion temporal',
    native_xi:'unica copia persistida de las estadisticas y reglas; recuperacion exacta desde Ether',
    train_end:data.config.train_end,validation_end:data.config.validation_end,test_end:data.test_end,
    training_samples:trained.training_samples,validation_samples:trained.validation_samples,
    training_prior:trained.training_prior,candidates_examined:trained.candidates_examined,
    candidates_generated:trained.candidates_generated,
    pattern_audit:trained.pattern_audit,
    validated_rules:trained.validated_rules,learned_rules:trained.rules,
    validation:trained.validation,test:evaluation.metrics,no_narrative_control:ablation.metrics,
    native:trained.native,model_state_sha256:checkpoint.state_sha256,
    forecast_sha256:forecast.forecast_sha256,seal_sha256:seal,
    financial_edge_demonstrated:false,causal_laws_demonstrated:false,
    full_language_comprehension:false,orders_executed:0};
  save('resultado.json',summary);return summary;
}
