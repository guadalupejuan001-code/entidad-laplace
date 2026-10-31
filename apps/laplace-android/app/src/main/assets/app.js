/* Interfaz Android. El triángulo y el vórtice son identidad visual;
 * ninguno de esos rayos es evidencia financiera o cálculo realizado.
 * No hay órdenes, cuentas, promesas de precisión ni muestras inventadas.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const Engine=window.LaplaceMath;
const WORLD=window.LAPLACE_WORLD;
const STORAGE='laplace-mobile-forecasts-v1';
const date=seconds=>new Date(seconds*1000).toLocaleString('es-MX',
  {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-MX',
  {style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
const percent=n=>Number.isFinite(n)?(100*n).toFixed(2)+' %':'—';
const number=n=>Number.isFinite(n)?n.toLocaleString('es-MX'):'—';
const hourLabel=h=>Engine.HORIZONS.find(x=>x.hours===h)?.label??h+' h';
let asset='BTC-USD',hours=1,hourly=null,daily=null;
let models=new Map(),lastForecast=null,busy=false;
const quotes=new Map();let refreshEpoch=0;
let promiseSequence=0;
const pending=new Map();
let log=[];
try {const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');
  if(Array.isArray(saved))log=saved.filter(x=>x&&Engine.ALLOWED_ASSETS.includes(x.asset))
    .slice(-200);
}catch(error){}
function updateConnection(text,live=false){
  $('connection').textContent=text;
  document.querySelector('.dot').classList.toggle('live',live);
}
function status(text,error=false){
  $('activityStatus').textContent=text;
  $('activityStatus').style.color=error?'#ffc6bd':'#d7efff';
  $('noticeText').textContent=text;
  $('noticeIcon').textContent=error?'!':'◎';
  $('notice').dataset.kind=error?'error':'info';
}
function success(text){
  status(text,false);
  $('notice').dataset.kind='success';
}
function renderQuotes(){
  const ids={'BTC-USD':'BTC','ETH-USD':'ETH','SOL-USD':'SOL'};
  let found=0;
  for(const symbol of Engine.ALLOWED_ASSETS){
    const suffix=ids[symbol],quote=quotes.get(symbol);
    const selected=symbol===asset;
    const button=document.querySelector('[data-quote-asset="'+symbol+'"]');
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
    $('quote'+suffix).textContent=quote?money(quote.price):'—';
    $('quote'+suffix+'Status').textContent=quote?
      'Cotización pública':'Sin cotización';
    if(quote)found++;
  }
  $('quoteStatus').textContent=found?found+'/3 PRECIOS':'SIN COTIZACIONES';
  const current=quotes.get(asset);
  const close=hourly?.at(-1)??daily?.at(-1);
  if(current){
    const instant=Date.parse(current.time);
    const when=Number.isFinite(instant)?new Date(instant):new Date(current.receivedAt);
    $('quoteTime').textContent=asset+' · Coinbase Exchange · '+when.toLocaleString('es-MX')+
      ' · Cotización pública (puede tener retraso)';
  }else if(close){
    $('quoteTime').textContent=asset+' · Ticker no disponible; último cierre histórico: '+
      money(close.close)+' · '+date(close.time);
  }else $('quoteTime').textContent='Sin precio público para '+asset+
    '. Verifica la conexión y pulsa Actualizar.';
}
function activate(page){
  for(const b of document.querySelectorAll('[data-tab]'))
    b.setAttribute('aria-current',b.dataset.tab===page?'page':'false');
  for(const el of document.querySelectorAll('.tabpage'))
    el.hidden=el.id!==page;
  if(page==='world')showWorld();
  if(page==='tests')renderHistory();
  if(page==='panel')setTimeout(drawChart,60);
}
function selectHours(value){
  const n=Number(value);
  if(!Engine.HORIZONS.some(x=>x.hours===n))return;
  hours=n;
  for(const b of document.querySelectorAll('[data-hours]')){
    const selected=Number(b.dataset.hours)===n;
    b.classList.toggle('active',selected);
    b.setAttribute('aria-pressed',String(selected));
  }
  $('horizonTag').textContent=hourLabel(n).toLocaleUpperCase('es-MX');
  lastForecast=null;
  $('estimate').textContent='—';$('relativeChange').textContent='Pulsa Proyectar';
  const model=models.get(Engine.selectResolution(hours));
  $('modelLabel').textContent=model?'DATOS LISTOS · '+(model.selected==='ar1_ridge'?'AR(1)':'BASELINE'):'SIN ENTRENAR';
  $('chartComment').textContent='Escenario para '+hourLabel(n)+
    '. No extrapolar su precisión a nuevos períodos.';
  drawChart();
}
function getRows(resolution){return resolution===1?hourly:daily}
function dataFor(hours){return getRows(Engine.selectResolution(hours))}
function remoteCandles(resolution,requestedAsset){
  return new Promise((resolve,reject)=>{
    const id='lap-'+(++promiseSequence);
    const timer=setTimeout(()=>{pending.delete(id);
      reject(Error('La fuente tardó demasiado en responder.'));},26000);
    pending.set(id,{resolve,reject,timer});
    if(!window.LaplaceBridge||typeof window.LaplaceBridge.fetchCandles!=='function'){
      pending.delete(id);clearTimeout(timer);
      reject(Error('Este panel requiere la APK nativa de Laplace.'));
      return;
    }
    try{window.LaplaceBridge.fetchCandles(id,requestedAsset,resolution*3600)}
    catch(error){pending.delete(id);clearTimeout(timer);reject(error)}
  });
}
function remoteQuote(requestedAsset){
  return new Promise((resolve,reject)=>{
    const id='lap-'+(++promiseSequence);
    const timer=setTimeout(()=>{
      pending.delete(id);reject(Error('El ticker no respondió a tiempo.'));
    },26000);
    pending.set(id,{resolve,reject,timer});
    if(!window.LaplaceBridge||typeof window.LaplaceBridge.fetchQuote!=='function'){
      pending.delete(id);clearTimeout(timer);
      reject(Error('La APK no ofrece todavía cotizaciones spot.'));
      return;
    }
    try{window.LaplaceBridge.fetchQuote(id,requestedAsset)}
    catch(error){pending.delete(id);clearTimeout(timer);reject(error)}
  });
}
window.LaplaceMobile={
  receive(id,response){
    const item=pending.get(id);if(!item)return;
    pending.delete(id);clearTimeout(item.timer);
    if(!response?.ok){
      item.reject(Error(response?.error||'Respuesta de fuente inválida'));
      return;
    }
    if(Array.isArray(response.candles)){
      try{item.resolve(Engine.candlesFromCoinbase(response.candles,response.granularity))}
      catch(error){item.reject(error)}
    }else if(response.quote){
      const q=response.quote;
      if(!Engine.ALLOWED_ASSETS.includes(q.asset)||!Number.isFinite(Number(q.price))||
        Number(q.price)<=0||!Number.isFinite(Number(q.receivedAt))){
        item.reject(Error('Cotización pública inválida.'));return;
      }
      item.resolve({asset:q.asset,price:Number(q.price),time:q.time,
        receivedAt:Number(q.receivedAt),source:q.source});
    }else item.reject(Error('La fuente no proporcionó velas ni precio.'));
  }
};
async function refresh(){
  if(busy)return;busy=true;
  $('refresh').disabled=true;
  updateConnection('CONSULTANDO');
  $('dataStatus').textContent='Recibiendo velas históricas de Coinbase Exchange…';
  status('Consultando velas horarias y diarias. No se inventarán precios.');
  const results=await Promise.allSettled([remoteCandles(1),remoteCandles(24)]);
  hourly=results[0].status==='fulfilled'?results[0].value:null;
  daily=results[1].status==='fulfilled'?results[1].value:null;
  models.clear();lastForecast=null;
  const good=Number(!!hourly)+Number(!!daily);
  const best=hourly?.at(-1)??daily?.at(-1);
  if(best){
    $('lastPrice').textContent=money(best.close);
    $('priceTime').textContent='Última vela: '+date(best.time);
    $('dataStatus').textContent=(hourly?hourly.length+' velas 1 h':'1 h no disponible')+
      ' · '+(daily?daily.length+' velas diarias':'Diario no disponible');
    status('Datos observados. Puedes entrenar un modelo temporal local.');
    updateConnection(good===2?'DATOS LISTOS':'PARCIAL',true);
    renderSignals();
    evaluateHistory();
  } else {
    const errors=results.map(x=>x.status==='rejected'?x.reason.message:'').filter(Boolean);
    $('lastPrice').textContent='—';$('priceTime').textContent='Sin datos verificables';
    $('dataStatus').textContent=errors.join(' · ').slice(0,450);
    status('No hay cotizaciones: conecta internet y pulsa Actualizar.',true);
    updateConnection('SIN DATOS');
  }
  $('estimate').textContent='—';$('relativeChange').textContent='Pulsa Proyectar';
  $('modelLabel').textContent='SIN ENTRENAR';
  $('trainingCount').textContent='—';$('testingCount').textContent='—';
  $('modelError').textContent='—';$('baselineError').textContent='—';
  $('refresh').disabled=false;busy=false;drawChart();
}
function trained(resolution){
  const existing=models.get(resolution);if(existing)return existing;
  const rows=getRows(resolution);
  if(!rows)throw Error('No se obtuvieron velas '+(resolution===1?'horarias':'diarias')+'.');
  const model=Engine.analyze(rows,{intervalHours:resolution,asset});
  models.set(resolution,model);return model;
}
function showModel(model){
  $('trainingCount').textContent=number(model.trainPairs);
  $('testingCount').textContent=number(model.holdoutPairs);
  $('modelError').textContent=money(model.modelMAE);
  $('baselineError').textContent=money(model.referenceMAE);
  $('modelLabel').textContent=model.selected==='ar1_ridge'?'AR(1) · EXPERIMENTAL':'PERSISTENCIA';
}
function actionTrain(){
  try{
    const model=trained(Engine.selectResolution(hours));
    showModel(model);
    status('Entrenado con '+model.trainPairs+' pares; '+
      model.holdoutPairs+' casos reservados. Modelo elegido: '+model.description+'.');
    showTests(model);drawChart();
  }catch(error){status(error.message,true)}
}
function showTests(model){
  const target=$('testResults');target.replaceChildren();
  const summary=document.createElement('p');
  summary.textContent='Test retrospectivo sobre velas posteriores al entrenamiento. '+
    'Comparación con la estrategia de referencia que conserva el precio anterior.';
  target.appendChild(summary);
  const stats=document.createElement('div');stats.className='stats';
  const data=[
    ['Instrumento',model.asset],
    ['Resolución',model.intervalHours+' h'],
    ['Muestras de entrenamiento',number(model.trainPairs)],
    ['Muestras de prueba',number(model.holdoutPairs)],
    ['MAE AR(1)',money(model.modelMAE)],
    ['MAE persistencia',money(model.referenceMAE)],
    ['Mejora AR(1)',percent(model.skill)],
    ['Selección actual',model.selected==='ar1_ridge'?'AR(1)':'Persistencia']
  ];
  for(const [key,value] of data){
    const el=document.createElement('div'),a=document.createElement('span'),
      b=document.createElement('strong');
    a.textContent=key;b.textContent=value;el.append(a,b);stats.appendChild(el);
  }
  target.appendChild(stats);
  const note=document.createElement('p');note.className='fineprint';
  note.textContent='Prueba histórica, no auditoría prospectiva. La mejora de una muestra no asegura rendimientos futuros.';
  target.appendChild(note);
}
function actionTest(){
  try{
    const model=trained(Engine.selectResolution(hours));
    showModel(model);showTests(model);activate('tests');
    status('Se ejecutó la comprobación temporal. Consulta el error y el baseline.');
  }catch(error){status(error.message,true);activate('panel')}
}
function actionEvaluate(){
  try{
    const model=trained(Engine.selectResolution(hours));
    showModel(model);showTests(model);
    activate('tests');
    status('Evaluación retrospectiva: '+model.holdoutPairs+' casos. Referencia: '+money(model.referenceMAE)+
      '; AR(1): '+money(model.modelMAE)+'.');
  }catch(error){status(error.message,true)}
}
function saveProjection(p,model){
  const item={id:String(Date.now())+'-'+String(Math.floor(Math.random()*100000)),
    asset,hours,issuedAt:Date.now()/1000,sourceTime:p.sourceTime,
    targetAt:Math.max(Date.now()/1000,p.sourceTime)+hours*3600,
    estimate:p.estimate,baseline:p.baseline,lower:p.lower,upper:p.upper,
    modelName:p.modelName,intervalHours:model.intervalHours,referenceMAE:model.referenceMAE,
    status:'pending'};
  log.push(item);log=log.slice(-200);
  try{localStorage.setItem(STORAGE,JSON.stringify(log))}catch(error){}
}
function actionForecast(){
  try{
    const model=trained(Engine.selectResolution(hours));
    const p=Engine.forecast(model,hours);
    lastForecast=p;
    showModel(model);
    $('estimate').textContent=money(p.estimate);
    const diff=(p.estimate/model.lastPrice-1)*100;
    $('relativeChange').textContent=(diff>=0?'+':'')+diff.toFixed(2)+' % · '+hourLabel(hours);
    $('chartComment').textContent='Rango exploratorio: '+money(p.lower)+' a '+money(p.upper)+
      '. Intervalo no calibrado y sin ventaja predictiva certificada.';
    status('Escenario calculado para '+hourLabel(hours)+
      '. Modelo: '+p.modelName+'. No constituye una recomendación.');
    saveProjection(p,model);drawChart();
  }catch(error){status(error.message,true)}
}
function renderSignals(){
  const el=$('signalRows');el.replaceChildren();
  const data=[
    ['Velas horarias de Coinbase',hourly?hourly.length+' registros':'No disponibles',!!hourly],
    ['Velas diarias de Coinbase',daily?daily.length+' registros':'No disponibles',!!daily],
    ['Libro de órdenes completo','No conectado en esta APK',false],
    ['Banca y derivados EF005','Solo archivo histórico global',!!WORLD],
    ['Órdenes y cuentas personales','Nunca se solicitan',false]
  ];
  for(const [name,description,ok] of data){
    const row=document.createElement('div');row.className='signal-row';
    const left=document.createElement('div'),h=document.createElement('strong'),
      p=document.createElement('small'),signal=document.createElement('span');
    h.textContent=name;p.textContent=description;signal.className='check';
    signal.textContent=ok?'●':'—';
    if(!ok)signal.style.color='#8399b4';
    left.append(h,p);row.append(left,signal);el.appendChild(row);
  }
}
function showWorld(){
  const w=window.LAPLACE_WORLD;
  $('worldStates').textContent=w?.states?number(w.states):'—';
  $('worldDomains').textContent=w?.domains?number(w.domains):'—';
  $('worldTime').textContent=w?.captured_at?
    'Captura EF002 archivada: '+new Date(w.captured_at).toLocaleString('es-MX')+
    '. No es una consulta actual en vivo.':'No hay archivo EF002 empaquetado.';
  const el=$('worldGroups');el.replaceChildren();
  if(!w?.groups){const p=document.createElement('p');p.textContent='Sin metadatos disponibles.';el.appendChild(p);return}
  for(const group of w.groups){
    const row=document.createElement('div');row.className='group-row';
    const label=document.createElement('div'),strong=document.createElement('strong'),
      sub=document.createElement('small'),count=document.createElement('span');
    strong.textContent=group.group;
    sub.textContent=group.status==='observed'?'Observaciones públicas':'Sin fuente comprobada';
    count.textContent=group.signals+' señales';count.className='outline-tag';
    label.append(strong,sub);row.append(label,count);el.appendChild(row);
  }
}
function drawChart(){
  const canvas=$('forecastChart');if(!canvas)return;
  const rect=canvas.getBoundingClientRect(),w=Math.max(280,rect.width||350),h=230;
  const density=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*density);canvas.height=Math.round(h*density);
  const ctx=canvas.getContext('2d');ctx.scale(density,density);
  ctx.fillStyle='#071727';ctx.fillRect(0,0,w,h);
  const rows=dataFor(hours)??hourly??daily;
  const n=rows?Math.min(90,rows.length):0;
  const prices=n?rows.slice(-n).map(x=>x.close):[];
  const predict=lastForecast?.trace??[];
  const high=lastForecast?.upper,low=lastForecast?.lower;
  const values=[...prices,...predict.map(x=>x.price)];
  if(Number.isFinite(high))values.push(high);
  if(Number.isFinite(low))values.push(low);
  if(values.length<2){
    ctx.fillStyle='#81a5c7';ctx.textAlign='center';ctx.font='12px system-ui';
    ctx.fillText('Sin datos de mercado observados',w/2,h/2);return;
  }
  let min=Math.min(...values),max=Math.max(...values);const range=Math.max(1e-8,max-min);
  min-=range*.1;max+=range*.1;
  const left=49,top=18,bottom=h-27,right=w-11,chartW=right-left,chartH=bottom-top;
  ctx.strokeStyle='#233d53';ctx.lineWidth=1;ctx.font='10px system-ui';
  for(let i=0;i<5;i++){
    const y=top+i*chartH/4;
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    ctx.fillStyle='#7492aa';ctx.textAlign='right';
    ctx.fillText(((max-min)*(1-i/4)+min).toFixed(0),left-7,y+4);
  }
  const scaleY=price=>top+(max-price)/(max-min)*chartH;
  const projectedLength=Math.min(predict.length,90);
  const pastSpan=lastForecast?chartW*.66:chartW,forecastSpan=chartW-pastSpan;
  const xPast=i=>left+((i)/(Math.max(1,n-1)))*pastSpan;
  ctx.strokeStyle='#d9e6f7';ctx.lineWidth=2;ctx.beginPath();
  prices.forEach((p,i)=>i?ctx.lineTo(xPast(i),scaleY(p)):
    ctx.moveTo(xPast(i),scaleY(p)));
  ctx.stroke();
  if(lastForecast&&prices.length){
    const x0=xPast(prices.length-1),baseY=scaleY(prices.at(-1));
    ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle='#6a9db8';
    ctx.beginPath();ctx.moveTo(x0,top);ctx.lineTo(x0,bottom);ctx.stroke();
    ctx.restore();
    ctx.fillStyle='rgba(53,126,235,.15)';
    ctx.beginPath();ctx.moveTo(x0,baseY);
    ctx.lineTo(right,scaleY(lastForecast.upper));
    ctx.lineTo(right,scaleY(lastForecast.lower));ctx.closePath();ctx.fill();
    ctx.strokeStyle='#69e9ff';ctx.lineWidth=2.3;ctx.shadowColor='#1eaef5';ctx.shadowBlur=9;
    ctx.beginPath();ctx.moveTo(x0,baseY);
    predict.forEach((point,i)=>ctx.lineTo(x0+(i+1)/predict.length*forecastSpan,
      scaleY(point.price)));ctx.stroke();ctx.shadowBlur=0;
  }
  ctx.fillStyle='#8fa9c0';ctx.font='10px system-ui';ctx.textAlign='left';
  ctx.fillText('HISTORIA',left,bottom+17);
  if(lastForecast){ctx.textAlign='right';ctx.fillText(hourLabel(hours).toUpperCase(),right,bottom+17)}
}
function renderHistory(){
  const container=$('history');container.replaceChildren();
  if(!log.length){const p=document.createElement('p');p.textContent='Sin pronósticos locales todavía.';container.appendChild(p);return}
  for(const f of log.slice().reverse().slice(0,30)){
    const row=document.createElement('div');row.className='history-row';
    const left=document.createElement('div'),main=document.createElement('strong'),
      info=document.createElement('small'),state=document.createElement('span');
    main.textContent=f.asset+' · '+hourLabel(f.hours);
    info.textContent=date(f.issuedAt)+' · '+money(f.estimate);
    state.className='outline-tag';
    state.textContent=f.status==='verified'?'Comprobado':f.status==='missing'?'Sin dato':'Pendiente';
    left.append(main,info);row.append(left,state);container.appendChild(row);
  }
}
function evaluateHistory(){
  for(const f of log){
    if(f.status==='verified'||f.status==='missing')continue;
    if(Date.now()/1000<f.targetAt)continue;
    const rows=f.intervalHours===1?hourly:daily;
    if(!rows)continue;
    const actual=rows.find(x=>x.time>=f.targetAt&&
      x.time-f.targetAt<=f.intervalHours*3600*1.5);
    if(!actual)continue;
    f.status='verified';f.actual=actual.close;
    f.modelError=Math.abs(f.estimate-actual.close);
    f.baselineError=Math.abs(f.baseline-actual.close);
  }
  try{localStorage.setItem(STORAGE,JSON.stringify(log))}catch(error){}
}
for(const b of document.querySelectorAll('[data-tab]'))
  b.addEventListener('click',()=>activate(b.dataset.tab));
for(const b of document.querySelectorAll('[data-hours]'))
  b.addEventListener('click',()=>selectHours(b.dataset.hours));
$('asset').addEventListener('change',()=>{asset=$('asset').value;hourly=null;daily=null;
  models.clear();lastForecast=null;log=log;refresh()});
$('refresh').addEventListener('click',refresh);
$('train').addEventListener('click',actionTrain);
$('test').addEventListener('click',actionTest);
$('evaluate').addEventListener('click',actionEvaluate);
$('forecast').addEventListener('click',actionForecast);
$('clearHistory').addEventListener('click',()=>{
  log=[];try{localStorage.removeItem(STORAGE)}catch(error){}renderHistory();
});
window.addEventListener('resize',drawChart);
selectHours(1);renderSignals();showWorld();renderHistory();drawChart();
updateConnection('EN ESPERA');
setTimeout(refresh,200);
})();
