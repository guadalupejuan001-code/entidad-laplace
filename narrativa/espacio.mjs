/* Narrative-only state. No market/economic values, calendar IDs or labels. */
import {canonicalLedger,timestamp} from '../historia/contrato.mjs';
import {digest} from '../inteligencia/laplace.mjs';
import {readFileSync} from 'node:fs';

export const EXTRACTOR='laplace-narrativa-v1';
export const EXTRACTOR_SHA256=digest(readFileSync(new URL('./espacio.mjs',import.meta.url)));
export const MAX_STORIES=256;
export const MAX_PATTERNS=512;
const need=(ok,message)=>{if(!ok)throw new Error(message)};
export const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');

// A bounded, declared vocabulary, not a claim to understand arbitrary prose.
// No category has a hard-coded bullish/bearish sign: training estimates it.
export const THEMES=Object.freeze({
  CONFLICT_ESCALATION:{kind:'geopolitica',phrases:['military escalation','airstrike','invasion','escalada militar','bombardeo']},
  CEASEFIRE:{kind:'geopolitica',phrases:['ceasefire','peace agreement','alto el fuego','acuerdo de paz']},
  SANCTIONS:{kind:'geopolitica',phrases:['sanctions imposed','economic sanctions','sanciones impuestas','sanciones economicas']},
  SHIPPING_DISRUPTION:{kind:'geopolitica',phrases:['shipping disruption','shipping blocked','bloqueo maritimo','cierre del estrecho']},
  DIPLOMATIC_COOPERATION:{kind:'geopolitica',phrases:['diplomatic agreement','diplomatic cooperation','acuerdo diplomatico','cooperacion diplomatica']},
  CIVILIAN_HARM:{kind:'humanitaria',phrases:['civilian casualties','civilian deaths','civiles muertos','dano civil']},
  DISPLACEMENT:{kind:'humanitaria',phrases:['displaced people','forcibly displaced','personas desplazadas','desplazamiento forzado']},
  FOOD_INSECURITY:{kind:'humanitaria',phrases:['famine','food insecurity','hambruna','inseguridad alimentaria']},
  AID_BLOCKED:{kind:'humanitaria',phrases:['aid blocked','humanitarian access denied','ayuda bloqueada','acceso humanitario denegado']},
  RELIEF_ACCESS:{kind:'humanitaria',phrases:['humanitarian corridor','aid delivered','corredor humanitario','ayuda entregada']},
  HEALTH_EMERGENCY:{kind:'humanitaria',phrases:['disease outbreak','health emergency','brote epidemico','emergencia sanitaria']}
});

function tagsFor(story){
  const summary=normalize(story.summary),out=[];
  for(const [code,definition] of Object.entries(THEMES)){
    // A humanitarian report may also describe war or diplomacy, and a
    // geopolitical report may describe civilian harm. Retain both domains.
    // Trusted structured codes are explicit upstream annotations. Text-only
    // fallback uses simple local negation; ambiguity must remain documented.
    if(story.event_code===code){out.push(code);continue}
    const words=summary.split(' ');
    const matched=definition.phrases.some(phrase=>{
      const needle=normalize(phrase).split(' ');
      return words.some((_,index)=>{
        if(!needle.every((word,k)=>words[index+k]===word))return false;
        const prefix=words.slice(Math.max(0,index-3),index);
        return !prefix.some(word=>['no','not','without','sin','denied','desmiente'].includes(word));
      });
    });
    if(matched)out.push(code);
  }
  return out;
}

function regionKey(raw){
  const aliases={USA:'US',CHN:'CN',RUS:'RU',UKR:'UA',ISR:'IL',PSE:'PS',IRN:'IR',LBN:'LB',
    SYR:'SY',YEM:'YE',SDN:'SD',SSD:'SS',COD:'CD',HTI:'HT',AFG:'AF',MMR:'MM',VEN:'VE',
    SAU:'SA',TUR:'TR',PAK:'PK',BGD:'BD',SOM:'SO',ETH:'ET',NGA:'NG'};
  const original=raw.trim().toUpperCase(),key=aliases[original]??original;
  return /^(?:GLOBAL|US|CN|RU|UA|IL|PS|IR|LB|SY|YE|SD|SS|CD|HT|AF|MM|VE|EU|SA|TR|PK|BD|SO|ET|NG)$/.test(key)
    ?key:'OTHER';
}
function sourceKey(raw){
  const url=new URL(raw);url.hash='';
  for(const key of [...url.searchParams.keys()]){
    if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key.toLowerCase()))url.searchParams.delete(key);
  }
  url.searchParams.sort();url.pathname=url.pathname.replace(/\/$/,'');
  return url.toString();
}
export const patternKey=pattern=>JSON.stringify(pattern);
export function validatePattern(pattern){
  need(pattern&&['single','pair','sequence'].includes(pattern.type),'tipo de patron invalido');
  need(Array.isArray(pattern.terms)&&pattern.terms.length===(pattern.type==='single'?1:2),'terminos invalidos');
  for(const term of pattern.terms){
    need(typeof term==='string'&&/^[A-Z_]+(?:@[A-Z]+)?$/.test(term)&&
      Object.hasOwn(THEMES,term.split('@')[0]),'tema fuera de vocabulario');
  }
  return pattern;
}

