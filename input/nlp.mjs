/* Deliberately small ES/EN lexicon, versioned and explainable. An extraction
 * score is not a truth score or a market forecast. No external model authority. */
import {sha,stable,event} from './contrato.mjs';
export const NLP_VERSION='laplace-lexicon-es-en-i001.1';
const defaults=[
  ['BTC',['bitcoin','btc']],['NVDA',['nvidia','nvda']],['BLK',['blackrock','blk']],
  ['JPM',['jpmorgan','jp morgan','jpmorgan chase','jpm']],['MSFT',['microsoft','msft']],
  ['AAPL',['apple','aapl']],['AMZN',['amazon','amzn']],['TSLA',['tesla','tsla']]
];
export function aliasesFromRegistry(registry){
  return defaults.map(([ticker,names])=>{
    const entity=registry.entities.find(e=>e.identifiers?.ticker===ticker);
    return entity?[entity.id,[...new Set([...names,entity.name,...entity.aliases])]]:[ticker,names];
  });
}
const negative=new Set(['odio','odiar','hate','hated','fraude','fraud','caida','cae','crash','perdida','loss','reject','rechazo','baja','bad','malo']);
const positive=new Set(['adoro','amo','love','positivo','positiva','positive','bueno','good','growth','crecimiento','sube','gana','gain','exito','success','optimismo']);
const negatives=new Set(['no','not','never','nunca','sin']);
const clean=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const tokens=s=>clean(s).match(/[a-z0-9]+/g)??[];
export function analyzeText(title,text,{aliases=defaults}={}){
  const input=(title+'\n'+text).slice(0,201000),clauses=input.split(/[.!?;\n]+|\b(?:pero|but|mientras|whereas)\b/iu);
  const targets=new Map();
  for(const clause of clauses){
    const words=tokens(clause);if(!words.length)continue;
    const mentions=[];
    for(const [entity,names] of aliases)for(const name of names){
      const parts=tokens(name);for(let i=0;i<=words.length-parts.length;i++)if(parts.every((w,k)=>words[i+k]===w))mentions.push({entity,at:i});
    }
    const unique=mentions.filter((m,i)=>mentions.findIndex(x=>x.entity===m.entity&&x.at===m.at)===i);
    for(const mention of unique){
      const old=targets.get(mention.entity)??{entity:mention.entity,mentions:0,positive_terms:0,negative_terms:0,term_evidence:[],declared_intent:false,reported_action:false};
      old.mentions++;
      for(let i=0;i<words.length;i++){
        if(!negative.has(words[i])&&!positive.has(words[i]))continue;
        // Attribute a term to the nearest named target in this clause.
        const nearest=Math.min(...unique.map(x=>Math.abs(x.at-i)));
        if(Math.abs(mention.at-i)!==nearest||nearest>8)continue;
        let sign=positive.has(words[i])?1:-1;if(words.slice(Math.max(0,i-3),i).some(w=>negatives.has(w)))sign=-sign;
        if(sign>0)old.positive_terms++;else old.negative_terms++;
        if(old.term_evidence.length<12)old.term_evidence.push({term:words[i],polarity:sign,negation_applied:(positive.has(words[i])?1:-1)!==sign});
      }
      const segment=words.slice(Math.max(0,mention.at-7),mention.at+8).join(' ');
      old.declared_intent||=/\b(?:voy a comprar|quiero comprar|will buy|plan to|planea|planean|intencion|intent)\b/.test(segment);
      old.reported_action||=/\b(?:compro|vendio|anuncio|announced|purchased|sold|reported)\b/.test(segment);
      targets.set(mention.entity,old);
    }
  }
  return [...targets.values()].map(t=>({...t,polarity:t.positive_terms-t.negative_terms,
    stance:t.declared_intent?'declared_intent':t.reported_action?'reported_action':'opinion_or_mention',
    action_verified:false,extraction_method:NLP_VERSION}));
}
export function narrativeEvent(document,{available_at=new Date().toISOString(),aliases}={}){
  const targets=analyzeText(document.payload.title,document.payload.text,{aliases});
  const payload={document_event_key:document.event_key,targets,content_fingerprint:document.payload.content_fingerprint,
    publisher:document.payload.publisher,model_version:NLP_VERSION,price_effect:null};
  const raw={source_id:'nlp/'+document.source_id,stream_key:document.stream_key,source_url:document.source_url,
    received_at:[available_at,document.known_at].sort().at(-1),raw_sha256:document.raw_sha256,delivery_id:document.delivery_id,source_sequence:null};
  return {...event(raw,{native_id:document.event_key,revision:sha(stable([NLP_VERSION,aliases??defaults])),type:'narrative',subject:document.subject,
    event_time:document.event_time,payload,quality:{truth:'derived_interpretation',sentiment_is_price_prediction:false}}),
    processed_at:raw.received_at,available_at:raw.received_at,input_keys:[document.event_key]};
}
export function attentionWindow(events,{cutoff,windowMs=3600000}={}){
  const hi=Date.parse(cutoff),lo=hi-windowMs,out=new Map(),seen=new Set();
  for(const e of events){
    if(e.type!=='narrative'||Date.parse(e.known_at)>hi||Date.parse(e.known_at)<lo)continue;
    const fingerprint=e.payload.content_fingerprint;
    for(const t of e.payload.targets){
      const key=t.entity+'|'+fingerprint;if(seen.has(key))continue;seen.add(key);
      const x=out.get(t.entity)??{entity:t.entity,distinct_content:0,polarity_sum:0,publishers:new Set(),declared_intents:0};
      x.distinct_content++;x.polarity_sum+=t.polarity;x.publishers.add(e.payload.publisher);x.declared_intents+=Number(t.declared_intent);out.set(t.entity,x);
    }
  }
  return [...out.values()].map(x=>({...x,publishers:[...x.publishers].sort(),independent_sources_verified:false,world_population_coverage:false}));
}
