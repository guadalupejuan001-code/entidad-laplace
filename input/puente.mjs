import {canonicalFact,stringifyJSONL} from '../historia/contrato.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {proveGlobalEther,compileGlobalEther} from '../universo/ether-global.mjs';
import {units,need,sha} from './contrato.mjs';

export function trainingFacts(events){
  const facts=[],excluded=[];
  for(const e of events){
    const base={id:'input-'+e.event_key,observed_at:e.event_time??e.known_at,known_at:e.known_at,source_url:e.source_url};
    let fact;
    if(e.type==='quote')fact={...base,kind:'precio',asset:e.subject.split('-')[0],price_basis:'spot_quote',currency:e.payload.currency,value:e.payload.price};
    else if(e.type==='macro')fact={...base,kind:'economia',series_id:e.payload.series_id,unit:e.payload.unit,value:e.payload.value};
    else if(e.type==='document')fact={...base,kind:'geopolitica',event_code:'TEXT_ONLY',region:'GLOBAL',summary:(e.payload.title+' '+e.payload.text).replace(/[\u0000-\u001f]+/g,' ').slice(0,1200)};
    else{excluded.push({event_key:e.event_key,reason:'no historical training mapping for '+e.type});continue}
    try{facts.push(canonicalFact(fact))}catch(error){excluded.push({event_key:e.event_key,reason:error.message})}
  }
  return {facts,excluded,jsonl:stringifyJSONL(facts),training_executed:false};
}
export function xiBatches(events,{cutoff=new Date().toISOString(),batchSize=1024}={}){
  need(Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=1024,'XI batch limit is 1024');
  const observations=[],excluded=[];
  const add=(e,domain,variable,unit,integer)=>{
    if(integer>BigInt(Number.MAX_SAFE_INTEGER)||integer<BigInt(Number.MIN_SAFE_INTEGER)){excluded.push({event_key:e.event_key,variable,reason:'exact integer exceeds float64 transport; retained in host'});return}
    observations.push({id:'i001-'+sha(e.event_key+'|'+variable).slice(0,48),domain,variable,unit,value:Number(integer),
      observed_at:e.event_time??e.known_at,known_at:e.known_at,source_url:e.source_url});
  };
  for(const e of events){
    if(e.known_at>cutoff)continue;
    try{
      if(e.type==='quote')add(e,'mercado',e.subject+'/precio_e8',e.payload.currency+'_e-8',units(e.payload.price,8));
      else if(e.type==='macro')add(e,'economia',e.payload.series_id+'/valor_e8','unidad_e-8',units(e.payload.value,8));
      else if(e.type==='narrative')for(const t of e.payload.targets){add(e,'narrativa',t.entity+'/polaridad','puntos',BigInt(t.polarity));add(e,'narrativa',t.entity+'/menciones','conteo',BigInt(t.mentions))}
      else if(e.type==='chain_block'){add(e,'onchain',e.subject+'/altura','bloques',BigInt(e.payload.height));
        add(e,'onchain',e.subject+'/operacion','codigo',BigInt({connect:1,disconnect:-1,finalize:2}[e.payload.operation]))}
    }catch(error){excluded.push({event_key:e.event_key,reason:error.message})}
  }
  const batches=[];for(let i=0;i<observations.length;i+=batchSize)batches.push(universeSnapshot(observations.slice(i,i+batchSize),{cutoff}));
  return {observations,batches,excluded,native_payload:'exact_scaled_integers_and_hash_keys',full_text_and_uint256_in_host:true};
}
export function proveInputXI(binary,events,options={}){
  const data=xiBatches(events,options),proofs=data.batches.map(snapshot=>proveGlobalEther(binary,snapshot));
  return {...data,batches:data.batches.map((snapshot,i)=>({snapshot,xi:compileGlobalEther(snapshot).xi,proof:proofs[i]})),
    exact_roundtrip:proofs.length>0&&proofs.every(p=>p.exact_roundtrip),prediction_generated:false};
}
