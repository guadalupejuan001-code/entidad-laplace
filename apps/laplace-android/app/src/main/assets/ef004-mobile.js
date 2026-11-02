/* Coordinador del motor original: worker local, archivo completo e IndexedDB. */
(function(){
'use strict';
const $=id=>document.getElementById(id),KEY='laplace-ef004-mobile-v1';
let captures=[],runs=[],evaluations=[],busy=false,worker=null,job=0,archivePending=null,source='archivo empaquetado';
const listeners=new Set();
function notify(){render();window.dispatchEvent(new Event('laplace:ef004'))}
function state(){return {available:typeof window.LAPLACE_EF004_WORKER_SOURCE==='string',
 executed:runs.length>0,archiveCount:captures.length,lastRun:runs.at(-1)??null,
 forecasts:runs.filter(r=>r.result?.status==='experimental_model_frozen').length,
 evaluations:evaluations.length,busy,source}}
window.LaplaceEF004Mobile={state,run:train};
function openDB(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open(KEY,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
})}
async function stored(value){const db=await openDB();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('state',value?'readwrite':'readonly'),store=tx.objectStore('state');
 const r=value?store.put(value,'archive'):store.get('archive');
 tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
})}finally{db.close()}}
async function persist(){try{await stored({captures,runs,evaluations,source});return true}
 catch(error){$('ef004Status').textContent='No se pudo guardar EF004. Exporta los resultados antes de cerrar. '+error.message;return false}}
function merge(list){const byTime=new Map();for(const c of [...captures,...list]){
 if(!c||typeof c.capture_sha256!=='string')throw Error('Captura sin sello');
 const old=byTime.get(c.at);if(old&&old.capture_sha256!==c.capture_sha256)throw Error('Capturas contradictorias en la misma fecha');
 byTime.set(c.at,c);
 }return [...byTime.values()].sort((a,b)=>a.at.localeCompare(b.at))}
