(function(){
'use strict';
const T=window.LaplaceQuantumTracking,D=window.LaplaceCampaignData??window.LaplaceActivityData,$=id=>document.getElementById(id);
const KEY='laplace-lqt-records-v1',requests=new Map(),fmt=(n,d=4)=>Number.isFinite(n)?
 new Intl.NumberFormat('es-MX',{maximumFractionDigits:d}).format(n):'—',when=n=>new Date(n*1000).toLocaleString('es-MX');
let records=[],busy=false,syncing=false,importing=false,exporting=false,epoch=0,limit=20,last=null,lastSyncAt=0;
try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(data)){
 for(const f of data)T.validate(f);records=data;
}}catch(error){$('lqtHistoryStatus').textContent='No se pudo leer el registro LQT: '+error.message;}
const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const unit=s=>s.market==='crypto'?s.asset.split('-')[0]:'unidades';
function selection(){const s=D.selection();$('lqtSelection').textContent=s.asset+' · '+s.minutes+' min · velas de '+s.granularity/60+
 ' min'+(s.market==='equity'?' de negociación':'')+'.';return s;}
function commit(next){localStorage.setItem(KEY,JSON.stringify(next));records=next;renderHistory();}
function request(action,payload){
 if(!window.LaplaceQuantumBridge?.request)return Promise.reject(Error('LQT se ejecuta en el núcleo nativo de la APK Android.'));
 const id='lqt-'+crypto.randomUUID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{requests.delete(id);reject(Error('El núcleo no respondió a tiempo; el aprendizaje confirmado queda guardado.'));},120000);
  requests.set(id,{resolve,reject,timer});
  try{window.LaplaceQuantumBridge.request(id,action,JSON.stringify(payload));}
  catch(error){clearTimeout(timer);requests.delete(id);reject(error);}
 });
}
function availability(){
 const occupied=busy||syncing||importing||exporting;
 $('lqtRun').disabled=occupied||!window.LaplaceQuantumBridge?.request;
 $('lqtSync').disabled=occupied;
 $('lqtExport').disabled=occupied||!window.LaplaceQuantumBridge?.request;
 $('lqtImport').disabled=occupied||!window.LaplaceQuantumBridge?.request;
}
function reset(){epoch++;last=null;for(const id of ['lqtPrice','lqtVolatility','lqtVolume','lqtDirection'])$(id).textContent='—';
 $('lqtPeriod').textContent='';$('lqtValidation').replaceChildren();$('lqtRaw').textContent='Sin cálculo para esta selección.';
 $('lqtStatus').textContent=window.LaplaceQuantumBridge?.request?
  'Pulsa Predecir. El aprendizaje se conserva por activo y plazo.':'Instala la APK para ejecutar LQT en XI/Ether.';
 selection();renderHistory();availability();}
