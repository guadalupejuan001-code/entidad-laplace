(function(){
'use strict';
const A=window.LaplaceActivity,D=window.LaplaceActivityData,$=id=>document.getElementById(id);
const KEY='laplace-activity-records-v1',fmt=(v,d=4)=>Number.isFinite(v)?new Intl.NumberFormat('es-MX',{
 maximumFractionDigits:d}).format(v):'—',when=t=>new Date(t*1000).toLocaleString('es-MX');
const unit=s=>s.market==='crypto'?s.asset.split('-')[0]:'unidades';
let records=[],busy=false,syncBusy=false,worker=null,cancelCompute=null,epoch=0,last=null,limit=20,importing=false,exporting=false;
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))records=saved;}
catch(error){$('activityHistoryStatus').textContent='No se pudo leer el registro de actividad: '+error.message;}
function commit(next){localStorage.setItem(KEY,JSON.stringify(next));records=next;renderHistory();window.LaplaceVerifier?.changed();}
function item(tag,text,cls){const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;}
function selection(){const s=D.selection();$('activitySelection').textContent=s.asset+' · '+
 (s.market==='equity'&&s.minutes>=1440?s.minutes/1440+' sesiones':s.minutes+' min')+
 ' · velas de '+s.granularity/60+' min. Se usa la selección de arriba.';return s;}
function reset(){epoch++;cancelCompute?.();busy=false;last=null;
 $('activityRun').disabled=syncBusy;$('activitySync').disabled=syncBusy;$('activityVolatility').textContent='—';$('activityVolume').textContent='—';
 $('activityPeriod').textContent='';$('activityValidation').replaceChildren();$('activityRaw').textContent='Sin cálculo para esta selección.';
 $('activityStatus').textContent='Selección cambiada. Pulsa Predecir para generar y guardar el nuevo escenario.';selection();}
