/* F001: motor multiescala, determinista y sin dependencias Node/Android.
 * La serie predice el precio candidato; el mundo modifica SOLAMENTE la amplitud
 * exploratoria del escenario. No transforma correlaciones en causalidad ni opera.
 */
export const FUSION_SCHEMA='laplace-fusion-temporal-f001-v1';
export const HORIZON_PLAN=Object.freeze([
  [5,300],[15,300],[30,300],[60,300],[120,300],
  [240,3600],[480,3600],[720,3600],[1440,3600],[4320,3600],
  [10080,86400],[20160,86400],[43200,86400],[129600,86400]
].map(([minutes,granularity])=>Object.freeze({minutes,granularity})));
export const HISTORIA_REQUERIDA=Object.freeze({
  300:{days:14,chunkDays:1},
  3600:{days:45,chunkDays:10},
  86400:{days:1000,chunkDays:200}
});
const need=(x,msg)=>{if(!x)throw Error(msg)};
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const iso=t=>new Date(t).toISOString();
const round=(x,n=8)=>Number(x.toFixed(n));
function percentile(a,q){
  if(!a.length)return null;
  const x=[...a].sort((a,b)=>a-b),i=q*(x.length-1),lo=Math.floor(i),hi=Math.ceil(i);
  return x[lo]+(x[hi]-x[lo])*(i-lo);
}
function feature(rows,i,gaps){
  if(i<6||gaps[i]!==gaps[i-6])return null;
  const ret=[];for(let j=i-5;j<=i;j++)ret.push(Math.log(rows[j][4]/rows[j-1][4]));
  const vol=avg(rows.slice(i-5,i+1).map(x=>x[5]));
  return [Math.log(rows[i][4]/rows[i-3][4]),
    Math.log(rows[i][4]/rows[i-1][4]),Math.sqrt(avg(ret.map(v=>v*v))),
    avg(rows.slice(i-2,i+1).map(x=>(x[2]-x[1])/x[4])),
    vol>0?rows[i][5]/vol:1];
}
export function prepararSerie(raw,{granularity,cutoff}){
  need(Object.hasOwn(HISTORIA_REQUERIDA,granularity),'Granularidad no soportada');
  const cut=Date.parse(cutoff);
  need(Number.isFinite(cut),'Corte temporal inválido');
  need(Array.isArray(raw)&&raw.length<=12000,'Presupuesto de velas excedido');
  const map=new Map();
  for(const r of raw){
    need(Array.isArray(r)&&r.length===6&&r.every(Number.isFinite),'Vela OHLCV inválida');
    const [t,lo,hi,o,c,v]=r;
    need(Number.isSafeInteger(t)&&t>=0&&t%granularity===0&&lo>0&&hi>=lo&&
      o>=lo&&o<=hi&&c>=lo&&c<=hi&&v>=0,'Vela inconsistente');
    if((t+granularity)*1000>cut)continue; // Nunca consumir la vela abierta.
    const old=map.get(t);
    need(!old||JSON.stringify(old)===JSON.stringify(r),'Velas contradictorias');
    map.set(t,r);
  }
  const bars=[...map.values()].sort((a,b)=>a[0]-b[0]),gaps=bars.map((b,i)=>i>0&&b[0]!==bars[i-1][0]+granularity?1:0);
  for(let i=1;i<gaps.length;i++)gaps[i]+=gaps[i-1];
  const features=bars.map((_,i)=>feature(bars,i,gaps));
  return {granularity,bars,gaps,features,
    last_complete_at:bars.length?iso((bars.at(-1)[0]+granularity)*1000):null};
}
const BASE_SCALE=[0.007,0.004,0.004,0.006,1.5];
export function proyectarHorizonte(prepared,quote,{minutes,granularity},at){
  const {bars,gaps,features}=prepared;
  const time=Date.parse(quote.observed_at),step=minutes*60/granularity;
  need(Number.isInteger(step)&&step>=1,'Horizonte incompatible con granularidad');
  const target=time+minutes*60000;
  const n=bars.length-1;
  const result={minutes,granularity,observed_at:quote.observed_at,target_at:iso(target),
    historical_bars:bars.length,analogs:0,price_candidate:null,return_pct:null,
    analog_low:null,analog_high:null,status:'sin_historia',validation:'no_validado',
    raw_diagnostics:null};
  if(n<Math.max(24,step+7))return result;
  if(time-(bars[n][0]+granularity)*1000>granularity*2000){
    result.status='serie_desactualizada';return result;
  }
  const current=features[n];if(!current){result.status='serie_discontinua';return result}
  const candidates=[],mult=Math.sqrt(granularity/300);
  const scale=BASE_SCALE.map((v,i)=>i===4?v:v*mult);
  // La etiqueta histórica debe haberse cerrado ANTES del ancla de predicción.
  for(let i=6;i+step<n;i++){
    if(!features[i]||gaps[i+step]!==gaps[i])continue;
    const distance=Math.sqrt(avg(current.map((v,k)=>((v-features[i][k])/scale[k])**2)));
    const r=Math.log(bars[i+step][4]/bars[i][4]);
    if(Number.isFinite(distance)&&Number.isFinite(r))
      candidates.push({i,distance,r});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.i-b.i);
  const chosen=[];
  for(const x of candidates){
    if(chosen.every(y=>Math.abs(y.i-x.i)>=step))chosen.push(x);
    if(chosen.length===18)break;
  }
  result.analogs=chosen.length;
  // Persist actual untouched numerical features and selected evidence even if
  // minimum independent-sample criterion forces abstention.
  result.raw_diagnostics={
    eligible_historical_windows:candidates.length,
    selected_analogs:chosen.map(x=>({
      index:x.i,time:new Date(bars[x.i][0]*1000).toISOString(),
      distance:x.distance,return_log:x.r,weight:1/(1+x.distance)
    })),
    features:current.slice(),normalization_scales:scale.slice(),
    price_candidate_unrounded:null,return_log_unrounded:null,
    return_pct_unrounded:null,analog_low_unrounded:null,
    analog_high_unrounded:null,
    numeric_format:'IEEE_754_binary64_no_display_rounding',
    model_criterion_met:chosen.length>=8,
    no_invented_price_on_abstention:true
  };
  if(chosen.length<8){result.status='soporte_insuficiente';return result}
  const weights=chosen.map(x=>1/(1+x.distance)),sum=weights.reduce((a,b)=>a+b,0);
  const estimate=chosen.reduce((a,x,i)=>a+x.r*weights[i],0)/sum;
  const q10=percentile(chosen.map(x=>x.r),0.1),q90=percentile(chosen.map(x=>x.r),0.9);
  const price=Number(quote.value)*Math.exp(estimate);
  if(!Number.isFinite(price)||price<=0){result.status='resultado_invalido';return result}
  result.raw_diagnostics.price_candidate_unrounded=price;
  result.raw_diagnostics.return_log_unrounded=estimate;
  result.raw_diagnostics.return_pct_unrounded=100*(Math.exp(estimate)-1);
  result.raw_diagnostics.analog_low_unrounded=Number(quote.value)*Math.exp(q10);
  result.raw_diagnostics.analog_high_unrounded=Number(quote.value)*Math.exp(q90);
  result.price_candidate=round(price,4);
  result.return_pct=round(100*(Math.exp(estimate)-1),5);
  result.analog_low=round(Number(quote.value)*Math.exp(q10),4);
  result.analog_high=round(Number(quote.value)*Math.exp(q90),4);
  result.status='candidato_experimental';
  return result;
}
const AGE_MS={
  mercado_global:6*3600000,cripto_global:6*3600000,clima_global:6*3600000,
  sismologia_global:48*3600000,geomagnetismo_global:48*3600000,
  macro_global:3*365*86400000
};
export function evaluarContexto(world,at){
  if(!world)return {status:'no_disponible',observations:0,usable:0,excluded:0,
    domains:[],freshness:0,market_stress:0,uncertainty_multiplier:1,source_status:[]};
  const cut=Date.parse(at),states=world.universal_state?.states;
  need(Number.isFinite(cut)&&Array.isArray(states)&&states.length<=4096,'Snapshot mundial inválido');
  const byDomain=new Map(),returnSignals=[];let excluded=0,usable=0,fresh=0;
  for(const o of states){
    const obs=Date.parse(o?.observed_at),known=Date.parse(o?.known_at);
    if(!Number.isFinite(obs)||!Number.isFinite(known)||known<obs||known>cut||obs>cut||
       typeof o.value!=='number'||!Number.isFinite(o.value)||typeof o.domain!=='string'){
      excluded++;continue;
    }
    const age=cut-obs,maxAge=AGE_MS[o.domain]??30*86400000;
    const isFresh=age<=maxAge;
    const domain=byDomain.get(o.domain)??{domain:o.domain,observations:0,fresh:0};
    domain.observations++;if(isFresh)domain.fresh++;byDomain.set(o.domain,domain);
    usable++;if(isFresh)fresh++;
    // Solo retornos porcentuales de precio son comparables; nunca sumar
    // precios, temperaturas, tasas y conteos crudos entre sí.
    if(isFresh&&o.unit==='ratio'&&/return_(5m|30m)$/.test(o.variable)&&
       (o.domain==='mercado_global'||o.domain==='cripto_global')){
      returnSignals.push(clamp(Math.abs(o.value)/0.03,0,1));
    }
  }
  const freshness=usable?fresh/usable:0,stress=returnSignals.length?avg(returnSignals):0;
  const multiplier=usable?1+clamp(0.25*(1-freshness)+0.25*stress,0,0.5):1;
  return {status:usable?(excluded?'parcial':'observado'):'sin_senales_validas',
    observations:states.length,usable,excluded,domains:[...byDomain.values()].sort((a,b)=>a.domain.localeCompare(b.domain)),
    freshness:round(freshness),market_stress:round(stress),
    uncertainty_multiplier:round(multiplier),source_status:world.source_status??[],
    captured_at:world.at??null,snapshot_sha256:world.universal_state.snapshot_sha256??null,
    disclaimer:'La cobertura y el estrés amplían escenarios; no prueban relación causal ni ajustan el precio central.'};
}
export function fusionTemporal({quote,series={},world=null,asOf}){
  const at=Date.parse(asOf),qt=Date.parse(quote?.observed_at),known=Date.parse(quote?.known_at),price=Number(quote?.value);
  need(Number.isFinite(at)&&Number.isFinite(qt)&&Number.isFinite(known)&&known>=qt&&known<=at&&
    at-qt<=180000&&at-qt>=0,'Cotización fuera del corte temporal');
  need(quote.asset==='BTC-USD'&&Number.isFinite(price)&&price>0,'Cotización BTC/USD requerida');
  const prepared=new Map();
  for(const key of Object.keys(HISTORIA_REQUERIDA)){
    prepared.set(Number(key),prepararSerie(series[key]??[],{granularity:Number(key),cutoff:quote.observed_at}));
  }
  const context=evaluarContexto(world,asOf);
  const horizons=HORIZON_PLAN.map(plan=>{
    const r=proyectarHorizonte(prepared.get(plan.granularity),quote,plan,at);
    if(r.price_candidate===null)return {...r,scenario_low:null,scenario_high:null,
      scenario_raw:null};
    const low=Math.min(price,r.analog_low),high=Math.max(price,r.analog_high);
    const mult=context.uncertainty_multiplier;
    return {...r,scenario_low:round(Math.max(0,price-(price-low)*mult),4),
      scenario_high:round(price+(high-price)*mult,4),
      scenario_raw:{
        low_unrounded:price-(price-low)*mult,
        high_unrounded:price+(high-price)*mult,
        mult:mult,
        lower_bounded_to_zero_in_display:price-(price-low)*mult<0,
        conditioned_on_experimental_world_freshness:true,
        central_candidate_unchanged:true
      }};
  });
  return {schema:FUSION_SCHEMA,as_of:asOf,asset:'BTC-USD',
    quote:{value:quote.value,observed_at:quote.observed_at,known_at:quote.known_at},
    horizons,context,method:'analogos_multiescala_y_escenario_contextual',
    calculation_policy:'Todas las entradas integradas en un corte; contexto afecta incertidumbre y no predicción central.',
    backtest_certified:false,financial_advantage_demonstrated:false,automatic_trading:false};
}
export async function adquirirEnParalelo(collectors,{now=()=>new Date().toISOString()}={}){
  const names=['quote','bars_300','bars_3600','bars_86400','world'];
  need(names.every(name=>typeof collectors[name]==='function'),'Faltan recolectores');
  const started=now(),results=await Promise.allSettled(names.map(name=>collectors[name]()));
  const at=now(),readings={},sources={};
  results.forEach((r,i)=>{
    const name=names[i];
    if(r.status==='fulfilled'){readings[name]=r.value;sources[name]={status:'ok'}}
    else sources[name]={status:'error',message:String(r.reason?.message??r.reason).slice(0,180)};
  });
  if(!readings.quote)throw Error('Cotización no disponible: no se genera predicción');
  const report=fusionTemporal({quote:readings.quote,series:{
    300:readings.bars_300??[],3600:readings.bars_3600??[],86400:readings.bars_86400??[]
  },world:readings.world??null,asOf:at});
  return {...report,collection:{started_at:started,finished_at:at,lanes:sources,
    complete:names.every(name=>sources[name].status==='ok')}};
}
