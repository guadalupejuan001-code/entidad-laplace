/* LAPLACE Android v2 — panel de control M001 restaurado + EF002 verificable.
 * Una sola fuente de verdad: precio público + velas cerradas Coinbase.
 * Cada botón funciona; no se confunde el valor futuro con un resultado real.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const E=window.LaplaceMath,W=window.LAPLACE_WORLD??null;
const F=window.LaplaceIntegral;
const Live=window.LaplaceLiveMath;
const STORAGE='laplace-mobile-forecasts-v2';
const money=v=>Number.isFinite(v)?new Intl.NumberFormat('es-MX',{
  style:'currency',currency:'USD',maximumFractionDigits:2}).format(v):'—';
const number=v=>Number.isFinite(v)?v.toLocaleString('es-MX',{maximumFractionDigits:5}):'—';
const percent=v=>Number.isFinite(v)?(100*v).toFixed(3)+' %':'—';
const date=sec=>Number.isFinite(sec)?new Date(sec*1000).toLocaleString('es-MX',{
  year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const label=m=>E.HORIZONS.find(h=>h.minutes===m)?.label??m+' min';
let asset='BTC-USD',minutes=15,history=null,historyGranularity=null;
let analysis=null,lastForecast=null,lastHistoryFetch=0,refreshEpoch=0;
let lastHistoryError=null;
let xn01Busy=false,xn01Result=null;
let integralResult=null,integralBusy=false;
let smartBusy=false,validationBusy=false;
let loading=false,sequence=0,latestTest=null;
const tickerStream=Live.createTracker();
let liveEnabled=true,lastLiveUiAt=0,lastLiveSignalsAt=0;
const quotes=new Map(),pending=new Map();
let log=[];
let worldVisibleLimit=100;
try{
  const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');
  if(Array.isArray(data))log=data.filter(r=>r&&E.ALLOWED_ASSETS.includes(r.asset))
    .slice(-250);
}catch(error){}
function connection(value,ready=false){
  $('connection').textContent=value;
  document.querySelector('.dot').classList.toggle('live',ready);
}
function status(message,kind='info'){
  $('noticeText').textContent=message;
  $('noticeIcon').textContent=kind==='error'?'!':kind==='success'?'✓':'◎';
  $('notice').dataset.kind=kind;
  $('inlineStatus').textContent=message;
  $('inlineStatus').dataset.kind=kind;
  $('activityStatus').textContent=message;
}
function setActionAvailability(){
  const ready=Boolean(history&&historyGranularity===E.selectResolution(minutes)&&!loading);
  for(const id of ['forecast','train','test','evaluate']){
    const button=$(id);
    button.disabled=!ready;
    button.title=ready?'Ejecutar con velas verificadas':
      'Primero pulsa Actualizar datos para este plazo';
  }
  $('refresh').disabled=loading;
  $('refresh').textContent=loading?'Consultando datos…':'Actualizar datos';
  $('integralRun').disabled=integralBusy;
  $('xn01Run').disabled=xn01Busy||asset!=='BTC-USD';
  $('xn01Run').textContent=xn01Busy?'Ejecutando XI original…':'Calcular dirección nativa XI';
  const quick=$('smartRun');
  if(quick){
    quick.disabled=loading||smartBusy||validationBusy;
    const label=quick.querySelector('strong');
    if(label)label.textContent=smartBusy?'Analizando mercado…':'Analizar ahora';
  }
  const validate=$('validationRun');
  if(validate){
    validate.disabled=loading||validationBusy||smartBusy;
    validate.textContent=validationBusy?'Calculando pruebas…':'Calcular validación del activo elegido';
  }
}

/* WebSocket reception is a separate, explicitly labeled source.
 * Only the last TRADES are streamed: heartbeats never create prices.
 * F001/M001 use their own closed OHLCV history; WebSocket re-anchors a
 * read-only preview only when M001 has already been trained.
 */
function liveTimeAgo(milliseconds){
  if(!Number.isFinite(milliseconds))return 'Sin ticks';
  const seconds=Math.max(0,Math.floor((Date.now()-milliseconds)/1000));
  if(seconds<2)return 'ahora';
  if(seconds<60)return 'hace '+seconds+' s';
  if(seconds<3600)return 'hace '+Math.floor(seconds/60)+' min';
  return 'hace '+Math.floor(seconds/3600)+' h';
}
function updateLiveBanner(){
  const snap=tickerStream.snapshot(),statuses={
    live:'WebSocket conectado',connecting:'Conectando a Coinbase',
    subscribing:'Suscribiendo ticker y heartbeat',
    retrying:'Reconectando automáticamente',
    off:'Transmisión detenida',paused:'Conexión pausada'
  };
  $('livePulse').dataset.state=snap.status;
  $('liveStatus').textContent=statuses[snap.status]??'Estado desconocido';
  $('liveDetail').textContent=snap.message+
    (snap.status==='retrying'&&snap.retrySeconds?
      ' · siguiente intento en '+snap.retrySeconds+' s':'');
  $('liveCount').textContent=snap.updates.toLocaleString('es-MX')+
    (snap.updates===1?' operación recibida':' operaciones recibidas');
  const q=tickerStream.quote(asset);
  const fresh=q&&tickerStream.isFresh(asset);
  $('liveAge').textContent=q?('Último '+asset.replace('-USD','')+' · '+
    liveTimeAgo(q.observedAt)+(fresh?' · activo':' · no actualizado')):
    'Sin operación en vivo de '+asset.replace('-USD','');
  $('liveToggle').textContent=liveEnabled?'Detener':'Activar';
  $('liveToggle').setAttribute('aria-pressed',String(liveEnabled));
}
function drawLiveChart(){
  const canvas=$('liveChart'),bounds=canvas.getBoundingClientRect();
  const width=Math.max(240,Math.round(bounds.width||350)),height=108;
  const ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.scale(ratio,ratio);
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#071b2a';ctx.fillRect(0,0,width,height);
  const points=tickerStream.points(asset),values=points.map(p=>p.price);
  $('liveGraphAsset').textContent=asset.replace('-USD','/USD');
  $('liveGraphLabel').textContent=points.length?
    points.length+' operaciones · '+liveTimeAgo(points.at(-1).at):
    'Aún sin operaciones recibidas';
  if(!points.length){
    ctx.fillStyle='#9dbbcc';ctx.font='12px system-ui';ctx.textAlign='center';
    ctx.fillText('Esperando ticker público de Coinbase',width/2,height/2);
    return;
  }
  const min=Math.min(...values),max=Math.max(...values),delta=Math.max(max-min,max*.00002);
  const low=min-delta*.2,high=max+delta*.2;
  const x=i=>10+(width-20)*(i/Math.max(1,points.length-1));
  const y=v=>10+(height-20)*(high-v)/(high-low);
  ctx.strokeStyle='#1b4055';ctx.lineWidth=1;
  for(let i=1;i<=3;i++){
    const step=height*i/4;ctx.beginPath();ctx.moveTo(10,step);
    ctx.lineTo(width-10,step);ctx.stroke();
  }
  ctx.beginPath();ctx.strokeStyle='#55e5c7';ctx.lineWidth=2;
  for(let i=0;i<points.length;i++){
    if(i===0)ctx.moveTo(x(i),y(values[i]));
    else ctx.lineTo(x(i),y(values[i]));
  }
  ctx.stroke();
  ctx.fillStyle='#b4fff1';ctx.beginPath();
  ctx.arc(x(points.length-1),y(values.at(-1)),3,0,Math.PI*2);ctx.fill();
}
function updateLivePreview(){
  const previewElement=$('livePreview'),q=tickerStream.quote(asset);
  if(!liveEnabled||!tickerStream.isFresh(asset)||!q){
    previewElement.textContent='Sin nuevos ticks válidos para '+asset+'. '+
      'El historial M001 no se transforma en precios en vivo.';
    return;
  }
  if(!analysis?.ready||analysis.asset!==asset||
      analysis.horizonMinutes!==minutes||!history){
    previewElement.textContent='Última operación '+money(q.price)+
      ' · '+liveTimeAgo(q.observedAt)+
      '. Analiza M001 para obtener un escenario indicativo con el último precio.';
    return;
  }
  const implied=q.price*Math.exp(analysis.returnLog);
  previewElement.textContent='Escenario indicativo M001 · '+label(minutes)+': '+
    money(implied)+' desde '+money(q.price)+
    '. Usa los mismos patrones históricos, SIN reentrenar y SIN guardar otra predicción.';
}
function liveMessage(event){
  if(!event||typeof event!=='object')return;
  if(event.type==='status'){
    tickerStream.statusUpdate(event);
    updateLiveBanner();renderQuotes();updateLivePreview();
    if(tickerStream.snapshot().status==='live')connection('WS EN VIVO',true);
    else if(tickerStream.snapshot().status==='retrying')connection('RECONEXIÓN');
    return;
  }
  if(event.type!=='ticker'||!tickerStream.acceptTicker(event))return;
  const q=tickerStream.quote(event.asset);
  quotes.set(event.asset,{...q});
  const now=Date.now();
  renderQuotes();updateLiveBanner();
  if(now-lastLiveUiAt>280){
    drawLiveChart();updateLivePreview();lastLiveUiAt=now;
  }
  if(now-lastLiveSignalsAt>2200&&document.querySelector('#signals')?.hidden===false){
    renderSignals();lastLiveSignalsAt=now;
  }
}
function toggleLive(){
  if(!window.LaplaceLiveBridge){
    $('liveDetail').textContent='WebSocket nativo no disponible: usa Actualizar datos.';
    return;
  }
  liveEnabled=!liveEnabled;
  try{
    if(liveEnabled)window.LaplaceLiveBridge.start();
    else window.LaplaceLiveBridge.stop();
  }catch(error){
    liveEnabled=!liveEnabled;
    $('liveDetail').textContent='No se pudo cambiar el estado de la conexión.';
  }
  updateLiveBanner();updateLivePreview();
}


