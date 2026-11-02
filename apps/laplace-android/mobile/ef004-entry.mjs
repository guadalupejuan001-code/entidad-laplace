/* Importaciones del motor original: no hay un segundo EF004 simplificado. */
import {aprenderNucleoEF004} from '../../../demonio/finanzas-ef004.mjs';
import {evaluarPronosticoEF004,verificarPronosticoEF004} from '../../../demonio/evaluacion-ef004.mjs';
import {prepararHistoria,estadoDeCaptura} from '../../../demonio/series.mjs';
import {normalizarCapturaU003} from '../../../estado-financiero/modelo.mjs';
import {createHash} from './crypto-shim.mjs';
const api={aprenderNucleoEF004,evaluarPronosticoEF004,verificarPronosticoEF004,
 prepararHistoria,estadoDeCaptura,normalizarCapturaU003,
 sha256:text=>createHash('sha256').update(text).digest('hex')};
globalThis.LaplaceEF004Core=Object.freeze(api);
if(typeof postMessage==='function'&&typeof document==='undefined'){
 globalThis.onmessage=({data})=>{
  try{
   const {id,action,captures,options,forecasts}=data;
   postMessage({id,progress:'Verificando sellos y fechas del archivo…'});
   if(!Array.isArray(captures)||!captures.length)throw Error('No hay capturas verificables');
   for(const c of captures){normalizarCapturaU003(c);
    if(Date.parse(c.at)>Date.now()+60000)throw Error('Captura fechada en el futuro');}
   let result;
   if(action==='train'){
    postMessage({id,progress:'Ejecutando el aprendizaje EF004 original en este teléfono…'});
    result=aprenderNucleoEF004(captures,{horizonHours:Number(options?.horizonHours??24)});
   }else if(action==='evaluate')result=(forecasts??[]).map(f=>evaluarPronosticoEF004(f,captures));
   else if(action==='verify')result=captures.map(c=>normalizarCapturaU003(c));
   else throw Error('Acción EF004 desconocida');
   postMessage({id,ok:true,result});
  }catch(error){postMessage({id:data.id,ok:false,error:String(error.message??error)})}
 };
}
