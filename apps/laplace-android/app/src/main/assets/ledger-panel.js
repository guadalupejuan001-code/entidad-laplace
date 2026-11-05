/* Un registro visible; las tres evidencias originales siguen independientes. */
(function(){
'use strict';
const V=window.LaplaceVerifier,H=window.LaplaceVerification,I=window.LaplaceIcons,
 M=window.LaplaceMarkets,$=id=>document.getElementById(id),finite=Number.isFinite;
let limit=20,renderTimer=null;
const formatters=new Map(),fmt=(n,d=2)=>{if(!finite(n))return '—';
 if(!formatters.has(d))formatters.set(d,new Intl.NumberFormat('es-MX',{maximumFractionDigits:d}));return formatters.get(d).format(n)};
const time=t=>finite(t)?new Date(t*1000).toLocaleString('es-MX',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Sin fecha';
const names={native:'Aprendizaje actual',m001:'Anterior · precio',activity:'Anterior · actividad'};
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
const horizon=f=>f.market==='equity'&&f.minutes>=1440?fmt(f.minutes/1440,0)+' sesiones':
 f.minutes>=1440?fmt(f.minutes/1440,0)+' días':f.minutes>=60?fmt(f.minutes/60,1)+' h':f.minutes+' min';
const descriptions={verified:'Resultado comprobado',due:'Cierre listo para consultar',waiting:'El plazo sigue abierto',
 awaiting_source:'El proveedor todavía no publicó el cierre completo',awaiting_session:'Faltan velas de negociación',
 missing_bars:'Faltan velas del período; se volverá a consultar',origin_missing:'La fuente no entregó la vela de origen',
 source_missing:'El proveedor no entregó datos para este período',
 source_error:'La fuente no respondió; se reintentará automáticamente',source_window_expired:'El origen está fuera de la historia disponible del proveedor',
 invalid_period:'El registro no conserva fechas válidas para comprobarse'};
function outputs({engine,record:f}){
 const unit=M.isCrypto(f.asset)?f.asset.split('-')[0]:'unidades';
 if(engine==='native')return ['Precio','Volatilidad','Volumen'].map((name,k)=>({name,
  predicted:f.outputs[k].predicted,actual:f.measurement?.[k]?.actual,error:f.measurement?.[k]?.error,
  unit:k===0?'USD':k===1?'%':unit,errorUnit:k===1?'puntos porcentuales':k===0?'USD':unit}));
 if(engine==='m001')return [{name:'Precio',predicted:f.estimate,actual:f.actual,
  error:window.LaplaceTracking.metrics(f)?.absoluteError,unit:'USD',errorUnit:'USD'}];
 return ['volatility','volume'].map((key,k)=>({name:k===0?'Volatilidad':'Volumen',predicted:f.outputs[key].predicted,
  actual:f.measurement?.[key]?.actual,error:f.measurement?.[key]?.error,unit:k===0?'%':unit,errorUnit:k===0?'puntos porcentuales':unit}));
}
function choice(id,options,initial){
 const select=$(id),signature=JSON.stringify(options);if(select.dataset.options===signature)return;
 const value=select.value;select.replaceChildren();for(const [key,text]of [['all',initial],...options]){
  const option=node('option',text);option.value=String(key);select.append(option)}
 select.value=options.some(([key])=>String(key)===value)?value:'all';select.dataset.options=signature;
}
function statusText(f,phase,now){
 if(phase==='verified')return 'Cierre comprobado · '+time(f.observedCloseAt);
 if(phase==='waiting'){const minutes=Math.max(1,Math.ceil((H.targetOf(f)-now)/60));
  return f.market==='equity'?'Esperando las velas de negociación del plazo':
   'Faltan '+(minutes>=1440?fmt(minutes/1440,1)+' días':minutes>=60?fmt(minutes/60,1)+' h':minutes+' min')+' · '+time(H.targetOf(f));}
 return descriptions[phase]??'Esperando datos verificables';
}
function makeRow(entry,now,open){
 const {engine,record:f}=entry,p=H.phase(f,now),done=p==='verified',fields=outputs(entry);
 const row=node('details',undefined,'ledger-entry');row.dataset.state=done?'verified':p==='waiting'?'waiting':'due';
 row.dataset.recordId=engine+':'+f.id;row.open=open.has(row.dataset.recordId);
 const head=node('summary'),line=node('div',undefined,'ledger-row-head'),asset=node('div',undefined,'ledger-asset');
 const medallion=node('span',undefined,'ledger-row-seal icon-medallion');medallion.append(I.create(done?'check':p==='waiting'?'clock':'source'));
 const title=node('div');title.append(node('strong',f.asset.replace('-USD','/USD')+' · '+horizon(f)),node('small',names[engine]));
 asset.append(medallion,title);line.append(asset,node('span',done?'Evaluado':p==='waiting'?'En plazo':'Esperando datos','ledger-chip'));
 const preview=node('div',undefined,'ledger-preview'),primary=fields[0];
 preview.append(node('span',primary.name+' previsto'),node('strong',(primary.unit==='USD'?'USD ':'')+fmt(primary.predicted,primary.unit==='USD'?2:4)+(primary.unit==='USD'?'':' '+primary.unit)));
 if(done){const actual=node('div',undefined,'ledger-actual');actual.append(node('span',primary.name==='Precio'?'Cierre observado':primary.name+' real'),
  node('strong',(primary.unit==='USD'?'USD ':'')+fmt(primary.actual,primary.unit==='USD'?2:4)+(primary.unit==='USD'?'':' '+primary.unit)));preview.append(actual)}
 const outcome=node('div',statusText(f,p,now),'ledger-row-status');head.append(line,preview,outcome);row.append(head);
 const body=node('div',undefined,'ledger-body');
 const date=node('dl',undefined,'ledger-dates');
 for(const [name,value]of [['Emitido',time(f.issuedAt)],['Objetivo',f.market==='equity'?f.horizonBars+' velas de negociación':time(H.targetOf(f))],
  ['Última comprobación',f.verification?.checkedAt?time(f.verification.checkedAt):done?time(f.checkedAt):'Automática al cerrar el período']])date.append(node('dt',name),node('dd',value));
 body.append(date);
 if(engine==='native'&&window.LaplaceForecastRisk)body.append(node('p',
  window.LaplaceForecastRisk.describe(f.riskDiagnostics),'helper'));
 if(engine==='native'&&f.inverseLoss){const a=f.inverseLoss;
  body.append(node('p','Inverso: '+(a.target.direction==='down'?'caída':'subida')+' del '+fmt(a.target.lossPct,2)+
   ' % hasta USD '+fmt(a.target.price,2)+'. '+a.history.lossCases+' antecedentes entre '+a.history.cases+' períodos.','helper'));}
 for(const x of fields){const metric=node('div',undefined,'ledger-measure');metric.append(node('strong',x.name));
  const values=node('dl');for(const [name,value]of [['Previsto',x.predicted],['Observado',x.actual],['Error absoluto',x.error]]){
   if(!done&&name!=='Previsto')continue;values.append(node('dt',name),node('dd',fmt(value,6)+' '+(name==='Error absoluto'?x.errorUnit:x.unit)))}
  metric.append(values);body.append(metric)}
 if(done&&fields[0].name==='Precio'){
  const reference=engine==='native'?f.reference:f.baseline,predicted=fields[0].predicted,actual=fields[0].actual;
  const direction=node('p',actual===reference?'El precio no cambió frente a la referencia.':
   'Dirección '+(Math.sign(predicted-reference)===Math.sign(actual-reference)?'acertada':'fallida')+' · error de precio '+
   fmt(100*Math.abs(predicted-actual)/actual,4)+' %.','ledger-outcome');body.append(direction);
 }
 if(!done){body.append(node('p',descriptions[p]??descriptions.due,'helper'));
  if(f.verification?.lastCloseAt)body.append(node('p','Último cierre recibido: '+time(f.verification.lastCloseAt)+'.','fineprint'));
  if(f.verification?.message)body.append(node('p',f.verification.message,'fineprint'));
  if(f.verification?.nextTryAt)body.append(node('p','Próximo intento desde '+time(f.verification.nextTryAt)+', con la app abierta.','fineprint'));
 }
 const raw=node('details',undefined,'ledger-raw'),pre=node('pre','');raw.append(node('summary','Cifras originales y procedencia'),pre);
 raw.addEventListener('toggle',()=>{pre.textContent=raw.open?JSON.stringify(f,null,2):''});
 body.append(raw);row.append(body);return row;
}
function render(){
 if(!document.getElementById('ledgerCard'))return;
 const all=V.entries(),now=Date.now()/1000,state=V.state();
 choice('ledgerAsset',[...new Set(all.map(e=>e.record.asset))].sort().map(s=>[s,s.replace('-USD','/USD')]),'Todos los activos');
 choice('ledgerHorizon',[...new Set(all.map(e=>e.record.minutes))].sort((a,b)=>a-b).map(m=>[String(m),horizon({minutes:m,market:'crypto'})]),'Todos los plazos');
 const selected=all.filter(e=>($('ledgerAsset').value==='all'||e.record.asset===$('ledgerAsset').value)&&
  ($('ledgerHorizon').value==='all'||String(e.record.minutes)===$('ledgerHorizon').value)&&
  ($('ledgerEngine').value==='all'||e.engine===$('ledgerEngine').value));
 $('ledgerFilterScope').textContent=['ledgerAsset','ledgerHorizon','ledgerState','ledgerEngine']
  .filter(id=>$(id).value!=='all').map(id=>$(id).selectedOptions[0].textContent).join(' · ')||'Todos los activos y plazos';
 const checked=selected.filter(e=>e.record.status==='verified').length,waiting=selected.filter(e=>H.phase(e.record,now)==='waiting').length;
 const metrics=$('ledgerMetrics');metrics.replaceChildren();
 for(const [name,value]of [['Registrados',selected.length],['Evaluados',checked],['En plazo',waiting],['Esperando datos',selected.length-checked-waiting]]){
  const card=node('div');card.append(node('strong',String(value)),node('span',name));metrics.append(card)}
 const chosen=selected.filter(e=>$('ledgerState').value==='all'||($('ledgerState').value==='due'?
  e.record.status==='pending'&&H.phase(e.record,now)!=='waiting':H.phase(e.record,now)===$('ledgerState').value))
  .sort((a,b)=>b.record.issuedAt-a.record.issuedAt||a.record.id.localeCompare(b.record.id));
 const out=$('ledgerEntries'),open=new Set([...out.querySelectorAll('details.ledger-entry[open]')].map(n=>n.dataset.recordId));
 const fragment=document.createDocumentFragment();for(const e of chosen.slice(0,limit))fragment.append(makeRow(e,now,open));
 if(!chosen.length){const empty=node('div',undefined,'ledger-empty');empty.append(I.create('ledger'),
  node('strong',all.length?'Ningún registro coincide con estos filtros.':'Tu próximo pronóstico aparecerá aquí.'),
  node('p',all.length?'Cambia el activo, el plazo o el estado para consultar otros resultados.':'Su cierre se comprobará automáticamente al terminar el plazo.'));fragment.append(empty)}
 out.replaceChildren(fragment);$('ledgerMore').hidden=chosen.length<=limit;
 $('ledgerScope').textContent=chosen.length+' registros'+(chosen.length>limit?' · mostrando '+limit:'')+' · horas de tu dispositivo';
 $('ledgerSync').disabled=state.running;$('ledgerCard').setAttribute('aria-busy',String(state.running));
 $('ledgerCard').dataset.verification=state.running?'running':state.lastReport?.errors.length?'error':'idle';
 $('ledgerStatus').textContent=state.running?(state.progress.asset?'Consultando '+state.progress.asset.replace('-USD','/USD')+
  ' · ventana '+state.progress.group+' de '+state.progress.total+'…':'Preparando la consulta de los cierres…'):
  state.lastReport?.errors.some(e=>e.kind==='storage')?'No se pudo guardar la comprobación. Revisa el almacenamiento o exporta los registros.':
  state.lastReport?.errors.length?'La revisión tiene registros pendientes. Consulta su motivo; se volverán a comprobar automáticamente.':
  state.lastCheckAt?'Última revisión: '+time(state.lastCheckAt)+' · '+state.lastReport.evaluated+' resultados nuevos comprobados.':
  'Comprobación automática activa al vencer el plazo y al volver a la app.';
}
function queue(){if(renderTimer!==null)return;renderTimer=setTimeout(()=>{renderTimer=null;render()},60)}
for(const id of ['ledgerAsset','ledgerHorizon','ledgerState','ledgerEngine'])$(id).addEventListener('change',()=>{limit=20;render()});
$('ledgerSync').addEventListener('click',()=>V.sync({force:true}));
$('ledgerBackups').addEventListener('click',()=>{$('ledgerArchive').open=true;$('ledgerArchive').scrollIntoView({behavior:'smooth',block:'start'})});
$('ledgerArchive').addEventListener('toggle',()=>{if($('ledgerArchive').open){window.LaplaceLegacyHistory?.render();
 window.LaplaceQuantumMobile.renderHistory();window.LaplaceActivityMobile.renderHistory();}});
$('ledgerMore').addEventListener('click',()=>{limit+=20;render()});
window.addEventListener('laplace:ledger',queue);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
setInterval(()=>{if(!document.hidden&&!$('tests').hidden)queue()},30000);
window.LaplaceLedger={render,entries:()=>V.entries()};render();
})();
