/* EF003 - leyes financieras deterministas, exactas y condicionadas.
 * No es un predictor omnisciente, ni un modelo aprendido del mercado.
 * Las operaciones futuras existen SOLO dentro de un escenario explícito.
 * Unidad/divisa/población incompatibles no se suman.
 */
import {need,decimal,sha,stable,identifier} from '../input/contrato.mjs';
import {utcTime} from '../universo/estados.mjs';

export const EF003_VERSION='laplace-ef003-conditional-state-laws-v1';
const pow10=n=>10n**BigInt(n);
const LIMIT_DIGITS=300;
function dec(s){
  decimal(s);need(s.length<=LIMIT_DIGITS,'numero fuera de presupuesto');
  const neg=s.startsWith('-'),parts=s.replace(/^-/,'').split('.');
  return {n:(neg?-1n:1n)*BigInt(parts.join('')),
    scale:(parts[1]??'').length};
}
function str(n,scale){
  need(Number.isInteger(scale)&&scale>=0&&scale<=1024,'escala no admitida');
  let x=n<0n?-n:n,t=x.toString().padStart(scale+1,'0');
  let s=scale?t.slice(0,-scale)+'.'+t.slice(-scale):t;
  s=s.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
  if(s==='')s='0';
  return n<0n&&x!==0n?'-'+s:s;
}
function align(a,b){
  const scale=Math.max(a.scale,b.scale);
  return {x:a.n*pow10(scale-a.scale),y:b.n*pow10(scale-b.scale),scale};
}
export function sumarDecimales(a,b){
  const {x,y,scale}=align(dec(a),dec(b));return str(x+y,scale);
}
export function restarDecimales(a,b){
  const {x,y,scale}=align(dec(a),dec(b));return str(x-y,scale);
}
export function multiplicarDecimales(a,b){
  const x=dec(a),y=dec(b);
  need(x.scale+y.scale<=40,'precision multiplicada excedida');
  return str(x.n*y.n,x.scale+y.scale);
}
export function dividirDecimales(a,b,{decimales=16}={}){
  const x=dec(a),y=dec(b);
  need(y.n!==0n,'division por cero');
  need(Number.isInteger(decimales)&&decimales>=0&&decimales<=24,'precision invalida');
  const num=x.n*pow10(decimales+y.scale),den=y.n*pow10(x.scale);
  const negative=(num<0n)!==(den<0n),positive=(num<0n?-num:num)/(den<0n?-den:den);
  const rem=(num<0n?-num:num)%(den<0n?-den:den);
  const rounded=positive+(rem*2n>=(den<0n?-den:den)?1n:0n);
  return str(negative?-rounded:rounded,decimales);
}
export function sumaExacta(values){
  need(Array.isArray(values)&&values.length<=10000,'presupuesto de sumas excedido');
  return values.reduce((acc,v)=>sumarDecimales(acc,v),'0');
}
function moment(value,label){try{return utcTime(value)}catch{throw Error(label+' invalido')}}
function canonical(x){return sha(stable(x))}
function knownAt(x,cut){need(moment(x.known_at,'known_at')<=cut,
  'señal no conocida antes del escenario');}