function render(f){
 last=f;const units=[' USD',' puntos porcentuales',' '+unit(f)];
 $('lqtPrice').textContent='USD '+fmt(f.outputs[0].predicted,2);
 $('lqtVolatility').textContent=fmt(f.outputs[1].predicted,3)+' %';
 $('lqtVolume').textContent=fmt(f.outputs[2].predicted,6)+' '+unit(f);
 const delta=f.outputs[0].predicted-f.reference;
 $('lqtDirection').textContent=delta>0?'Subida':delta<0?'Bajada':'Sin cambio';
 $('lqtProbability').textContent='Probabilidad estimada de subida: '+fmt(f.probabilityUp*100,1)+' %.';
 $('lqtPeriod').textContent='Referencia: USD '+fmt(f.reference,2)+' al cierre de '+when(f.sourceCloseAt)+'. '+
  (f.market==='equity'?'Objetivo: próximas '+f.horizonBars+' velas de negociación.':'Objetivo: '+when(f.targetCloseAt)+'.');
 const out=$('lqtValidation');out.replaceChildren();
 const reliability=f.confidence??window.LaplaceIntegral?.medirConfianzaInterna(records,f,{asOf:f.issuedAt});
 if(reliability){
  out.append(node('p','Confianza interna: '+reliability.similar_cases+' resultados posteriores comparables ('+
   reliability.nonoverlapping_cases+' períodos sin solapamiento en total). '+
   (reliability.status==='insufficient_similar_prospective_outcomes'?
    'Todavía no hay evidencia suficiente para calibrar esta probabilidad.':
    'En ese grupo, la subida ocurrió en '+fmt(reliability.observed_up_rate*100,1)+' % de los períodos.'),'helper'));
  if(reliability.brier!==null)out.append(node('p','Error de probabilidad Brier: '+fmt(reliability.brier,4)+
   '. Se usan emisiones locales comprobadas; el examen histórico no se cuenta como resultados nuevos.','fineprint'));
 }
 const joint=f.jointContext;
 if(joint){
  const why={independent_world_history_unavailable:'Falta historia mundial independiente.',
   insufficient_purged_independent_outcomes:'Faltan suficientes objetivos comprobados del mismo plazo.',
   latest_world_capture_not_fresh_at_issue:'La captura mundial necesita actualizarse.',
   asset_has_no_verified_c03_target_adapter:'Falta conectar objetivos mundiales verificables de este activo.',
   world_worker_busy:'El cálculo mundial estaba ocupado.',world_context_unavailable:'El cálculo mundial no estuvo disponible.'};
  out.append(node('p','Contexto mundial: '+(joint.trained_series??0)+' series con pesos ajustados. '+
   (why[joint.reason]??(joint.forecast?'Candidato contextual calculado; pendiente de comparar con este modelo en predicciones nuevas.':joint.reason??'')),'helper'));
  if(joint.forecast)out.append(node('p','Candidato mundial: USD '+fmt(joint.forecast.estimated_price,2)+
   ' al '+new Date(joint.forecast.target_at).toLocaleString('es-MX')+'. Conserva su propia referencia y objetivo.','fineprint'));
 }
 const names=['Precio','Volatilidad','Volumen'];
 for(let i=0;i<3;i++){
  const x=f.outputs[i],score=f.training.test.outputs[i],row=node('div','','activity-validation-row');
  row.append(node('strong',names[i]+' · intervalo histórico central del 80 %'),
   node('p',fmt(x.lower,i===0?2:4)+' – '+fmt(x.upper,i===0?2:4)+(i===1?' %':i===0?' USD':' '+unit(f)),'helper'),
   node('p','Error medio en '+f.training.test.cases+' casos de prueba: '+fmt(score.mae,4)+units[i]+'. Referencia: '+
    fmt(score.baselineMAE,4)+units[i]+'.','fineprint'),
   node('p',(score.mae<score.baselineMAE?'Mejoró':'No mejoró')+' la referencia en esa muestra. El intervalo cubrió '+
    fmt(score.intervalCoverage*100,1)+' % de sus resultados.','fineprint'));
  out.append(row);
 }
 if(f.campaign){
  out.append(node('p','Campaña: '+f.campaign.candidates+' configuraciones comparadas con '+f.campaign.trainCases+' ejemplos de entrenamiento. Validación: '+fmt(f.campaign.validationAccuracy*100,1)+' % de dirección.','fineprint'));
  if(f.referenceTest)out.append(node('p','Mismos períodos reservados: campaña '+f.training.test.directionCorrect+'/'+f.training.test.cases+'; modelo anterior '+f.referenceTest.directionCorrect+'/'+f.referenceTest.cases+'. Se muestran todos los casos.','fineprint'));
  if(f.pretrainedLoaded)out.append(node('p','Se cargó el aprendizaje incluido en esta APK.','fineprint'));
 }
 const te=f.training.test;
 if(Number.isInteger(te.predictedUp)){
  out.append(node('p','En la prueba histórica, el precio indicó '+te.predictedUp+' subidas y '+te.predictedDown+' bajadas en '+te.cases+' casos. '+
   'Dirección del precio: '+te.directionCorrect+'/'+te.cases+'; clasificador de subida: '+te.probabilityCorrect+'/'+te.cases+'.','fineprint'));
  if(te.predictedUp===te.cases||te.predictedDown===te.cases)
   out.append(node('p','La dirección no varió en esa muestra. Su porcentaje de aciertos también debe compararse con repetir una sola dirección.','helper'));
 }
 out.append(node('p','Aprendizaje guardado: '+f.training.updates+' actualizaciones · '+f.training.onlineUpdates+
  ' ejemplos nuevos. Los resultados e intervalos históricos corresponden al entrenamiento inicial, hasta '+
  when(f.training.initialTestThrough)+'. Tu registro comprueba las predicciones posteriores.','fineprint'));
 $('lqtRaw').textContent=JSON.stringify(f,null,2);
}
async function run(){
 if(busy||syncing||importing||exporting)return;busy=true;const token=++epoch,s=selection();availability();
 $('lqtStatus').textContent='Consultando velas cerradas y cargando el aprendizaje; si falta un modelo, se entrena y prueba localmente…';
 try{
  const rows=await D.history(s);if(token!==epoch)return;
  if(!rows.length||!D.freshness(s,rows.at(-1)).valid)throw Error('Actualiza las velas: el último cierre está desactualizado.');
  const checked=T.evaluate(records,rows,{...s,now:Date.now()/1000});if(checked.evaluated)commit(checked.records);
  const existing=records.find(f=>f.asset===s.asset&&f.minutes===s.minutes&&f.granularity===s.granularity&&f.originTime===rows.at(-1).time&&
   (f.algorithmVersion??1)===(window.LAPLACE_CAMPAIGN_RELEASE?.algorithmVersion??window.LAPLACE_LQT_RELEASE?.algorithmVersion??2));
  if(existing){render(existing);$('lqtStatus').textContent='Este cierre ya tenía un pronóstico; se conserva el original.';return;}
  const result=await request('analyze',{...s,rows:rows.map(b=>[b.time,b.low,b.high,b.open,b.close,b.volume])});
  if(token!==epoch)return;
  $('lqtStatus').textContent='Comprobando el contexto mundial y la evidencia de confianza…';
  try{result.jointContext=window.LaplaceEF004Mobile?.joint?
   await window.LaplaceEF004Mobile.joint(s,result,rows):{status:'abstained',reason:'world_context_unavailable'};
  }catch(error){result.jointContext={status:'abstained',reason:'world_context_unavailable',detail:String(error.message)}}
  if(token!==epoch)return;
  const f=T.freeze(result);
  if(window.LaplaceIntegral?.medirConfianzaInterna)f.confidence=window.LaplaceIntegral.medirConfianzaInterna(records,f);
  commit([...records,f]);render(f);
  $('lqtStatus').textContent='Precio, dirección, volatilidad y volumen guardados. El resultado se comprobará al cerrar el período.';
 }catch(error){if(token===epoch)$('lqtStatus').textContent='LQT: '+error.message;}
 finally{busy=false;availability();}
}
function renderHistory(){
 const out=$('lqtHistory');out.replaceChildren();
 for(const f of records.slice().reverse().slice(0,limit)){
  const row=node('details','','history-entry'),head=node('summary',''),label=node('div','');
  label.append(node('strong',f.asset+' · '+f.minutes+' min · LQT-1000 v'+(f.algorithmVersion??1)),
   node('small','Precio USD '+fmt(f.outputs[0].predicted,2)+' · volatilidad '+fmt(f.outputs[1].predicted,3)+' % · volumen '+fmt(f.outputs[2].predicted,4)+' '+unit(f)));
  head.append(label,node('span',f.status==='verified'?'Evaluado':'Pendiente','result-tag'));row.append(head);
  const facts=node('dl','','record-facts'),fields=[['Emitido',when(f.issuedAt)],['Cierre de referencia',when(f.sourceCloseAt)],
   ['Precio de referencia','USD '+fmt(f.reference,2)],['Objetivo',f.targetCloseAt?when(f.targetCloseAt):f.horizonBars+' velas de negociación'],
   ['Probabilidad estimada de subida',fmt(f.probabilityUp*100,1)+' %']];
  if(f.status==='verified'){
   ['Precio','Volatilidad','Volumen'].forEach((name,i)=>{
    const u=i===0?' USD':i===1?' puntos porcentuales':' '+unit(f),m=f.measurement[i];
    fields.push([name+' real',fmt(m.actual,6)+(i===1?' %':u)],['Error de '+name.toLowerCase(),fmt(m.error,6)+u],
     ['Error de referencia',fmt(m.baselineError,6)+u],['Dentro del intervalo de '+name.toLowerCase(),m.insideInterval?'Sí':'No']);
   });
   const expected=Math.sign(f.outputs[0].predicted-f.reference),actual=Math.sign(f.measurement[0].actual-f.reference);
   fields.push(['Dirección del precio',expected===actual?'Acertada':'Fallida'],['Cierre utilizado',when(f.observedCloseAt)]);
  }
  fields.push(['Versión del aprendizaje',f.checkpointSHA256.slice(0,16)]);
  if(f.importedFromFile)fields.push(['Procedencia','Respaldo importado; conserva sus resultados observados.']);
  for(const [name,value]of fields)facts.append(node('dt',name),node('dd',value));row.append(facts);
  const raw=node('details','');raw.append(node('summary','Registro sin redondear'),node('pre',JSON.stringify(f,null,2)));row.append(raw);out.append(row);
 }
 if(!records.length)out.append(node('p','Genera tu primer pronóstico LQT en Analizar.','helper'));
 $('lqtMore').hidden=records.length<=limit;
 const s={...D.selection(),algorithmVersion:window.LAPLACE_CAMPAIGN_RELEASE?.algorithmVersion??window.LAPLACE_LQT_RELEASE?.algorithmVersion??2},summary=T.summarize(records,s);
 $('lqtSummary').textContent=s.asset+' · '+s.minutes+' min · LQT v'+s.algorithmVersion+': '+summary.cases+' evaluados y '+summary.pending+' pendientes.'+
  (summary.cases?' Error medio de precio: USD '+fmt(summary.mae[0],2)+'; referencia USD '+fmt(summary.baselineMAE[0],2)+
   '. Dirección: '+summary.directionCorrect+'/'+summary.directionCases+'. Brier: '+fmt(summary.brier,4)+'.':'');
}
async function sync(){
 if(busy||syncing||importing||exporting)return;syncing=true;lastSyncAt=Date.now();availability();
 try{
  const groups=new Map();for(const f of records)if(f.status==='pending'&&(f.market==='equity'||f.targetCloseAt<=Date.now()/1000))
   groups.set(f.asset+':'+f.granularity,{asset:f.asset,minutes:f.minutes,granularity:f.granularity,market:f.market});
  let count=0;for(const s of groups.values()){
   const rows=await D.history(s),checked=T.evaluate(records,rows,{...s,now:Date.now()/1000});
   if(checked.evaluated){commit(checked.records);count+=checked.evaluated;}
  }
  $('lqtHistoryStatus').textContent='Comprobados '+count+' períodos nuevos. Se conservan pendientes los que aún no tienen todas sus velas.';
 }catch(error){$('lqtHistoryStatus').textContent='Comprobación LQT: '+error.message;}
 finally{syncing=false;availability();}
}
async function exportBackup(){
 if(busy||syncing||importing||exporting)return;
 try{
  exporting=true;availability();const model=await request('backup',D.selection());
  const text=JSON.stringify({schema:'laplace-lqt-backup-v1',exportedAt:new Date().toISOString(),model,records},null,2);
  if(new TextEncoder().encode(text).length>8*1024*1024)throw Error('El respaldo supera 8 MiB.');
  if(window.LaplaceBridge?.exportHistory){window.LaplaceBridge.exportHistory(text);return;}
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='LAPLACE-LQT-aprendizaje.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  exporting=false;$('lqtHistoryStatus').textContent='Respaldo preparado: aprendizaje del activo/plazo seleccionado y todos los pronósticos LQT.';
 }catch(error){exporting=false;$('lqtHistoryStatus').textContent='No se exportó LQT: '+error.message;}
 finally{availability();}
}
async function acceptImport(text){
 let modelRestored=false;
 try{
  const result=T.importEvidence(records,text); // Validate the complete ledger before restoring a model.
  if(result.model)modelRestored=(await request('restore',{model:result.model})).restored===true;
  commit(result.records);$('lqtHistoryStatus').textContent='Respaldo LQT importado: '+result.added+' registros nuevos y '+result.duplicates+' ya existentes conservados.';
 }catch(error){$('lqtHistoryStatus').textContent=(modelRestored?'El aprendizaje se restauró; falta guardar el registro: ':'No se completó la importación LQT: ')+error.message;}
 finally{importing=false;availability();}
}
window.LaplaceQuantumMobile={
 receive(id,payload){const pending=requests.get(id);if(!pending)return;clearTimeout(pending.timer);requests.delete(id);
  payload?.ok?pending.resolve(payload.result):pending.reject(Error(payload?.error||'El núcleo no devolvió un resultado válido.'));},
 state:()=>({records:JSON.parse(JSON.stringify(records)),last,busy}),run,sync,
 consumeImport(payload){if(!importing)return false;
  if(payload?.ok)acceptImport(payload.text);else{importing=false;availability();$('lqtHistoryStatus').textContent=
   payload?.cancelled?'Importación LQT cancelada.':'No se importó LQT: '+payload?.error;}return true;},
 consumeExport(message){if(!exporting)return false;exporting=false;availability();$('lqtHistoryStatus').textContent=String(message);return true;}
};
$('lqtRun').addEventListener('click',run);$('lqtSync').addEventListener('click',sync);$('lqtMore').addEventListener('click',()=>{limit+=20;renderHistory();});
$('lqtExport').addEventListener('click',exportBackup);
$('lqtImport').addEventListener('click',()=>{importing=true;availability();
 try{if(window.LaplaceBridge?.importHistory)window.LaplaceBridge.importHistory();else $('lqtImportFile').click();}
 catch(error){window.LaplaceQuantumMobile.consumeImport({ok:false,error:error.message});}
});
$('lqtImportFile').addEventListener('cancel',()=>{importing=false;availability();});
$('lqtImportFile').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file){importing=false;availability();return;}
 try{if(file.size>8*1024*1024)throw Error('El respaldo supera 8 MiB.');await acceptImport(await file.text());}
 catch(error){importing=false;availability();$('lqtHistoryStatus').textContent=error.message;}
 event.target.value='';
});
for(const event of ['laplace:selection','laplace:horizon'])window.addEventListener(event,reset);
setInterval(()=>{
 if(document.visibilityState==='visible'&&!busy&&!syncing&&!importing&&!exporting&&Date.now()-lastSyncAt>120000&&
  records.some(f=>f.status==='pending'&&(f.market==='equity'||f.targetCloseAt<=Date.now()/1000)))sync();
},15000);
reset();
})();
