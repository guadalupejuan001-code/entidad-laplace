import {verifyUniverseSnapshot,utcTime} from '../universo/estados.mjs';
import {huellaContenido,sellarCaptura,verificarSelloCaptura} from '../universo/integridad.mjs';
/* Registro v2: integridad completa, coherencia entre bloques y orden temporal.
 * Los hashes detectan cambios sin resellar; no sustituyen firmas externas. */
export const PANEL_SCHEMA='laplace-panel-v2';
export const MAX_CAPTURAS=144;
const debe=(c,m)=>{if(!c)throw Error(m)};
const numero=x=>typeof x==='number'&&Number.isFinite(x);
const fecha=x=>{utcTime(x);return Date.parse(x)};
function contenidoValido(c){
  debe(c?.schema==='laplace-universo-btc-u001-v1','Captura universal incompatible');
  const at=fecha(c.at),m=c.instrument_15m;
  debe(m?.schema==='laplace-btc-intradia-i015-v1','Falta el núcleo I015');
  debe(numero(m.observed_price_usd)&&m.observed_price_usd>0,'No existe cotización observada');
  debe(numero(m.projected_price_usd)&&m.projected_price_usd>0,'No existe referencia temporal');
  debe(fecha(m.observed_at)<=fecha(m.known_at)&&fecha(m.known_at)<=at,
    'Fechas incoherentes en la cotización');
  debe(fecha(m.target_at)-fecha(m.observed_at)===900000,'El objetivo no es de quince minutos');
  verifyUniverseSnapshot(c.universal_state);
  debe(fecha(c.universal_state.cutoff)===at,'El corte de memoria no coincide con la captura');
  const precios=c.universal_state.states.filter(x=>x.domain==='mercado'&&
    x.variable==='BTC_USD_spot'&&x.observed_at===utcTime(m.observed_at)&&x.known_at===utcTime(m.known_at));
  debe(precios.length===1&&precios[0].unit==='USD'&&precios[0].value===m.observed_price_usd,
    'La cotización no coincide con la memoria verificada');
  debe(c.projected_price_usd===m.projected_price_usd,'Las proyecciones no coinciden');
  if(m.model_selected==='persistencia')debe(m.projected_price_usd===m.observed_price_usd,
    'La referencia de persistencia no coincide con el precio');
  const fuentes=c.measured_market;
  debe(Array.isArray(fuentes)&&fuentes.length===4&&
    ['book','trades','eth','euro'].every(n=>fuentes.filter(x=>x.name===n).length===1)&&
    fuentes.every(x=>['observed','unavailable'].includes(x.status)),'Fuentes de mercado incompletas');
  const total=1+fuentes.filter(x=>x.status==='observed').length+
    Number(c.measured_space_weather?.status==='observed');
  debe(c.source_count===total,'El número de fuentes no coincide');
  if(m.scenario_interval_usd!=null)debe(Array.isArray(m.scenario_interval_usd)&&
    m.scenario_interval_usd.length===2&&m.scenario_interval_usd.every(x=>numero(x)&&x>0)&&
    m.scenario_interval_usd[0]<=m.scenario_interval_usd[1],'Intervalo inválido');
  if(m.serie_cierres_5m!==undefined){
    debe(Array.isArray(m.serie_cierres_5m)&&m.serie_cierres_5m.length<=72,'Serie demasiado grande');
    let previo=-Infinity;
    for(const p of m.serie_cierres_5m){
      const t=fecha(p.fecha);
      debe(numero(p.precio)&&p.precio>0&&t>previo&&t<=fecha(m.observed_at),'Cierre fuera de orden o del corte');
      previo=t;
    }
  }
  return c;
}
export function validarCaptura(c){
  verificarSelloCaptura(c);contenidoValido(c);return c;
}
export function resumenCaptura(raw){
  const c=validarCaptura(raw),m=c.instrument_15m;
  return {fecha:c.at,precio:m.observed_price_usd,precio_proyectado:m.projected_price_usd,
    intervalo:m.scenario_interval_usd??null,fuentes:c.source_count,
    validez:m.status,dominios:c.universal_state.domains,estados:c.universal_state.known_states,
    huella:c.universal_state.snapshot_sha256,cotizacion_en:m.observed_at,proyeccion_hasta:m.target_at,
    muestras:m.backtest?.scored??0,error_modelo:m.backtest?.model_mae_return_pct??null,
    error_referencia:m.backtest?.reference_mae_return_pct??null,
    huella_captura:c.capture_sha256,origen_integridad:c.origen_integridad??'sellado_al_capturar'};
}
function sellarRegistro(body){return {...body,registro_sha256:huellaContenido(body)}}
function revisarHistoria(historial){
  debe(Array.isArray(historial)&&historial.length<=MAX_CAPTURAS,'Demasiadas capturas');
  let anterior=-Infinity;
  for(const r of historial){
    const t=fecha(r.fecha);
    debe(t>anterior,'El historial tiene fechas duplicadas o retrocede');
    debe(numero(r.precio)&&r.precio>0&&numero(r.precio_proyectado)&&r.precio_proyectado>0,
      'Registro histórico inválido');
    anterior=t;
  }
}
export function normalizarRegistro(raw){
  debe(raw?.schema===PANEL_SCHEMA,'Registro del panel incompatible');
  const {registro_sha256,...body}=raw;
  debe(registro_sha256===huellaContenido(body),'El registro completo está modificado');
  revisarHistoria(body.historial);
  if(body.ultima){
    validarCaptura(body.ultima);
    debe(body.historial.length>0&&body.actualizado_en===body.ultima.at,'Última captura inconsistente');
    debe(huellaContenido(body.historial.at(-1))===huellaContenido(resumenCaptura(body.ultima)),
      'La última fila no coincide con la captura');
  }else debe(body.historial.length===0&&body.actualizado_en===null,'Registro vacío inconsistente');
  return structuredClone(raw);
}
export function añadirCaptura(registro,captura){
  const c=structuredClone(validarCaptura(captura)),anterior=normalizarRegistro(registro);
  debe(!anterior.historial.some(x=>fecha(x.fecha)===fecha(c.at)),'La captura ya existe');
  if(anterior.ultima){
    debe(fecha(c.at)>fecha(anterior.ultima.at),'La captura es anterior a la última lectura');
    debe(fecha(c.instrument_15m.observed_at)>=fecha(anterior.ultima.instrument_15m.observed_at),
      'La cotización retrocede en el tiempo');
  }
  const {registro_sha256:viejo,...body}=anterior;
  return normalizarRegistro(sellarRegistro({...body,ultima:c,actualizado_en:c.at,
    historial:[...anterior.historial,resumenCaptura(c)].slice(-MAX_CAPTURAS)}));
}
export const registroVacio=()=>sellarRegistro({schema:PANEL_SCHEMA,ultima:null,historial:[],
  actualizado_en:null,aviso_migracion:null});
export function migrarRegistroAnterior(raw){
  debe(raw?.schema==='laplace-panel-v1','No es un registro anterior compatible');
  revisarHistoria(raw.historial);
  if(!raw.ultima){debe(raw.historial.length===0,'Registro anterior incompleto');return registroVacio()}
  const c=contenidoValido(raw.ultima);
  debe(raw.actualizado_en===c.at&&raw.historial.at(-1)?.fecha===c.at&&
    raw.historial.at(-1)?.precio===c.instrument_15m.observed_price_usd&&
    raw.historial.at(-1)?.precio_proyectado===c.instrument_15m.projected_price_usd,
    'El registro anterior es incoherente; se conserva sin convertir');
  const ultima=sellarCaptura({...c,origen_integridad:'migracion_sin_sello_original'});
  const historial=raw.historial.map(x=>({...x,huella_captura:null,
    origen_integridad:'migracion_sin_sello_original'}));
  historial[historial.length-1]=resumenCaptura(ultima);
  return normalizarRegistro(sellarRegistro({schema:PANEL_SCHEMA,ultima,historial,actualizado_en:c.at,
    aviso_migracion:'Historial anterior convertido con copia de respaldo. El sello nuevo no certifica su integridad antes de la migración.'}));
}
