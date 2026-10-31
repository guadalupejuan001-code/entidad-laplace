/* Structured corroboration, not a majority vote over repeated text.
 * Inputs must already have semantic identity, period and original provenance. */
import {sha,stable,need} from './contrato.mjs';
import {utcTime} from '../universo/estados.mjs';
export function auditAssertions(assertions,{cutoff}={}){
  need(Array.isArray(assertions)&&assertions.length<=10000,'audit budget exceeded');
  cutoff=utcTime(cutoff);
  const latest=new Map();
  for(const a of assertions){
    utcTime(a.known_at);if(a.known_at>cutoff)continue;
    const key=stable([a.subject,a.metric,a.period,a.unit,a.origin_id]),old=latest.get(key);
    if(!old||a.known_at>old[0].known_at)latest.set(key,[a]);
    else if(a.known_at===old[0].known_at)old.push(a);
  }
  const claims=new Map();
  for(const a of [...latest.values()].flat()){
    need(['subject','metric','period','unit','value','origin_id','source_kind','event_key'].every(k=>typeof a[k]==='string'),'incomplete audit assertion');
    const key=sha(stable([a.subject,a.metric,a.period,a.unit])),group=claims.get(key)??{subject:a.subject,metric:a.metric,period:a.period,unit:a.unit,variants:new Map()};
    const variant=group.variants.get(a.value)??{value:a.value,origins:new Set(),primary:new Set(),event_keys:[]};
    variant.origins.add(a.origin_id);if(a.source_kind==='primary')variant.primary.add(a.origin_id);variant.event_keys.push(a.event_key);
    group.variants.set(a.value,variant);claims.set(key,group);
  }
  return [...claims].map(([key,g])=>({key,subject:g.subject,metric:g.metric,period:g.period,unit:g.unit,
    status:g.variants.size>1?'conflicting_assertions':[...g.variants.values()][0].primary.size?'primary_source_assertion':'awaiting_primary_evidence',
    variants:[...g.variants.values()].map(v=>({value:v.value,origins:[...v.origins].sort(),primary_origins:[...v.primary].sort(),event_keys:v.event_keys})),
    truth_guaranteed:false,price_effect:null}));
}
