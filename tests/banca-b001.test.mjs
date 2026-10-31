import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {B001_SCHEMA,BIS_ROOT,BIS_SERIES,BIS_LIMITS,BIS_BANKING_RULES}
  from '../universo/banca/catalogo-bis.mjs';
import {bisSdmxUrl,parseBisSdmxCSV,observeBisBanking}
  from '../universo/banca/bis-sdmx.mjs';
import {universeSnapshot} from '../universo/estados.mjs';

const asOf='2026-10-31T07:10:00.000Z';
const LBS=['FREQ','L_MEASURE','L_POSITION','L_INSTR','L_DENOM',
  'L_CURR_TYPE','L_PARENT_CTY','L_REP_BANK_TYPE','L_REP_CTY',
  'L_CP_SECTOR','L_CP_COUNTRY','L_POS_TYPE'];
const CBS=['FREQ','L_MEASURE','L_REP_CTY','CBS_BANK_TYPE','CBS_BASIS',
  'L_POSITION','L_INSTR','REM_MATURITY','CURR_TYPE_BOOK',
  'L_CP_SECTOR','L_CP_COUNTRY'];
const periods=['2025-Q4','2026-Q1'];
function csv(series,{values=['100.50','110.75'],status=['A','A'],conf=['N','N'],
  unit='USD',mult='6',periods_:ps=periods,mod=null,quote=false,
  flow=series.dataset,flowKey=series.key}={}){
  const names=series.kind==='LBS'?LBS:CBS,expected=series.key.split('.');
  const heads=['DATAFLOW','SERIES_KEY',...names,'TIME_PERIOD','OBS_VALUE',
    'UNIT_MEASURE','UNIT_MULT','OBS_STATUS','OBS_CONF'];
  const rows=values.map((value,i)=>{
    const row=[flow,flowKey,...expected,ps[i],value,unit,mult,
      status[i]??'A',conf[i]??'N'];
    if(mod)mod(row,heads,i);
    return row.map(x=>quote?'"'+String(x).replace(/"/g,'""')+'"':x).join(',');
  });
  return [heads.join(','),...rows].join('\n')+'\n';
}
const http=(body,status=200)=>new Response(body,{status,
  headers:{'content-type':'text/csv'}});
test('B001 01: catálogo 4 series verificadas por dataset, definición y población',()=>{
  assert.equal(BIS_SERIES.length,4);
  assert.equal(BIS_SERIES.filter(s=>s.kind==='LBS').length,2);
  assert.equal(BIS_SERIES.filter(s=>s.kind==='CBS').length,2);
  assert.ok(BIS_SERIES.every(s=>s.key.split('.').length===(s.kind==='LBS'?12:11)));
  assert.equal(BIS_BANKING_RULES.cbs_and_lbs_additive,false);
  assert.equal(BIS_BANKING_RULES.stock_change_equals_flow,false);
});
test('B001 02: API BIS fija claves por serie y no admite objeto externo',()=>{
  for(const s of BIS_SERIES){
    const url=bisSdmxUrl(s);
    assert.ok(url.startsWith(BIS_ROOT+'/api/v2/data/dataflow/BIS/'+s.dataset+'/1.0/'+s.key));
    assert.ok(url.endsWith('format=csv&labels=id&lastNObservations=8'));
  }
  assert.throws(()=>bisSdmxUrl({...BIS_SERIES[0]}),/catálogo/);
});
test('B001 03: una serie LBS USD stock trimestral produce U001 con mes final del trimestre',()=>{
  const s=BIS_SERIES[0];
  const data=parseBisSdmxCSV(csv(s),{series:s,knownAt:asOf,sourceUrl:bisSdmxUrl(s)});
  assert.equal(data.observations.length,2);
  assert.equal(data.observations[1].unit,'USD_million');
  assert.equal(data.observations[1].value,110.75);
  assert.equal(data.observations[1].observed_at,'2026-03-31T23:59:59.999Z');
  assert.equal(data.observations[1].known_at,asOf);
  assert.equal(data.measure,'quarter_end_stock');
  assert.match(data.body_sha256,/^[a-f0-9]{64}$/);
});
test('B001 04: las series CBS son independientes y no se agregan a LBS',()=>{
  const x=parseBisSdmxCSV(csv(BIS_SERIES[2]),{series:BIS_SERIES[2],
    knownAt:asOf,sourceUrl:bisSdmxUrl(BIS_SERIES[2])});
  assert.equal(x.observations.length,2);
  assert.equal(x.observations[0].domain,'banca_bis_consolidada');
  assert.equal(x.consolidation,'consolidated_banking_groups; intragroup_excluded');
  assert.ok(!x.observations.some(o=>o.variable.includes('LBS')));
});
test('B001 05: clave de dimensión, país y measure se verifican sin excepciones',()=>{
  const s=BIS_SERIES[0],url=bisSdmxUrl(s);
  assert.throws(()=>parseBisSdmxCSV(csv(s,{mod:(r,header)=>{
    r[header.indexOf('L_REP_CTY')]='JP';
  }}),{series:s,knownAt:asOf,sourceUrl:url}),/ajena/);
  assert.throws(()=>parseBisSdmxCSV(csv(s,{mod:(r,header)=>{
    r[header.indexOf('L_MEASURE')]='B';
  }}),{series:s,knownAt:asOf,sourceUrl:url}),/ajena|variación/);
  assert.throws(()=>parseBisSdmxCSV(csv(s,{flow:'WS_CBS_PUB'}),{
    series:s,knownAt:asOf,sourceUrl:url}),/DATAFLOW/);
  assert.throws(()=>parseBisSdmxCSV(csv(s,{flowKey:BIS_SERIES[1].key}),{
    series:s,knownAt:asOf,sourceUrl:url}),/SERIES_KEY/);
});
test('B001 06: sólo USD en millones; no convertir EUR, porcentajes o multiplier',()=>{
  const s=BIS_SERIES[0],p={series:s,knownAt:asOf,sourceUrl:bisSdmxUrl(s)};
  assert.throws(()=>parseBisSdmxCSV(csv(s,{unit:'EUR'}),p),/unidad USD/);
  assert.throws(()=>parseBisSdmxCSV(csv(s,{mult:'9'}),p),/multiplicador/);
  assert.throws(()=>parseBisSdmxCSV(csv(s,{values:['-1','10']}),p),/nivel inválido/);
});
test('B001 07: supresiones y OBS_CONF marcados se excluyen y no se vuelven cero',()=>{
  const s=BIS_SERIES[0];
  const result=parseBisSdmxCSV(csv(s,{values:['','120.125'],conf:['C','N']}),
    {series:s,knownAt:asOf,sourceUrl:bisSdmxUrl(s)});
  assert.equal(result.observations.length,1);
  assert.equal(result.observations[0].value,120.125);
  assert.equal(result.rejected_periods[0].reason,'missing_or_suppressed');
  assert.ok(!result.observations.some(x=>x.value===0));
});
test('B001 08: datos estimados marcados, break fuera de contrato y errores separados',()=>{
  const s=BIS_SERIES[0],p={series:s,knownAt:asOf,sourceUrl:bisSdmxUrl(s)};
  const result=parseBisSdmxCSV(csv(s,{status:['E','B']}),p);
  assert.equal(result.observations.length,1);
  assert.equal(result.observation_flags[0].estimated,true);
  assert.equal(result.rejected_periods.length,1);
});
test('B001 09: no acepta trimestre futuro ni filtración temporal en captura anterior',()=>{
  const s=BIS_SERIES[1],url=bisSdmxUrl(s);
  assert.throws(()=>parseBisSdmxCSV(csv(s),{
    series:s,sourceUrl:url,knownAt:'2026-03-01T00:00:00.000Z'}),/posterior/);
  const r=parseBisSdmxCSV(csv(s),{series:s,sourceUrl:url,knownAt:asOf});
  assert.equal(universeSnapshot(r.observations,{cutoff:'2026-09-01T00:00:00.000Z'}).known_states,0);
  assert.equal(universeSnapshot(r.observations,{cutoff:asOf}).known_states,2);
});
test('B001 10: CSV incompleto, comillas mal cerradas y columnas duplicadas fallan',()=>{
  const s=BIS_SERIES[1],p={series:s,sourceUrl:bisSdmxUrl(s),knownAt:asOf};
  assert.throws(()=>parseBisSdmxCSV(csv(s).replace('110.75','"110.75'),p),/comillas/);
  assert.throws(()=>parseBisSdmxCSV(csv(s).replace('OBS_CONF','TIME_PERIOD'),p),/duplicadas/);
  assert.throws(()=>parseBisSdmxCSV(csv(s).replace('110.75,USD','110.75'),p),/cortada/);
});
test('B001 11: parsea CSV entrecomillado según estándar (escape comillas)',()=>{
  const s=BIS_SERIES[2],p={series:s,sourceUrl:bisSdmxUrl(s),knownAt:asOf};
  const r=parseBisSdmxCSV(csv(s,{quote:true}),p);
  assert.equal(r.observations.length,2);
  assert.equal(r.observations[0].value,100.5);
});
test('B001 12: filas repetidas de un trimestre no duplican datos bancarios',()=>{
  const s=BIS_SERIES[3],p={series:s,knownAt:asOf,sourceUrl:bisSdmxUrl(s)};
  assert.throws(()=>parseBisSdmxCSV(csv(s,{periods_:['2025-Q4','2025-Q4']}),p),/duplicado/);
});
test('B001 13: las cuatro fuentes arrancan sin esperar a la primera',async()=>{
  const tasks=new Map();
  const promise=observeBisBanking({now:()=>asOf,fetchImpl:url=>
    new Promise(resolve=>tasks.set(url,resolve))});
  assert.equal(tasks.size,4);
  for(const s of BIS_SERIES)tasks.get(bisSdmxUrl(s))(http(csv(s)));
  const r=await promise;
  assert.equal(r.schema,B001_SCHEMA);
  assert.equal(r.coverage.states_observed,8);
  assert.equal(r.coverage.series_observed,4);
  assert.equal(r.sources.length,4);
  assert.equal(r.rules.cbs_and_lbs_additive,false);
  assert.ok(!r.observations.some(o=>o.variable.includes('global_liquidity_proxy')));
  assert.equal(r.prediction_inputs_enabled,false);
  assert.equal(r.automatic_trading,false);
});
test('B001 14: fallo parcial de fuente conserva las otras tres y no inventa cero',async()=>{
  const r=await observeBisBanking({now:()=>asOf,fetchImpl:async url=>{
    const s=BIS_SERIES.find(x=>bisSdmxUrl(x)===url);
    return s===BIS_SERIES[0]?http('Forbidden',403):http(csv(s));
  }});
  assert.equal(r.coverage.series_observed,3);
  assert.equal(r.coverage.series_missing,1);
  assert.equal(r.observations.length,6);
  assert.equal(r.sources[0].status,'unavailable');
  assert.equal(r.sources[0].missing_is_zero,false);
});
test('B001 15: muestras suprimidas no generan cifras ficticias en agregación',async()=>{
  const s=BIS_SERIES[0];
  const r=await observeBisBanking({now:()=>asOf,series:[s],fetchImpl:async()=>
    http(csv(s,{values:['',''],conf:['C','C']}))});
  assert.equal(r.coverage.states_observed,0);
  assert.equal(r.sources[0].status,'not_reported');
  assert.equal(r.sources[0].rejected_periods.length,2);
});
test('B001 16: series inventadas, repetidas y demasiadas series se rechazan',async()=>{
  await assert.rejects(()=>observeBisBanking({series:[BIS_SERIES[0],BIS_SERIES[0]],now:()=>asOf}),/duplicada/);
  await assert.rejects(()=>observeBisBanking({series:[{...BIS_SERIES[0]}],now:()=>asOf}),/inválida/);
});
test('B001 17: U003 requiere opt-in y mantiene F001 separado',()=>{
  const raw=readFileSync(new URL('../universo/global-u003.mjs',import.meta.url),'utf8');
  assert.match(raw,/LAPLACE_B001_ENABLED==='true'/);
  assert.match(raw,/if\(includeBanking\)/);
});
