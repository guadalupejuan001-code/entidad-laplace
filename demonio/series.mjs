/* EF004: panel temporal de observaciones EF002, sin fuga temporal.
 * La captura es un conjunto de afirmaciones públicas; no es estado total del mundo.
 * Cada identidad mantiene dominio, variable, unidad y proveedor separados.
 */
import {createHash} from 'node:crypto';
import {normalizarCapturaU003} from '../estado-financiero/modelo.mjs';

export const EF004_SERIES_SCHEMA='laplace-ef004-series-v1';
const need=(x,message)=>{if(!x)throw Error(message)};
const hash=x=>createHash('sha256').update(x).digest('hex');
const isTime=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
export function serieId(row){
  need(row&&typeof row.domain==='string'&&typeof row.variable==='string'&&
    typeof row.unit==='string','serie requiere dominio, variable y unidad');
  const u=new URL(row.source_url);
  need(u.protocol==='https:'&&!u.username&&!u.password,'origen público HTTPS requerido');
  return 'ef004-'+hash(JSON.stringify([row.domain,row.variable,row.unit,u.hostname])).slice(0,32);
}
export function estadoDeCaptura(capture){
  const certified=normalizarCapturaU003(capture);
  const at=certified.captured_at,cut=Date.parse(at),state=new Map(),rejected=[];
  for(const row of capture.universal_state.states){
    if(!Number.isFinite(row.value)||!isTime(row.observed_at)||!isTime(row.known_at)||
      Date.parse(row.known_at)>cut||Date.parse(row.observed_at)>cut){
      rejected.push({id:row.id,reason:'unavailable_at_capture'});continue;
    }
    const key=serieId(row),old=state.get(key);
    // Varios reportes trimestrales en una captura son una sola serie,
    // mostrando únicamente el trimestre más reciente conocido entonces.
    if(!old||Date.parse(row.observed_at)>Date.parse(old.observed_at)||
       row.observed_at===old.observed_at&&row.known_at>old.known_at)
      state.set(key,{key,id:row.id,domain:row.domain,variable:row.variable,
        unit:row.unit,source_url:row.source_url,observed_at:row.observed_at,
        known_at:row.known_at,value:row.value});
  }
  return {at,capture_sha256:certified.capture_sha,
    snapshot_sha256:certified.snapshot_sha,state,rejected};
}
export function prepararHistoria(captures,{
  cadenceHours=null,toleranceHours=null,minDistinct=2
}={}){
  need(Array.isArray(captures),'se requiere historia de capturas');
  need(cadenceHours===null||(typeof cadenceHours==='number'&&
    Number.isFinite(cadenceHours)&&cadenceHours>0),
    'cadencia positiva o automática requerida');
  need(toleranceHours===null||(Number.isFinite(toleranceHours)&&toleranceHours>=0),
    'tolerancia debe ser no negativa');
  need(Number.isSafeInteger(minDistinct)&&minDistinct>=1,
    'mínimo estadístico inválido');
  const rows=captures.map(estadoDeCaptura).sort((a,b)=>a.at.localeCompare(b.at));
  const seen=new Set();
  for(const x of rows){
    need(!seen.has(x.at),'dos capturas con la misma hora: desambiguar antes de entrenar');
    seen.add(x.at);
  }
  const gaps=[];
  for(let i=1;i<rows.length;i++)
    gaps.push((Date.parse(rows[i].at)-Date.parse(rows[i-1].at))/3600000);
  const sorted=[...gaps].sort((a,b)=>a-b);
  const median=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:
    (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):null;
  const inferred=cadenceHours??median;
  const tolerance=toleranceHours??(inferred===null?null:inferred*.48);
  let start=0,broken=0;
  for(let i=1;i<rows.length;i++){
    if(Math.abs(gaps[i-1]-inferred)>tolerance){start=i;broken++}
  }
  const tail=rows.slice(start);
  return {schema:EF004_SERIES_SCHEMA,
    snapshots:tail,all_captures:rows.length,
    contiguous_captures:tail.length,discarded_due_to_gap:start,
    gaps_detected:broken,cadence_hours:inferred,
    cadence_tolerance_hours:tolerance,
    inferred_cadence:cadenceHours===null,
    enough_observations:tail.length>=minDistinct,
    as_of:tail.at(-1)?.at??null,
    provenance:tail.map(x=>({captured_at:x.at,capture_sha256:x.capture_sha256,
      snapshot_sha256:x.snapshot_sha256})),
    no_fixed_capture_limit:true,
    never_retrodated:true,scope:'public_capture_snapshots_not_complete_world'};
}
export function extraerSeries(panel,{
  minChanges=2,maxSeries=null,selectionEnd=panel?.snapshots?.length
}={}){
  need(panel?.schema===EF004_SERIES_SCHEMA,'panel temporal desconocido');
  need(maxSeries===null||(Number.isSafeInteger(maxSeries)&&maxSeries>=1),
    'presupuesto opcional de series inválido');
  const snapshots=panel.snapshots;
  need(Number.isInteger(selectionEnd)&&selectionEnd>=2&&selectionEnd<=snapshots.length,
    'corte de selección de series inválido');
  const found=new Map(),excluded=[];
  for(let i=0;i<snapshots.length;i++)for(const [key,row] of snapshots[i].state){
    const obj=found.get(key)??{key,domain:row.domain,variable:row.variable,
      unit:row.unit,source_url:row.source_url,rows:Array(snapshots.length).fill(null)};
    obj.rows[i]={at:snapshots[i].at,observed_at:row.observed_at,value:row.value};
    found.set(key,obj);
  }
  const eligible=[];
  for(const v of found.values()){
    const train=v.rows.slice(0,selectionEnd);
    if(train.some(x=>x===null)){
      excluded.push({key:v.key,reason:'incomplete_training_series',
        coverage:train.filter(Boolean).length});continue;
    }
    const changes=train.reduce((n,x,i)=>i&&
      x.value!==train[i-1].value&&x.observed_at!==train[i-1].observed_at?n+1:n,0);
    // Selección exclusivamente con registros anteriores al corte de entrenamiento.
    // NUNCA seleccionar series porque sobreviven a todo el período de prueba.
    if(changes<minChanges){
      excluded.push({key:v.key,reason:'insufficient_training_updates',changes});continue;
    }
    eligible.push({...v,changes,values:v.rows.map(x=>x?.value??null),
      observed_times:v.rows.map(x=>x?.observed_at??null)});
  }
  eligible.sort((a,b)=>b.changes-a.changes||a.key.localeCompare(b.key));
  const selectedCount=maxSeries===null?eligible.length:Math.min(maxSeries,eligible.length);
  return {eligible:eligible.slice(0,selectedCount),
    excluded:[...excluded,...eligible.slice(selectedCount).map(x=>({
      key:x.key,reason:'user_defined_resource_budget'}))],
    total_unique:found.size,total_eligible:eligible.length,
    selected:selectedCount,no_fixed_series_limit:true,
    selection_end_index:selectionEnd-1,
    heldout_not_used_for_selection:true,
    all_raw_observations_retained_in_archives:true,
    no_absent_series_imputed:true};
}
