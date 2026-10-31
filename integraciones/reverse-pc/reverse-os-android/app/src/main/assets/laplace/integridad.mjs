/* Integridad local de TODO el contenido. No es firma del proveedor ni prueba
 * de autenticidad frente a alguien que pueda recalcular los hashes. */
export function serializarCanonico(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(serializarCanonico).join(',')+']';
  if(value&&Object.getPrototypeOf(value)===Object.prototype)
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+serializarCanonico(value[k])).join(',')+'}';
  throw Error('El contenido debe ser JSON finito, sin valores indefinidos');
}
export async function huellaContenido(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serializarCanonico(value)));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