const same=(x,y)=>String(x??'')===String(y??'');
function matchUnit(a,b){
  return ['unit','currency','population_id'].every(k=>same(a[k],b[k]));
}
function baseBalance(raw,cut){
  need(raw&&typeof raw==='object','balance original requerido');
  need(raw.value_status==='observed'&&raw.value_kind==='exact_decimal'&&
    typeof raw.value_text==='string','base exige valor real decimal, no ausente');
  dec(raw.value_text);
  knownAt(raw,cut);
  need(moment(raw.observed_at,'observed_at')<=cut,'saldo futuro como dato base');
  need(typeof raw.subject_id==='string'&&raw.subject_id.length,'sujeto sin identidad');
  return {subject_id:raw.subject_id,value_text:raw.value_text,
    unit:raw.unit,currency:raw.currency??null,
    population_id:raw.population_id??null,source_id:raw.source_id,
    known_at:raw.known_at,observed_at:raw.observed_at,
    assertion_sha:raw.assertion_sha??null};
}
export function aplicarLeyContable({base,flows,cutoff,target_at,scenario_id,
  complete_flow_scope=false,allow_negative_balance=false}={}){
  const cut=moment(cutoff,'corte'),target=moment(target_at,'objetivo');
  need(target>cut,'la evolucion debe avanzar en tiempo');
  need(typeof scenario_id==='string'&&/^[a-f0-9]{64}$/.test(scenario_id),
    'evolucion futura requiere escenario aislado por SHA');
  need(Array.isArray(flows)&&flows.length<=4096,'flujo contable fuera de presupuesto');
  const source=baseBalance(base,cut);
  if(!complete_flow_scope)return {schema:EF003_VERSION,status:'abstained',
    reason:'flujo_incompleto_no_equivale_a_cero',
    scenario_id,cutoff:cut,target_at:target,source,
    prediction_certified:false,automatic_trading:false};
  let amount=source.value_text;
  const trace=[];
  for(const f of flows){
    need(f&&['inflow','outflow'].includes(f.direction),'direccion de flujo invalida');
    need(f.origin==='assumption','flujos futuros no son hechos observados');
    need(typeof f.amount_text==='string','monto requerido');
    const number=dec(f.amount_text);
    need(number.n>=0n,'valor negativo de flujo: explicitar direccion');
    need(matchUnit(f,source),'moneda, poblacion o unidad incompatible');
    const effective=moment(f.effective_at,'fecha de flujo');
    need(effective>cut&&effective<=target,'flujo fuera del horizonte');
    if(f.declared_at)need(moment(f.declared_at,'declaracion')<=cut,
      'escenario introdujo informacion posterior a decision');
    amount=f.direction==='inflow'?
      sumarDecimales(amount,f.amount_text):restarDecimales(amount,f.amount_text);
    trace.push({id:String(f.id??trace.length),direction:f.direction,
      effective_at:effective,amount_text:f.amount_text,after:amount,
      source_kind:'counterfactual_assumption'});
  }
  if(!allow_negative_balance&&dec(amount).n<0n)return {
    schema:EF003_VERSION,status:'abstained',reason:'saldo_negativo_no_permitido',
    scenario_id,cutoff:cut,target_at:target,source,
    prediction_certified:false,automatic_trading:false};
  const body={schema:EF003_VERSION,law:'conservacion_contable_condicionada',
    cutoff:cut,target_at:target,scenario_id,source,result:{
      subject_id:source.subject_id,value_text:amount,unit:source.unit,
      currency:source.currency,population_id:source.population_id
    },trace,all_flow_inputs_are_assumptions:true,
    closed_scope_asserted_by_caller:true,forecast_of_real_market:false,
    calibrated:false,automatic_trading:false};
  return {...body,status:'conditional_model_result',result_sha256:canonical(body)};
}
export function aplicarLeyInteresSimple({base,rate,periods,cutoff,target_at,scenario_id}={}){
  const cut=moment(cutoff,'corte'),target=moment(target_at,'objetivo');
  need(target>cut,'interes requiere horizonte futuro');
  need(typeof scenario_id==='string'&&/^[a-f0-9]{64}$/.test(scenario_id),
    'interes requiere escenario');
  const original=baseBalance(base,cut);
  need(typeof rate==='string','tasa debe ser decimal');
  dec(rate);
  need(Number.isInteger(periods)&&periods>=0&&periods<=3650,'periodos invalidos');
  // Tasa por periodo declarada explícitamente; NO deducir calendario,
  // composicion, impago, curva futura o coste de capital.
  const ratio=multiplicarDecimales(rate,String(periods));
  const interest=multiplicarDecimales(original.value_text,ratio);
  const result=sumarDecimales(original.value_text,interest);
  const body={schema:EF003_VERSION,status:'conditional_model_result',
    law:'interes_simple_hipotetico',scenario_id,cutoff:cut,target_at:target,
    principal:original,periods,rate_per_period:rate,
    interest_text:interest,result_text:result,unit:original.unit,
    currency:original.currency,population_id:original.population_id,
    assumes_fixed_rate_and_no_defaults:true,
    real_rate_path_observed:false,forecast_of_real_market:false,
    calibrated:false,automatic_trading:false};
  return {...body,result_sha256:canonical(body)};
}
export function propagarTransferencias({balances,transfers,cutoff,target_at,
  scenario_id,allow_overdraft=false}={}){
  const cut=moment(cutoff,'corte'),target=moment(target_at,'objetivo');
  need(target>cut,'horizonte invalido');
  need(typeof scenario_id==='string'&&/^[a-f0-9]{64}$/.test(scenario_id),
    'red de flujos requiere escenario');
  need(Array.isArray(balances)&&balances.length>=2&&balances.length<=4096,
    'numero de nodos fuera de presupuesto');
  need(Array.isArray(transfers)&&transfers.length<=4096,'enlaces fuera de presupuesto');
  const nodes=new Map();
  for(const row of balances){
    const v=baseBalance(row,cut);
    need(!nodes.has(v.subject_id),'balance duplicado de entidad');
    if(nodes.size){
      const reference=nodes.values().next().value;
      need(matchUnit(v,reference),'red de divisas/unidades/poblaciones incompatibles');
    }
    nodes.set(v.subject_id,v);
  }
  const values=new Map([...nodes].map(([id,v])=>[id,v.value_text]));
  const sumBefore=sumaExacta([...values.values()]);
  const trace=[];
  for(const t of transfers){
    need(t&&t.origin==='assumption','transferencia futura sin escenario declarada');
    need(t.from!==t.to&&values.has(t.from)&&values.has(t.to),
      'transferencia entre entidades conocidas distintas');
    const at=moment(t.effective_at,'fecha transferencia');
    need(at>cut&&at<=target,'transferencia fuera del horizonte');
    if(t.declared_at)need(moment(t.declared_at,'declaracion')<=cut,
      'transferencia declarada despues de la decision');
    need(matchUnit(t,nodes.get(t.from)),'monto de transferencia incompatible');
    const amount=dec(t.amount_text);
    need(amount.n>=0n,'cantidad transferida negativa');
    const next=restarDecimales(values.get(t.from),t.amount_text);
    if(!allow_overdraft&&dec(next).n<0n)return {
      schema:EF003_VERSION,status:'abstained',reason:'transferencia_sin_saldo',
      scenario_id,cutoff:cut,target_at:target,
      financial_truth_not_asserted:true,automatic_trading:false};
    values.set(t.from,next);
    values.set(t.to,sumarDecimales(values.get(t.to),t.amount_text));
    trace.push({from:t.from,to:t.to,effective_at:at,amount_text:t.amount_text,
      origin:'counterfactual_assumption'});
  }
  const sumAfter=sumaExacta([...values.values()]);
  need(sumBefore===sumAfter,'transferencias violan conservacion contable');
  const body={schema:EF003_VERSION,status:'conditional_model_result',
    law:'transferencias_bilaterales_conservacion',scenario_id,
    cutoff:cut,target_at:target,
    balances:[...values].sort(([a],[b])=>a.localeCompare(b))
      .map(([subject_id,value_text])=>({
        subject_id,value_text,unit:nodes.get(subject_id).unit,
        currency:nodes.get(subject_id).currency,
        population_id:nodes.get(subject_id).population_id})),
    sum_before:sumBefore,sum_after:sumAfter,trace,
    conservation_within_declared_closed_scope:true,
    external_flows_not_measured:true,
    real_world_causality_not_demonstrated:true,
    automatic_trading:false};
  return {...body,result_sha256:canonical(body)};
}
