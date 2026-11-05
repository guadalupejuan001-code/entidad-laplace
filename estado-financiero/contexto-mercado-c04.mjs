/* C04: nuevas observaciones de mercado + referencia al mundo ya archivado.
 * El diario persiste solamente el delta y sus sellos. No renueva las fechas
 * de BIS, SEC o macro ni convierte copias de estados en ejemplos nuevos.
 */
import {createHash} from 'node:crypto';
import {normalizarCapturaU003} from './modelo.mjs';
import {observation,universeSnapshot,utcTime} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {serieId} from '../demonio/series.mjs';
import {CRYPTO_CONTEXT_ASSETS,MARKET_ROOT,marketDecimal,measureBook,measureTrades}
  from '../universo/microestructura-medidas.mjs';

export const C04_FRAME='laplace-market-delta-c04-v1';
const need=(ok,m)=>{if(!ok)throw Error(m)};
function stable(x){return Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?
  '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x)}
const digest=x=>createHash('sha256').update(stable(x)).digest('hex');
const endpoint=(asset,name)=>MARKET_ROOT+asset+'/'+(name==='book'?'book?level=2':name);

export function crearMarcoMercadoC04(payload,base,{asOf=new Date().toISOString()}={}){
  normalizarCapturaU003(base);
  const asset=payload?.asset,cut=utcTime(payload?.captured_at),now=Date.parse(utcTime(asOf));
  need(payload?.schema==='laplace-market-context-c04-v1'&&CRYPTO_CONTEXT_ASSETS.includes(asset),
    'C04: contexto de mercado desconocido');
  need(Date.parse(base.at)<=Date.parse(cut)&&Date.parse(cut)<=now&&now-Date.parse(cut)<=60000,
    'C04: contexto futuro o desactualizado');
  const components=payload.components,observations=[],sources=[],coin=asset.split('-')[0];
  need(components?.ticker?.status==='observed','C04: falta ticker observado');
  for(const name of ['ticker','book','trades']){
    const c=components?.[name];
    if(!c||c.status!=='observed'){
      sources.push({name:'Coinbase-'+name,source_url:endpoint(asset,name),status:'unavailable'});continue;
    }
    const received=utcTime(c.received_at),at=Date.parse(received);
    need(c.source_url===endpoint(asset,name)&&at<=Date.parse(cut)&&Date.parse(cut)-at<=60000,
      'C04: origen o recepción inválida');
    need(/^[a-f0-9]{64}$/.test(c.raw_sha256??''),'C04: falta huella de la respuesta');
    const add=(domain,variable,value,unit,observed=received)=>observations.push(observation({
      id:'c04-'+asset+'-'+variable+'-'+at,domain,variable,value,unit,
      observed_at:observed,known_at:received,source_url:c.source_url}));
    if(name==='ticker'){
      const observed=utcTime(new Date(Date.parse(c.data?.time)).toISOString());
      need(Date.parse(observed)<=at&&at-Date.parse(observed)<=180000,'C04: ticker futuro o antiguo');
      add('cripto_global',asset.replace('-','_')+'_spot',marketDecimal(c.data.price),'USD',observed);
    }else if(name==='book'){
      const b=measureBook(c.data,{at:received,product:asset});
      add('liquidez',coin+'_spread_bps',b.spread_bps,'bps');
      add('liquidez',coin+'_bid_depth_usd_top10',b.bid_depth_usd_top10,'USD');
      add('liquidez',coin+'_ask_depth_usd_top10',b.ask_depth_usd_top10,'USD');
      add('liquidez',coin+'_top10_notional_imbalance',b.top10_notional_imbalance,'ratio');
    }else{
      need(c.data.every(r=>Date.parse(r.time)<=at),'C04: operación posterior a su recepción');
      const t=measureTrades(c.data,{at:received,product:asset});
      add('flujo',coin+'_observed_trade_count',t.observed_trade_count,'trades');
      add('flujo',coin+'_maker_buy_notional_usd',t.maker_buy_notional_usd,'USD');
      add('flujo',coin+'_maker_sell_notional_usd',t.maker_sell_notional_usd,'USD');
    }
    sources.push({name:'Coinbase-'+name,source_url:c.source_url,status:'observed',
      received_at:received,raw_sha256:c.raw_sha256,
      coverage:name==='book'?'L2_snapshot_top10_not_executions':name==='trades'?
        'recent_REST_sample_not_complete_flow':'latest_trade_ticker'});
  }
  const body={schema:C04_FRAME,asset,captured_at:cut,base_capture_sha256:base.capture_sha256,
    base_captured_at:base.at,observations,sources,
    provider_signature_verified:false,full_world_copied:false};
  return {...body,frame_sha256:digest(body)};
}

export function verificarMarcoMercadoC04(frame,{asOf=new Date().toISOString()}={}){
  need(frame?.schema===C04_FRAME&&CRYPTO_CONTEXT_ASSETS.includes(frame.asset),'C04: marco desconocido');
  const {frame_sha256,...body}=frame;
  need(/^[a-f0-9]{64}$/.test(frame.base_capture_sha256??'')&&digest(body)===frame_sha256,
    'C04: marco alterado');
  need(Date.parse(utcTime(frame.base_captured_at))<=Date.parse(utcTime(frame.captured_at))&&
    Date.parse(frame.captured_at)<=Date.parse(utcTime(asOf)),'C04: fecha futura o base contradictoria');
  need(Array.isArray(frame.observations)&&frame.observations.length>=1&&frame.observations.length<=8,
    'C04: número de medidas inválido');
  const seen=new Set(),asset=frame.asset,coin=asset.split('-')[0];
  const allowed=new Map([[asset.replace('-','_')+'_spot',['cripto_global','USD','ticker']],
    ...[['spread_bps','bps'],['bid_depth_usd_top10','USD'],['ask_depth_usd_top10','USD'],['top10_notional_imbalance','ratio']]
      .map(([v,u])=>[coin+'_'+v,['liquidez',u,'book']]),
    ...[['observed_trade_count','trades'],['maker_buy_notional_usd','USD'],['maker_sell_notional_usd','USD']]
      .map(([v,u])=>[coin+'_'+v,['flujo',u,'trades']])]);
  for(const raw of frame.observations){const r=observation(raw),spec=allowed.get(r.variable);
    need(spec&&r.domain===spec[0]&&r.unit===spec[1]&&r.source_url===endpoint(asset,spec[2])&&
      r.known_at<=frame.captured_at&&!seen.has(r.variable),'C04: medida incompatible');
    seen.add(r.variable);
  }
  need(seen.has(asset.replace('-','_')+'_spot'),'C04: falta precio de referencia observado');
  return true;
}

export function incorporarMarcosC04(captures,frames,{asOf=new Date().toISOString()}={}){
  const bases=new Map();for(const c of captures){normalizarCapturaU003(c);bases.set(c.capture_sha256,c)}
  const seen=new Map(),expanded=[],unresolved=[],carry=new Map(),baseStates=new Map();
  for(const f of [...frames].sort((a,b)=>a.captured_at.localeCompare(b.captured_at))){verificarMarcoMercadoC04(f,{asOf});
    const old=seen.get(f.captured_at);
    need(!old||old===f.frame_sha256,'C04: marcos contradictorios en la misma fecha');
    if(old)continue;seen.set(f.captured_at,f.frame_sha256);
    const base=bases.get(f.base_capture_sha256);
    if(!base){unresolved.push({frame_sha256:f.frame_sha256,reason:'base_capture_not_available'});continue}
    need(base.at===f.base_captured_at,'C04: referencia de base alterada');
    if(!baseStates.has(base.capture_sha256)){
      const state=new Map();for(const r of base.universal_state.states){const id=serieId(r),old=state.get(id);
        if(!old||r.observed_at>old.observed_at||r.observed_at===old.observed_at&&r.known_at>old.known_at)state.set(id,r);
      }baseStates.set(base.capture_sha256,state);
    }
    const states=new Map(baseStates.get(base.capture_sha256));
    for(const r of f.observations){const id=serieId(r),old=carry.get(id);
      if(!old||r.observed_at>old.observed_at||r.observed_at===old.observed_at&&r.known_at>old.known_at)carry.set(id,r);
    }
    for(const [id,r]of carry){const old=states.get(id);
      if(!old||r.observed_at>old.observed_at||r.observed_at===old.observed_at&&r.known_at>old.known_at)states.set(id,r);
    }
    const snapshot=universeSnapshot([...states.values()],{cutoff:f.captured_at});
    expanded.push(sellarCaptura({schema:'laplace-universo-global-u003-v4',at:f.captured_at,
      universal_state:snapshot,source_status:f.sources,coverage:{known_signals:snapshot.known_states,
        groups:[],market_delta:true,world_reference_at:base.at},
      market_frame_sha256:f.frame_sha256,world_base_sha256:base.capture_sha256,
      prediction_inputs_enabled:false,automatic_trading:false}));
  }
  const all=new Map(captures.map(c=>[c.at,c]));
  for(const c of expanded){need(!all.has(c.at),'C04: captura y marco comparten fecha');all.set(c.at,c)}
  return {captures:[...all.values()].sort((a,b)=>a.at.localeCompare(b.at)),
    frames_verified:seen.size,frames_materialized:expanded.length,unresolved,
    full_world_copied_in_journal:false};
}

export function ejecutarContextoVivoC04(captures,frames,market,options,execute){
  const asOf=options.asOf??new Date().toISOString();
  const available=captures.filter(c=>Date.parse(c.at)<=Date.parse(market?.captured_at??asOf))
    .sort((a,b)=>a.at.localeCompare(b.at));
  let frame=null;
  if(market&&available.length)frame=crearMarcoMercadoC04(market,available.at(-1),{asOf});
  const list=frame?[...frames,frame]:frames;
  const history=incorporarMarcosC04(captures,list,{asOf});
  const result=execute(history.captures,{...options,asOf});
  return {...result,market_frame:frame,context_journal:{frames_verified:history.frames_verified,
    frames_materialized:history.frames_materialized,unresolved:history.unresolved,
    world_reference_at:frame?.base_captured_at??null,latest_market_at:frame?.captured_at??null,
    full_world_copied:false}};
}
