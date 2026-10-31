/* U001 - contrato universal de estados observables.
 * Dominio abierto, historia cronologica, hipotesis no equivalen a causas.
 * Sin RNG, sin estados densos ni acceso a datos no capturados.
 */
import {createHash} from 'node:crypto';
export const UNIVERSO_SCHEMA='laplace-universo-estados-u001-v1';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export function utcTime(s){
  need(typeof s==='string'&&DATE.test(s),'fecha UTC ISO invalida');
  const time=Date.parse(s);
  need(Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===s.slice(0,10),
    'fecha UTC inexistente');
  return new Date(time).toISOString();
}
function identifier(s,field,max=100){
  need(typeof s==='string'&&s.length>0&&s.length<=max&&
    /^[a-zA-Z0-9_.:/-]+$/.test(s),field+' invalido');
  return s;
}
function url(s){
  need(typeof s==='string'&&s.length<=1024,'URL invalida');
  let parsed;try{parsed=new URL(s)}catch{throw Error('URL invalida')}
  need(parsed.protocol==='https:'&&!parsed.username&&!parsed.password,'fuente debe usar HTTPS');
  return parsed.toString();
}
export function observation(record){
  need(record&&typeof record==='object'&&!Array.isArray(record),'observacion invalida');
  const keys=['domain','id','known_at','observed_at','source_url','unit','value','variable'];
  need(JSON.stringify(Object.keys(record).sort())===JSON.stringify(keys),
    'campos de observacion desconocidos o faltantes');
  const item={
    id:identifier(record.id,'id',120),
    domain:identifier(record.domain,'dominio',60),
    variable:identifier(record.variable,'variable',120),
    observed_at:utcTime(record.observed_at),
    known_at:utcTime(record.known_at),
    value:record.value,
    unit:identifier(record.unit,'unidad',32),
    source_url:url(record.source_url)
  };
  need(item.known_at>=item.observed_at,'la observacion no se conocia todavia');
  need(typeof item.value==='number'&&Number.isFinite(item.value)&&
    Math.abs(item.value)<=1e30,'valor numerico invalido');
  return Object.freeze(item);
}
export function causalHypothesis(h){
  need(h&&typeof h==='object'&&!Array.isArray(h),'hipotesis invalida');
  const keys=['from','id','label','to','type'];
  need(JSON.stringify(Object.keys(h).sort())===JSON.stringify(keys),'campos de hipotesis invalidos');
  const item={id:identifier(h.id,'hipotesis',120),
    from:identifier(h.from,'origen',120),to:identifier(h.to,'destino',120),
    label:identifier(h.label,'nombre',120),
    type:h.type};
  need(h.type==='hipotesis'||h.type==='precedencia','solo hipotesis o precedencia; nunca causalidad afirmada');
  need(h.from!==h.to,'autorelacion no permitida');
  return Object.freeze(item);
}
export function universeSnapshot(raw,{cutoff,hypotheses=[]}={}){
  const time=utcTime(cutoff);
  need(Array.isArray(raw)&&raw.length<=4096,'presupuesto de estados excedido (4096)');
  need(Array.isArray(hypotheses)&&hypotheses.length<=4096,'presupuesto de relaciones excedido');
  const all=raw.map(observation),ids=new Set();
  for(const item of all){need(!ids.has(item.id),'id duplicado '+item.id);ids.add(item.id)}
  const states=all.filter(x=>x.known_at<=time&&x.observed_at<=time)
    .sort((a,b)=>a.known_at.localeCompare(b.known_at)||a.id.localeCompare(b.id));
  const liveIds=new Set(states.map(x=>x.id)),links=hypotheses.map(causalHypothesis)
    .filter(h=>liveIds.has(h.from)&&liveIds.has(h.to)).sort((a,b)=>a.id.localeCompare(b.id));
  need(new Set(links.map(x=>x.id)).size===links.length,'hipotesis duplicada');
  const summaries=new Map();
  for(const item of states){
    const key=item.domain+'|'+item.variable;
    const old=summaries.get(key)??{domain:item.domain,variable:item.variable,
      count:0,first_seen_at:item.known_at,last_seen_at:item.known_at,last_value:null,unit:item.unit};
    need(old.unit===item.unit,'unidad incompatible para variable '+key);
    old.count++;
    old.last_seen_at=item.known_at;old.last_value=item.value;summaries.set(key,old);
  }
  const domains=[...new Set(states.map(x=>x.domain))].sort();
  const body={schema:UNIVERSO_SCHEMA,cutoff:time,total_supplied:all.length,
    withheld_future:all.length-states.length,known_states:states.length,
    domains,states,variables:[...summaries.values()].sort((a,b)=>(a.domain+'|'+a.variable).localeCompare(b.domain+'|'+b.variable)),
    relations:links,relations_type:'hipotesis_o_precedencia_no_causalidad_probada',
    complete_universe_observed:false};
  return {...body,snapshot_sha256:sha(JSON.stringify(body))};
}
export function verifyUniverseSnapshot(report){
  need(report&&report.schema===UNIVERSO_SCHEMA,'schema universal invalido');
  const {snapshot_sha256,...body}=report;
  need(sha(JSON.stringify(body))===snapshot_sha256,'snapshot universal modificado');
  return true;
}
