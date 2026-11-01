import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {grupoF002,cambiosF002,prepararPanelF002,ejecutarPrediccionF002,
  verificarPronosticoF002,evaluarPronosticoF002,resumirValidacionProspectivaF002,
  F002_GROUPS,F002_FEATURE_NAMES} from '../prediccion/conjunta-f002.mjs';
import {estadoDeCaptura} from '../demonio/series.mjs';

const BASE=Date.parse('2026-09-01T00:00:00Z'),HOUR=3600000;
const stamp=ms=>new Date(ms).toISOString();
function synthetic(n=115,{stalePrice=false,omitMarket=false,holdoutDistortion=false}={}){
  const out=[];let btc=50000,macro=100,eth=2000,bis=900,defi=12,priorShock=0;
  for(let i=0;i<n;i++){
    const at=stamp(BASE+i*6*HOUR);
    const d=.17*Math.sin(i*.73)+.09*Math.cos(i*1.17),previous=macro;
    macro*=Math.exp(d);
    const shock=2*(macro-previous)/(macro+previous);
    // BTC en i sigue el cambio macro observado en i-1 (sin anticipar).
    if(i)btc*=Math.exp(.012*priorShock+.00025*Math.sin(i*.31));
    if(holdoutDistortion&&i>=98)btc*=Math.exp(.001*Math.cos(i*.91));
    priorShock=shock;
    eth*=Math.exp(.01*Math.sin(i*.47));
    bis+=.3;defi+=.05;
    const rows=[
      {id:'btc-'+i,domain:'cripto_global',variable:'BTC_USD_spot',
        value:btc,unit:'USD',observed_at:stamp(BASE+
          (stalePrice?0:i*6*HOUR)),known_at:at,
        source_url:'https://api.exchange.coinbase.com/products/BTC-USD/ticker'},
      {id:'eth-'+i,domain:'cripto_global',variable:'ETH_USD_spot',
        value:eth,unit:'USD',observed_at:at,known_at:at,
        source_url:'https://api.exchange.coinbase.com/products/ETH-USD/ticker'},
      {id:'macro-'+i,domain:'futuros_commodities',variable:'commod_01',
        value:macro,unit:'index',observed_at:at,known_at:at,
        source_url:'https://example.org/macro'},
      {id:'bis-'+i,domain:'banca_bis_locacional',variable:'B001_claims',
        value:bis,unit:'USD_million',observed_at:at,known_at:at,
        source_url:'https://data.bis.org/api/v2/data'},
      {id:'defi-'+i,domain:'blockchain_bitcoin_publica',variable:'K001_height',
        value:defi,unit:'blocks',observed_at:at,known_at:at,
        source_url:'https://example.org/defi'},
      {id:'weather-'+i,domain:'clima_global',variable:'temperature',
        value:20+3*Math.sin(i*.2),unit:'degC',observed_at:at,known_at:at,
        source_url:'https://example.org/weather'},
      {id:'unclassified-'+i,domain:'future_public_domain',variable:'sensor',
        value:7+i*.1,unit:'counts',observed_at:at,known_at:at,
        source_url:'https://example.org/unknown'}
    ];
    const data=omitMarket?rows.filter(x=>x.variable!=='BTC_USD_spot'):rows;
    out.push(sellarCaptura({schema:'laplace-universo-global-u003-v4',at,
      universal_state:universeSnapshot(data,{cutoff:at}),
      coverage:{known_signals:data.length,groups:[
        {group:'bis_banking_b001',signals:1,status:'observed'},
        {group:'blockchain_defi_k001',signals:1,status:'observed'}]},
      source_status:[
        {group:'u002_base',name:'BTC',status:omitMarket?'unavailable':'observed',signals:omitMarket?0:2},
        {group:'bis_banking_b001',name:'BIS',status:'observed',signals:1},
        {group:'blockchain_defi_k001',name:'Blockchain',status:'observed',signals:1},
        {group:'etf_fund_flows_c001',name:'SEC-NPORT',status:'requires_credentials',signals:0}],
      automatic_trading:false,prediction_inputs_enabled:false}));
  }
  return out;
}
test('F002 considera todos los estados públicos y mantiene ausencias explícitas',()=>{
  assert.equal(grupoF002('banca_bis_locacional'),'banca_tasas');
  assert.equal(grupoF002('blockchain_bitcoin_publica'),'flujos_derivados');
  assert.equal(grupoF002('futuros_commodities'),'economia_real');
  assert.equal(grupoF002('future_public_domain'),'otros');
  assert.equal(F002_GROUPS.length,6);
  assert.equal(F002_FEATURE_NAMES.length,13);
  const captures=synthetic(3),previous=estadoDeCaptura(captures[0]),
    current=estadoDeCaptura(captures[1]);
  const result=cambiosF002(previous,current);
  assert.equal(result.features.length,13);
  assert.equal(result.signal_values_summed_across_units,false);
  assert.equal(result.missing_encoded_with_explicit_presence,true);
  assert.equal(result.accounting.length,6);
  assert.equal(result.accounting.find(x=>x.group==='banca_tasas').fresh,1);
  assert.equal(result.accounting.find(x=>x.group==='otros').fresh,1);
  const input=prepararPanelF002(captures);
  assert.ok(input.distinct_source_series>=7);
  assert.equal(input.source_groups.find(x=>x.group==='etf_fund_flows_c001').restricted,1);
});
test('cinco capturas no prueban precisión, ni generan precios ficticios',()=>{
  const result=ejecutarPrediccionF002(synthetic(5));
  assert.equal(result.status,'abstained');
  assert.equal(result.reason,'insufficient_verified_market_outcomes');
  assert.equal(result.production_activation_allowed,false);
  assert.equal(result.automatic_trading,false);
  assert.equal(result.prospectively_validated,false);
});
test('etiquetas de precio estancadas nunca se cuentan como resultados futuros',()=>{
  const s=prepararPanelF002(synthetic(60,{stalePrice:true}));
  assert.equal(s.matched_outcomes,0);
  assert.equal(ejecutarPrediccionF002(synthetic(60,{stalePrice:true})).status,'abstained');
  const absent=ejecutarPrediccionF002(synthetic(60,{omitMarket:true}));
  assert.equal(absent.status,'abstained');
});
test('F002 ajuste conjunto + validación cronológica + holdout prueban salida shadow',()=>{
  const caps=synthetic(115),result=ejecutarPrediccionF002(caps);
  assert.equal(result.status,'experimental_shadow_frozen',JSON.stringify(result).slice(0,1200));
  assert.equal(result.model_ready,true);
  assert.equal(result.forecast.asset,'BTC-USD');
  assert.equal(result.forecast.source_series_count,7);
  assert.equal(result.training.selected_only_from_validation,true);
  assert.equal(result.training.holdout_not_used_for_selection,true);
  assert.equal(result.training.training_labels_do_not_cross_validation,true);
  assert.equal(result.training.validation_labels_do_not_cross_holdout,true);
  assert.ok(result.training.observed_training_pairs>=24);
  assert.ok(result.training.observed_validation_pairs>=8);
  assert.ok(result.training.observed_holdout_pairs>=8);
  assert.ok(result.training.validation.relative_improvement>0);
  assert.ok(result.training.holdout.relative_improvement>0);
  assert.equal(result.forecast.production_activation_allowed,false);
  assert.equal(verificarPronosticoF002(result.forecast),true);
  assert.equal(result.central_f001_price_modified,false);
});
test('modificar holdout no cambia parámetros entrenados/seleccionados',()=>{
  const base=ejecutarPrediccionF002(synthetic(115));
  const perturbed=ejecutarPrediccionF002(synthetic(115,{holdoutDistortion:true}));
  assert.equal(base.training.model_sha256,perturbed.training.model_sha256);
  assert.equal(base.training.selected_lambda,perturbed.training.selected_lambda);
  assert.deepEqual(base.training.validation,perturbed.training.validation);
});
test('evaluación posterior rechaza pronóstico alterado, sin ver el futuro antes',()=>{
  const caps=synthetic(115),result=ejecutarPrediccionF002(caps),f=result.forecast;
  assert.equal(evaluarPronosticoF002(f,caps).status,'waiting_for_outcome');
  const next=synthetic(116);
  const evaluation=evaluarPronosticoF002(f,next);
  assert.equal(evaluation.status,'prospective_outcome_measured');
  assert.equal(evaluation.outcome_capture_sha256,next.at(-1).capture_sha256);
  assert.equal(evaluation.automatic_trading,false);
  const score=resumirValidacionProspectivaF002([evaluation,evaluation]);
  assert.equal(score.evaluated_forecasts,1);
  assert.equal(score.status,'insufficient_prospective_outcomes');
  assert.equal(score.prospective_advantage_proven,false);
  const altered={...f,estimated_price_unrounded:f.estimated_price_unrounded*1.4};
  assert.throws(()=>evaluarPronosticoF002(altered,next),/alterado/);
  const hacked={...evaluation,actual_price:evaluation.actual_price*1.1};
  assert.throws(()=>resumirValidacionProspectivaF002([hacked]),/modificada/);
});
test('archivo duplicado o captura con sello inválido rechaza todo el entrenamiento',()=>{
  const caps=synthetic(3);
  assert.throws(()=>prepararPanelF002([caps[0],caps[0]]),/duplicadas/);
  const modified=structuredClone(caps[0]);
  modified.universal_state.states[0].value=123456;
  assert.throws(()=>prepararPanelF002([modified]),/sello|modificada/i);
});