/* Original native XN01 only: no JavaScript classification.
 * Closed five-minute bars are mandatory; a live ticker is not a candle.
 */
function renderXN01(){
  const r=xn01Result;
  for(const id of ['xn01Direction','xn01Confidence','xn01PUp','xn01Support','xn01Prior','xn01Rows'])
    $(id).textContent='—';
  $('xn01Raw').textContent='Sin salida nativa todavía.';
  if(!r)return;
  $('xn01Direction').textContent=r.direction==='subida'?'SUBIDA ↑':'BAJADA ↓';
  $('xn01Confidence').textContent=(r.confidence*100).toFixed(2)+' %';
  $('xn01PUp').textContent=String(r.probability_up);
  $('xn01Support').textContent=String(r.support);
  $('xn01Prior').textContent=String(r.prior);
  $('xn01Rows').textContent=String(r.training_rows);
  $('xn01Raw').textContent=JSON.stringify({...r,
    warning:'Confianza interna, no porcentaje de aciertos demostrados',
    not_reimplemented_in_javascript:true
  },null,2);
}
async function runXN01(){
  if(xn01Busy)return;
  xn01Busy=true;setActionAvailability();
  $('xn01Status').textContent='Recuperando velas cerradas y ejecutando XI/Ether original…';
  try{
    if(asset!=='BTC-USD')throw Error('XN01 original sólo BTC mientras no se valide la ruta bursátil.');
    if(typeof window.LaplaceBridge?.analyzeXN01!=='function')
      throw Error('Ejecutor original JNI no está disponible; no se inventará confianza.');
    const rows=historyGranularity===300&&history?.length>=64?history:
      await remote({kind:'history',asset:'BTC-USD',granularity:300,days:14});
    const closedAt=rows.at(-1).time+300;
    if(Date.now()/1000-closedAt>750)
      throw Error('Las velas de 5 minutos están desactualizadas.');
    const bars=rows.slice(-240).map(b=>[b.time,b.low,b.high,b.open,b.close,b.volume]);
    xn01Result=await remote({kind:'xn01',asset:'BTC-USD',bars});
    renderXN01();
    $('xn01Status').textContent='XN01 ejecutado en XI/Ether: '+bars.length+
      ' velas. Estado '+xn01Result.mask+', P(subida) '+xn01Result.probability_up+
      ', confianza '+xn01Result.confidence+' (no precisión validada).';
  }catch(e){
    xn01Result=null;renderXN01();
    $('xn01Status').textContent='XN01 se abstuvo: '+e.message;
  }finally{
    xn01Busy=false;setActionAvailability();renderCapabilities();
  }
}

/* F001 original: sus tres resoluciones se consultan por lotes; el mundo
 * se lee desde la captura EF002 verificable. La ecuación no sustituye
 * el candidato y no puede entrenar EF004 sin tiempo independiente.
 */
