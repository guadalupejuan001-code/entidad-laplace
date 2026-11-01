/* EF002: resumen fiel de contadores publicados por los conectores.
 * CFTC D002 usa "count"; otros emisores usan "signals".
 * La ausencia de un contador no convierte una captura fallida en cero financiero.
 * signal_count es NÚMERO de observaciones, no una suma de sus valores/unidades.
 */
export const SOURCE_SUMMARY_SCHEMA='laplace-ef002-source-summary-v2';
export function resumirFuentesEF002(items=[]){
  if(!Array.isArray(items))throw Error('Estado de fuentes EF002 inválido');
  const groups=new Map();
  for(const item of items){
    if(!item||typeof item!=='object')throw Error('Registro de fuente EF002 inválido');
    const group=String(item.group??'unclassified'),entry=groups.get(group)??{
      group,observed_sources:0,failed_sources:0,restricted_sources:0,
      not_reported_sources:0,signal_count:0,source_ids:[]};
    const status=String(item.status??'unknown');
    entry.source_ids.push(String(item.name??item.id??'unknown'));
    // El primer campo presente tiene prioridad; nunca sumar ambos.
    const count=Number(item.signals??item.count??0);
    if(status==='observed'){
      entry.observed_sources++;
      if(Number.isSafeInteger(count)&&count>=0)entry.signal_count+=count;
    }else if(['requires_credentials','requires_license','requires_contact','restricted'].includes(status)){
      entry.restricted_sources++;
    }else if(['not_reported','not_published'].includes(status)){
      entry.not_reported_sources++;
    }else entry.failed_sources++;
    groups.set(group,entry);
  }
  return [...groups.values()].sort((a,b)=>a.group.localeCompare(b.group));
}
