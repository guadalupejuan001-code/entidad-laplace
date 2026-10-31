/* LAPLACE Android v2 — panel de control M001 restaurado + EF002 verificable.
 * Una sola fuente de verdad: precio público + velas cerradas Coinbase.
 * Cada botón funciona; no se confunde el valor futuro con un resultado real.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const E=window.LaplaceMath,W=window.LAPLACE_WORLD??null;
const F=window.LaplaceIntegral;
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
let integralResult=null,integralBusy=false;
let loading=false,sequence=0,latestTest=null;
const quotes=new Map(),pending=new Map();
let log=[];
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
function show(page){
  
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
    p.textContent='Sin ejecución. Pulsa Consultar y calcular para obtener datos de BTC.';
    table.appendChild(p);return;
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
  const groups=[
    ['F001 multiescala',fusion.horizons.length+' horizontes calculados'],
    ['M001', 'Análogos históricos en F001; ver error por horizonte'],
    ['Laplace (ecuación)',domain],
    ['EF001 / EF002',audit.valid_at_cut+' estados públicos, fecha '+(audit.capture_at??'no disponible')],
    ['C001 ETF SEC',audit.etf_fund_flow_status+' · '+audit.etf_fund_flow_signals+' señales'],
    ['EF004', 'Faltan suficientes transiciones independientes para usarlo en Android'],
    ['U002/U003/U004',audit.domains.length+' dominios conocidos; cobertura no universal'],
    ['D001/D002 B001 K001 O001','Se conservan en el archivo si la captura los observó; revisar Mundo'],
    ['X002 / XN01 / XI-Ether','No ejecutados por esta APK; se requiere backend nativo verificable'],
    ['Datos fallidos',errors.length?errors.join(' · '):'Ninguna consulta de velas falló']
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
  integralBusy=true;$('integralRun').disabled=true;
  $('integralStatus').textContent='Consultando F001: BTC + 5m/14 días + 1h/45 días + 1d/1000 días.';
  const tasks=[
    ...[300,3600,86400].map(granularity=>
      remote({kind:'history',asset:'BTC-USD',granularity,
        days:F.HISTORIA_REQUERIDA[granularity].days})),
    remote({kind:'quote',asset:'BTC-USD'})
  ];
  try{
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
    $('integralStatus').textContent='F001 completado con '+
      fusion.horizons.filter(x=>x.price_candidate!==null).length+
      ' candidatos de '+fusion.horizons.length+' horizontes. Campo Laplace: '+
      field.status+'. '+problems.length+' fuentes incompletas. No se confundió '+
      'el archivo mundial con información en vivo.';
    show('integral');renderIntegral();
  }catch(error){
    $('integralStatus').textContent='No se emitió cálculo integral: '+error.message;
  }finally{
    integralBusy=false;$('integralRun').disabled=false;
  }
}

for(const b of document.querySelectorAll('[data-tab]'))
    b.setAttribute('aria-current',b.dataset.tab===page?'page':'false');
  for(const section of document.querySelectorAll('.tabpage'))
    section.hidden=section.id!==page;
  if(page==='world')renderWorld();
  if(page==='integral')renderIntegral();
  if(page==='tests'){showTests();renderHistory()}
  if(page==='panel')setTimeout(drawChart,60);
}
function renderQuotes(){
  const short={'BTC-USD':'BTC','ETH-USD':'ETH','SOL-USD':'SOL'};
  let found=0;
  for(const code of E.ALLOWED_ASSETS){
    const q=quotes.get(code),id=short[code],selected=code===asset;
    const button=document.querySelector('[data-quote-asset="'+code+'"]');
    if(button){button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected))}
    $('quote'+id).textContent=q?money(q.price):'—';
    $('quote'+id+'Status').textContent=q?'Ticker público':'Sin conexión actual';
    if(q)found++;
  }
  $('quoteStatus').textContent=found+'/3 PRECIOS';
  const q=quotes.get(asset);
  $('quoteTime').textContent=q?
    asset+' · Coinbase · ticker '+q.time+' · recibido '+date(q.receivedAt/1000)+
      ' · NO constituye una predicción':
    'Sin ticker disponible para '+asset+'. No se usarán precios inventados.';
}
function useHorizon(value){
  const m=Number(value);
  if(!E.HORIZONS.some(h=>h.minutes===m))return;
  const previous=historyGranularity;
  minutes=m;analysis=null;lastForecast=null;
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
    $('priceTime').textContent='Selecciona Actualizar para cambiar de resolución';
    status('Horizonte cambiado. Es necesario consultar velas de '+E.HISTORICAL_CONFIG[E.selectResolution(m)].label+'.');
  }
  renderSignals();drawChart();
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
      else throw Error('Solicitud desconocida.');
    }catch(error){
      clearTimeout(timer);pending.delete(id);reject(error);
    }
  });
}
window.LaplaceMobile={
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
}
async function refresh(){
  const epoch=++refreshEpoch,requested=asset,m=minutes;
  const granularity=E.selectResolution(m),cfg=E.HISTORICAL_CONFIG[granularity];
  loading=true;$('refresh').disabled=true;
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
      quotes.set(code,q);renderQuotes();
    }catch(error){
      if(epoch!==refreshEpoch)return;
      quotes.delete(code);renderQuotes();
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
    const last=history.at(-1),age=Math.max(0,Math.round(Date.now()/1000-
      (last.time+granularity)));
    $('lastPrice').textContent=money(last.close);
    $('priceTime').textContent='Cierre de vela '+date(last.time+granularity)+
      ' · '+cfg.label+' · '+(age>2.5*granularity?'ANTIGUA':'verificada');
    $('dataStatus').textContent=history.length+' velas cerradas · '+cfg.label+
      ' · '+cfg.days+' días solicitados · del '+date(history[0].time)+
      ' al '+date(last.time+granularity)+
      (age>2.5*granularity?' · datos antiguos':'');
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
      renderSignals();drawChart();
    }
  }finally{
    await Promise.allSettled(quotePromises);
    if(epoch===refreshEpoch){
      loading=false;$('refresh').disabled=false;renderQuotes();
    }
  }
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
  renderSignals();return analysis;
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
    status('No se emitió un candidato: '+error.message,'error')}
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
  renderWorldObservations();
}
function renderWorldObservations(){
  const target=$('worldObservations');target.replaceChildren();
  const states=Array.isArray(W?.states)?W.states:[];
  const query=$('worldSearch').value.toLocaleLowerCase('es-MX').trim();
  const matches=states.filter(x=>(x.id+' '+x.domain+' '+x.variable+' '+x.unit)
    .toLocaleLowerCase('es-MX').includes(query));
  $('worldMatches').textContent=matches.length+' estados auténticos coincidentes; '+
    'se muestran los primeros 40. Valores de la captura archivada.';
  for(const observation of matches.slice(0,40)){
    const row=document.createElement('div');row.className='world-observation';
    const key=document.createElement('strong'),value=document.createElement('span'),
      meta=document.createElement('small');
    key.textContent=observation.domain+' · '+observation.variable;
    value.textContent=number(observation.value)+' '+observation.unit;
    meta.textContent='Disponible '+observation.known_at+' · '+observation.id;
    row.append(key,value,meta);target.appendChild(row);
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
  renderQuotes();renderSignals();drawChart();
  refresh();
}
for(const b of document.querySelectorAll('[data-tab]'))
  b.addEventListener('click',()=>show(b.dataset.tab));
for(const b of document.querySelectorAll('[data-minutes]'))
  b.addEventListener('click',()=>useHorizon(b.dataset.minutes));
for(const b of document.querySelectorAll('[data-quote-asset]'))
  b.addEventListener('click',()=>changeAsset(b.dataset.quoteAsset));
$('asset').addEventListener('change',()=>changeAsset($('asset').value));
$('refresh').addEventListener('click',refresh);
$('integralRun').addEventListener('click',runIntegral);
$('train').addEventListener('click',analyzeAction);
$('test').addEventListener('click',testAction);
$('evaluate').addEventListener('click',evaluateAction);
$('forecast').addEventListener('click',forecastAction);
$('worldSearch').addEventListener('input',renderWorldObservations);
$('clearHistory').addEventListener('click',()=>{
  log=[];persist();renderHistory();
  status('Registro local limpiado. No se alteraron datos del proveedor.','success');
});
window.addEventListener('resize',drawChart);
useHorizon(15);renderQuotes();renderWorld();renderSignals();
renderHistory();drawChart();connection('SIN CONSULTAR');
setTimeout(refresh,200);
})();