function compute(rows,options){
 const source=window.LAPLACE_ACTIVITY_WORKER_SOURCE,url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 return new Promise((resolve,reject)=>{
  let settled=false,owned=null;const cancel=()=>finish(Error('Cálculo cancelado al cambiar la selección.'));
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);owned?.terminate();
   if(worker===owned)worker=null;if(cancelCompute===cancel)cancelCompute=null;
   URL.revokeObjectURL(url);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('El cálculo agotó el tiempo; puedes reintentarlo.')),90000);
  try{owned=worker=new Worker(url);cancelCompute=cancel;worker.onerror=e=>finish(Error(e.message||'El cálculo de actividad no pudo ejecutarse.'));
   worker.onmessage=e=>e.data.ok?finish(null,e.data.result):finish(Error(e.data.error));
   worker.postMessage({id:epoch,rows,options});
  }catch(error){finish(error);}
 });
}
function renderResult(result){
 last=result;$('activityRaw').textContent=JSON.stringify(result,null,2);
 $('activityVolatility').textContent=fmt(result.outputs.volatility.predicted,3)+' %';
 $('activityVolume').textContent=fmt(result.outputs.volume.predicted,6)+' '+unit(result);
 const origin=result.sourceCloseAt??result.dataKnownThrough;
 $('activityPeriod').textContent='Desde el cierre '+when(origin)+' · '+
  (result.market==='equity'?'próximas '+result.horizonBars+' velas bursátiles.':'hasta '+when(result.targetCloseAt)+'.');
 const out=$('activityValidation');out.replaceChildren();
 for(const key of ['volatility','volume']){
  const value=result.outputs[key],name=key==='volatility'?'Volatilidad':'Volumen',suffix=key==='volatility'?' puntos porcentuales':' '+unit(result);
  const card=item('div','','activity-validation-row');
  card.append(item('strong',name+' · '+value.test.cases+' casos posteriores de prueba'),
   item('p','Error medio '+fmt(value.test.mae,6)+suffix+' · referencia '+fmt(value.test.baselineMAE,6)+suffix+'.','helper'),
   item('p',value.weight===0?'La validación eligió usar la actividad reciente como referencia predictiva.':
    'La validación eligió combinar patrones similares y actividad reciente.','fineprint'),
   item('p',value.test.skill>0?'En esta prueba histórica redujo el error un '+fmt(value.test.skill*100,1)+' %.':
    'En esta prueba histórica no mejoró la referencia.','fineprint'));
  out.append(card);
 }
 out.append(item('p','Los resultados históricos describen esta muestra; el pronóstico guardado se comprobará con velas posteriores.','fineprint'));
}
async function run(){
 if(busy||syncBusy)return;busy=true;const token=++epoch,s=selection();$('activityRun').disabled=true;$('activitySync').disabled=true;
 last=null;$('activityVolatility').textContent='—';$('activityVolume').textContent='—';
 $('activityValidation').replaceChildren();$('activityPeriod').textContent='';$('activityRaw').textContent='Calculando actividad…';
 $('activityStatus').textContent='Consultando velas cerradas y aprendiendo a predecir actividad…';
 try{
  const rows=await D.history(s);if(token!==epoch)return;
  if(!D.freshness(s,rows.at(-1)).valid)throw Error('Las últimas velas están desactualizadas.');
  const existing=records.find(f=>f.asset===s.asset&&f.minutes===s.minutes&&f.granularity===s.granularity&&f.originTime===rows.at(-1).time);
  if(existing){renderResult(existing);$('activityStatus').textContent='Este origen ya tenía un pronóstico guardado. Se conserva su predicción original.';return;}
  const result=await compute(rows,{...s,asOf:Date.now()/1000});if(token!==epoch)return;
  if(result.status!=='forecast'){last=null;$('activityVolatility').textContent='—';$('activityVolume').textContent='—';
   $('activityValidation').replaceChildren();$('activityRaw').textContent=JSON.stringify(result,null,2);
   throw Error(result.reason);}
  const record=A.freeze(result);commit([...records,record]);renderResult(record);
  $('activityStatus').textContent='Dos predicciones guardadas: volatilidad y volumen. Se comprobarán cuando termine el período.';
 }catch(error){if(token===epoch)$('activityStatus').textContent='Actividad: '+error.message;}
 finally{if(token===epoch){busy=false;$('activityRun').disabled=syncBusy;$('activitySync').disabled=syncBusy;}}
}
function renderHistory(){
 if(!$('ledgerArchive').open)return;
 const out=$('activityHistory');out.replaceChildren();
 if(!records.length)out.append(item('p','Sin pronósticos de actividad. Genera uno en Analizar.','helper'));
 for(const f of records.slice().reverse().slice(0,limit)){
  const row=item('details','','history-entry'),head=item('summary',''),name=item('div','');
  name.append(item('strong',f.asset+' · '+(f.market==='equity'&&f.minutes>=1440?f.minutes/1440+' sesiones':f.minutes+' min')),
    item('small','Volatilidad '+fmt(f.outputs.volatility.predicted,3)+' % · volumen '+fmt(f.outputs.volume.predicted,6)+' '+unit(f)));
  head.append(name,item('span',f.status==='verified'?'Evaluado':'Pendiente','result-tag'));row.append(head);
  const facts=item('dl','','record-facts'),fields=[['Emitido',when(f.issuedAt)],['Origen',when(f.sourceCloseAt)],
   ['Objetivo',f.market==='equity'?f.horizonBars+' velas bursátiles':when(f.targetCloseAt)]];
  if(f.status==='verified'){
   for(const key of ['volatility','volume']){
    const m=f.measurement[key],name=key==='volatility'?'Volatilidad':'Volumen',u=key==='volatility'?' %':' '+unit(f);
    fields.push([name+' prevista',fmt(f.outputs[key].predicted,6)+u],[name+' real',fmt(m.actual,6)+u],
     ['Error de '+name.toLowerCase(),fmt(m.error,6)+(key==='volatility'?' puntos porcentuales':u)],
     ['Error de referencia',fmt(m.baselineError,6)+(key==='volatility'?' puntos porcentuales':u)]);
   }
   fields.push(['Cierre utilizado',when(f.observedCloseAt)]);
  }
  if(f.importedFromFile)fields.push(['Procedencia','Importado; conserva los resultados del archivo.']);
  for(const [key,value]of fields)facts.append(item('dt',key),item('dd',value));row.append(facts);
  const raw=item('details','');raw.append(item('summary','Registro sin redondear'),item('pre',JSON.stringify(f,null,2)));row.append(raw);out.append(row);
 }
 $('activityMore').hidden=records.length<=limit;
}
async function sync(){return window.LaplaceVerifier.sync({force:true})}

