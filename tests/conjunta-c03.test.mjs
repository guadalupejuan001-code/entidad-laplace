import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {ejecutarConjuntoC03,componenteDeSerieC03} from '../prediccion/conjunta-c03.mjs';
import {medirConfianzaInterna} from '../nucleo/confianza-c03.mjs';

const H=3600000,START=Date.parse('2026-08-01T00:00:00Z'),stamp=t=>new Date(t).toISOString();
function history(n=150,{distortTest=false,lateSeries=false}={}){
  const out=[];let price=50000,previous=0;
  for(let i=0;i<n;i++){
    const t=START+i*6*H,at=stamp(t),signal=Math.sin(i*.83)+.6*Math.cos(i*1.11);
    price*=Math.exp(.005*previous+(distortTest&&i>=130?.01*Math.cos(i):0));previous=signal;
    const row=(id,domain,variable,value,url='https://example.org/signal',unit='index')=>({
      id:id+'-'+i,domain,variable,value,unit,observed_at:at,known_at:at,source_url:url});
    const states=[row('btc','cripto_global','BTC_USD_spot',price,
      'https://api.exchange.coinbase.com/products/BTC-USD/ticker','USD'),
      row('positive','banca_bis_locacional','positive',100+signal,'https://data.bis.org/a','USD_million'),
      row('negative','banca_bis_locacional','negative',100-signal,'https://data.bis.org/b','USD_million'),
      row('flow','liquidez','depth_imbalance',signal,'https://api.exchange.coinbase.com/products/BTC-USD/book','ratio'),
      row('etf','etf_funds','holdings',20+Math.sin(i*.5)),
      row('otc','finra_otc','short_volume',200+Math.cos(i*.7)),
      row('derivative','derivados','funding',.001*signal),
      row('defi','blockchain_publica','height',900000+i,'https://example.org/chain','blocks'),
      row('event','noticias','events',30+Math.cos(i)),
      row('equity','bolsas','SPY',500+Math.sin(i*.71),'https://example.org/spy','USD')];
    if(lateSeries&&i>=130)states.push(row('new','clima','new_sensor',i));
    out.push(sellarCaptura({schema:'laplace-universo-global-u003-v4',at,
      universal_state:universeSnapshot(states,{cutoff:at}),coverage:{known_signals:states.length,groups:[]},
      source_status:[],automatic_trading:false,prediction_inputs_enabled:false}));
  }return out;
}

test('C03 conecta series separadas aunque los shocks de su familia se cancelen',()=>{
  const captures=history(),r=ejecutarConjuntoC03(captures,{asOf:captures.at(-1).at});
  assert.equal(r.model_ready,true,JSON.stringify(r.counts));
  assert.equal(r.components.length,20);
  assert.equal(r.trained_series,10);
  assert.equal(r.feature_count,40);
  const a=r.contributions.find(x=>x.variable==='positive'),b=r.contributions.find(x=>x.variable==='negative');
  assert.notDeepEqual(a.coefficients,b.coefficients);
  assert.ok(Math.abs(a.contribution_log_return)+Math.abs(b.contribution_log_return)>0);
  assert.ok(r.components.find(x=>x.key==='B001').series===2);
  assert.ok(r.components.find(x=>x.key==='EF003').status==='not_supplied_to_c03');
  assert.equal(r.original_units_never_summed,true);
  assert.equal(r.forecast.asset,'BTC-USD');
  assert.equal(r.central_price_modified,false);
  const s=r.split_boundaries;
  assert.ok(s.training_last_label<s.validation_first_decision);
  assert.ok(s.validation_last_label<s.calibration_first_decision);
  assert.ok(s.calibration_last_label<s.test_first_decision);
});

test('C03 fija catálogo, escalas, pesos y calibración antes del bloque reservado',()=>{
  const captures=history(),later=history(150,{distortTest:true,lateSeries:true});
  const a=ejecutarConjuntoC03(captures,{asOf:captures.at(-1).at});
  const b=ejecutarConjuntoC03(later,{asOf:later.at(-1).at});
  assert.equal(a.model_sha256,b.model_sha256);
  assert.deepEqual(a.model,b.model);
  assert.notDeepEqual(a.holdout,b.holdout);
  assert.equal(b.unknown_latest_series.length,1);
  assert.equal(b.trained_series,10,'No seleccionar una serie porque aparece en prueba');
});

test('C03 se abstiene con archivo insuficiente, precio antiguo o activo sin adaptador',()=>{
  const short=history(5),a=ejecutarConjuntoC03(short,{asOf:short.at(-1).at});
  assert.equal(a.reason,'insufficient_purged_independent_outcomes');
  assert.equal(a.model_ready,false);
  assert.equal(a.components.length,20);
  const full=history(),b=ejecutarConjuntoC03(full,{asOf:stamp(Date.parse(full.at(-1).at)+H)});
  assert.equal(b.model_ready,true);assert.equal(b.forecast,null);
  assert.equal(b.reason,'latest_world_capture_not_fresh_at_issue');
  assert.equal(ejecutarConjuntoC03(full,{asOf:full.at(-1).at,asset:'ETH-USD'}).reason,
    'asset_has_no_verified_c03_target_adapter');
});

