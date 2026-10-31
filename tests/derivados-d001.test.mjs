import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {D001_ROOTS,D001_SCHEMA,number,timestampMillis,instrumentId,numericRecord,boundedJSON} from '../universo/derivados/contrato.mjs';
import {urlsUSDm,parsePremiumUSDm,parseOIUSDm,parseSettledUSDm,observeUSDm} from '../universo/derivados/binance-usdm.mjs';
import {parseHyperliquid,observeHyperliquid,HYPERLIQUID_INFO,HYPERLIQUID_BODY} from '../universo/derivados/hyperliquid.mjs';
import {parseDeribitOptions,observeDeribitOptions,optionUrls} from '../universo/derivados/deribit-opciones.mjs';
import {observeDerivatives} from '../universo/derivados/global.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
const now='2026-10-31T03:15:00.000Z',at=Date.parse(now),ms=at-30000;
const quote={symbol:'BTCUSDT',markPrice:'70002.55',indexPrice:'70000.25',
  lastFundingRate:'0.000124',time:ms};
const oi={symbol:'BTCUSDT',openInterest:'12345.567',time:ms};
const funded=[{symbol:'BTCUSDT',fundingRate:'-0.00012',fundingTime:at-8*3600000}];
const json=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const info=[{universe:[{name:'BTC',szDecimals:5,maxLeverage:40},{name:'ETH',szDecimals:4,maxLeverage:25}]},
  [{markPx:'70010.2',oraclePx:'70000.1',funding:'0.000012',openInterest:'1550.2',
    dayNtlVlm:'100000000.23'},
   {markPx:'2600.2',oraclePx:'2590.1',funding:'-0.00003',openInterest:'50002',
    dayNtlVlm:'2000000.75'}]];
const exp=Date.parse('2027-01-29T08:00:00.000Z'),expired=Date.parse('2026-09-30T08:00:00.000Z');
const instrument=(name,type,strike,expires=exp)=>({kind:'option',is_active:true,base_currency:'BTC',
  settlement_currency:'BTC',quote_currency:'USD',instrument_name:name,option_type:type,
  strike,expiration_timestamp:expires,contract_size:1,instrument_type:'reversed'});
