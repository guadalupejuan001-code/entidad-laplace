/* XG01: traza completa de decisiones del test, no agregados redondeados.
 * Reproduce el experimento ORIGINAL sin cambiar selección, pesos ni predicciones.
 * Cada probabilidad se conserva en binary64 y representación hexadecimal.
 * Clasifica dirección: no estima precio ni garantiza aciertos.
 */
import {experimentOne,PLAN} from './u002-predictive-xg01.mjs';
export const RAW_XG01_SCHEMA='laplace-xg01-raw-test-trace-v1';
const need=(x,m)=>{if(!x)throw Error(m)};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function binary64Hex(n){
  if(!Number.isFinite(n))return null;
  const b=new ArrayBuffer(8),v=new DataView(b);
  v.setFloat64(0,n,false);
  return '0x'+Array.from({length:8},(_,i)=>v.getUint8(i).toString(16).padStart(2,'0')).join('');
}
function train(rows,key,strength){
  need(rows.length>0,'Muestra de entrenamiento vacía');
  const positives=rows.reduce((s,x)=>s+x.y,0),prior=(positives+1)/(rows.length+2);
  const by=new Map();
  for(const r of rows){
    if(r[key]===null)continue;
    const cell=by.get(r[key])??{n:0,up:0};
    cell.n++;cell.up+=r.y;by.set(r[key],cell);
  }
  return {prior,by,strength};
}
function predict(model,mask){
  if(mask===null)return null;
  const cell=model.by.get(mask)??{n:0,up:0};
  const p=(cell.up+model.strength*model.prior)/(cell.n+model.strength);
  need(Number.isFinite(p)&&p>=0&&p<=1,'Probabilidad inválida');
  return {p,support:cell.n,ups:cell.up,prior:model.prior};
}
const same=(a,b)=>a===null&&b===null||Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<5e-14;
export function experimentOneRaw(samples,target,{plan=PLAN}={}){
  need(Array.isArray(samples)&&samples.length<=100000,'Muestra inválida o demasiado grande');
  const original=experimentOne(samples,target,{plan});
  const folds=[];
  for(const fold of original.fold_details){
    const trainStart=fold.partitions.train[0],
      testStart=fold.partitions.test[0],testEnd=fold.partitions.test[1];
    const training=samples.slice(trainStart,testStart);
    const local=train(training,'local',plan.strength),global=train(training,'global',plan.strength);
    const weight=fold.selected_local_weight;
    need(Number.isFinite(weight)&&weight>=0&&weight<=1,'Peso fuera de rango');
    const decisions=[];
    for(let i=testStart;i<testEnd;i++){
      const r=samples[i];
      need(r&&Number.isSafeInteger(r.t)&&r.t>0&&[0,1].includes(r.y),
        'Etiqueta de test o instante inválido');
      const l=predict(local,r.local),g=predict(global,r.global);
      const p=l&&g?weight*l.p+(1-weight)*g.p:null;
      decisions.push({
        index:i,known_state_at:new Date(r.t*1000).toISOString(),
        target_close_at:new Date((r.t+300)*1000).toISOString(),
        actual_up:r.y,local_mask:r.local,global_mask:r.global,
        eligible:p!==null,excluded_reason:p===null?'missing_local_or_global_signal':null,
        local_probability:l?.p??null,global_probability:g?.p??null,
        fused_probability:p,original_baseline_prior:local.prior,
        local_prior:local.prior,global_prior:global.prior,
        local_support:l?.support??null,global_support:g?.support??null,
        local_up_count:l?.ups??null,global_up_count:g?.ups??null,
        selected_local_weight:weight,
        fused_probability_ieee754_hex:binary64Hex(p),
        local_probability_ieee754_hex:l?binary64Hex(l.p):null,
        global_probability_ieee754_hex:g?binary64Hex(g.p):null,
        brier_loss:p===null?null:(p-r.y)**2,
        predicted_up:p===null?null:Number(p>=.5),
        price_prediction:null,
        is_retrospective:true,source_vintage_authenticated:false
      });
    }
    const valid=decisions.filter(x=>x.eligible),
      loss=mean(valid.map(x=>x.brier_loss)),
      accuracy=mean(valid.map(x=>Number(x.predicted_up===x.actual_up)));
    need(valid.length===fold.fused.count&&same(loss,fold.fused.brier)&&
      same(accuracy,fold.fused.accuracy),'Traza difiere de la función XG01 original');
    folds.push({
      target,partition:fold.partitions,weight,training_rows:training.length,
      test_rows:decisions.length,eligible_rows:valid.length,
      brier:loss,accuracy,brier_binary64_hex:binary64Hex(loss),
      decisions
    });
  }
  return {
    schema:RAW_XG01_SCHEMA,target,original_result:original,folds,
    test_decisions:folds.reduce((n,f)=>n+f.test_rows,0),
    evaluated_decisions:folds.reduce((n,f)=>n+f.eligible_rows,0),
    raw_ieee754_before_display_rounding:true,
    original_model_unchanged:true,
    signal: 'dirección histórica 5 minutos, sin magnitud de precio',
    no_authenticated_prospective_predictions:true,
    financial_advantage_proven:false,automatic_trading:false
  };
}