function renderIntegral(){
  const table=$('integralTable'),modules=$('integralModules'),metrics=$('integralMetrics');
  if(!table||!modules||!metrics)return;
  table.replaceChildren();modules.replaceChildren();metrics.replaceChildren();
  const result=integralResult;
  if(!result){
    const p=document.createElement('p');
    p.textContent='Todavía no hay un cálculo. Pulsa el botón para consultar BTC y ejecutar F001.';
    table.appendChild(p);
    const row=document.createElement('div');row.className='signal-row';
    const text=document.createElement('small');
    text.textContent='F001: pendiente de consulta · Campo Laplace: sin resolver · '+
      'ETF C001 y EF004: requieren fuentes e historia independientes. '+
      'No se fabrican resultados.';
    row.appendChild(text);modules.appendChild(row);
    return;
  }
  const {fusion,field,audit,errors}=result;
  const info=[
    ['Horizontes F001',fusion.horizons.length],
    ['Con candidatos',fusion.horizons.filter(h=>h.price_candidate!==null).length],
    ['Operador Lφ=0',field.status],
    ['Anclas del campo',field.available_candidate_anchors],
    ['Estados EF002 válidos',audit.valid_at_cut],
    ['ETF C001',audit.etf_fund_flow_signals+' flujos observados']
  ];
  for(const [label,value] of info){
    const cell=document.createElement('div'),name=document.createElement('span'),
      number=document.createElement('strong');
    name.textContent=label;number.textContent=String(value);
    cell.append(name,number);metrics.appendChild(cell);
  }
  for(const row of fusion.horizons){
    const element=document.createElement('div');element.className='integral-item';
    const label=document.createElement('strong'),statusText=document.createElement('span'),
      detail=document.createElement('small');
    label.textContent=E.HORIZONS.find(h=>h.minutes===row.minutes)?.label??row.minutes+' min';
    statusText.textContent=row.price_candidate===null?'Sin candidato':
      money(row.price_candidate);
    detail.textContent='F001 · '+row.status+' · '+row.analogs+' análogos'+
      (row.return_pct!==null?' · retorno '+number(row.return_pct)+' %':'');
    element.append(label,statusText,detail);table.appendChild(element);
  }
  const domain=field.status==='calculated'?
    'Lφ = 0: '+field.available_candidate_anchors+' fronteras experimentales; '+
      field.interpolated_horizons+' interpolaciones diagnósticas; '+
      'discrepancia máxima '+Number(field.max_anchor_inconsistency).toExponential(2)+
      '. El precio central F001 permanece intacto.':
    'Laplace: '+(field.reason??field.status)+'. No se inventa cálculo.';
  const snapshot=F.resumirCapacidades({world:W,
    executed:{f001:true,xn01:!!xn01Result,m001Diary:log.length},
    asOf:new Date().toISOString()});
  const groups=[
    ['F001 · cálculo actual',fusion.horizons.length+' horizontes · '+
      fusion.horizons.filter(x=>x.price_candidate!==null).length+' candidatos, sin validación prospectiva'],
    ['Campo Laplace',domain],
    ['Auditoría EF002',audit.valid_at_cut+' estados válidos al corte; '+errors.length+' problemas de descarga'],
    ...snapshot.items.map(x=>[x.id+' · '+x.title,x.state+' · '+x.reason])
  ];
  for(const [title,description] of groups){
    const row=document.createElement('div');row.className='signal-row';
    const a=document.createElement('div'),b=document.createElement('strong'),
      c=document.createElement('small');
    b.textContent=title;c.textContent=description;a.append(b,c);row.appendChild(a);
    modules.appendChild(row);
  }
}
async function runIntegral(){
  if(integralBusy)return;
  integralBusy=true;setActionAvailability();
  $('integralRun').textContent='Consultando Bitcoin…';
  $('integralStatus').dataset.state='info';
  $('integralStatus').textContent='F001 usa BTC/USD exclusivamente. Solicitando velas de 5 minutos, 1 hora y 1 día…';
  try{
    if(!F||!window.LaplacePDE?.resolverLaplaceGrafo)
      throw Error('El motor F001 o Laplace no se cargó correctamente.');
    const tasks=[
      ...[300,3600,86400].map(granularity=>
        remote({kind:'history',asset:'BTC-USD',granularity,
          days:F.HISTORIA_REQUERIDA[granularity].days})),
      remote({kind:'quote',asset:'BTC-USD'})
    ];
    const r=await Promise.allSettled(tasks);
    const problems=[],series={};
    for(let i=0;i<3;i++){
      const k=[300,3600,86400][i],entry=r[i];
      if(entry.status==='fulfilled')
        series[k]=entry.value.map(x=>[
          x.time,x.low,x.high,x.open,x.close,x.volume]);
      else{
        series[k]=[];
        problems.push(F.HISTORIA_REQUERIDA[k].days+' días: '+String(entry.reason?.message));
      }
    }
    if(r[3].status!=='fulfilled')
      throw Error('Ticker BTC no disponible: '+String(r[3].reason?.message));
    const q=r[3].value,asOf=new Date().toISOString();
    const quote={asset:'BTC-USD',value:q.price,observed_at:q.time,
      known_at:new Date(q.receivedAt).toISOString()};
    const world=W?.states?{at:W.captured_at,
      universal_state:{states:W.states,snapshot_sha256:W.snapshot_sha256},
      source_status:W.groups}:null;
    const fusion=F.fusionTemporal({quote,series,world,asOf});
    const field=F.aplicarLaplaceAHorizontes(fusion.horizons,{
      quotePrice:q.price,asset:'BTC-USD',
      solver:window.LaplacePDE.resolverLaplaceGrafo});
    const audit=F.auditarUniversoLaplace(W,{asOf});
    integralResult={fusion,field,audit,errors:problems};
    $('rawF001').textContent=JSON.stringify({
      schema:'laplace-f001-raw-binary64-v1',as_of:asOf,
      quote,errors:problems,fusion,laplace_field:field,
      world_audit:audit,known_source:'prediccion/fusion-temporal.mjs',
      disclaimer:'Valores raw_diagnostics previos a redondeo; sin evidencia de rentabilidad'
    },null,2);
    $('integralStatus').dataset.state='success';
    $('integralStatus').textContent='F001 completado con '+
      fusion.horizons.filter(x=>x.price_candidate!==null).length+
      ' candidatos de '+fusion.horizons.length+' horizontes. Campo Laplace: '+
      field.status+'. '+problems.length+' fuentes incompletas. No se confundió '+
      'el archivo mundial con información en vivo.';
    show('integral');renderIntegral();renderCapabilities();
  }catch(error){
    $('integralStatus').dataset.state='error';
    $('integralStatus').textContent='No se pudo completar F001: '+error.message+
      '. Verifica Internet y vuelve a intentar.';
    integralResult=null;
    $('rawF001').textContent='F001 no emitió resultado: '+error.message;
    renderIntegral();renderCapabilities();
  }finally{
    integralBusy=false;setActionAvailability();
    $('integralRun').textContent='Calcular los 14 horizontes de Bitcoin';
  }
}