const calls=[
 instrument('BTC-29JAN27-60000-C','call',60000),
 instrument('BTC-29JAN27-60000-P','put',60000),
 instrument('BTC-30SEP26-60000-C','call',60000,expired)
];
const summaries=[
 {instrument_name:calls[0].instrument_name,base_currency:'BTC',open_interest:3.5,mark_iv:55.5,
  volume_usd:250000},
 {instrument_name:calls[1].instrument_name,base_currency:'BTC',open_interest:7,mark_iv:60.5,volume_usd:12000},
 {instrument_name:calls[2].instrument_name,base_currency:'BTC',open_interest:1,mark_iv:20,volume_usd:500}
];
const deribit={instruments:{jsonrpc:'2.0',result:calls},summary:{jsonrpc:'2.0',result:summaries}};
test('D001: contrato no confunde unidades, subyacente, producto ni venues',()=>{
  const contract=instrumentId({venue:'binance',kind:'perpetual',symbol:'BTCUSDT',settlement:'USDT'});
  const row=numericRecord({contract,metric:'open_interest_base',value:1234,unit:'BTC',
    observedAt:new Date(ms).toISOString(),knownAt:now,
    sourceUrl:D001_ROOTS.binance+'/fapi/v1/openInterest?symbol=BTCUSDT'});
  assert.equal(row.known_at,now);assert.equal(row.unit,'BTC');
  assert.ok(!JSON.stringify(row).includes('customer'));
  assert.throws(()=>instrumentId({venue:'unknown',kind:'perpetual',symbol:'BTCUSDT',settlement:'USDT'}));
  assert.throws(()=>instrumentId({venue:'deribit',kind:'option',symbol:'BTC-29JAN27-60000-C',settlement:'BTC'}),/Vencimiento/);
});
test('D001: rechazamos timestamps futuros, datos muy viejos y números inválidos',()=>{
  assert.throws(()=>timestampMillis(at+50000,{cutoff:now}),/futuro/);
  assert.throws(()=>timestampMillis(at-1000000,{cutoff:now}),/atrasado/);
  assert.equal(number('-0.00004',{min:-1,max:1}),-0.00004);
  assert.throws(()=>number('NaN'),/no numérico/);
  assert.throws(()=>number('1e999'),/rango/);
});
test('D001: Binance mark, index, basis y funding anunciado son distintas métricas',()=>{
  const p=parsePremiumUSDm(quote,{symbol:'BTCUSDT',knownAt:now,sourceUrl:urlsUSDm('BTCUSDT').mark});
  assert.equal(p.observations.length,4);
  assert.equal(p.observations.find(x=>x.variable.endsWith('_mark_price')).value,70002.55);
  assert.equal(p.observations.find(x=>x.variable.endsWith('_displayed_funding_rate')).value,0.000124);
  assert.equal(p.metadata.funding_type,'reported_snapshot_not_confirmed_settlement');
  assert.ok(p.observations.every(x=>x.known_at===now));
  assert.throws(()=>parsePremiumUSDm({...quote,time:at+50000},{symbol:'BTCUSDT',knownAt:now,
    sourceUrl:urlsUSDm('BTCUSDT').mark}),/futuro/);
});
test('D001: Binance open interest está en BTC; funding histórico no se mezcla con el estimado',()=>{
  const u=urlsUSDm('BTCUSDT');
  const p=parseOIUSDm(oi,{symbol:'BTCUSDT',knownAt:now,sourceUrl:u.oi});
  const s=parseSettledUSDm(funded,{symbol:'BTCUSDT',knownAt:now,sourceUrl:u.settled});
  assert.equal(p.observations[0].unit,'BTC');
  assert.equal(p.observations[0].value,12345.567);
  assert.equal(s.observations[0].value,-0.00012);
  assert.equal(s.metadata.funding_interval_hours,null);
  assert.throws(()=>parseSettledUSDm([{...funded[0],fundingTime:at+2000}],
    {symbol:'BTCUSDT',knownAt:now,sourceUrl:u.settled}),/futuro/);
});
test('D001: Binance fallos parciales no se vuelven cero, ni bloquean mercados válidos',async()=>{
  const urls=urlsUSDm('BTCUSDT');
  const x=await observeUSDm({symbols:['BTCUSDT'],now:()=>now,fetchImpl:async url=>{
    if(url===urls.mark)return json(quote);
    if(url===urls.oi)return new Response('denied',{status:403});
    if(url===urls.settled)return json(funded);
    throw Error('No autorizado');
  }});
  assert.equal(x.sources.length,3);assert.equal(x.sources[1].status,'unavailable');
  assert.equal(x.observations.length,5);
  assert.ok(x.observations.every(r=>!r.variable.endsWith('_open_interest_base')));
  assert.equal(x.automatic_trading,false);
});
test('D001: Hyperliquid conserva alineación del catálogo, marca primera recepción',()=>{
  const x=parseHyperliquid(info,{coins:['BTC','ETH'],knownAt:now});
  assert.equal(x.contracts.length,2);
  assert.equal(x.observations.length,10);
  assert.equal(x.contracts[0].source_exchange_timestamp_provided,false);
  assert.equal(x.observations.find(r=>r.variable==='D001_hyperliquid_BTC_open_interest_base').unit,'BTC');
  assert.ok(x.observations.every(r=>r.observed_at===now));
  assert.throws(()=>parseHyperliquid([info[0],[info[1][0]]],{knownAt:now}),/alineados/);
});
test('D001: Hyperliquid usa SOLO info pública, sin usuarios ni órdenes',async()=>{
  const calls=[];
  const x=await observeHyperliquid({coins:['BTC'],now:()=>now,fetchImpl:async (url,options)=>{
    calls.push({url,method:options.method,body:options.body});
    return json(info);
  }});
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{url:HYPERLIQUID_INFO,method:'POST',body:HYPERLIQUID_BODY});
  assert.equal(x.sources[0].status,'observed');
  assert.equal(x.observations.length,5);
});
test('D001: Deribit conserva vencimiento, strike, call/put y OI nativo por contrato',()=>{
  const url=optionUrls('BTC');
  const x=parseDeribitOptions(deribit,{currency:'BTC',knownAt:now,maxContracts:2,
    sourceUrl:url.summary});
  assert.equal(x.observations.length,6);
  assert.equal(x.contracts.length,2);
  assert.deepEqual(x.contracts.map(c=>c.side),['call','put']);
  assert.ok(x.contracts.every(c=>c.expiry===new Date(exp).toISOString()));
  assert.equal(x.contracts[0].strike,60000);
  assert.equal(x.observations.find(x=>x.variable.endsWith('_open_interest_base')).unit,'BTC');
  assert.equal(x.observations.find(x=>x.variable.endsWith('_mark_implied_volatility')).unit,'pct');
  assert.equal(x.coverage.full_market_coverage,false);
  assert.equal(x.automatic_trading,false);
});
test('D001: Deribit rechaza duplicados, metadatos inventados y futuros vencidos',()=>{
  const url=optionUrls('BTC').summary;
  assert.throws(()=>parseDeribitOptions({instruments:deribit.instruments,summary:{
    jsonrpc:'2.0',result:[summaries[0],summaries[0]]}},
    {currency:'BTC',knownAt:now,sourceUrl:url}),/duplicado/);
  assert.throws(()=>parseDeribitOptions({instruments:{jsonrpc:'2.0',result:[{
    ...calls[0],expiration_timestamp:null}]},summary:deribit.summary},
    {currency:'BTC',knownAt:now,sourceUrl:url}),/vencimiento/);
  const filtered=parseDeribitOptions(deribit,{currency:'BTC',knownAt:now,sourceUrl:url});
  assert.ok(filtered.contracts.every(c=>c.symbol!==calls[2].instrument_name));
});
test('D001: opciones sólo se descargan por endpoints públicos y una falla se conserva',async()=>{
  const urls=optionUrls('BTC');
  const r=await observeDeribitOptions({currencies:['BTC'],now:()=>now,fetchImpl:async url=>{
    if(url===urls.instruments)return json(deribit.instruments);
    if(url===urls.summary)return json(deribit.summary);
    throw Error('url');
  }});
  assert.equal(r.observations.length,6);
  assert.equal(r.sources.length,2);
  const bad=await observeDeribitOptions({currencies:['BTC'],now:()=>now,fetchImpl:async url=>
    url===urls.instruments?json(deribit.instruments):new Response('closed',{status:429})});
  assert.equal(bad.observations.length,0);
  assert.equal(bad.sources[1].status,'unavailable');
});
test('D001: validación de sólo hosts permitidos y límites de red',async()=>{
  await assert.rejects(()=>boundedJSON('https://evil.example/api'),/Host/);
  await assert.rejects(()=>boundedJSON('https://www.deribit.com/api/v2/private/get_positions',{method:'GET'}),/Deribit/);
  await assert.rejects(()=>boundedJSON(HYPERLIQUID_INFO,{method:'POST',body:'X'.repeat(201)}),/Hyperliquid/);
  await assert.rejects(()=>boundedJSON('https://fapi.binance.com/fapi/v1/account?symbol=BTCUSDT'),/Binance/);
});
test('D001: tres vías empiezan juntas y combinan resultados sin sumar OI entre venues',async()=>{
  const requests=[];
  const urls=urlsUSDm('BTCUSDT'),opts=optionUrls('BTC');
  const fetchImpl=async (url,options)=>{
    requests.push(url);
    if(url===urls.mark)return json(quote);
    if(url===urls.oi)return json(oi);
    if(url===urls.settled)return json(funded);
    if(url===HYPERLIQUID_INFO)return json(info);
    if(url===opts.instruments)return json(deribit.instruments);
    if(url===opts.summary)return json(deribit.summary);
    throw Error('No autorizado '+url);
  };
  const x=await observeDerivatives({now:()=>now,fetchImpl,
    binanceSymbols:['BTCUSDT'],hyperliquidCoins:['BTC'],deribitCurrencies:['BTC']});
  assert.equal(x.schema,D001_SCHEMA);
  assert.equal(x.coverage.groups.length,3);
  assert.equal(x.coverage.unavailable_sources,0);
  assert.equal(x.coverage.observations,17);
  assert.equal(requests.length,6);
  assert.ok(x.observations.some(o=>o.variable==='D001_binance_BTCUSDT_open_interest_base'));
  assert.ok(x.observations.some(o=>o.variable==='D001_hyperliquid_BTC_open_interest_base'));
  assert.ok(x.observations.some(o=>o.variable.includes('BTC-29JAN27-60000-C')));
  assert.ok(!x.observations.some(o=>o.variable.includes('total_global_open_interest')));
  assert.equal(x.prediction_inputs_enabled,false);
  const snap=universeSnapshot(x.observations,{cutoff:now});
  assert.equal(snap.known_states,17);
  assert.equal(universeSnapshot(x.observations,{cutoff:new Date(at-1).toISOString()}).known_states,0);
});
test('D001: opt-in U003 no crea consultas ni órdenes predeterminadas',()=>{
  const source=readFileSync(new URL('../universo/global-u003.mjs',import.meta.url),'utf8');
  assert.match(source,/includeDerivatives=process\.env\.LAPLACE_D001_ENABLED==='true'/);
  assert.match(source,/if\(includeDerivatives\)/);
});