function exportRecords(){
 const text=JSON.stringify({schema:'laplace-activity-evidence-v1',exportedAt:new Date().toISOString(),records},null,2);
 if(window.LaplaceBridge?.exportHistory){exporting=true;window.LaplaceBridge.exportHistory(text);return;}
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
 link.href=url;link.download='LAPLACE-actividad.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('activityHistoryStatus').textContent='Actividad exportada con sus predicciones y resultados originales.';
}
function acceptImport(text){
 try{const result=A.importEvidence(records,text);commit(result.records);$('activityHistoryStatus').textContent=
  'Actividad importada: '+result.added+' registros · '+result.duplicates+' identificadores ya existentes conservados.';}
 catch(error){$('activityHistoryStatus').textContent='No se importó actividad: '+error.message;}
 finally{importing=false;$('activityImport').disabled=false;}
}
window.LaplaceActivityMobile={state:()=>({records:records.slice(),last,busy}),run,sync,renderHistory,
 consumeImport(payload){if(!importing)return false;
  if(payload?.ok)acceptImport(payload.text);else{importing=false;$('activityImport').disabled=false;
   $('activityHistoryStatus').textContent=payload?.cancelled?'Importación de actividad cancelada.':'No se importó actividad: '+payload?.error;}
  return true;},
 consumeExport(message){if(!exporting)return false;exporting=false;$('activityHistoryStatus').textContent=String(message);return true;}
};
$('activityRun').addEventListener('click',run);$('activitySync').addEventListener('click',sync);
$('activityMore').addEventListener('click',()=>{limit+=20;renderHistory();});
$('activityClear').addEventListener('click',()=>{$('activityClearConfirm').hidden=false;});
$('activityClearNo').addEventListener('click',()=>{$('activityClearConfirm').hidden=true;});
$('activityClearYes').addEventListener('click',()=>{
 try{commit([]);$('activityClearConfirm').hidden=true;$('activityHistoryStatus').textContent='Registro de actividad vaciado.';}
 catch(error){$('activityHistoryStatus').textContent='No se pudo vaciar la actividad: '+error.message;}
});
$('activityExport').addEventListener('click',()=>{try{exportRecords();}catch(error){exporting=false;$('activityHistoryStatus').textContent=error.message;}});
$('activityImport').addEventListener('click',()=>{
 importing=true;if(window.LaplaceBridge?.importHistory){$('activityImport').disabled=true;
  try{window.LaplaceBridge.importHistory();}catch(error){window.LaplaceActivityMobile.consumeImport({ok:false,error:error.message});}}
 else $('activityImportFile').click();
});
$('activityImportFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file){importing=false;return;}
 try{if(file.size>8*1024*1024)throw Error('El archivo supera 8 MiB.');acceptImport(await file.text());}
 catch(error){importing=false;$('activityImport').disabled=false;$('activityHistoryStatus').textContent=error.message;}
 finally{e.target.value='';}
});
window.addEventListener('laplace:selection',reset);window.addEventListener('laplace:horizon',reset);
window.LaplaceVerifier.register('activity',{records:()=>records,busy:()=>busy||importing||exporting,
 evaluate:A.evaluate,update:commit});
window.addEventListener('laplace:verification',event=>{
 syncBusy=event.detail.running;$('activitySync').disabled=syncBusy;$('activityRun').disabled=syncBusy||busy;
 $('activitySync').textContent=syncBusy?'Consultando cierres…':'Comprobar ahora';
 if(!syncBusy)$('activityHistoryStatus').textContent='Revisión automática activa. '+
  (event.detail.lastReport?.evaluated??0)+' resultados nuevos comprobados.';
});
selection();renderHistory();
})();
