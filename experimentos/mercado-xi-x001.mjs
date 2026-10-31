/* X001 — prueba justa del núcleo XI/Ether sobre mercado intradía.
 * Objetivo único: dirección del SIGUIENTE intervalo de 5 minutos.
 * - Estado compacto 4 bits, construido solo con datos ya cerrados.
 * - Ajuste de conteos/emisiones y memoria en laplace_temporal nativo.
 * - M001 recibe exactamente el mismo corte histórico y objetivo de 5 minutos.
 * - Selección de alpha en validación; test permanece sellado.
 * No produce órdenes ni reemplaza producción.
 */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validarVelas,emitirPronosticos} from '../seguimiento/modelo.mjs';

export const X001_SCHEMA='laplace-xi-market-headtohead-x001-v1';
export const ALPHAS=Object.freeze([0,1,4,16]);
export const PLAN=Object.freeze({train:192,validation:32,test:32,folds:8,prior_strength:8});
const BASE=1000000,need=(ok,msg)=>{if(!ok)throw Error(msg)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const brier=rows=>rows.length?avg(rows.map(x=>(x.p-x.y)**2)):null;
const accuracy=rows=>rows.length?avg(rows.map(x=>Number((x.p>=.5)===Boolean(x.y)))):null;
const loglossState=rows=>rows.length?avg(rows.map(x=>-Math.log(Math.max(1e-12,x.p)))):null;

export function stateAt(bars,i){
  if(i<6)return null;
  for(let j=i-5;j<=i;j++)if(j>0&&bars[j][0]!==bars[j-1][0]+300)return null;
  const r5=Math.log(bars[i][4]/bars[i-1][4]);
  const r15=Math.log(bars[i][4]/bars[i-3][4]);
  const recent=[];for(let j=i-5;j<=i;j++)recent.push(Math.log(bars[j][4]/bars[j-1][4]));
  const rms=Math.sqrt(avg(recent.map(x=>x*x)));
  const vol=avg(bars.slice(i-5,i+1).map(x=>x[5]));
  return (r5>=0?1:0)|(r15>=0?2:0)|(Math.abs(r5)>rms?4:0)|(bars[i][5]>vol?8:0);
}
export function rowsFromBars(bars,start,end){
  const out=[];
  for(let i=start;i<end;i++){
    const mask=stateAt(bars,i);if(mask===null||i+1>=bars.length)continue;
    if(bars[i+1][0]!==bars[i][0]+300)continue;
    out.push({index:i,mask,y:Number(bars[i+1][4]>bars[i][4]),link:false});
  }
  for(let i=0;i<out.length-1;i++)out[i].link=out[i+1].index===out[i].index+1;
  return out;
}
export function nativeProgram(rows,queries,alpha,priorStrength=PLAN.prior_strength){
  need(Array.isArray(rows)&&rows.length>=1&&rows.length<=256,'Filas nativas fuera de presupuesto');
  need(Number.isInteger(alpha)&&alpha>=0&&alpha<=64&&Number.isInteger(priorStrength)&&priorStrength>=1&&priorStrength<=64,'Regularización nativa inválida');
  need(Array.isArray(queries)&&queries.length<=2048&&queries.every(q=>Number.isInteger(q.mask)&&q.mask>=0&&q.mask<16&&Number.isInteger(q.steps)&&q.steps>=0&&q.steps<=10000),'Consultas nativas fuera de presupuesto');
  const bytes=Buffer.alloc(rows.length*4);
  for(let i=0;i<rows.length;i++){
    const r=rows[i];need(Number.isInteger(r.mask)&&r.mask>=0&&r.mask<16,'Estado fuera de 4 bits');
    need(r.y===0||r.y===1,'Etiqueta nativa inválida');
    need(typeof r.link==='boolean'&&(!r.link||i+1<rows.length),'Enlace nativo inválido');
    bytes.writeUInt16LE(r.mask,i*4);bytes[i*4+2]=r.y;bytes[i*4+3]=r.link?1:0;
  }
  const lines=['mem_reset 0'];
  for(let i=0;i<bytes.length;i++)if(bytes[i])lines.push('mem_store '+(BASE+i)+' '+bytes[i]);
  lines.push('laplace_fit '+BASE+' '+rows.length+' '+alpha+' '+priorStrength,'laplace_report');
  for(const q of queries)lines.push('laplace_evolve '+q.mask+' '+q.steps);
  lines.push('mem_stats','stats');
  return lines.join('\n')+'\n';
}
export function nativeRun(binary,rows,queries,alpha,priorStrength=PLAN.prior_strength){
  need(typeof binary==='string'&&binary.length,'Ejecutor temporal requerido');
  const xi=nativeProgram(rows,queries,alpha,priorStrength);
  const run=spawnSync(resolve(binary),['-'],{input:xi,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
  if(run.error)throw run.error;
  need(run.status===0,'Fallo XI/Ether: '+String(run.stderr||run.stdout).slice(0,500));
  const output=run.stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  const learned=output.find(x=>x.type==='temporal_model');
  const forecasts=output.filter(x=>x.type==='temporal_evolution');
  const memory=output.find(x=>x.type==='memory_stats'),core=output.find(x=>x.type==='stats');
  need(learned?.backend==='original-inverse-ether-memory'&&memory?.model==='inverse-ether-memory',
    'El modelo no quedó en Inverse Ether Memory');
  need(core?.active_qubits===0,'Este experimento debe ser nativo clásico, no fingir qubits');
  need(forecasts.length===queries.length,'Respuestas nativas incompletas');
  return {learned,forecasts,memory,core,xi_sha256:sha(xi)};
}
function scoreNative(binary,train,evalRows,alpha){
  const queries=evalRows.flatMap(r=>[{mask:r.mask,steps:0},{mask:r.mask,steps:1}]);
  const run=nativeRun(binary,train,queries,alpha),direction=[],transition=[];
  for(let i=0;i<evalRows.length;i++){
    const emission=run.forecasts[i*2],evolved=run.forecasts[i*2+1];
    const p=emission.trace?.[0]?.probability;
    if(Number.isFinite(p))direction.push({p,y:evalRows[i].y});
    const next=evalRows[i+1];
    if(next&&evalRows[i].link&&evolved.trace?.[1]){
      const idx=run.learned.state_masks.indexOf(next.mask);
      if(idx>=0)transition.push({p:evolved.trace[1].distribution[idx]});
    }
  }
  return {direction,brier:brier(direction),accuracy:accuracy(direction),
    transition_log_loss:loglossState(transition),transition_count:transition.length,run};
}
function m001At(bars,row){
  const i=row.index,closeAt=new Date((bars[i][0]+300)*1000).toISOString();
  const quote={asset:'BTC-USD',value:String(bars[i][4]),observed_at:closeAt,known_at:closeAt};
  const history=bars.slice(0,i+1);
  const [p]=emitirPronosticos(history,quote,{emitidoEn:closeAt,horizontes:[5],revision:'x001-backtest'});
  if(p.precio_predicho===null)return null;
  return {predicted:Number(p.precio_predicho>p.precio_inicial),actual:row.y,
    predicted_price:p.precio_predicho,initial:p.precio_inicial};
}
export function experiment(binary,raw,{cutoff,folds=PLAN.folds,compareM001=true,asset='BTC-USD'}={}){
  const bars=validarVelas(raw,{corte:cutoff,maximo:10000});
  const needed=PLAN.train+PLAN.validation+PLAN.test*folds+7;
  need(bars.length>=needed,'Historia insuficiente para X001');
  const end=bars.length-1,start=end-(PLAN.train+PLAN.validation+PLAN.test*folds);
  const foldResults=[];
  for(let f=0;f<folds;f++){
    const testStart=start+PLAN.train+PLAN.validation+f*PLAN.test;
    const trainStart=testStart-PLAN.train-PLAN.validation;
    const valStart=testStart-PLAN.validation;
    const train=rowsFromBars(bars,trainStart,valStart);
    const validation=rowsFromBars(bars,valStart,testStart);
    const candidates=ALPHAS.map(alpha=>({alpha,...scoreNative(binary,train,validation,alpha)}))
      .sort((a,b)=>(a.transition_log_loss??Infinity)-(b.transition_log_loss??Infinity)||a.alpha-b.alpha);
    const selected=candidates[0];
    const fitRows=rowsFromBars(bars,trainStart,testStart);
    const testRows=rowsFromBars(bars,testStart,testStart+PLAN.test);
    const native=scoreNative(binary,fitRows,testRows,selected.alpha);
    const prior=(fitRows.reduce((s,r)=>s+r.y,0)+1)/(fitRows.length+2);
    const baseline=testRows.map(r=>({p:prior,y:r.y}));
    const m001=compareM001?testRows.map(r=>m001At(bars,r)).filter(Boolean):[];
    foldResults.push({fold:f+1,selected_alpha:selected.alpha,
      partitions:{train:[trainStart,valStart],validation:[valStart,testStart],test:[testStart,testStart+PLAN.test]},
      native:{count:native.direction.length,brier:native.brier,accuracy:native.accuracy,
        transition_log_loss:native.transition_log_loss,transition_count:native.transition_count,
        xi_sha256:native.run.xi_sha256,backend:native.run.learned.backend,
        states:native.run.learned.state_masks},
      baseline:{count:baseline.length,brier:brier(baseline),accuracy:accuracy(baseline),prior},
      m001:{count:m001.length,accuracy:m001.length?avg(m001.map(x=>Number(x.predicted===x.actual))):null},
      validation:candidates.map(x=>({alpha:x.alpha,brier:x.brier,accuracy:x.accuracy,
        transition_log_loss:x.transition_log_loss,transition_count:x.transition_count}))
    });
  }
  const weighted=(key,sub,countKey='count')=>{
    const vals=foldResults.map(f=>({n:f[sub][countKey],v:f[sub][key]})).filter(x=>x.n&&Number.isFinite(x.v));
    const n=vals.reduce((s,x)=>s+x.n,0);return {count:n,value:n?vals.reduce((s,x)=>s+x.n*x.v,0)/n:null};
  };
  const nb=weighted('brier','native'),bb=weighted('brier','baseline');
  const na=weighted('accuracy','native'),ba=weighted('accuracy','baseline'),ma=weighted('accuracy','m001');
  return {schema:X001_SCHEMA,generated_at:new Date().toISOString(),cutoff,folds:foldResults.length,
    asset,target:'direccion_del_siguiente_intervalo_cerrado_de_5_minutos',
    state_bits:['retorno_5m_no_negativo','retorno_15m_no_negativo','movimiento_5m_mayor_que_rms_30m','volumen_mayor_que_media_30m'],
    native:{direction_count:nb.count,brier:nb.value,accuracy:na.value},
    baseline:{direction_count:bb.count,brier:bb.value,accuracy:ba.value},
    m001:{enabled:compareM001,direction_count:ma.count,accuracy:ma.value},
    native_brier_skill:bb.value?1-nb.value/bb.value:null,
    native_accuracy_minus_m001:compareM001&&Number.isFinite(na.value)&&Number.isFinite(ma.value)?na.value-ma.value:null,
    native_accuracy_minus_baseline:Number.isFinite(na.value)&&Number.isFinite(ba.value)?na.value-ba.value:null,
    fold_results:foldResults,
    direction_regularization_tuned:false,
    alpha_selection_metric:'transition_log_loss',
    alpha_selection_note:'alpha se selecciona por pérdida de transición; no modifica la emisión direccional de paso cero. X002 selecciona prior_strength.',
    production_changed:false,orders_executed:0,
    interpretation:'Prueba de dirección a 5 minutos para '+asset+'. El núcleo nativo aprende/emite en Inverse Ether Memory; no es todavía un predictor de precio absoluto.'
  };
}
