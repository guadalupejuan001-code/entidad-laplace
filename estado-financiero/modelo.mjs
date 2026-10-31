/* EF001: contrato unificado. No transforma mediciones en leyes causales.
 * Decimal exacto se almacena como texto, sin pasar por Number.
 * Las observaciones U003 ya son float64 y se declaran aproximadas.
 */
import {sha,stable,need,decimal,identifier,sourceURL} from '../input/contrato.mjs';
import {utcTime,verifyUniverseSnapshot} from '../universo/estados.mjs';
import {verificarSelloCaptura} from '../universo/integridad.mjs';

export const EF001_SCHEMA='laplace-financial-world-ef001-v1';
export const FINANCIAL_FAMILIES=Object.freeze([
  'I001','P001','U001','U002','U003','U004','O001','D001','D002',
  'C001','B001','K001','M001','F001','V001','E001','E002','E003',
  'E004','E005','P002','P003','P004','P005','externo'
]);
const FAMILIES=new Set(FINANCIAL_FAMILIES);
const STATUS=new Set(['observed','estimated','missing','suppressed','unavailable','unknown']);
const ACCESS=new Set(['observed','partial','unavailable','restricted','requires_credentials','requires_license','not_connected','unknown']);
const VALUETYPES=new Set(['exact_decimal','float64_approx','none']);
const SCENARIOS=new Set(['counterfactual','stress','simulation','observational']);
const KINDS=new Set(['deterministic','probabilistic','structural','learned']);
const SHA=/^[a-f0-9]{64}$/;
const APPROX=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const text=(x,name,max=240)=>identifier(x,name,max);
const optional=(x,name,max)=>x===undefined||x===null?null:text(x,name,max);
const time=(x)=>utcTime(x);
const maybeTime=x=>x===undefined||x===null?null:time(x);
const object=(x,name)=>{need(x&&typeof x==='object'&&!Array.isArray(x),name+' debe ser objeto');stable(x);return x};
const digest=(x,name)=>{need(typeof x==='string'&&SHA.test(x),name+' debe ser SHA256');return x};
const family=x=>{need(FAMILIES.has(x),'familia financiera desconocida: '+x);return x};
export const recordSha=body=>sha(stable(body));
export function normalizarObservacion(f){
  need(f&&typeof f==='object'&&!Array.isArray(f),'observacion EF001 invalida');
  const observed_at=time(f.observed_at),known_at=time(f.known_at),published_at=maybeTime(f.published_at);
  need(observed_at<=known_at,'observacion posterior al conocimiento');
  need(!published_at||published_at<=known_at,'publicacion posterior al conocimiento');
  const valid_from=maybeTime(f.valid_from),valid_to=maybeTime(f.valid_to);
  need(!valid_from||!valid_to||valid_to>valid_from,'vigencia invertida');
  const value_status=f.value_status??'observed';
  need(STATUS.has(value_status),'estado de valor invalido');
  const available=value_status==='observed'||value_status==='estimated';
  const value_kind=f.value_kind??(available?'exact_decimal':'none');
  need(VALUETYPES.has(value_kind),'representacion numerica invalida');
  const value_text=available?f.value_text:null;
  if(available){
    need(typeof value_text==='string','valor disponible requiere texto numerico');
    if(value_kind==='exact_decimal')decimal(value_text);
    else {need(value_kind==='float64_approx'&&APPROX.test(value_text),
      'valor float64 aproximado no finito');need(Number.isFinite(Number(value_text)),'valor aproximado no finito')}
    need(f.missing_reason===undefined||f.missing_reason===null,'valor observado no lleva razon faltante');
  }else{
    need(f.value_text===undefined||f.value_text===null,'ausente no equivale a cero');
    need(value_kind==='none','sin valor no hay representacion');
    text(f.missing_reason,'razon de ausencia',400);
  }
  const body={
    family:family(f.family),domain:text(f.domain,'dominio',100),
    subject_id:text(f.subject_id,'sujeto',240),variable:text(f.variable,'variable',160),
    instrument_id:optional(f.instrument_id,'instrumento',240),
    market_id:optional(f.market_id,'mercado',240),
    counterparty_id:optional(f.counterparty_id,'contraparte',240),
    jurisdiction:optional(f.jurisdiction,'jurisdiccion',100),
    currency:optional(f.currency,'divisa',32),
    population_id:optional(f.population_id,'poblacion',160),
    observed_at,known_at,published_at,valid_from,valid_to,
    value_text,value_kind,value_status,
    missing_reason:available?null:f.missing_reason,
    unit:text(f.unit,'unidad',100),
    source_id:text(f.source_id,'fuente',240),
    source_url:sourceURL(f.source_url),
    source_record_id:text(f.source_record_id,'id fuente',500),
    source_revision:text(f.source_revision??'0','revision',240),
    raw_sha256:f.raw_sha256==null?null:digest(f.raw_sha256,'hash de bytes'),
    parent_event_key:f.parent_event_key==null?null:digest(f.parent_event_key,'clave I001'),
    capture_sha256:f.capture_sha256==null?null:digest(f.capture_sha256,'captura'),
    metadata:object(f.metadata??{},'metadatos')
  };
  return Object.freeze({...body,assertion_sha:recordSha(body)});
}
export function observacionI001(e){
  need(e?.schema==='laplace.input.event.i001','se requiere evento I001 validado');
  let variable,value_text,unit,domain,currency=null;
  if(e.type==='quote'){
    variable='precio';value_text=e.payload.price;unit=e.payload.currency;currency=e.payload.currency;domain='mercado';
  }else if(e.type==='macro'){
    variable=e.payload.series_id;value_text=e.payload.value;unit=e.payload.unit;domain='macroeconomia';
  }else if(e.type==='chain_block'){
    variable='altura_evento_'+e.payload.operation;value_text=String(e.payload.height);
    unit='block_height';domain='blockchain';
  }else return null;
  return normalizarObservacion({family:'I001',domain,subject_id:e.subject,variable,
    currency,unit,value_text,value_kind:'exact_decimal',value_status:'observed',
    observed_at:e.event_time??e.known_at,known_at:e.known_at,
    published_at:e.published_at,source_id:e.source_id,source_url:e.source_url,
    source_record_id:e.native_id,source_revision:e.revision,
    raw_sha256:e.raw_sha256,parent_event_key:e.event_key,
    metadata:{adapter_event_type:e.type,quality:e.quality,
      meaning:e.type==='chain_block'?'chain_operation_not_a_balance':'source_assertion'}});
}
export function observacionU003(o,capture_sha){
  need(o&&typeof o.value==='number'&&Number.isFinite(o.value),
    'U003 solamente transporta numeros float64 observados');
  const parsed=new URL(sourceURL(o.source_url));
  return normalizarObservacion({family:'U003',domain:o.domain,
    subject_id:o.id,variable:o.variable,unit:o.unit,
    observed_at:o.observed_at,known_at:o.known_at,value_text:String(o.value),
    value_status:'observed',value_kind:'float64_approx',
    source_id:'u003/'+parsed.hostname,source_url:o.source_url,
    source_record_id:o.id,source_revision:capture_sha,
    capture_sha256:capture_sha,
    metadata:{original_observation_id:o.id,original_numeric_type:'IEEE754_double',
      numeric_precision_not_certified:true}});
}
export function normalizarCapturaU003(capture){
  verificarSelloCaptura(capture);
  verifyUniverseSnapshot(capture.universal_state);
  need(capture.universal_state.states.length===capture.universal_state.known_states,
    'conteo de estados inconsistente');
  const at=time(capture.at),cutoff=time(capture.universal_state.cutoff);
  need(at>=cutoff,'captura anterior a corte');
  for(const s of capture.universal_state.states)need(
    time(s.known_at)<=cutoff&&time(s.observed_at)<=cutoff,'captura contiene dato futuro');
  return {capture_sha:digest(capture.capture_sha256,'captura sellada'),
    snapshot_sha:digest(capture.universal_state.snapshot_sha256,'snapshot'),
    capture_kind:'u003_world_observation',captured_at:at,cutoff_at:cutoff,
    state_count:capture.universal_state.known_states,
    manifest:object(capture.coverage??{},'cobertura'),
    provenance:{schema:capture.schema,local_hash_not_provider_signature:true,
      world_complete:false,source_status:Array.isArray(capture.source_status)?capture.source_status:[]}};
}
export function normalizarCoberturasU003(capture){
  const ref=normalizarCapturaU003(capture);
  const rows=(capture.source_status??[]).map((item,i)=>{
    const raw=String(item.status??'unknown');
    const availability=ACCESS.has(raw)?raw:
      raw==='not_reported'||raw==='no_data'?'unavailable':
      raw==='requires_contact'?'restricted':'unknown';
    const count=Number(item.signals??0);
    need(Number.isSafeInteger(count)&&count>=0,'cantidad por fuente invalida');
    const status=availability==='observed'&&count===0?'partial':availability;
    const body={capture_sha:ref.capture_sha,family:family(
      String(item.group??'U003').toUpperCase() in {}?'U003':'U003'),
      source_id:text(String(item.name??item.id??'source_'+i),'origen',240),
      availability:status,observed_count:count,known_at:ref.captured_at,
      reason:item.reason??item.error??null,
      scope:{group:item.group??null,domain:item.domain??null,provider_status:raw,
        source_url:item.url??null},license_ref:null};
    return {...body,coverage_sha:recordSha(body)};
  });
  return rows;
}
export function normalizarRelacion(x){
  need(x&&typeof x==='object','relacion invalida');
  const observed_at=time(x.observed_at),known_at=time(x.known_at);
  need(observed_at<=known_at,'relacion anticipada');
  need(x.from_id!==x.to_id,'no se permite autorelacion');
  const evidence_type=x.evidence_type??'hypothesis';
  need(['source_assertion','hypothesis','precedence','model_inference'].includes(evidence_type),'relacion sin tipo de prueba');
  const amount_text=x.amount_text??null;
  if(amount_text!==null)decimal(amount_text);
  need((amount_text===null)===(x.unit==null),'importe exige unidad');
  const body={from_id:text(x.from_id,'origen'),to_id:text(x.to_id,'destino'),
    relation_kind:text(x.relation_kind,'relacion',100),
    evidence_type,amount_text,unit:optional(x.unit,'unidad',100),
    population_id:optional(x.population_id,'poblacion',160),
    observed_at,known_at,
    source_id:text(x.source_id,'fuente',240),source_url:sourceURL(x.source_url),
    source_record_id:text(x.source_record_id,'registro',500),
    metadata:object(x.metadata??{},'metadatos')};
  return {...body,relation_sha:recordSha(body)};
}
export function normalizarRegla(x){
  need(x&&typeof x==='object','ley invalida');
  need(KINDS.has(x.rule_kind),'tipo de ley no reconocido');
  need(['xi_ether','classical','analytical','external'].includes(x.execution_engine),'ejecutor no reconocido');
  need(['unverified','synthetic_only','backtested','prospective'].includes(x.verification??'unverified'),'validacion desconocida');
  const discovered_at=time(x.discovered_at),recorded_at=time(x.recorded_at);
  need(discovered_at<=recorded_at,'ley conocida antes de descubrirla');
  const body={rule_kind:x.rule_kind,execution_engine:x.execution_engine,
    code_sha256:digest(x.code_sha256,'hash del programa'),discovered_at,recorded_at,
    law:object(x.law,'ley'),assumptions:object(x.assumptions??{},'supuestos'),
    evidence:object(x.evidence??{},'evidencia'),verification:x.verification??'unverified'};
  return {...body,rule_sha:recordSha(body)};
}
export function normalizarEscenario(x){
  need(SCENARIOS.has(x.scenario_kind),'tipo de escenario invalido');
  const base_cutoff=time(x.base_cutoff),created_at=time(x.created_at);
  need(created_at>=base_cutoff,'escenario creado antes de la base');
  const body={parent_id:x.parent_id??null,scenario_kind:x.scenario_kind,
    base_cutoff,created_at,assumptions:object(x.assumptions??{},'supuestos'),
    initial_state_sha:x.initial_state_sha==null?null:digest(x.initial_state_sha,'estado')};
  return {...body,scenario_id:recordSha(body)};
}
export function normalizarDelta(x){
  need(['set','unset','unknown'].includes(x.operation),'operacion dispersa invalida');
  need(['observation','derived','assumption'].includes(x.origin),'origen del delta invalido');
  need(['exact','approximate','symbolic','unknown'].includes(x.state_kind),'tipo de valor invalido');
  const observed_at=time(x.observed_at),known_at=time(x.known_at);
  need(observed_at<=known_at,'delta futuro como dato real');
  const address=x.logical_address??null;
  need(address===null||typeof address==='string'&&/^(0|[1-9]\d{0,299})$/.test(address),'direccion logica debe ser decimal arbitrariamente grande y acotado');
  const set=x.operation==='set';
  need(set?(typeof x.state_value==='string'&&x.state_kind!=='unknown'):
    x.state_value==null,'delta desconocido no admite valor');
  const body={state_key:text(x.state_key,'clave de estado',500),
    logical_address:address,rule_sha:x.rule_sha??null,scenario_id:x.scenario_id??null,
    operation:x.operation,state_value:set?x.state_value:null,
    state_unit:optional(x.state_unit,'unidad',100),state_kind:x.state_kind,
    observed_at,known_at,origin:x.origin,evidence_sha:digest(x.evidence_sha,'evidencia')};
  return {...body,delta_sha:recordSha(body)};
}
export function normalizarPronostico(x){
  const decision_at=time(x.decision_at),sealed_at=time(x.sealed_at),target_at=time(x.target_at);
  const input_cutoff=time(x.input_cutoff);
  need(input_cutoff<=decision_at&&sealed_at<=decision_at&&target_at>decision_at,
    'prediccion no pudo sellarse con datos del futuro');
  const status=x.status??'candidate',kind=x.prediction_kind;
  need(['deterministic','probabilistic','baseline','abstention'].includes(kind),'tipo pronostico invalido');
  need(['candidate','abstained'].includes(status),'estado del pronostico invalido');
  const estimate_text=x.estimate_text??null,distribution=x.distribution??null;
  if(estimate_text!==null)decimal(estimate_text);
  if(distribution!==null)object(distribution,'distribucion');
  need(status==='abstained'?(estimate_text===null&&distribution===null):
    (estimate_text!==null||distribution!==null),'pronostico debe abstenerse o tener valor');
  const body={rule_sha:digest(x.rule_sha,'regla'),scenario_id:x.scenario_id??null,
    target_subject:text(x.target_subject,'objetivo',240),
    target_variable:text(x.target_variable,'variable',160),unit:text(x.unit,'unidad',100),
    decision_at,sealed_at,target_at,input_cutoff,
    input_snapshot_sha:digest(x.input_snapshot_sha,'snapshot de entradas'),
    estimate_text,distribution,prediction_kind:kind,status,
    metadata:object(x.metadata??{},'metadatos')};
  return {...body,forecast_sha:recordSha(body)};
}
