/* Integridad local de TODO el contenido. No es firma del proveedor ni prueba
 * de autenticidad frente a alguien que pueda recalcular los hashes. */
import {createHash} from 'node:crypto';
export function serializarCanonico(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(serializarCanonico).join(',')+']';
  if(value&&Object.getPrototypeOf(value)===Object.prototype)
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+serializarCanonico(value[k])).join(',')+'}';
  throw Error('El contenido debe ser JSON finito, sin valores indefinidos');
}
export const huellaContenido=value=>createHash('sha256').update(serializarCanonico(value)).digest('hex');
export function sellarCaptura(raw){
  const {capture_sha256:anterior,...contenido}=structuredClone(raw);
  return {...contenido,capture_sha256:huellaContenido(contenido)};
}
export function verificarSelloCaptura(c){
  const {capture_sha256,...contenido}=c??{};
  if(typeof capture_sha256!=='string'||!/^[a-f0-9]{64}$/.test(capture_sha256)||
    capture_sha256!==huellaContenido(contenido))throw Error('La captura completa está modificada o no tiene sello');
  return true;
}
