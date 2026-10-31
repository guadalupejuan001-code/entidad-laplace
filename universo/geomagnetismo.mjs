/* U001 - dominio fisico: indice geomagnetico planetario Kp de NOAA SWPC.
 * Fuente no relacionada causalmente con Bitcoin por defecto.
 * Mantiene observation-time y first-known-time separados.
 */
export const KP_URL='https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
export function measureKp(raw,{capturedAt,maxAgeHours=9}={}){
  const captured=Date.parse(capturedAt);
  need(Number.isFinite(captured),'captura Kp sin fecha');
  need(Array.isArray(raw)&&raw.length>0&&raw.length<=1000,'filas Kp invalidas');
  const rows=raw.map(item=>{
    // NOAA cambio su feed en marzo 2026 a JSON con objetos.
    need(item&&typeof item==='object'&&!Array.isArray(item)&&
      typeof item.time_tag==='string'&&typeof item.Kp==='number',
      'se requiere estructura NOAA 2026 time_tag/Kp');
    need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(item.time_tag),
      'Kp: timestamp no admitido');
    const epoch=Date.parse(item.time_tag+'Z');
    need(Number.isFinite(epoch)&&new Date(epoch).toISOString().slice(0,10)===item.time_tag.slice(0,10),
      'Kp: timestamp invalido');
    need(Number.isFinite(item.Kp)&&item.Kp>=0&&item.Kp<=9,'Kp fuera de limites');
    return {epoch,value:item.Kp};
  }).filter(x=>x.epoch<=captured);
  need(rows.length>0,'Kp no tiene observacion anterior a corte');
  rows.sort((a,b)=>a.epoch-b.epoch);
  const last=rows.at(-1);
  need(captured-last.epoch<=maxAgeHours*3600000,'Kp fuera de ventana de frescura');
  return {domain:'geomagnetismo',variable:'Kp_planetario',
    value:last.value,unit:'Kp',observed_at:new Date(last.epoch).toISOString(),
    known_at:new Date(captured).toISOString(),source_url:KP_URL,
    note:'observacion de indice magnetico de 3h, no estado cuantico ni predictor de BTC'};
}
export async function fetchKp({fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=9000}={}){
  const response=await fetchImpl(KP_URL,{signal:AbortSignal.timeout(timeoutMs),
    cache:'no-store',headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-U001/1.0'}});
  need(response.ok,'HTTP NOAA '+response.status);
  const body=await response.text();
  need(body.length<=100000,'respuesta NOAA excesiva');
  return measureKp(JSON.parse(body),{capturedAt:now()});
}