function show(page){
  const navPage=page==='signals'?'world':page;
  for(const b of document.querySelectorAll('[data-tab]'))
    b.setAttribute('aria-current',b.dataset.tab===navPage?'page':'false');
  for(const section of document.querySelectorAll('.tabpage'))
    section.hidden=section.id!==page;
  if(page==='world')renderWorld();
  if(page==='integral')renderIntegral();
  if(page==='tests'){showTests();renderHistory()}
  if(page==='panel')setTimeout(()=>{drawChart();drawLiveChart();updateLiveBanner();},60);
  // Evita quedarse navegando a una sección que no tiene vuelta visible.
  window.scrollTo?.({top:0,behavior:'instant'});
}
function renderQuotes(){
  const short={'BTC-USD':'BTC','ETH-USD':'ETH','SOL-USD':'SOL'};
  let found=0;
  for(const code of E.ALLOWED_ASSETS){
    const q=quotes.get(code),id=short[code],selected=code===asset,
      streamFresh=q?.isLive&&tickerStream.isFresh(code);
    const button=document.querySelector('[data-quote-asset="'+code+'"]');
    if(button){
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected));
      button.dataset.live=String(Boolean(streamFresh));
    }
    $('quote'+id).textContent=q?money(q.price):'—';
    $('quote'+id+'Status').textContent=streamFresh?
      'WEB SOCKET · último trade':
      q?.isLive?'ÚLTIMA OPERACIÓN · no actualizada':
      q?'HTTPS · cotización puntual':'Sin cotización';
    if(q)found++;
  }
  $('quoteStatus').textContent=tickerStream.snapshot().status==='live'?
    'WS CONECTADO · '+found+'/3':'HTTPS · '+found+'/3';
  const q=quotes.get(asset);
  $('quoteTime').textContent=q?
    asset+' · '+(q.isLive?'WebSocket · última operación':'HTTPS · ticker')+
      ' · origen '+q.time+' · recibido '+date(q.receivedAt/1000)+
      ' · NO es una predicción':
    'Sin ticker disponible para '+asset+'. No se inventaron precios.';
}
function useHorizon(value){
  const m=Number(value);
  if(!E.HORIZONS.some(h=>h.minutes===m))return;
  const previous=historyGranularity;
  minutes=m;analysis=null;lastForecast=null;
  $('horizonSelect').value=String(m);
  for(const b of document.querySelectorAll('[data-minutes]')){
    const selected=Number(b.dataset.minutes)===m;
    b.classList.toggle('active',selected);
    b.setAttribute('aria-pressed',String(selected));
  }
  $('horizonTag').textContent=label(m).toUpperCase();
  $('estimate').textContent='—';
  $('relativeChange').textContent='Sin cálculo para este horizonte';
  $('modelLabel').textContent='M001 · NO CALCULADO';
  if(history&&previous!==E.selectResolution(m)){
    history=null;historyGranularity=null;
    $('lastPrice').textContent='—';
    $('priceTime').textContent='Este plazo requiere otra resolución de velas.';
    $('dataStatus').textContent='Sin datos para el plazo '+label(m)+'. Pulsa Actualizar datos.';
    $('chartComment').textContent='Historial pendiente para '+label(m)+'.';
    status('Horizonte cambiado. Es necesario consultar velas de '+E.HISTORICAL_CONFIG[E.selectResolution(m)].label+'.');
  }
  smartMessage('idle','PLAZO SELECCIONADO',
    'Listo para '+label(m)+'.','Pulsa Analizar ahora para trabajar con el horizonte elegido.',
    asset.replace('-','/'));
  renderSignals();drawChart();setActionAvailability();
}
function remote(request){
  return new Promise((resolve,reject)=>{
    const id='lap-'+(++sequence);
    const timer=setTimeout(()=>{
      pending.delete(id);
      reject(Error('Tiempo de espera agotado. Revisa la conexión.'));},135000);
    pending.set(id,{resolve,reject,timer,kind:request.kind});
    try{
      if(!window.LaplaceBridge)throw Error('Este panel necesita la APK Android.');
      if(request.kind==='quote')
        window.LaplaceBridge.fetchQuote(id,request.asset);
      else if(request.kind==='history')
        window.LaplaceBridge.fetchCandles(id,request.asset,request.granularity,request.days);
      else if(request.kind==='xn01')
        window.LaplaceBridge.analyzeXN01(id,request.asset,JSON.stringify(request.bars));
      else throw Error('Solicitud desconocida.');
    }catch(error){
      clearTimeout(timer);pending.delete(id);reject(error);
    }
  });
}
window.LaplaceMobile={
  live:event=>liveMessage(event),
  receive(id,response){
    const p=pending.get(id);if(!p)return;
    pending.delete(id);clearTimeout(p.timer);
    if(!response?.ok){p.reject(Error(String(response?.error??'Proveedor sin datos')));return}
    try{
      if(p.kind==='quote'){
        const q=response.quote;
        if(!q||!E.ALLOWED_ASSETS.includes(q.asset)||
           !Number.isFinite(Number(q.price))||Number(q.price)<=0||
           !Number.isFinite(Number(q.receivedAt)))
          throw Error('Cotización numéricamente inválida.');
        p.resolve({...q,price:Number(q.price),receivedAt:Number(q.receivedAt)});
      }else if(p.kind==='xn01'){
        const o=response.xn01;
        if(!o||o.schema!=='laplace-xn01-native-xi-v1'||
          o.backend!=='XI/Ether · NativeRuntime'||o.asset!=='BTC-USD'||
          !Number.isFinite(o.confidence)||o.confidence<.5||o.confidence>1||
          !Number.isFinite(o.probability_up)||o.probability_up<0||o.probability_up>1||
          !Number.isSafeInteger(o.support)||!Number.isSafeInteger(o.training_rows)||
          !/^[0-9a-f]{64}$/.test(o.program_sha256)||
          !/^[0-9a-f]{64}$/.test(o.output_sha256))
          throw Error('Resultado XI no verificable; no hay confianza ficticia.');
        p.resolve(o);
      }else{
        const rows=E.candlesFromCoinbase(response.candles,response.granularity);
        p.resolve(rows);
      }
    }catch(error){p.reject(error)}
  },
  progress(id,done,total){
    const p=pending.get(id);
    if(p&&p.kind==='history'&&total>0)
      $('dataStatus').textContent='Recuperando velas históricas: '+done+'/'+total+
        ' ventanas de Coinbase. Solo se usarán velas cerradas.';
  }
};
function forgetEstimate(){
  analysis=null;lastForecast=null;
  $('estimate').textContent='—';$('relativeChange').textContent='Sin estimación';
  $('trainingCount').textContent='—';$('testingCount').textContent='—';
  $('modelError').textContent='—';$('baselineError').textContent='—';
  $('modelLabel').textContent='M001 · SIN ANALIZAR';
  $('rawM001').textContent='Sin análisis válido para este horizonte.';
}
async function refresh(){
  const epoch=++refreshEpoch,requested=asset,m=minutes;
  const granularity=E.selectResolution(m),cfg=E.HISTORICAL_CONFIG[granularity];
  loading=true;setActionAvailability();
  $('quoteStatus').textContent='CONSULTANDO';
  connection('CARGANDO');
  status('Consultando '+requested+' en Coinbase. Velas de '+cfg.label+
    ' durante '+cfg.days+' días; no se inventarán datos.');
  $('dataStatus').textContent='Consultando fuente pública...';
  const oldValid=history&&historyGranularity===granularity&&
    Date.now()-lastHistoryFetch<180000;
  if(!oldValid){history=null;historyGranularity=null;forgetEstimate()}
  const quotePromises=E.ALLOWED_ASSETS.map(async code=>{
    try{
      const q=await remote({kind:'quote',asset:code});
      if(epoch!==refreshEpoch)return;
      const previous=quotes.get(code);
      if(!(previous?.isLive&&tickerStream.isFresh(code)))
        quotes.set(code,q);
      renderQuotes();
    }catch(error){
      if(epoch!==refreshEpoch)return;
      if(!tickerStream.isFresh(code))
        quotes.delete(code);
      renderQuotes();
    }
  });
  try{
    const rows=oldValid?history:await remote({
      kind:'history',asset:requested,granularity,days:cfg.days
    });
    if(epoch!==refreshEpoch||requested!==asset||m!==minutes)return;
    if(!oldValid){
      history=rows;historyGranularity=granularity;lastHistoryFetch=Date.now();
      forgetEstimate();
    }
    lastHistoryError=null;
    const last=history.at(-1),age=Math.max(0,Math.round(Date.now()/1000-
      (last.time+granularity)));
    $('lastPrice').textContent=money(last.close);
    $('priceTime').textContent='Cierre de vela '+date(last.time+granularity)+
      ' · '+cfg.label+' · '+(age>2.5*granularity?'ANTIGUA':'verificada');
    $('dataStatus').textContent=history.length+' velas cerradas · '+cfg.label+
      ' · '+cfg.days+' días solicitados · del '+date(history[0].time)+
      ' al '+date(last.time+granularity)+
      (age>2.5*granularity?' · datos antiguos':'');
    $('chartComment').textContent='Historial real cargado: '+history.length+
      ' velas de '+cfg.label+'. Para ver un candidato selecciona Proyectar precio.';
    if(age>2.5*granularity){
      connection('DATOS ANTIGUOS');
      status('Fuente retrasada: hay velas, pero no son recientes. No emitir candidatos actuales.','error');
    }else{
      connection('VELAS LISTAS',true);
      status('Historial público descargado y ordenado. Pulsa Analizar o Proyectar.','success');
    }
    evaluateHistory();renderSignals();drawChart();
  }catch(error){
    if(epoch===refreshEpoch){
      connection('HISTORIAL NO DISPONIBLE');
      $('dataStatus').textContent=error.message;
      status('Error al cargar historia: '+error.message+
        '. Se conserva vacío; no se fabrica predicción.','error');
      history=null;historyGranularity=null;forgetEstimate();
      lastHistoryError=String(error.message);
      $('chartComment').textContent='No hay datos de mercado para graficar: '+error.message;
      renderSignals();drawChart();
    }
  }finally{
    await Promise.allSettled(quotePromises);
    if(epoch===refreshEpoch){
      loading=false;setActionAvailability();renderQuotes();
    }
  }
}
/* Flujo principal 3.5. Mismo M001 original: descarga datos y calcula un
 * candidato sólo si los patrones y los cortes temporales son válidos.
 * No altera pesos, no sintetiza series, no permite trading.
 */
