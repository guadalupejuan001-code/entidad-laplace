import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../input/almacen.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {normalizarObservacion,familiaObservacionU003} from '../estado-financiero/modelo.mjs';
import {guardarObservacion,consultarCorte,consultarPaginaCorte,coberturaCorte}
  from '../estado-financiero/repositorio.mjs';
import {ejecutarCicloEF002,resumirCapturaFinanciera,guardarArchivoEF002,
  leerArchivoEF002,recuperarArchivosEF002,descubrirManifiestosEF002,opcionesPublicas}
  from '../estado-financiero/captura.mjs';

const T0='2026-10-30T10:00:00.000Z',T1='2026-10-30T12:00:00.000Z';
const src='https://data.bis.org/api/v2/data';
function world(){
  const states=[
    {id:'bis-b001-lbs-q2',domain:'banca_bis_locacional',variable:'B001_claims',
      value:150,unit:'USD_million',observed_at:T0,known_at:T1,source_url:src},
    {id:'c001-spy-q2',domain:'flujos_fondos_sec_nport',variable:'C001_assets',
      value:200,unit:'USD',observed_at:T0,known_at:T1,
      source_url:'https://www.sec.gov/Archives/edgar/data/1/x.xml'},
    {id:'k001-btc-100',domain:'blockchain_bitcoin_publica',variable:'K001_height',
      value:100,unit:'blocks',observed_at:T0,known_at:T1,
      source_url:'https://blockstream.info/api/blocks'},
    {id:'global-price-1',domain:'mercado_global',variable:'close',
      value:10,unit:'USD',observed_at:T0,known_at:T1,
      source_url:'https://example.org/global'}
  ];
  return sellarCaptura({schema:'laplace-universo-global-u003-v4',at:T1,
    universal_state:universeSnapshot(states,{cutoff:T1}),
    source_status:[
      {group:'bis_banking_b001',name:'bis-lbs',status:'observed',signals:1},
      {group:'etf_fund_flows_c001',name:'sec-nport',status:'observed',signals:1},
      {group:'blockchain_defi_k001',name:'blockstream',status:'observed',signals:1},
      {group:'other',name:'licensed-l3',status:'requires_license',signals:0}
    ],
    coverage:{groups:[
      {group:'bis_banking_b001',status:'observed',signals:1},
      {group:'etf_fund_flows_c001',status:'observed',signals:1},
      {group:'blockchain_defi_k001',status:'observed',signals:1}
    ]},automatic_trading:false,prediction_inputs_enabled:false});
}
const makeDB=async path=>{const s=await Store.open({embeddedDirectory:path});await s.migrate();return s};
test('EF002 opciones reales incluyen cinco fuentes cuando hay acceso, no inventan FINRA',()=>{
  const a=opcionesPublicas({env:{}});
  assert.equal(a.includeBanking,true);assert.equal(a.includeOtcSwaps,true);
  assert.equal(a.includeBlockchainDeFi,true);
  assert.equal(a.includeDerivatives,true);
  assert.equal(a.includeEtfFunds,false);
  assert.equal(a.finraTradeDate,null);
  const b=opcionesPublicas({env:{SEC_USER_AGENT:'Lab lab@example.org'}});
  assert.equal(b.includeEtfFunds,true);
});
test('EF002 nunca interpreta omisiones como cero, conserva matriz de fuentes',()=>{
  const report=resumirCapturaFinanciera(world());
  assert.equal(report.states_observed,4);
  assert.equal(report.coverage_complete,false);
  assert.equal(report.source_summary.find(x=>x.group==='other').restricted_sources,1);
  assert.ok(report.additional_financial_groups.some(x=>x.id==='derivatives_d001'&&!x.attempted));
  assert.equal(familiaObservacionU003({domain:'banca_bis_locacional'}),'B001');
  assert.equal(familiaObservacionU003({domain:'flujos_fondos_sec_nport'}),'C001');
  assert.equal(familiaObservacionU003({domain:'blockchain_bitcoin_publica'}),'K001');
  assert.equal(familiaObservacionU003({domain:'swaps_otc_agregados'}),'D002');
  assert.equal(familiaObservacionU003({domain:'opciones_publicas'}),'D001');
  assert.equal(familiaObservacionU003({domain:'sismologia_global'}),'U003');
});
test('EF002 captura concurrente validada, archivo recuperable y PGlite persistente al reinicio',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'laplace-ef002-'));
  let s;
  try{
    s=await makeDB(join(folder,'postgres'));
    const output=await ejecutarCicloEF002({store:s,collector:async()=>world()});
    assert.equal(output.summary.import_result.added_observations,4);
    const saved=await guardarArchivoEF002({capture:output.capture,
      summary:output.summary,directory:join(folder,'archives')});
    assert.equal(saved.states_observed,4);
    const manifests=await descubrirManifiestosEF002(join(folder,'archives'));
    assert.deepEqual(manifests,[saved.manifest_path]);
    await s.close();s=null;
    s=await makeDB(join(folder,'postgres'));
    const old=await consultarCorte(s,{asOf:T1});
    assert.equal(old.states.length,4);
    assert.deepEqual(new Set(old.states.map(x=>x.family)),new Set(['B001','C001','K001','U003']));
    assert.equal(old.states.find(x=>x.family==='B001').population_id,'BIS_LBS');
    const coverage=await coberturaCorte(s,{asOf:T1});
    assert.equal(coverage.restricted_or_missing,1);
    const restored=await recuperarArchivosEF002(s,manifests);
    assert.equal(restored.imported_new_states,0);
    assert.equal(restored.duplicate_captures,1);
    await assert.rejects(()=>guardarArchivoEF002({capture:output.capture,
      summary:output.summary,directory:join(folder,'archives')}),/EEXIST/);
  }finally{await s?.close();await rm(folder,{force:true,recursive:true})}
});
test('EF002 importador de archivos nuevos reconstruye la base desde cero y verifica hashes',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'laplace-ef002-replay-'));
  let s;
  try{
    const capture=world(),summary=resumirCapturaFinanciera(capture);
    const saved=await guardarArchivoEF002({capture,summary,directory:join(folder,'archive')});
    const loaded=await leerArchivoEF002(saved.manifest_path);
    assert.equal(loaded.capture.capture_sha256,capture.capture_sha256);
    s=await makeDB(join(folder,'new-database'));
    const rebuilt=await recuperarArchivosEF002(s,[saved.manifest_path]);
    assert.equal(rebuilt.imported_new_states,4);
    assert.equal((await consultarCorte(s,{asOf:T0})).known_series,0);
    assert.equal((await consultarCorte(s,{asOf:T1})).known_series,4);
    await writeFile(saved.payload_path,Buffer.from('tampered'));
    await assert.rejects(()=>leerArchivoEF002(saved.manifest_path),/corrupto|modificado/);
  }finally{await s?.close();await rm(folder,{force:true,recursive:true})}
});
test('EF002 datos históricos no se sobrescriben por otro período, varias monedas y poblaciones',async()=>{
  const s=await makeDB('memory://');
  try{
    const base={family:'B001',domain:'banca_bis_locacional',subject_id:'bank',
      variable:'claims',value_text:'100',unit:'USD_million',observed_at:T0,
      known_at:T1,source_id:'bis',source_url:src,source_record_id:'q',
      source_revision:'1',value_kind:'exact_decimal',value_status:'observed'};
    await s.transaction(async tx=>{
      await guardarObservacion(tx,{...base,population_id:'LBS',currency:'USD'});
      await guardarObservacion(tx,{...base,population_id:'CBS',currency:'USD'});
      await guardarObservacion(tx,{...base,population_id:'LBS',currency:'EUR'});
    });
    const out=await consultarCorte(s,{asOf:T1});
    assert.equal(out.known_series,3);
    const p1=await consultarPaginaCorte(s,{asOf:T1,limit:2});
    assert.equal(p1.states.length,2);assert.equal(p1.next_offset,2);
    const p2=await consultarPaginaCorte(s,{asOf:T1,limit:2,offset:p1.next_offset});
    assert.equal(p2.states.length,1);assert.equal(p2.next_offset,null);
    assert.deepEqual(new Set([...p1.states,...p2.states].map(x=>x.assertion_sha)),
      new Set(out.states.map(x=>x.assertion_sha)));
  }finally{await s.close()}
});
test('EF002 ciclo se abstiene sin capturas y sin almacenar datos sintéticos',async()=>{
  const s=await makeDB('memory://');
  try{
    const empty=sellarCaptura({schema:'laplace-universo-global-u003-v4',at:T1,
      universal_state:universeSnapshot([],{cutoff:T1}),coverage:{groups:[]},
      source_status:[{group:'banca',name:'bis',status:'unavailable',signals:0}]});
    await assert.rejects(()=>ejecutarCicloEF002({store:s,collector:async()=>empty}),
      /sin señales reales/);
    const query=await consultarCorte(s,{asOf:T1});
    assert.equal(query.known_series,0);
  }finally{await s.close()}
});