function execute(action,{list=captures,forecasts=[]}={}){
 if(worker)throw Error('Ya hay una tarea EF004 en curso');
 const id=++job,url=URL.createObjectURL(new Blob([window.LAPLACE_EF004_WORKER_SOURCE],{type:'text/javascript'}));
 return new Promise((resolve,reject)=>{
  try{worker=new Worker(url)}catch(error){URL.revokeObjectURL(url);reject(error);return}
  const finish=()=>{worker?.terminate();worker=null;URL.revokeObjectURL(url);listeners.delete(cancel)};
  const cancel=()=>{finish();reject(Error('Cálculo cancelado; se conserva el último resultado completo.'))};listeners.add(cancel);
  worker.onerror=event=>{finish();reject(Error(event.message||'El motor EF004 no pudo ejecutarse'))};
  worker.onmessage=({data})=>{if(data.id!==id)return;
   if(data.progress){$('ef004Status').textContent=data.progress;return}
   finish();data.ok?resolve(data.result):reject(Error(data.error));
  };
  worker.postMessage({id,action,captures:list,forecasts,options:{horizonHours:Number($('ef004Horizon').value)}});
 });
}
async function train(){
 if(busy)return;busy=true;notify();
 try{
  const result=await execute('train');
  const key=result.forecast_sha256??result.as_of+'-'+(result.reason??'none');
  const run={id:key,executedAt:new Date().toISOString(),archiveCount:captures.length,
   runtime:'EF004 original · JavaScript local en worker',engine:window.LAPLACE_EF004_ENGINE,
   source,result};
  if(!runs.some(x=>x.id===key))runs.push(run);
  await persist();$('ef004Status').textContent=describe(result);
 }catch(error){$('ef004Status').textContent='EF004: '+error.message}
 finally{busy=false;notify()}
}
function describe(r){
 if(r.status==='experimental_model_frozen')return 'Entrenamiento local terminado: '+r.selected_targets+
  ' variables, '+r.lagged_relationships+' relaciones estadísticas. Modelo y pronóstico sellados.';
 const why={insufficient_independent_capture_history:'Aún faltan transiciones consecutivas independientes',
 insufficient_multivariate_observable_transitions:'Las series no tienen suficientes cambios observables para un modelo conjunto'};
 return 'Motor ejecutado en este teléfono. '+(why[r.reason]??r.reason)+'. '+
  (r.contiguous_captures??r.captures_seen??0)+' capturas continuas; entrenamiento '+
  (r.observed_training_pairs??0)+'/'+(r.required_training_pairs??6)+', validación '+
  (r.observed_validation_pairs??0)+'/'+(r.required_validation_pairs??2)+', prueba reservada '+
  (r.observed_holdout_pairs??0)+'/'+(r.required_holdout_pairs??2)+'.';
}
async function refreshArchive(){
 if(busy)return;
 if(!window.LaplaceBridge?.fetchEF004Archive){$('ef004Status').textContent='La actualización del archivo requiere el puente Android de esta APK.';return}
 busy=true;notify();$('ef004Status').textContent='Recuperando todas las capturas publicadas en laplace-archivo…';
 try{
  const response=await new Promise((resolve,reject)=>{
   const id='ef004-archive-'+Date.now(),timer=setTimeout(()=>{archivePending=null;reject(Error('El archivo tardó demasiado. Se conserva la copia local.'))},180000);
   archivePending={id,resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}};
   try{window.LaplaceBridge.fetchEF004Archive(id)}catch(error){clearTimeout(timer);archivePending=null;reject(error)}
  });
  const candidate=merge(response.captures_raw.map(text=>JSON.parse(text)));
  await execute('verify',{list:candidate});captures=candidate;source='laplace-archivo · '+response.commit;
  await persist();$('ef004Status').textContent=captures.length+' capturas auténticas verificadas en el teléfono. Pulsa Entrenar EF004.';
 }catch(error){$('ef004Status').textContent='No se pudo actualizar: '+error.message}
 finally{busy=false;notify()}
}
window.LaplaceEF004Archive={receive(id,response){
 if(!archivePending||archivePending.id!==id)return;const request=archivePending;archivePending=null;
 response?.ok?request.resolve(response):request.reject(Error(response?.error??'Archivo no disponible'));
},progress(id,done,total){if(archivePending?.id===id)$('ef004Status').textContent='Descargando capturas '+done+'/'+total+'…'}};
async function evaluate(){
 if(busy)return;busy=true;notify();
 try{
  const forecasts=runs.filter(x=>x.result?.status==='experimental_model_frozen').map(x=>x.result);
  if(!forecasts.length){$('ef004Status').textContent='Aún no hay pronósticos EF004 congelados por comprobar.';return}
  const result=await execute('evaluate',{forecasts});
  for(const r of result){const key=r.evaluation_sha256??JSON.stringify(r);if(!evaluations.some(x=>x.id===key))evaluations.push({id:key,result:r})}
  await persist();$('ef004Status').textContent='Comprobados '+result.length+' pronósticos. Los objetivos sin observación posterior quedan pendientes.';
 }catch(error){$('ef004Status').textContent='Comprobación EF004: '+error.message}
 finally{busy=false;notify()}
}
function exportData(){const payload=JSON.stringify({schema:KEY,exportedAt:new Date().toISOString(),
 source,runs,evaluations,captureIndex:captures.map(c=>({at:c.at,sha256:c.capture_sha256}))},null,2);
 if(window.LaplaceBridge?.exportHistory){window.LaplaceBridge.exportHistory(payload);return}
 const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download='LAPLACE-EF004.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function render(){
 const s=state(),r=s.lastRun?.result,metrics=$('ef004Metrics');metrics.replaceChildren();
 const pairs=r?.model;
 for(const [label,value] of [['Motor',s.available?'Incluido en el móvil':'No disponible'],
  ['Capturas completas',captures.length],['Consecutivas',r?.consecutive_captures??r?.contiguous_captures??'Por comprobar'],
  ['Pares entrenamiento',pairs?.train_pairs??r?.observed_training_pairs??'—'],
  ['Pares validación',pairs?.validation_pairs??r?.observed_validation_pairs??'—'],
  ['Prueba reservada',pairs?.holdout_pairs??r?.observed_holdout_pairs??'—']]){
  const d=document.createElement('div'),a=document.createElement('small'),b=document.createElement('strong');
  a.textContent=label;b.textContent=String(value);d.append(a,b);metrics.append(d);
 }
 $('ef004Tag').textContent=busy?'EJECUTANDO':s.executed?(r.status==='experimental_model_frozen'?'MODELO LOCAL':'EJECUTADO · ESPERANDO DATOS'):'MOTOR LISTO';
 $('ef004Train').disabled=busy||!s.available||!captures.length;
 $('ef004Refresh').disabled=busy;$('ef004Evaluate').disabled=busy;
 $('ef004Cancel').hidden=!busy||!worker;
 $('ef004Raw').textContent=JSON.stringify({latest:s.lastRun,evaluations,archiveCount:captures.length,
  provenance:captures.map(c=>({at:c.at,capture_sha256:c.capture_sha256}))},null,2);
 const rows=$('ef004Forecasts');rows.replaceChildren();
 for(const point of r?.trajectory?.[0]?.states??[]){
  const line=document.createElement('div');line.className='signal-row';
  const left=document.createElement('div'),name=document.createElement('strong'),v=document.createElement('small');
  name.textContent=point.variable??point.key;
  v.textContent=point.status==='abstained'?'Sin estimación: '+point.reason:
   String(point.origin_value)+' → '+String(point.estimated_value)+' '+point.unit+' · '+point.status;
  left.append(name,v);line.append(left);rows.append(line);
 }
}
$('ef004Train').addEventListener('click',train);$('ef004Refresh').addEventListener('click',refreshArchive);
$('ef004Evaluate').addEventListener('click',evaluate);$('ef004Export').addEventListener('click',exportData);
$('ef004Cancel').addEventListener('click',()=>{for(const cancel of listeners)cancel()});
(async()=>{
 try{
  const packed=window.LAPLACE_EF004_ARCHIVE?.captures??[];
  const saved=await stored();if(saved){captures=saved.captures??[];runs=saved.runs??[];evaluations=saved.evaluations??[];source=saved.source??source}
  captures=merge(packed);notify();
  if(captures.length){busy=true;notify();await execute('verify');busy=false;
   $('ef004Status').textContent='Motor original disponible. '+captures.length+' capturas completas verificadas. '+
     (runs.length?describe(runs.at(-1).result):'Pulsa Entrenar EF004 para ejecutar el aprendizaje local.');await persist();}
 }catch(error){busy=false;$('ef004Status').textContent='Archivo EF004 no verificable: '+error.message;captures=[]}
 notify();
})();
})();
