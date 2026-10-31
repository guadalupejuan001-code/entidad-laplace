import test from 'node:test';
import assert from 'node:assert/strict';
import {universeSnapshot} from '../universo/estados.mjs';
import {REGSHO_SCHEMA,urlRegSho,parseRegSho,summarizeRegSho,
  fetchRegSho,observeFinraOffExchange} from '../universo/otc/finra-regsho.mjs';

const cut='2026-10-31T02:30:00.000Z';
const day='20261030';
const header='Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market';
const row1='20261030|AAPL|20.125000|1.000000|80.500000|B,Q,N';
const row2='20261030|SPY|15|0|50|N';
const file=[header,row1,row2,'2',''].join('\n');
const url=urlRegSho({tradeDate:day});
const mock=(body,status=200)=>new Response(body,{status,headers:{'content-type':'text/plain'}});
test('O001: URL pública fijada; rechaza inyección, fechas imposibles y centros desconocidos',()=>{
  assert.equal(url,'https://cdn.finra.org/equity/regsho/daily/CNMSshvol20261030.txt');
  assert.equal(urlRegSho({tradeDate:day,facility:'FORF'}),
    'https://cdn.finra.org/equity/regsho/daily/FORFshvol20261030.txt');
  assert.throws(()=>urlRegSho({tradeDate:'20260230'}));
  assert.throws(()=>urlRegSho({tradeDate:'20261030?bad=1'}));
  assert.throws(()=>urlRegSho({tradeDate:day,facility:'FNYX'}),/no admitido/);
});
test('O001: parser comprueba encabezado, número de registros, volúmenes y decimales',()=>{
  const parsed=parseRegSho(file,{tradeDate:day});
  assert.equal(parsed.schema,REGSHO_SCHEMA);
  assert.equal(parsed.raw_records,2);
  assert.equal(parsed.records[0].short,20125000n);
  assert.equal(parsed.records[0].exempt,1000000n);
  assert.equal(parsed.records[0].total,80500000n);
  assert.match(parsed.raw_sha256,/^[a-f0-9]{64}$/);
});
test('O001: símbolos publicados con barra como AAC/U se preservan sin inferir identidad',()=>{
  const raw=[header,'20261030|AAC/U|11|1|22|N','1'].join('\n');
  const x=parseRegSho(raw,{tradeDate:day});
  assert.equal(x.records[0].symbol,'AAC/U');
  const r=summarizeRegSho(x,{capturedAt:cut,sourceUrl:url,symbols:['AAC/U']});
  assert.equal(r.observations.length,4);
});
test('O001: no interpreta volumen short como short interest ni revela contrapartes',()=>{
  const parsed=parseRegSho(file,{tradeDate:day});
  const result=summarizeRegSho(parsed,{capturedAt:cut,sourceUrl:url,symbols:['AAPL','SPY','NVDA']});
  assert.equal(result.observations.length,8);
  assert.deepEqual(result.missing_symbols,['NVDA']);
  assert.equal(result.observations.find(x=>x.variable==='FINRA_CNMS_AAPL_short_sale_shares').value,20.125);
  assert.equal(result.observations.find(x=>x.variable==='FINRA_CNMS_AAPL_short_sale_share_ratio').value,20.125/80.5);
  assert.ok(result.observations.every(o=>o.known_at===cut));
  assert.ok(result.observations.every(o=>!Object.hasOwn(o,'counterparty_id')));
  assert.equal(result.backtest_intraday_eligible,false);
  assert.equal(result.prediction_inputs_enabled,false);
});
test('O001: rechaza tráiler incorrecto, campos sobrantes, volúmenes imposibles y fecha distinta',()=>{
  assert.throws(()=>parseRegSho(file.replace(/\n2\n/,'\n4\n'),{tradeDate:day}),/recuento/);
  assert.throws(()=>parseRegSho(file.replace('SPY|15','SPY|50.1'),{tradeDate:day}),/incoherente/);
  assert.throws(()=>parseRegSho(file.replace('AAPL|20.125000','AAPL|-20'),{tradeDate:day}),/formato/);
  assert.throws(()=>parseRegSho(file.replace('SPY|15|0|50|N','SPY|15|0|50|N|EXTRA'),{tradeDate:day}),/truncada/);
  assert.throws(()=>parseRegSho(file,{tradeDate:'20261029'}),/Fecha/);
  assert.throws(()=>parseRegSho([header,row1,row1,'2'].join('\n'),{tradeDate:day}),/Duplicado/);
  assert.throws(()=>parseRegSho(file.replace('AAPL|20.125000','BAD TICKER|20.125000'),{tradeDate:day}),/Fecha\/símbolo/);
});
test('O001: fecha de conocimiento no se retrotrae a la sesión',()=>{
  const parsed=parseRegSho(file,{tradeDate:day});
  assert.throws(()=>summarizeRegSho(parsed,{capturedAt:'2026-10-29T12:00:00.000Z',
    sourceUrl:url,symbols:['AAPL']}),/aún/);
  const report=summarizeRegSho(parsed,{capturedAt:cut,sourceUrl:url,symbols:['AAPL']});
  const early=universeSnapshot(report.observations,{cutoff:'2026-10-30T23:00:00.000Z'});
  assert.equal(early.known_states,0);
  const later=universeSnapshot(report.observations,{cutoff:cut});
  assert.equal(later.known_states,4);
});
test('O001: descarga HTTP real simulada reporta hash y nunca órdenes financieras',async()=>{
  let seen='';
  const r=await fetchRegSho({tradeDate:day,symbols:['AAPL'],now:()=>cut,
    fetchImpl:async target=>{seen=target;return mock(file)}});
  assert.equal(seen,url);
  assert.equal(r.source.status,'observed');
  assert.equal(r.source.raw_records,2);
  assert.equal(r.observations.length,4);
  assert.equal(r.source.prediction_inputs_enabled,false);
  assert.match(r.source.body_sha256,/^[a-f0-9]{64}$/);
});
test('O001: fallo o día sin fichero no equivale a cero negociado',async()=>{
  const x=await fetchRegSho({tradeDate:day,symbols:['AAPL'],now:()=>cut,
    fetchImpl:async()=>mock('not found',403)});
  assert.equal(x.source.status,'unavailable');
  assert.equal(x.observations.length,0);
  assert.equal(x.source.absent_is_zero,false);
  assert.match(x.source.reason,/HTTP 403/);
});
test('O001: CNMS y FORF inician juntas, pero son universos separados',async()=>{
  const urls=[],done=new Map();
  const task=observeFinraOffExchange({tradeDate:day,symbols:['AAPL','SPY'],now:()=>cut,
    fetchImpl:(target)=>{urls.push(target);return new Promise(resolve=>done.set(target,resolve));}});
  assert.equal(urls.length,2);
  assert.ok(urls[0].includes('CNMSshvol')&&urls[1].includes('FORFshvol'));
  done.get(urls[0])(mock(file));
  done.get(urls[1])(mock([header,'20261030|AAPL|8|1|12|O','1'].join('\n')));
  const x=await task;
  assert.equal(x.observations.length,12);
  assert.equal(x.sources.length,2);
  assert.equal(x.sources[0].status,'observed');
  assert.equal(x.sources[1].status,'observed'); // O corresponde a ORF, universo independiente.
  assert.equal(x.prediction_inputs_enabled,false);
});
test('O001: fichero válido de cero registros informa ausencia de cobertura, no de actividad total',()=>{
  const x=parseRegSho(header+'\n0\n',{tradeDate:day});
  assert.equal(x.raw_records,0);
  const s=summarizeRegSho(x,{capturedAt:cut,sourceUrl:url,symbols:['AAPL']});
  assert.equal(s.observations.length,0);
  assert.deepEqual(s.missing_symbols,['AAPL']);
});