test('C03 ignora capturas posteriores al corte y rechaza duplicación o alteración',()=>{
  const captures=history(),cut=captures[100].at;
  assert.deepEqual(ejecutarConjuntoC03(captures,{asOf:cut}),
    ejecutarConjuntoC03(captures.slice(0,101),{asOf:cut}));
  assert.throws(()=>ejecutarConjuntoC03([...captures,captures[20]],{asOf:captures.at(-1).at}),/duplicada/);
  const broken=structuredClone(captures);broken[20].universal_state.states[0].value++;
  assert.throws(()=>ejecutarConjuntoC03(broken,{asOf:captures.at(-1).at}));
});

test('C03 la asignación de componentes conserva origen financiero y flujo',()=>{
  assert.equal(componenteDeSerieC03('liquidez'),'ORDER_FLOW');
  assert.equal(componenteDeSerieC03('blockchain_publica'),'K001');
  assert.equal(componenteDeSerieC03('unknown_domain'),'WORLD');
});

test('C03 usa cierres exactos aunque la captura llegue 37 segundos después y reacciona a entradas nuevas',()=>{
  const source=history(),captures=source.map(c=>{
    const at=stamp(Date.parse(c.at)+37000);
    const states=c.universal_state.states.map(r=>({...r,known_at:at}));
    return sellarCaptura({...c,at,universal_state:universeSnapshot(states,{cutoff:at})});
  });
  const g=3600,rows=Array.from({length:902},(_,i)=>{
    const t=START/1000+(i-1)*g,p=1000*Math.exp(.01*Math.sin(i*.09));
    return [t,p*.99,p*1.01,p,p,10];
  });
  const options={asOf:captures.at(-1).at,horizonHours:6,targetCandles:{granularity:g,rows}};
  const a=ejecutarConjuntoC03(captures,options);
  assert.equal(a.model_ready,true,JSON.stringify(a.counts));
  assert.equal(a.label_kind,'retrospective_closed_OHLCV_not_prospective_or_vintage_certified');
  assert.equal(Date.parse(a.forecast.target_at)%(g*1000),0);
  const changed=structuredClone(captures),last=changed.at(-1);
  const states=last.universal_state.states.map(r=>r.variable==='positive'?{...r,value:r.value+2}:r);
  changed[changed.length-1]=sellarCaptura({...last,universal_state:universeSnapshot(states,{cutoff:last.at})});
  const b=ejecutarConjuntoC03(changed,options);
  assert.equal(a.model_sha256,b.model_sha256);
  assert.notEqual(a.forecast.estimated_return_log,b.forecast.estimated_return_log);
});

function ledger(){
  const current={asset:'BTC-USD',minutes:60,granularity:300,algorithmVersion:3,kernelSHA256:'test-kernel',
    probabilityUp:.8,issuedAt:1000000,training:{initialTestThrough:1000}};
  const records=Array.from({length:40},(_,i)=>({...current,id:'f'+i,status:'verified',originTime:2000+i*4000,
    sourceCloseAt:2300+i*4000,issuedAt:2310+i*4000,observedCloseAt:5900+i*4000,
    checkedAt:5910+i*4000,reference:100,measurement:[{actual:i%2?110:90}]}));
  return {records,current};
}

test('confianza informa sobreconfianza observada sin aumentar P(subida)',()=>{
  const {records,current}=ledger(),r=medirConfianzaInterna(records,current);
  assert.equal(r.estimated_probability_up,.8);
  assert.equal(r.nonoverlapping_cases,40);assert.equal(r.similar_cases,40);
  assert.equal(r.observed_up_rate,.5);
  assert.ok(r.observed_up_rate_interval_95[0]<.5&&r.observed_up_rate_interval_95[1]>.5);
  assert.ok(Math.abs(r.calibration_error-.3)<1e-10);
  assert.equal(medirConfianzaInterna([],current).status,'insufficient_similar_prospective_outcomes');
});

test('confianza excluye importados, repetidos, futuros, solapados y otros modelos',()=>{
  const {records,current}=ledger(),first=records[0];
  const extra=[{...first,id:'duplicate'},{...first,id:'overlap',originTime:2100,sourceCloseAt:2400},
    {...first,id:'imported',importedFromFile:true},
    {...first,id:'future-check',checkedAt:current.issuedAt+1},
    {...first,id:'other-model',kernelSHA256:'other'}];
  assert.deepEqual(medirConfianzaInterna([...records,...extra],current),medirConfianzaInterna(records,current));
});