// Internal entry accepts a prevalidated narrative ledger for chronological
// evaluation. Public boundary validates all records before dropping non-news.
export function stateFromNarratives(narratives,cutoff,lookbackHours=72){
  const when=timestamp(cutoff,'narrative cutoff');
  need(Number.isInteger(lookbackHours)&&lookbackHours>=1&&lookbackHours<=168,'ventana narrativa: 1..168 horas');
  const begin=new Date(Date.parse(when)-lookbackHours*3600000).toISOString();
  const eligible=narratives.filter(row=>row.known_at>begin&&row.known_at<=when)
    .sort((a,b)=>a.known_at.localeCompare(b.known_at)||a.id.localeCompare(b.id));
  need(eligible.length<=MAX_STORIES,'ventana excede '+MAX_STORIES+' relatos; dividir o declarar otra agregacion');
  const urls=new Set(),texts=new Set(),events=[];
  let ignored=0,duplicates=0;
  for(const story of eligible){
    const url=sourceKey(story.source_url),fingerprint=digest(normalize(story.summary));
    if(urls.has(url)||texts.has(fingerprint)){duplicates++;continue}
    urls.add(url);texts.add(fingerprint);
    const tags=tagsFor(story);
    if(!tags.length){ignored++;continue}
    events.push({id:story.id,kind:story.kind,known_at:story.known_at,source_url:story.source_url,
      tags,region:regionKey(story.region),content_sha256:fingerprint});
  }
  const atoms=new Set();
  for(const event of events)for(const tag of event.tags){atoms.add(tag);atoms.add(tag+'@'+event.region)}
  const sequences=new Set();
  for(let a=0;a<events.length;a++)for(let b=a+1;b<events.length;b++){
    if(events[a].known_at>=events[b].known_at)continue; // simultaneous reports have no established order
    for(const first of events[a].tags)for(const second of events[b].tags){
      if(first!==second)sequences.add(JSON.stringify([first,second]));
    }
  }
  const state={schema:EXTRACTOR,cutoff:when,lookback_hours:lookbackHours,
    atoms:[...atoms].sort(),sequences:[...sequences].sort().map(x=>JSON.parse(x)),events,
    coverage:{eligible:eligible.length,classified:events.length,unclassified:ignored,duplicates}};
  return {...state,state_sha256:digest(JSON.stringify(state))};
}

export function narrativeState(records,cutoff,lookbackHours=72){
  const narratives=canonicalLedger([...records]).filter(row=>['geopolitica','humanitaria'].includes(row.kind));
  return stateFromNarratives(narratives,cutoff,lookbackHours);
}

export function enumeratePatterns(state){
  const patterns=[],atoms=state.atoms;
  for(const term of atoms)patterns.push({type:'single',terms:[term]});
  // Combinations contain two distinct themes. Region-specific atoms remain
  // single conditions; pairs and sequences operate on the declared themes.
  const themes=atoms.filter(term=>!term.includes('@'));
  for(let a=0;a<themes.length;a++)for(let b=a+1;b<themes.length;b++){
    patterns.push({type:'pair',terms:[themes[a],themes[b]]});
  }
  for(const terms of state.sequences)patterns.push({type:'sequence',terms});
  need(patterns.length<=MAX_PATTERNS,'demasiados patrones por estado');
  return patterns;
}

export function matches(pattern,state){
  if(pattern.type==='sequence')return state.sequences.some(terms=>
    terms[0]===pattern.terms[0]&&terms[1]===pattern.terms[1]);
  return pattern.terms.every(term=>state.atoms.includes(term));
}