function smartMessage(state,badge,summary,explanation,evidence){
  const root=$('smartResult');
  if(!root)return;
  root.dataset.state=state;
  $('smartBadge').textContent=badge;
  $('smartSummary').textContent=summary;
  $('smartExplain').textContent=explanation;
  $('smartEvidence').textContent=evidence??'';
}
async function ensureAnalysisHistory(){
  if(!history||historyGranularity!==E.selectResolution(minutes)||
     Date.now()-lastHistoryFetch>180000)
    await refresh();
  if(!history)throw Error(lastHistoryError??'No llegaron velas verificables.');
  try{return latestObservedOrFail()}
  catch(error){
    // Un historial antiguo no se usa aunque acabemos de consultar el ticker.
    // Sólo se hace un segundo intento si los datos cargados eran antiguos.
    if(history&&Date.now()-lastHistoryFetch<180000){
      // No reutilizar una caché con barras vencidas.
      lastHistoryFetch=0;
      await refresh();
      if(!history)throw Error(lastHistoryError??'No llegaron velas actuales.');
      return latestObservedOrFail();
    }
    throw error;
  }
}
async function runSmart(){
  if(smartBusy||loading)return;
  const chosenAsset=asset,chosenMinutes=minutes;
  smartBusy=true;
  // Una ejecución nueva no debe presentar el candidato anterior como actual.
  lastForecast=null;
  $('estimate').textContent='—';
  $('relativeChange').textContent='Preparando una evaluación nueva';
  drawChart();
  setActionAvailability();
  smartMessage('working','COMPROBANDO FUENTES',
    'Analizando '+chosenAsset.replace('-','/')+'…',
    'Validando velas cerradas, patrones históricos y precio de referencia.',
    'M001 · '+label(chosenMinutes));
  try{
    await ensureAnalysisHistory();
    if(asset!==chosenAsset||minutes!==chosenMinutes)
      throw Error('Cambiaste de activo o plazo durante la consulta; vuelve a analizar.');
    const model=calculateModel();
    if(!model.ready){
      smartMessage('abstained','SIN SOPORTE SUFICIENTE',
        'M001 se abstiene de proyectar.',
        String(model.reason??'No hay análogos independientes suficientes para este plazo.'),
        model.historyCount+' velas · '+model.patterns+' patrones');
      status('M001 se abstuvo. '+String(model.reason),'error');
      return;
    }
    forecastAction(); // El único camino canónico de M001; guarda evidencia y dibuja.
    const forecast=lastForecast;
    if(!forecast)throw Error('No fue posible producir un candidato con datos válidos.');
    const v=model.validation;
    const compared=v.evaluated>0&&Number.isFinite(v.candidateMAE)&&
      Number.isFinite(v.baselineMAE);
    const comparison=!compared?'Sin muestras suficientes para comparar errores.':
      v.candidateMAE<v.baselineMAE?
        'En la prueba retrospectiva, el error M001 fue menor que persistencia.':
        'En la prueba retrospectiva, M001 no superó la referencia de persistencia.';
    smartMessage('complete','CÁLCULO EXPERIMENTAL',
      money(forecast.estimate)+' · '+label(chosenMinutes),
      'Desde '+money(forecast.fromPrice)+' ('+
        percent(forecast.relativeChange)+'). '+model.patterns+
        ' patrones históricos y '+v.evaluated+' casos de evaluación. '+
        comparison+' No es una predicción calibrada ni una recomendación de operar.',
      forecast.sourceType+' · '+label(chosenMinutes));
  }catch(error){
    smartMessage('error','SIN RESULTADO VERIFICABLE','No se emitió un candidato.',
      String(error.message??error)+' · Revisa la fuente o intenta nuevamente.',
      chosenAsset+' · '+label(chosenMinutes));
    status('Análisis no disponible: '+String(error.message??error),'error');
  }finally{smartBusy=false;setActionAvailability()}
}
async function runValidation(){
  if(validationBusy||loading)return;
  validationBusy=true;setActionAvailability();
  $('validationStatus').textContent='Preparando histórico y prueba cronológica…';
  try{
    await ensureAnalysisHistory();
    const m=calculateModel();
    const changed=evaluateHistory();
    show('tests');showTests();renderHistory();
    const v=m.validation;
    $('validationStatus').textContent='Evaluados '+v.evaluated+
      ' casos retrospectivos; '+changed.evaluated+
      ' pronósticos locales nuevos comprobados. Sin ventaja futura garantizada.';
    status('Validación M001 actualizada con barras cerradas.','success');
  }catch(error){
    $('validationStatus').textContent='Validación no disponible: '+error.message;
    status('No fue posible validar: '+error.message,'error');
  }finally{validationBusy=false;setActionAvailability()}
}
function latestObservedOrFail(){
  if(!history||historyGranularity!==E.selectResolution(minutes))
    throw Error('Necesitas pulsar Actualizar para este horizonte.');
  const last=history.at(-1),g=historyGranularity;
  if(Date.now()/1000-(last.time+g)>g*2.5)
    throw Error('Las últimas velas son antiguas; revisa la conexión.');
  return last;
}
function calculateModel(){
  latestObservedOrFail();
  analysis=E.analyze(history,{asset,granularity:historyGranularity,
    horizonMinutes:minutes});
  $('trainingCount').textContent=number(analysis.patterns);
  $('testingCount').textContent=number(analysis.validation.evaluated);
  $('modelError').textContent=money(analysis.validation.candidateMAE);
  $('baselineError').textContent=money(analysis.validation.baselineMAE);
  $('modelLabel').textContent=analysis.ready?'M001 · '+analysis.patterns+' PATRONES':
    'SIN PATRONES SUFICIENTES';
  $('rawM001').textContent=JSON.stringify({
    schema:'laplace-m001-raw-binary64-v1',asset,
    model:analysis,source_close_at:new Date(analysis.dataKnownThrough*1000).toISOString(),
    note:'Datos originales: sin redondeo de pantalla, sin ocultar errores.'
  },null,2);
  renderSignals();updateLivePreview();return analysis;
}
function analyzeAction(){
  try{
    const model=calculateModel();
    if(model.ready)status('M001 analizó '+model.historyCount+' velas, seleccionó '+
      model.patterns+' patrones; test cronológico: '+
      model.validation.evaluated+' casos. No hay garantía de precisión.','success');
    else status('M001 se abstiene: '+model.reason,'error');
    return model;
  }catch(error){status(error.message,'error');return null}
}
function quoteAnchor(last){
  const q=quotes.get(asset),now=Date.now()/1000;
  if(q){
    const providerTime=Date.parse(q.time)/1000;
    if(Number.isFinite(providerTime)&&Math.abs(now-providerTime)<180&&
      Math.abs(now-q.receivedAt/1000)<180)
      return {basePrice:q.price,sourceTime:providerTime,
        sourceType:'ticker spot Coinbase'};
  }
  return {basePrice:last.close,sourceTime:last.time+historyGranularity,
    sourceType:'último cierre histórico (sin spot válido)'};
}
function forecastAction(){
  try{
    const last=latestObservedOrFail();
    const model=analysis&&analysis.asset===asset&&
      analysis.horizonMinutes===minutes?analysis:calculateModel();
    if(!model.ready)throw Error(model.reason);
    const candidate=E.forecast(model,quoteAnchor(last));
    lastForecast=candidate;
    $('rawM001').textContent=JSON.stringify({
      schema:'laplace-m001-raw-binary64-v1',
      model:analysis,forecast:candidate,
      source:'Coinbase Exchange · OHLCV',
      no_display_rounding:true
    },null,2);
    $('estimate').textContent=money(candidate.estimate);
    $('relativeChange').textContent=percent(candidate.relativeChange)+' · '+
      label(minutes)+' · '+model.patterns+' patrones';
    $('chartComment').textContent='Candidato para '+date(candidate.forecastTime)+
      ', usando '+candidate.sourceType+'. Rango de resultados analógicos: '+
      money(candidate.lower)+' – '+money(candidate.upper)+
      '. No son intervalos de confianza calibrados.';
    status('Candidato M001 emitido: '+money(candidate.estimate)+
      ' desde '+money(candidate.fromPrice)+' ('+percent(candidate.relativeChange)+
      '). No se corrigió artificialmente el movimiento.','success');
    saveForecast(candidate,model);
    drawChart();
  }catch(error){lastForecast=null;$('estimate').textContent='—';
    $('relativeChange').textContent='Sin candidato válido';
    $('chartComment').textContent='No se generó proyección: '+error.message;
    status('No se emitió un candidato: '+error.message,'error');drawChart()}
}
function saveForecast(candidate,model){
  const existing=log.find(x=>x.status==='pending'&&x.asset===asset&&
    x.minutes===minutes&&x.sourceTime===candidate.sourceTime);
  if(existing)return;
  log.push({id:String(Date.now())+'-'+String(log.length),asset,minutes,
    granularity:historyGranularity,issuedAt:Date.now()/1000,
    sourceTime:candidate.sourceTime,targetAt:candidate.forecastTime,
    sourceType:candidate.sourceType,
    estimate:candidate.estimate,baseline:candidate.fromPrice,
    low:candidate.lower,high:candidate.upper,patterns:model.patterns,
    model:'M001_analogos',status:'pending'});
  log=log.slice(-250);persist();
}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(log))}catch(error){}}
function evaluateHistory(){
  if(!history||!historyGranularity)return {evaluated:0,pending:log.length};
  let evaluated=0,pendingCount=0;
  for(const f of log){
    if(f.status!=='pending'||f.asset!==asset||
      f.granularity!==historyGranularity){if(f.status==='pending')pendingCount++;continue}
    if(Date.now()/1000<f.targetAt){pendingCount++;continue}
    // Resultado de cierre posterior al objetivo, nunca un precio inventado
    // al segundo exacto; distancia temporal máxima: una barra.
    const bar=history.find(b=>b.time+historyGranularity>=f.targetAt&&
      b.time+historyGranularity<=f.targetAt+historyGranularity);
    if(!bar){pendingCount++;continue}
    f.actual=bar.close;f.observedCloseAt=bar.time+historyGranularity;
    f.modelError=Math.abs(f.estimate-f.actual);
    f.baselineError=Math.abs(f.baseline-f.actual);
    f.status='verified';evaluated++;
  }
  if(evaluated)persist();
  return {evaluated,pending:pendingCount};
}
function evaluateAction(){
  try{
    const current=calculateModel();
    const r=evaluateHistory();
    show('tests');showTests();renderHistory();
    status('Evaluación histórica M001: '+current.validation.evaluated+
      ' objetivos no solapados; MAE candidato '+
      money(current.validation.candidateMAE)+' frente a persistencia '+
      money(current.validation.baselineMAE)+'. Registros futuros verificados ahora: '+
      r.evaluated+'.','success');
  }catch(error){status('Evaluación no disponible: '+error.message,'error')}
}
function testAction(){
  const m=analyzeAction();if(!m)return;
  show('tests');showTests();
  status('Se muestra prueba cronológica fuera de muestra disponible: '+
    m.validation.evaluated+' casos. No atribuye ventaja prospectiva.','success');
}
function showTests(){
  const target=$('testResults');target.replaceChildren();
  const intro=document.createElement('p');
  intro.textContent='M001 original restaurado: cinco rasgos, distancia normalizada, retorno '+
    'logarítmico ponderado. Prueba walk-forward: cada decisión usa únicamente '+
    'velas conocidas antes de su resultado; objetivos evaluados sin solaparse.';
  target.appendChild(intro);
  if(!analysis){const note=document.createElement('p');
    note.textContent='Sin análisis. Regresa a Mercado y pulsa Actualizar y Analizar.';
    target.appendChild(note);return}
  const m=analysis,stats=document.createElement('div');stats.className='stats';
  const rows=[
    ['Activo',m.asset],['Horizonte',label(m.horizonMinutes)],
    ['Resolución',E.HISTORICAL_CONFIG[m.granularity].label],
    ['Velas reales',number(m.historyCount)],
    ['Patrones usados',number(m.patterns)],
    ['Estado',m.ready?'Candidato experimental':'Abstención: '+m.reason],
    ['Pruebas retrospectivas',number(m.validation.evaluated)],
    ['MAE candidato',money(m.validation.candidateMAE)],
    ['MAE persistencia',money(m.validation.baselineMAE)],
    ['Skill vs persistencia',percent(m.validation.skill)],
    ['Direcciones acertadas',m.validation.evaluated?
      m.validation.correctDirections+'/'+m.validation.evaluated:'Sin evaluación'],
    ['Datos mundiales en este modelo','No: EF002 observado por separado']
  ];
  for(const [k,v] of rows){
    const div=document.createElement('div'),small=document.createElement('span'),
      strong=document.createElement('strong');
    small.textContent=k;strong.textContent=String(v);
    div.append(small,strong);stats.appendChild(div);
  }
  target.appendChild(stats);
  const foot=document.createElement('p');foot.className='fineprint';
  foot.textContent='Un skill positivo de una muestra no demuestra ventaja futura. '+
    'Se publican errores negativos, fallos y abstenciones sin ocultarlos.';
  target.appendChild(foot);
}
function renderSignals(){
  const out=$('signalRows');out.replaceChildren();
  const g=historyGranularity,rows=history;
  const current=rows&&g?E.featureAt(rows,rows.length-1,g):null;
  const data=[
    ['Precio ticker público',quotes.get(asset)?money(quotes.get(asset).price):
      'No disponible',Boolean(quotes.get(asset))],
    ['Velas OHLCV',rows?number(rows.length)+' cerradas · '+
      E.HISTORICAL_CONFIG[g].label:'No cargadas',Boolean(rows)],
    ['Retorno de 3 velas',current?percent(Math.exp(current[0])-1):'Faltan velas',Boolean(current)],
    ['Retorno de 1 vela',current?percent(Math.exp(current[1])-1):'Faltan velas',Boolean(current)],
    ['Volatilidad RMS (6 velas)',current?percent(current[2]):'Faltan velas',Boolean(current)],
    ['Rango relativo (3 velas)',current?percent(current[3]):'Faltan velas',Boolean(current)],
    ['Volumen relativo (6 velas)',current?number(current[4])+' ×':'Faltan velas',Boolean(current)],
    ['Archivo global EF002',W?number(W.states_count??W.states)+
      ' estados fechados':'No empaquetado',Boolean(W)],
    ['EF004 en el móvil','No entrenado dentro de esta APK; ver estado en servidor',false],
    ['Órdenes financieras','Deshabilitadas por diseño',false]
  ];
  for(const [title,description,ok] of data){
    const row=document.createElement('div');row.className='signal-row';
    const l=document.createElement('div'),n=document.createElement('strong'),
      d=document.createElement('small'),mark=document.createElement('span');
    n.textContent=title;d.textContent=description;
    mark.textContent=ok?'●':'—';mark.className='check';
    if(!ok)mark.style.color='#8294a9';
    l.append(n,d);row.append(l,mark);out.appendChild(row);
  }
}
function renderWorld(){
  $('worldStates').textContent=W?number(W.states_count??W.states):'—';
  $('worldDomains').textContent=W?number(W.domains):'—';
  $('worldTime').textContent=W?.captured_at?
    'Última captura pública verificada: '+new Date(W.captured_at).toLocaleString('es-MX')+
      '. No son cotizaciones en vivo. Archivo SHA256 '+W.capture_sha256.slice(0,16)+'…':
    'El paquete no incluyó captura EF002.';
  $('worldSourceCount').textContent=W?number(W.source_count):'—';
  $('worldCaptureCount').textContent=W?number(W.archive_manifests_count):'—';
  const hist=$('worldHistory');
  hist.textContent=W?.history?.length?
    'Capturas verificadas en el APK: '+W.history.map(x=>
      new Date(x.captured_at).toLocaleString('es-MX')+
      ' ('+x.states+' estados)').join(' · '):'Sin historial de capturas.';
  const groups=$('worldGroups');groups.replaceChildren();
  for(const group of W?.groups??[]){
    const row=document.createElement('div');row.className='group-row';
    const l=document.createElement('div'),k=document.createElement('strong'),
      d=document.createElement('small'),cnt=document.createElement('span');
    k.textContent=group.group;d.textContent=group.status;
    cnt.textContent=group.signals+' señales';cnt.className='outline-tag';
    l.append(k,d);row.append(l,cnt);groups.appendChild(row);
  }
  renderWorldObservations();renderCapabilities();
}
function renderWorldObservations(){
  const target=$('worldObservations');target.replaceChildren();
  const states=Array.isArray(W?.states)?W.states:[];
  const query=$('worldSearch').value.toLocaleLowerCase('es-MX').trim();
  const matches=states.filter(x=>(x.id+' '+x.domain+' '+x.variable+' '+x.unit)
    .toLocaleLowerCase('es-MX').includes(query));
  $('worldMatches').textContent=matches.length+' estados auténticos coincidentes; '+
    'se muestran '+Math.min(matches.length,worldVisibleLimit)+'. Valores de la captura archivada.';
  for(const observation of matches.slice(0,worldVisibleLimit)){
    const row=document.createElement('div');row.className='world-observation';
    const key=document.createElement('strong'),value=document.createElement('span'),
      meta=document.createElement('small');
    key.textContent=observation.domain+' · '+observation.variable;
    value.textContent=number(observation.value)+' '+observation.unit;
    meta.textContent='Observado '+observation.observed_at+' · conocido '+
      observation.known_at+' · '+observation.id;
    row.append(key,value,meta);target.appendChild(row);
  }
  $('worldShowMore').hidden=matches.length<=worldVisibleLimit;
  $('worldShowMore').textContent='Mostrar más · '+
    (matches.length-worldVisibleLimit>0?matches.length-worldVisibleLimit:0)+' restantes';
}
function renderCapabilities(){
  const output=$('capabilityRows');if(!output)return;
  output.replaceChildren();
  if(!F?.resumirCapacidades){
    $('capabilitySummary').textContent='El inventario canónico no está empaquetado.';
    $('capabilityRaw').textContent='Sin inventario verificable';return;
  }
  const report=F.resumirCapacidades({world:W,
    executed:{xn01:!!xn01Result,f001:!!integralResult,m001Diary:log.length},
    asOf:new Date().toISOString()});
  const c=report.counts;
  $('capabilitySummary').textContent=report.items.length+
    ' grupos · '+c.executed+' ejecutados · '+c.observed_archive+
    ' observados en archivo · '+c.partial+' parciales · '+c.abstained+
    ' abstenciones · '+c.not_executed+' sin ejecutar · '+c.not_observed+
    ' sin observación.';
  const ef=W?.ef004_report;
  $('ef004Report').textContent=ef?
    'EF004 · '+ef.status+' ('+(ef.reason??'sin motivo')+
      ') · '+ef.contiguous_captures+' capturas contiguas · train '+
      ef.observed_training_pairs+' / '+ef.required_training_pairs+
      ', validación '+ef.observed_validation_pairs+' / '+
      ef.required_validation_pairs+
      ' · informe '+ef.as_of+' [laplace-modelos]':
    'EF004: ningún informe del mismo archivo disponible en esta compilación; no se asume que entrenó.';
  $('capabilityRaw').textContent=JSON.stringify(report,null,2);
  const query=$('capabilityQuery').value.toLocaleLowerCase('es-MX').trim();
  const filter=$('capabilityFilter')?.value??'all';
  const names={executed:'EJECUTADO',observed_archive:'OBSERVADO EN ARCHIVO',
    partial:'PARCIAL',abstained:'ABSTENCIÓN',
    not_executed:'NO EJECUTADO',not_observed:'NO OBSERVADO'};
  const matching=report.items.filter(x=>
    (x.id+' '+x.key+' '+x.title+' '+x.source+' '+x.reason).
      toLocaleLowerCase('es-MX').includes(query)).filter(x=>
      filter==='all'||(filter==='usable'&&
        ['executed','observed_archive'].includes(x.state))||
        (filter==='pending'&&
          ['partial','not_executed','not_observed','abstained'].includes(x.state)));
  if(!matching.length){
    const p=document.createElement('p');
    p.textContent='No coincide ninguna capacidad con la búsqueda.';
    output.appendChild(p);
  }
  for(const x of matching){
    const row=document.createElement('div');row.className='signal-row';
    const left=document.createElement('div'),head=document.createElement('strong'),
      detail=document.createElement('small'),source=document.createElement('small'),
      state=document.createElement('span');
    head.textContent=x.id+' · '+x.title;
    detail.textContent=x.reason;
    source.textContent='Código: '+x.source;
    state.textContent=names[x.state]??x.state;
    state.className='outline-tag';
    left.append(head,detail,source);row.append(left,state);output.appendChild(row);
  }
}
function drawChart(){
  const canvas=$('forecastChart');if(!canvas)return;
  const r=canvas.getBoundingClientRect(),w=Math.max(280,r.width||340),h=230;
  const ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);
  ctx.fillStyle='#071727';ctx.fillRect(0,0,w,h);
  if(!history?.length){
    ctx.fillStyle='#a9bfd1';ctx.textAlign='center';ctx.font='12px system-ui';
    ctx.fillText('Sin velas: pulsa Actualizar',w/2,h/2);return;
  }
  const past=history.slice(-75),vals=past.map(x=>x.close);
  if(lastForecast){
    vals.push(lastForecast.estimate,lastForecast.lower,lastForecast.upper);
  }
  let min=Math.min(...vals),max=Math.max(...vals),range=Math.max(1e-7,max-min);
  min-=range*.10;max+=range*.10;
  const left=54,right=w-14,top=17,bottom=h-26,
    span=right-left,spanPast=lastForecast?span*.72:span;
  const X=i=>left+(i/Math.max(1,past.length-1))*spanPast;
  const Y=v=>top+(max-v)/(max-min)*(bottom-top);
  for(let i=0;i<5;i++){
    const y=top+(bottom-top)*i/4;
    ctx.strokeStyle='#28465f';ctx.lineWidth=1;ctx.beginPath();
    ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    ctx.fillStyle='#8ba4b8';ctx.font='10px system-ui';ctx.textAlign='right';
    ctx.fillText(((max-min)*(1-i/4)+min).toFixed(0),left-7,y+3);
  }
  ctx.strokeStyle='#d8eaff';ctx.lineWidth=2;ctx.beginPath();
  past.forEach((p,i)=>i?ctx.lineTo(X(i),Y(p.close)):ctx.moveTo(X(i),Y(p.close)));
  ctx.stroke();
  if(lastForecast){
    const endX=right,beginX=X(past.length-1),startY=Y(lastForecast.fromPrice);
    ctx.setLineDash([4,6]);ctx.strokeStyle='#55d2f4';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(beginX,startY);
    ctx.lineTo(endX,Y(lastForecast.estimate));ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='#526fcf';ctx.lineWidth=5;ctx.beginPath();
    ctx.moveTo(endX,Y(lastForecast.lower));ctx.lineTo(endX,Y(lastForecast.upper));ctx.stroke();
    ctx.fillStyle='#b6f3ff';ctx.beginPath();ctx.arc(endX,Y(lastForecast.estimate),4,0,2*Math.PI);ctx.fill();
  }
  ctx.textAlign='left';ctx.fillStyle='#92bed7';ctx.font='10px system-ui';
  ctx.fillText('OBSERVADO',left,bottom+18);
  if(lastForecast){ctx.textAlign='right';
    ctx.fillText('OBJETIVO '+label(minutes),right,bottom+18)}
}
function renderHistory(){
  const out=$('history');out.replaceChildren();
  if(!log.length){
    const p=document.createElement('p');p.textContent='Sin candidatos guardados.';
    out.appendChild(p);return;
  }
  for(const f of log.slice().reverse().slice(0,35)){
    const row=document.createElement('div');row.className='history-row';
    const l=document.createElement('div'),n=document.createElement('strong'),
      s=document.createElement('small'),v=document.createElement('span');
    n.textContent=f.asset+' · '+label(f.minutes)+' · '+money(f.estimate);
    s.textContent='Emitido '+date(f.issuedAt)+' · objetivo '+date(f.targetAt)+
      (f.status==='verified'?' · real '+money(f.actual)+
        ', error '+money(f.modelError):'');
    v.className='outline-tag';
    v.textContent=f.status==='verified'?'Evaluado':'Pendiente';
    l.append(n,s);row.append(l,v);out.appendChild(row);
  }
}
function changeAsset(next){
  if(!E.ALLOWED_ASSETS.includes(next)||next===asset)return;
  asset=next;$('asset').value=next;
  history=null;historyGranularity=null;lastHistoryFetch=0;forgetEstimate();
  xn01Result=null;renderXN01();
  $('xn01Status').textContent=asset==='BTC-USD'?'XN01 listo para consultar velas cerradas.':
    'XN01 original bursátil no está integrado; BTC sí está disponible.';
  smartMessage('idle','ACTIVO SELECCIONADO','Listo para '+asset.replace('-','/')+'.',
    'El próximo cálculo utilizará velas de este activo, sin mezclar mercados.',
    'PLAZO · '+label(minutes));
  renderQuotes();renderSignals();drawChart();updateLiveBanner();drawLiveChart();updateLivePreview();
  refresh();
}
for(const b of document.querySelectorAll('[data-tab]'))
  b.addEventListener('click',()=>show(b.dataset.tab));
