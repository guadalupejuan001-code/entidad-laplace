/* Descriptive activity diagnostics. They never change a forecast or infer a
 * validated crash probability. Only information available at issue is read. */
(function(root){
'use strict';
const finite=Number.isFinite,need=(ok,message)=>{if(!ok)throw Error(message);};
const schema='laplace-forecast-risk-v1',windowBars=31;
// Fixed descriptive rules: doubling activity is a change to inspect, not a
// fitted financial predictor. Subsequent independent forecasts must score it.
const rules=Object.freeze({volumeRatio:2,volatilityRatio:2});
const ratio=(a,b)=>finite(a)&&finite(b)&&b>0&&finite(a/b)?a/b:null;
const same=(a,b)=>a===b||(a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&
 Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&
 Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
function closedWindow(rows,f){
 need(Array.isArray(rows),'Riesgo: historial inválido.');
 const cutoff=Math.min(f.sourceCloseAt,f.issuedAt),closed=[];
 for(const input of rows){
  const r=Array.isArray(input)?input:[input.time,input.low,input.high,input.open,input.close,input.volume];
  // Future/open bars cannot influence any value, including validation of the
  // past. Bad timestamps cannot be assigned to either side of the cutoff.
  need(finite(r[0]),'Riesgo: fecha de vela inválida.');
  if(r[0]+f.granularity>cutoff)continue;
  need(r.length===6&&r.every(finite)&&Number.isSafeInteger(r[0])&&r[0]>0&&
   r[0]%f.granularity===0&&r[1]>0&&r[2]>=r[1]&&r[3]>=r[1]&&r[3]<=r[2]&&
   r[4]>=r[1]&&r[4]<=r[2]&&r[5]>=0,'Riesgo: vela inválida.');
  closed.push(r.slice());
 }
 closed.sort((a,b)=>a[0]-b[0]);
 for(let i=1;i<closed.length;i++)need(closed[i][0]>closed[i-1][0],'Riesgo: velas duplicadas.');
 const out=closed.slice(-windowBars);
 if(out.length)need(out.at(-1)[0]+f.granularity===f.sourceCloseAt&&out.at(-1)[4]===f.reference,
  'Riesgo: el historial no corresponde al cierre pronosticado.');
 return out;
}
function recentActivity(rows,f){
 if(rows.length<windowBars)return null;
 // A gap, including a closed equity session, is not a regular-time sample.
 if(rows.some((r,i)=>i>0&&r[0]-rows[i-1][0]!==f.granularity))return null;
 const returns=rows.slice(1).map((r,i)=>Math.log(r[4]/rows[i][4]));
 const rms=xs=>Math.sqrt(xs.reduce((s,x)=>s+x*x,0)/xs.length);
 const pastRMS=rms(returns.slice(0,24)),recentRMS=rms(returns.slice(24));
 const pastVolume=rows.slice(1,25).reduce((s,r)=>s+r[5],0)/24;
 const recentVolume=rows.slice(25).reduce((s,r)=>s+r[5],0)/6;
 return {windowStartAt:rows[0][0],closedThrough:f.sourceCloseAt,
  return1BarPct:100*(rows[30][4]/rows[29][4]-1),
  return6BarsPct:100*(rows[30][4]/rows[24][4]-1),
  return24BarsPct:100*(rows[30][4]/rows[6][4]-1),
  recentRMSPct:100*recentRMS,pastRMSPct:100*pastRMS,
  volatilityRatio:ratio(recentRMS,pastRMS),volumeRatio:ratio(recentVolume,pastVolume)};
}
function assess(f,{records=[],rows=[],mode='issued'}={}){
 need(f&&finite(f.issuedAt)&&finite(f.sourceCloseAt)&&f.sourceCloseAt<=f.issuedAt&&
  finite(f.reference)&&f.reference>0&&finite(f.probabilityUp)&&f.probabilityUp>0&&f.probabilityUp<1&&
  finite(f.granularity)&&f.granularity>0&&Array.isArray(f.outputs)&&f.outputs.length===3&&
  f.outputs.every(o=>finite(o.baseline)&&o.baseline>=0)&&['issued','retrospective'].includes(mode),
  'Riesgo: pronóstico inválido.');
 const previous=records.filter(r=>r.asset===f.asset&&r.minutes===f.minutes&&r.granularity===f.granularity&&
  (r.algorithmVersion??1)===(f.algorithmVersion??1)&&finite(r.issuedAt)&&r.sourceCloseAt<=r.issuedAt&&
  r.issuedAt<f.issuedAt&&r.sourceCloseAt<f.sourceCloseAt&&
  finite(r.outputs?.[1]?.baseline)&&r.outputs[1].baseline>=0&&
  finite(r.outputs?.[2]?.baseline)&&r.outputs[2].baseline>=0)
  .sort((a,b)=>b.sourceCloseAt-a.sourceCloseAt||a.issuedAt-b.issuedAt)[0];
 const comparison=previous?{sourceCloseAt:previous.sourceCloseAt,issuedAt:previous.issuedAt,
  elapsedSeconds:f.sourceCloseAt-previous.sourceCloseAt,
  referenceVolatilityPct:previous.outputs[1].baseline,referenceVolume:previous.outputs[2].baseline,
  volatilityRatio:ratio(f.outputs[1].baseline,previous.outputs[1].baseline),
  volumeRatio:ratio(f.outputs[2].baseline,previous.outputs[2].baseline)}:null;
 const inputWindow=closedWindow(rows,f),recent=recentActivity(inputWindow,f),alerts=[];
 if(comparison?.volumeRatio>=rules.volumeRatio)alerts.push('reference_volume_doubled');
 if(comparison?.volatilityRatio>=rules.volatilityRatio)alerts.push('reference_volatility_doubled');
 if(recent?.volumeRatio>=rules.volumeRatio)alerts.push('recent_volume_doubled');
 if(recent?.volatilityRatio>=rules.volatilityRatio)alerts.push('recent_volatility_doubled');
 return {schema,policyVersion:1,mode,asOf:f.issuedAt,sourceCloseAt:f.sourceCloseAt,
  status:alerts.length?'activity_shift':comparison||recent?'no_rule_triggered':'insufficient_input_history',
  rules:{...rules},alerts,comparison,recent,inputWindow,
  inputProgramSHA256:f.programSHA256??null,
  referenceVolatilityPct:f.outputs[1].baseline,referenceVolume:f.outputs[2].baseline,
  directionalEdge:Math.abs(2*f.probabilityUp-1),
  contextContributing:f.jointContext?.central_price_modified===true,
  tailProbability:null,predictiveValidation:'not_established'};
}
function validate(d,f){
 need(d?.schema===schema&&d.policyVersion===1&&['issued','retrospective'].includes(d.mode)&&
  d.asOf===f.issuedAt&&d.sourceCloseAt===f.sourceCloseAt&&d.tailProbability===null&&
  d.predictiveValidation==='not_established'&&Array.isArray(d.inputWindow)&&d.inputWindow.length<=windowBars,
  'Riesgo: diagnóstico inválido.');
 const c=d.comparison,records=c?[{asset:f.asset,minutes:f.minutes,granularity:f.granularity,
  algorithmVersion:f.algorithmVersion,sourceCloseAt:c.sourceCloseAt,issuedAt:c.issuedAt,
  outputs:[{}, {baseline:c.referenceVolatilityPct},{baseline:c.referenceVolume}]}]:[];
 const expected=assess(f,{records,rows:d.inputWindow,mode:d.mode});
 // Recompute every saved indicator and alert; object key order is irrelevant.
 need(same(expected,d),'Riesgo: señales o fechas contradictorias.');
 return d;
}
function audit(f){
 if(f.status!=='verified'||!finite(f.measurement?.[0]?.actual))return {status:'pending'};
 const actual=f.measurement[0].actual,predicted=f.outputs[0].predicted,reference=f.reference;
 const diagnostic=f.riskDiagnostics?validate(f.riskDiagnostics,f):null;
 return {status:'evaluated',asset:f.asset,minutes:f.minutes,sourceCloseAt:f.sourceCloseAt,
  targetCloseAt:f.targetCloseAt,reference,predicted,actual,
  expectedMove:predicted-reference,observedMove:actual-reference,absoluteError:Math.abs(predicted-actual),
  baselineError:Math.abs(reference-actual),
  directionCorrect:Math.sign(predicted-reference)===Math.sign(actual-reference),
  insidePriceInterval:actual>=f.outputs[0].lower&&actual<=f.outputs[0].upper,
  recordedActivityAlert:diagnostic?.mode==='issued'?diagnostic.alerts.length>0:null};
}
function describe(d){
 if(!d)return 'Este registro no guardó señales de actividad al emitirse.';
 const prefix=d.mode==='retrospective'?'Reconstrucción posterior: ':'';
 const text=d.status==='activity_shift'?'Cambio de actividad: revisa el riesgo de movimientos amplios.':
  d.status==='insufficient_input_history'?'Faltan datos anteriores para evaluar cambios de actividad.':
  'Las reglas de actividad no activaron una alerta; pueden ocurrir movimientos fuera del intervalo.';
 return prefix+text+' La probabilidad de una caída fuerte todavía no está validada.';
}
root.LaplaceForecastRisk={assess,validate,audit,describe};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LaplaceForecastRisk;
})(typeof window!=='undefined'?window:globalThis);
