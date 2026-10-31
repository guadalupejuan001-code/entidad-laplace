'use strict';
/* LAPLACE — interfaz de consulta. Sin datos ficticios ni predictor en el navegador. */
const $=id=>document.getElementById(id);
const formatoMoneda=new Intl.NumberFormat('es-MX',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const formatoEuro=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'});
const formatoNumero=new Intl.NumberFormat('es-MX',{maximumFractionDigits:4});
const formatoFecha=new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'medium'});
const dinero=n=>typeof n==='number'&&Number.isFinite(n)?formatoMoneda.format(n):'—';
const euros=n=>typeof n==='number'&&Number.isFinite(n)?formatoEuro.format(n):'—';
const numero=n=>typeof n==='number'&&Number.isFinite(n)?formatoNumero.format(n):'—';
const fecha=valor=>valor&&Number.isFinite(Date.parse(valor))?formatoFecha.format(new Date(valor)):'—';
const porcentaje=n=>typeof n==='number'&&Number.isFinite(n)?numero(n)+' %':'—';
const texto=(id,valor)=>{$(id).textContent=valor??'—'};
let estado=null,cargando=false;
function alerta(mensaje){
  if(mensaje&&/fetch|network|timeout|aborted/i.test(mensaje))mensaje='La consulta no pudo completarse. Revisa la conexión y vuelve a intentarlo; la última lectura válida se conserva.';
  const lugar=$('aviso');lugar.hidden=!mensaje;lugar.textContent=mensaje||'';
}
function irAVista(nombre){
  for(const boton of document.querySelectorAll('.pestana')){
    const activo=boton.dataset.vista===nombre;
    boton.classList.toggle('activo',activo);
    if(activo)boton.setAttribute('aria-current','page');else boton.removeAttribute('aria-current');
  }
  for(const panel of document.querySelectorAll('.vista'))panel.hidden=panel.id!=='vista-'+nombre;
  if(nombre==='mercado')trazar(serieHistorica(estado?.ultima),estado?.ultima?.instrument_15m);
}
const grafico=$('grafico'),NS='http://www.w3.org/2000/svg';
function svg(nodo,propiedades,textoDentro){
  const el=document.createElementNS(NS,nodo);
  for(const [clave,valor] of Object.entries(propiedades??{}))el.setAttribute(clave,String(valor));
  if(textoDentro!==undefined)el.textContent=String(textoDentro);
  grafico.append(el);return el;
}
function sinGrafica(mensaje){
  grafico.replaceChildren();
  svg('text',{x:400,y:120,'text-anchor':'middle',fill:'#9baab9','font-size':13},mensaje);
}
function trazar(serie,instrumento){
  const ancho=Math.max(300,Math.round(grafico.getBoundingClientRect().width)||800);
  const g=LaplaceGrafica.calcular(serie,instrumento,{ancho,alto:285,maxPuntos:ancho<550?12:36});
  grafico.replaceChildren();grafico.setAttribute('viewBox','0 0 '+ancho+' 285');
  if(!g){
    svg('text',{x:ancho/2,y:140,'text-anchor':'middle',fill:'#9baab9','font-size':13},
      'Sin cotización válida para representar.');return;
  }
  const reloj=new Intl.DateTimeFormat('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false});
  const precioEje=new Intl.NumberFormat('es-MX',{maximumFractionDigits:0});
  for(const fila of g.rejilla){
    svg('line',{x1:g.izquierda,x2:g.derecha,y1:fila.y,y2:fila.y,stroke:'#2b3a48','stroke-dasharray':'4 6'});
    svg('text',{x:g.izquierda-8,y:fila.y+4,'text-anchor':'end',fill:'#a5b4c2','font-size':12},precioEje.format(fila.valor));
  }
  svg('text',{x:g.izquierda-8,y:18,'text-anchor':'end',fill:'#a5b4c2','font-size':11},'USD');
  for(const marca of g.marcas)svg('text',{x:marca.x,y:g.abajo+23,
    'text-anchor':marca.x===g.izquierda?'start':marca.x===g.derecha?'end':'middle',
    fill:'#a5b4c2','font-size':12},reloj.format(new Date(marca.tiempo)));
  const camino=g.puntos.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
  svg('path',{d:camino,fill:'none',stroke:'#e1ebf3','stroke-width':2.25,'data-tramo':'observado'});
  svg('line',{x1:g.ancla.x,x2:g.ancla.x,y1:24,y2:g.abajo,stroke:'#668296','stroke-dasharray':'3 5'});
  if(g.intervalo){
    svg('line',{x1:g.fin.x,x2:g.fin.x,y1:g.intervalo.alto,y2:g.intervalo.bajo,stroke:'#dcb878','stroke-width':5,'stroke-opacity':.45});
  }
  svg('path',{d:'M '+g.ancla.x.toFixed(2)+' '+g.ancla.y.toFixed(2)+' L '+g.fin.x.toFixed(2)+' '+g.fin.y.toFixed(2),
    stroke:'#dcb878','stroke-width':2.25,'stroke-dasharray':'7 6',fill:'none','data-tramo':'estimado',
    'data-precio-origen':g.ancla.precio,'data-fecha-origen':new Date(g.cotizacion).toISOString(),
    'data-fecha-objetivo':new Date(g.objetivo).toISOString()});
  svg('circle',{cx:g.ancla.x,cy:g.ancla.y,r:4,fill:'#e1ebf3'});
  svg('circle',{cx:g.fin.x,cy:g.fin.y,r:4,fill:'#dcb878'});
  svg('text',{x:g.izquierda,y:18,fill:'#9baab9','font-size':12},g.cierres_visibles+' cierres y cotización');
  grafico.setAttribute('aria-label','Gráfico con fechas reales. Cotización '+dinero(g.ancla.precio)+
    ' a las '+fecha(instrumento.observed_at)+'. Estimación '+dinero(g.fin.precio)+' para '+fecha(instrumento.target_at)+'.');
  texto('graficaDetalle','Cotización: '+fecha(instrumento.observed_at)+' · Objetivo: '+fecha(instrumento.target_at)+
    ' · Eje horizontal en hora local.');
}
function serieHistorica(c){
  const precios=c?.instrument_15m?.serie_cierres_5m;
  if(Array.isArray(precios)&&precios.length>=2){
    return precios.filter(p=>typeof p.precio==='number').map(p=>({fecha:p.fecha,precio:p.precio}));
  }
  return (estado?.historial??[]).filter(x=>typeof x.precio==='number')
    .map(x=>({fecha:x.cotizacion_en??x.fecha,precio:x.precio}));
}
function estadoModelo(m){
  if(!m)return 'Pendiente de cálculo.';
  const mapa={
    referencia_sin_ventaja_validada:'Sin mejora demostrada: se conserva el precio actual.',
    modelo_condicional_exploratorio:'Proyección experimental: mejora en la muestra corta.',
    barras_incompletas:'Faltan velas: se utiliza la referencia.',
    evidencia_intradia_insuficiente:'Historial insuficiente para un modelo.'
  };
  return mapa[m.status]??'Resultado sin clasificación verificada.';
}
function fuente(nombre,entrada){
  const fila=document.createElement('div');fila.className='fuente';
  const info=document.createElement('div');
  const titulo=document.createElement('strong');titulo.textContent=nombre;info.append(titulo);
  const subtitulo=document.createElement('small');
  subtitulo.textContent=entrada?.status==='observed'?'Fuente recibida':
    'No se recibió una lectura válida; detalle técnico en la exportación.';
  info.append(subtitulo);fila.append(info);
  const estadoVisual=document.createElement('span');
  estadoVisual.className='estado-fuente'+(entrada?.status==='observed'?'':' no');
  estadoVisual.textContent=entrada?.status==='observed'?'Registrada':'Sin datos';
  fila.append(estadoVisual);return fila;
}
function llenarFactores(c){
  const mercado=c?.measured_market??[];
  const get=n=>mercado.find(x=>x.name===n);
  const book=get('book'),trades=get('trades'),eth=get('eth'),euro=get('euro');
  const kp=c?.measured_space_weather;
  texto('presion',book?.status==='observed'?
    numero(book.data.top10_notional_imbalance):'—');
  texto('libroEstado',book?.status==='observed'?
    'Desequilibrio entre los 10 mejores niveles; no es una predicción.':
    'Libro de órdenes no disponible');
  texto('profCompra',dinero(book?.data?.bid_depth_usd_top10));
  texto('profVenta',dinero(book?.data?.ask_depth_usd_top10));
  texto('spread',typeof book?.data?.spread_bps==='number'?
    numero(book.data.spread_bps)+' puntos básicos':'—');
  texto('operaciones',numero(trades?.data?.observed_trade_count));
  texto('operacionesEstado',trades?.status==='observed'?
    'Muestra parcial según el lado creador de mercado.':
    'Sin información de operaciones');
  texto('volCompra',dinero(trades?.data?.maker_buy_notional_usd));
  texto('volVenta',dinero(trades?.data?.maker_sell_notional_usd));
  texto('eth',dinero(eth?.data?.price));
  texto('btceur',euros(euro?.data?.price));
  texto('kp',numero(kp?.data?.value));
  texto('kpEstado',kp?.status==='observed'?
    'Lectura de '+fecha(kp.data.observed_at):'Sin datos de NOAA');
  const fuentes=$('fuentes');fuentes.replaceChildren();
  const todas=[['Coinbase · BTC/USD', {status:c?'observed':'unavailable'}],
    ['Coinbase · Libro de órdenes',book],['Coinbase · Operaciones',trades],
    ['Coinbase · ETH/USD',eth],['Coinbase · BTC/EUR',euro],
    ['NOAA · Índice geomagnético',kp]];
  for(const [nombre,registro] of todas)fuentes.append(fuente(nombre,registro));
  texto('fuentesContador',(c?.source_count??0)+' de 6 fuentes');
}
function llenarHistoria(){
  const historial=estado?.historial??[];
  texto('historiaContador',historial.length+' lecturas');
  const cuerpo=$('tablaHistoria');cuerpo.replaceChildren();
  if(!historial.length){
    const fila=document.createElement('tr'),celda=document.createElement('td');
    celda.colSpan=4;celda.textContent='No hay capturas. Pulsa «Actualizar lectura».';
    fila.append(celda);cuerpo.append(fila);return;
  }
  for(const registro of [...historial].reverse()){
    const fila=document.createElement('tr');
    const campos=[fecha(registro.fecha),dinero(registro.precio),
      dinero(registro.precio_proyectado),String(registro.fuentes??'—')];
    for(const valor of campos){
      const celda=document.createElement('td');celda.textContent=valor;fila.append(celda);
    }
    cuerpo.append(fila);
  }
  texto('historiaNota',historial.length<2?
    'Hay una captura. Una sola instantánea no establece ninguna trayectoria causal.':
    'Hay '+historial.length+' capturas. Comparar sus cambios todavía no demuestra causalidad; se necesitan controles y validación temporal.');
}
function llenarValidacion(c){
  const m=c?.instrument_15m,b=m?.backtest;
  texto('errorModelo',porcentaje(b?.model_mae_return_pct));
  texto('errorReferencia',porcentaje(b?.reference_mae_return_pct));
  texto('decisiones',numero(b?.scored));
  texto('numeroEstados',numero(c?.universal_state?.known_states));
  texto('numeroDominios',numero(c?.universal_state?.domains?.length));
  texto('huella',c?.capture_sha256??'Sin sello de captura completa');
  texto('objetivoValidacion',fecha(m?.target_at));
  let advertencia='No hay pruebas recientes que evaluar.';
  if(b?.beats_persistence===false)advertencia='En la evaluación retrospectiva, el modelo NO superó el precio sin cambio. El panel muestra la referencia como estimación central.';
  else if(b?.beats_persistence===true)advertencia='El modelo mejoró la referencia en una muestra corta. Sigue siendo experimental: falta una prueba externa independiente.';
  else if(b)advertencia='La muestra de evaluación es insuficiente. No se declara una ventaja predictiva.';
  texto('resultadoPrueba',advertencia);
}
function mostrarDatos(){
  const c=estado?.ultima,m=c?.instrument_15m;
  $('exportar').hidden=!c;
  actualizarTiempo();
  texto('horaLectura',c?'Última captura: '+fecha(c.at):'Sin una captura registrada');
  texto('precioObservado',dinero(m?.observed_price_usd));
  texto('precioFecha',c?'Fuente: Coinbase Exchange · '+fecha(m.observed_at):
    'Pulsa «Actualizar lectura» para consultar la fuente.');
  texto('precioEstimado',dinero(m?.projected_price_usd));
  texto('modeloEstado',estadoModelo(m));
  texto('rango',Array.isArray(m?.scenario_interval_usd)?
    dinero(m.scenario_interval_usd[0])+' – '+dinero(m.scenario_interval_usd[1]):'No calculado');
  texto('candidato',dinero(m?.model_candidate_price_usd));
  texto('fechaObjetivo',m?.target_at?'Objetivo: '+fecha(m.target_at):'Solo está disponible el horizonte de 15 minutos.');
  texto('graficaNota',c?
    'Velas recuperadas durante la captura. La línea discontinua es una estimación; no es una operación ni un dato futuro.':
    'Sin datos simulados. El tramo calculado no representa un precio futuro observado.');
  trazar(serieHistorica(c),m);
  actualizarTiempo();
  const avisoIntegridad=$('avisoIntegridad');
  avisoIntegridad.hidden=!estado?.aviso_migracion;
  avisoIntegridad.textContent=estado?.aviso_migracion??'';
  llenarFactores(c);llenarHistoria();llenarValidacion(c);
}
// Solo cambia las etiquetas: no realiza peticiones ni modifica la captura.
function actualizarTiempo(){
  const c=estado?.ultima,m=c?.instrument_15m,indicador=$('estadoConexion');
  const edad=m?Date.now()-Date.parse(m.observed_at):NaN;
  const futura=Number.isFinite(edad)&&edad< -5000;
  const antigua=Number.isFinite(edad)&&edad>180000;
  indicador.className='indicador'+(c?((antigua||futura)?' antiguo':' correcto'):'');
  indicador.textContent=!c?'Sin lectura':futura?'Revisar reloj':antigua?'Captura histórica':'Lectura reciente';
  const vencido=m&&Date.now()>=Date.parse(m.target_at);
  texto('fechaObjetivo',m?'Objetivo: '+fecha(m.target_at)+(vencido?' · Vencido; requiere una nueva lectura.':' · Estimación pendiente de contraste.'):
    'Solo está disponible el horizonte de 15 minutos.');
}
async function pedir(url,opciones){
  const respuesta=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000),...opciones});
  const datos=await respuesta.json();
  if(!respuesta.ok)throw Error(datos.error||'No fue posible completar la consulta.');
  return datos;
}
async function cargar(){
  try{estado=await pedir('/api/estado');alerta('');mostrarDatos();}
  catch(err){alerta('No se pudo leer el panel local: '+err.message);}
}
async function actualizar(){
  if(cargando)return;
  cargando=true;
  $('actualizar').disabled=true;$('actualizar').textContent='Leyendo fuentes…';
  $('actualizar').setAttribute('aria-busy','true');
  alerta('');
  try{estado=await pedir('/api/actualizar',{method:'POST'});mostrarDatos();}
  catch(err){alerta(err.message+' La última captura válida, si existe, se conserva.');}
  finally{cargando=false;$('actualizar').disabled=false;
    $('actualizar').textContent='Actualizar lectura';$('actualizar').removeAttribute('aria-busy');actualizarTiempo();}
}
for(const boton of document.querySelectorAll('.pestana')){
  boton.addEventListener('click',()=>irAVista(boton.dataset.vista));
}
$('actualizar').addEventListener('click',actualizar);
cargar();

setInterval(actualizarTiempo,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)actualizarTiempo()});
window.addEventListener('focus',actualizarTiempo);
window.addEventListener('pageshow',actualizarTiempo);
let cambioTamano;
window.addEventListener('resize',()=>{
  clearTimeout(cambioTamano);
  cambioTamano=setTimeout(()=>{if(!$('vista-mercado').hidden)trazar(serieHistorica(estado?.ultima),estado?.ultima?.instrument_15m)},100);
});