for(const b of document.querySelectorAll('[data-minutes]'))
  b.addEventListener('click',()=>useHorizon(b.dataset.minutes));
$('horizonSelect').addEventListener('change',()=>useHorizon($('horizonSelect').value));
for(const b of document.querySelectorAll('[data-quote-asset]'))
  b.addEventListener('click',()=>changeAsset(b.dataset.quoteAsset));
$('asset').addEventListener('change',()=>changeAsset($('asset').value));
$('refresh').addEventListener('click',refresh);
$('integralRun').addEventListener('click',runIntegral);
$('train').addEventListener('click',analyzeAction);
$('test').addEventListener('click',testAction);
$('evaluate').addEventListener('click',evaluateAction);
$('forecast').addEventListener('click',forecastAction);
$('xn01Run').addEventListener('click',runXN01);
$('worldSearch').addEventListener('input',()=>{
  worldVisibleLimit=100;renderWorldObservations();
});
$('worldShowMore').addEventListener('click',()=>{
  worldVisibleLimit+=100;renderWorldObservations();
});
$('capabilityQuery').addEventListener('input',renderCapabilities);
$('capabilityFilter').addEventListener('change',renderCapabilities);
$('capabilityRefresh').addEventListener('click',()=>{
  $('capabilityQuery').value='';
  $('capabilityFilter').value='all';
  renderCapabilities();
});
$('jumpSignals').addEventListener('click',()=>{show('signals');renderSignals()});
$('jumpValidation').addEventListener('click',()=>show('tests'));
$('smartRun').addEventListener('click',runSmart);
$('validationRun').addEventListener('click',runValidation);
$('clearHistory').addEventListener('click',()=>{
  log=[];persist();renderHistory();
  status('Registro local limpiado. No se alteraron datos del proveedor.','success');
});
window.addEventListener('resize',drawChart);
$('liveToggle').addEventListener('click',toggleLive);
useHorizon(15);renderQuotes();renderWorld();renderSignals();renderXN01();
renderHistory();drawChart();connection('SIN CONSULTAR');
updateLiveBanner();drawLiveChart();updateLivePreview();
if(window.LaplaceLiveBridge){
  try{window.LaplaceLiveBridge.start();}
  catch(error){
    tickerStream.statusUpdate({type:'status',state:'retrying',
      message:'Error de conexión de stream'});
    updateLiveBanner();
  }
}else{
  liveEnabled=false;
  $('liveToggle').disabled=true;
  tickerStream.statusUpdate({type:'status',state:'off',
    message:'Streaming solo disponible dentro de la APK Android.'});
  updateLiveBanner();
}
window.setInterval(()=>{
  updateLiveBanner();
  if(document.querySelector('#panel')?.hidden===false)drawLiveChart();
  renderQuotes();updateLivePreview();
},2500);
window.LaplaceUIHealth={initialized:true,version:'3.5',tabs:5,
  actions:['smartRun','jumpValidation','validationRun','refresh','forecast','train',
    'test','evaluate','integralRun','xn01Run','liveToggle','clearHistory',
    'pdeSolve','graphSolve','capabilityRefresh','capabilityFilter',
    'worldShowMore','jumpSignals']};
setTimeout(refresh,200);
})();
