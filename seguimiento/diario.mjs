/* Diario prospectivo: sólo añadir, hash encadenado y fsync por evento.
 * No equivale a una firma de Coinbase ni impide un resellado con acceso local. */
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,statSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {huellaContenido} from '../universo/integridad.mjs';
import {verificarPronostico,evaluarPronostico} from './modelo.mjs';
const debe=(c,m)=>{if(!c)throw Error(m)};
export const ARCHIVO='diario.jsonl';
const CERO='0'.repeat(64);
function validarEvento(e,anteriores){
  debe(Number.isFinite(Date.parse(e.registrado_en)),'Fecha de registro inválida');
  if(e.tipo==='pronostico'){
    verificarPronostico(e.datos);
    debe(Date.parse(e.registrado_en)>=Date.parse(e.datos.emitido_en)&&
      Date.parse(e.registrado_en)<Date.parse(e.datos.objetivo_en),'Pronóstico guardado tarde');
    debe(!anteriores.some(x=>x.tipo==='pronostico'&&x.datos.id===e.datos.id),'Pronóstico repetido');
  }else if(e.tipo==='resultado'){
    const p=anteriores.find(x=>x.tipo==='pronostico'&&x.datos.id===e.datos.pronostico_id);
    debe(p,'Resultado sin pronóstico previo');
    debe(!anteriores.some(x=>x.tipo==='resultado'&&x.datos.pronostico_id===p.datos.id),'Resultado ya registrado');
    const esperado=evaluarPronostico(p.datos,e.datos.vela_completa,{consultadoEn:e.datos.consultado_en,fuente:e.datos.fuente});
    debe(huellaContenido(esperado)===huellaContenido(e.datos),'Resultado inconsistente');
    debe(Date.parse(e.registrado_en)>=Date.parse(e.datos.consultado_en),'Registro anterior al resultado');
  }else debe(['dato_ausente','error_fuente','ciclo'].includes(e.tipo),'Tipo de evento desconocido');
}
export function leerDiario(directorio){
  const path=join(directorio,ARCHIVO);
  if(!existsSync(path))return [];
  debe(statSync(path).size<=64*1024*1024,'Diario supera 64 MiB: archivar antes de continuar, no se borra');
  const text=readFileSync(path,'utf8');
  debe(!text||text.endsWith('\n'),'Diario incompleto: se conserva para recuperación manual');
  const eventos=[];
  for(const line of text.split('\n').filter(Boolean)){
    const e=JSON.parse(line),{huella,...body}=e;
    debe(e.secuencia===eventos.length+1&&e.anterior===(eventos.at(-1)?.huella??CERO)&&
      huella===huellaContenido(body),'Integridad del diario inválida');
    validarEvento(e,eventos);eventos.push(e);
  }
  return eventos;
}
export function añadirEvento(directorio,eventos,tipo,datos,registradoEn){
  const body={schema:'laplace-diario-m001',secuencia:eventos.length+1,
    anterior:eventos.at(-1)?.huella??CERO,tipo,registrado_en:registradoEn,datos:structuredClone(datos)};
  const e={...body,huella:huellaContenido(body)};
  validarEvento(e,eventos);mkdirSync(directorio,{recursive:true});
  const path=join(directorio,ARCHIVO),line=JSON.stringify(e)+'\n';
  debe((existsSync(path)?statSync(path).size:0)+Buffer.byteLength(line)<=64*1024*1024,'Diario lleno; no se descartan datos');
  const fd=openSync(path,'a',0o600);
  try{writeSync(fd,line);fsyncSync(fd)}finally{closeSync(fd)}
  eventos.push(e);return e;
}
export function resumir(eventos,ahora=new Date().toISOString()){
  const preds=eventos.filter(x=>x.tipo==='pronostico').map(x=>x.datos);
  const resultados=new Map(eventos.filter(x=>x.tipo==='resultado').map(x=>[x.datos.pronostico_id,x.datos]));
  const ausentes=new Map(eventos.filter(x=>x.tipo==='dato_ausente').map(x=>[x.datos.pronostico_id,x.datos]));
  const grupos=new Map();
  for(const p of preds){
    const clave=p.modelo+'|'+p.codigo_sha256+'|'+p.horizonte_minutos;
    if(!grupos.has(clave))grupos.set(clave,{modelo:p.modelo,codigo_sha256:p.codigo_sha256,
      horizonte_minutos:p.horizonte_minutos,emitidos:0,evaluados:0,pendientes:0,sin_patrones:0,sin_dato_objetivo:0,
      aciertos_direccion:0,fallos_direccion:0,aciertos_precio:0,fallos_precio:0,mejora_referencia:0,
      suma_error_usd:0,suma_error_referencia_usd:0,suma_error_porcentual:0,tolerancia_precio_pb:p.criterio.tolerancia_precio_pb});
    const g=grupos.get(clave);g.emitidos++;
    const r=resultados.get(p.id);
    if(p.precio_predicho===null){g.sin_patrones++;continue}
    if(!r){g.pendientes++;if(ausentes.has(p.id))g.sin_dato_objetivo++;continue}
    g.evaluados++;g.aciertos_direccion+=Number(r.acierto_direccion);g.fallos_direccion+=Number(!r.acierto_direccion);
    g.aciertos_precio+=Number(r.acierto_precio);g.fallos_precio+=Number(!r.acierto_precio);
    g.mejora_referencia+=Number(r.mejora_referencia);g.suma_error_usd+=r.error_absoluto_usd;
    g.suma_error_referencia_usd+=r.error_referencia_usd;g.suma_error_porcentual+=r.error_porcentual;
  }
  const rows=preds.slice(-100).reverse().map(p=>{
    const r=resultados.get(p.id);
    return {id:p.id,emitido_en:p.emitido_en,objetivo_en:p.objetivo_en,horizonte_minutos:p.horizonte_minutos,
      modelo:p.modelo,precio_inicial:p.precio_inicial,precio_predicho:p.precio_predicho,
      estado:p.precio_predicho===null?'sin_patrones':r?'evaluado':ausentes.has(p.id)?'pendiente_datos':'pendiente',
      resultado:r??null};
  });
  return {schema:'laplace-resumen-m001',actualizado_en:ahora,ultima_secuencia:eventos.length,
    huella_diario:eventos.at(-1)?.huella??CERO,pronosticos:preds.length,evaluados:resultados.size,
    errores_fuentes:eventos.filter(x=>x.tipo==='error_fuente').length,
    incidencias_datos:eventos.filter(x=>x.tipo==='dato_ausente').length,
    por_horizonte:[...grupos.values()].map(g=>({...g,mae_usd:g.evaluados?g.suma_error_usd/g.evaluados:null,
      mae_referencia_usd:g.evaluados?g.suma_error_referencia_usd/g.evaluados:null,
      error_medio_porcentual:g.evaluados?g.suma_error_porcentual/g.evaluados:null})),ultimos:rows,
    aviso:'Cierres de minuto, no precio del segundo exacto. Horizontes largos de emisiones horarias pueden solaparse; no son ensayos independientes. Sin órdenes.'};
}
export function guardarResumen(directorio,eventos,ahora){
  const s=resumir(eventos,ahora),path=join(directorio,'resumen.json');
  mkdirSync(directorio,{recursive:true});
  writeFileSync(path+'.temporal',JSON.stringify(s,null,2)+'\n',{mode:0o600});renameSync(path+'.temporal',path);
  return s;
}
