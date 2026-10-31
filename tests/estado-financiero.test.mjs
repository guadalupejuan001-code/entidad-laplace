import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Store} from '../input/almacen.mjs';
import {sha,rawRecord} from '../input/contrato.mjs';
import {normalize} from '../input/normalizar.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {prepararLotesXI,compilarLotesXI,probarLotesXI} from '../estado-financiero/puente-xi.mjs';
import {WORLD_DOMAIN_CATALOG,consultarCatalogo} from '../estado-financiero/catalogo-mundial.mjs';
import {normalizarObservacion,normalizarDelta,normalizarCapturaU003,
  normalizarPronostico} from '../estado-financiero/modelo.mjs';
import {guardarObservacion,importarU003,reindexarI001,consultarCorte,coberturaCorte,
  guardarEntidad,guardarRelacion,guardarRegla,guardarEscenario,
  guardarDelta,guardarIntervencion,consultarEstadosDispersos,
  guardarPronostico,guardarEvaluacion} from '../estado-financiero/repositorio.mjs';

const T0='2026-10-29T00:00:00.000Z';
const T1='2026-10-29T12:00:00.000Z';
const T2='2026-10-29T13:00:00.000Z';
const T3='2026-10-30T13:00:00.000Z';
const T4='2026-10-30T14:00:00.000Z';
async function db(){
  const s=await Store.open({embeddedDirectory:'memory://'});
  await s.migrate();return s;
}
const obs=(extras={})=>({
  family:'B001',domain:'banca_internacional',subject_id:'BIS-US',
  variable:'claims',observed_at:T1,known_at:T2,source_id:'bis',
  source_url:'https://stats.bis.org/api/v2',source_record_id:'Q1',
  source_revision:'v1',unit:'USD_million',
  value_text:'123456789012345678901234567890.001234567890123456789',
  value_kind:'exact_decimal',value_status:'observed',
  population_id:'BIS_LBS',metadata:{stock_not_flow:true},...extras
});
const world=(items=[
  {id:'market-1',domain:'mercado_global',variable:'precio',
    observed_at:T1,known_at:T2,unit:'USD',value:100,
    source_url:'https://example.org/market'}
])=>sellarCaptura({
  schema:'laplace-universo-global-u003-v4',at:T2,
  universal_state:universeSnapshot(items,{cutoff:T2}),
  coverage:{known_signals:items.length,complete_world:false},
  source_status:[
    {name:'public-market',status:'observed',signals:items.length},
    {name:'private-L3',status:'requires_license',signals:0}
  ],automatic_trading:false,prediction_inputs_enabled:false
});

test('EF001 migra de forma aditiva y conserva P001/I001, incluyendo remigracion',async()=>{
  const s=await db();
  try{
    await s.db.query('INSERT INTO input_registry_imports(registry_sha256,source_known_at,summary) VALUES($1,$2,$3::jsonb)',
      [sha('registry'),T1,JSON.stringify({count:1})]);
    await s.db.query('INSERT INTO input_entity_versions(entity_id,registry_sha256,entity) VALUES($1,$2,$3::jsonb)',
      ['bank:1',sha('registry'),JSON.stringify({id:'bank:1',name:'Banco de prueba',jurisdiction:'US'})]);
    await s.migrate();
    const existing=(await s.db.query('SELECT * FROM laplace_fin_entity_index WHERE entity_id=$1',['bank:1'])).rows;
    assert.equal(existing.length,1);
    assert.equal(existing[0].family,'P001');
    assert.equal(existing[0].display_name,'Banco de prueba');
    const old=(await s.db.query('SELECT count(*)::int AS n FROM input_entity_versions')).rows[0];
    assert.equal(old.n,1);
    const tables=(await s.db.query('SELECT tablename FROM pg_tables WHERE tablename LIKE $1',['laplace_fin_%'])).rows;
    assert.ok(tables.length>=10);
  }finally{await s.close()}
});

test('EF001 I001 macro: decimal exacto, revision, deduplicacion y no fuga temporal',async()=>{
  const s=await db();
  try{
    const v='3.123456789012345678901234567890';
    const r=rawRecord({id:'macro-fixture',adapter:'macro_json',
      url:'https://example.org/macro'},JSON.stringify({id:'cpi:Q1',revision:'r1',
      series_id:'US-CPI',observed_at:T1,unit:'percent',value:v}),
      {received_at:T2});
    const one=await s.process(r);
    assert.equal(one.status,'processed');
    assert.equal(one.inserted,1);
    assert.equal((await s.process(r)).status,'duplicate_delivery');
    assert.equal((await consultarCorte(s,{asOf:T1})).states.length,0);
    const cut=await consultarCorte(s,{asOf:T2});
    assert.equal(cut.known_series,1);
    assert.equal(cut.states[0].value_text,v);
    assert.equal(cut.states[0].value_kind,'exact_decimal');
    assert.equal(cut.states[0].source_record_id,'cpi:Q1');
    assert.equal(cut.states[0].family,'I001');
    assert.equal((await s.health()).events,'1');
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_observations')).rows[0].n,1);
  }finally{await s.close()}
});

test('EF001 admite revision tardia sin reescribir historia, separa fuentes y poblaciones',async()=>{
  const s=await db();
  try{
    await s.transaction(async tx=>{
      await guardarObservacion(tx,obs({known_at:T1,source_revision:'first',value_text:'10'}));
      await guardarObservacion(tx,obs({known_at:T2,source_revision:'revised',value_text:'20'}));
      await guardarObservacion(tx,obs({source_id:'cbs',population_id:'BIS_CBS',
        source_revision:'other-population',value_text:'30'}));
    });
    const early=await consultarCorte(s,{asOf:T1});
    assert.equal(early.states.length,1);assert.equal(early.states[0].value_text,'10');
    const later=await consultarCorte(s,{asOf:T2});
    assert.equal(later.states.length,2);
    assert.deepEqual(new Set(later.states.map(s=>s.value_text)),new Set(['20','30']));
    assert.notEqual(later.states[0].population_id,later.states[1].population_id);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_observations')).rows[0].n,3);
  }finally{await s.close()}
});

test('EF001 ausente, restringido y cero son estados diferentes',async()=>{
  assert.throws(()=>normalizarObservacion(obs({value_status:'suppressed',missing_reason:'confidential',
    value_text:'0',value_kind:'none'})),/ausente no equivale a cero/);
  assert.throws(()=>normalizarObservacion(obs({value_text:null,value_status:'observed'})),/valor disponible/);
  const missing=normalizarObservacion(obs({value_status:'missing',value_text:null,
    value_kind:'none',missing_reason:'no public report'}));
  assert.equal(missing.value_text,null);
  const zero=normalizarObservacion(obs({value_text:'0'}));
  assert.equal(zero.value_text,'0');assert.notEqual(missing.assertion_sha,zero.assertion_sha);
  assert.throws(()=>normalizarObservacion(obs({known_at:T0})),/posterior/);
  assert.throws(()=>normalizarObservacion(obs({published_at:T3})),/publicacion posterior/);
});

test('EF001 U003 verifica dos hashes, importa observaciones float64 y conserva fuentes ausentes',async()=>{
  const s=await db();
  try{
    const capture=world();
    const first=await importarU003(s,capture);
    assert.equal(first.added_observations,1);
    assert.equal(first.total_observations,1);
    assert.equal(first.covered_sources,2);
    const again=await importarU003(s,capture);
    assert.equal(again.added_observations,0);
    assert.equal(again.created_capture,false);
    assert.equal((await consultarCorte(s,{asOf:T1})).states.length,0);
    const visible=(await consultarCorte(s,{asOf:T2})).states;
    assert.equal(visible.length,1);
    assert.equal(visible[0].value_kind,'float64_approx');
    assert.equal(visible[0].value_text,'100');
    const c=await coberturaCorte(s,{asOf:T2});
    assert.equal(c.sources.length,2);
    assert.equal(c.restricted_or_missing,1);
    assert.ok(c.sources.some(r=>r.availability==='requires_license'));
    const corrupted=structuredClone(capture);corrupted.universal_state.states[0].value=666;
    await assert.rejects(()=>importarU003(s,corrupted),/modificada|alterado|sello/);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_captures')).rows[0].n,1);
  }finally{await s.close()}
});

test('EF001 conserva relaciones verificables como afirmaciones, no causalidad deducida',async()=>{
  const s=await db();
  try{
    await s.transaction(async tx=>{
      assert.equal(await guardarEntidad(tx,{entity_id:'bank:A',entity_kind:'bank',
        display_name:'Bank A',observed_at:T1,known_at:T2,
        source_id:'sec',source_url:'https://www.sec.gov/edgar',identifiers:{CIK:'1'}}),true);
      assert.equal(await guardarRelacion(tx,{from_id:'bank:A',to_id:'fund:1',
        relation_kind:'reported_position',evidence_type:'source_assertion',
        amount_text:'10000000000000.123',unit:'USD',population_id:'SEC_13F',
        observed_at:T1,known_at:T2,source_id:'sec',
        source_url:'https://www.sec.gov/edgar',source_record_id:'13F-1'}),true);
    });
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_relation_index')).rows[0].n,1);
    assert.equal((await s.db.query('SELECT amount_text FROM laplace_fin_relations')).rows[0].amount_text,
      '10000000000000.123');
  }finally{await s.close()}
});

test('EF001 leyes XI/Ether, delta disperso en 2^60 y contrafactual aislado',async()=>{
  const s=await db();
  try{
    const rule={rule_kind:'deterministic',execution_engine:'xi_ether',
      code_sha256:sha('rule90-original-xi'),discovered_at:T0,recorded_at:T0,
      law:{kind:'Rule90',space:'2^60',query_only:true},
      assumptions:{closed_world:true},verification:'synthetic_only'};
    const address=(2n**60n-1n).toString(),key='sistema_financiero/estado_simbolico';
    let scenario,rule_sha;
    await s.transaction(async tx=>{
      await guardarRegla(tx,rule);
      rule_sha=(await tx.query('SELECT rule_sha FROM laplace_fin_rules')).rows[0].rule_sha;
      await guardarDelta(tx,{state_key:key,logical_address:address,rule_sha,
        operation:'set',state_value:'1',state_kind:'exact',
        observed_at:T1,known_at:T1,origin:'derived',evidence_sha:sha('p005')});
      scenario=await guardarEscenario(tx,{scenario_kind:'counterfactual',
        base_cutoff:T1,created_at:T2,assumptions:{external_shock:'simulated'}});
      await guardarDelta(tx,{state_key:key,logical_address:address,rule_sha,
        scenario_id:scenario.scenario_id,operation:'set',state_value:'0',
        state_kind:'exact',observed_at:T1,known_at:T2,origin:'assumption',
        evidence_sha:sha('user-assumption')});
      await guardarIntervencion(tx,{scenario_id:scenario.scenario_id,
        state_key:key,action:'raise_rate',value_text:'0.5',unit:'percent',
        effective_at:T3,declared_at:T2});
    });
    const base=await consultarEstadosDispersos(s,{asOf:T2});
    const simulated=await consultarEstadosDispersos(s,{asOf:T2,scenario_id:scenario.scenario_id});
    assert.equal(base.materialized_entries,1);
    assert.equal(base.states[0].state_value,'1');
    assert.equal(simulated.states[0].state_value,'0');
    assert.equal(base.states[0].logical_address,address);
    assert.equal(simulated.full_space_materialized,false);
    assert.equal(simulated.physical_qubits_allocated,0);
    assert.throws(()=>normalizarDelta({state_key:key,logical_address:'1e60',operation:'set',
      state_value:'1',state_kind:'exact',observed_at:T1,known_at:T1,
      origin:'derived',evidence_sha:sha('a')}),/direccion logica/);
  }finally{await s.close()}
});

test('EF001 prediccion sellada no puede utilizar datos posteriores ni evaluarse antes del objetivo',async()=>{
  const s=await db();
  try{
    const cap=world();
    await importarU003(s,cap);
    const rule={rule_kind:'probabilistic',execution_engine:'classical',
      code_sha256:sha('model-source-code'),discovered_at:T0,recorded_at:T0,
      law:{family:'F001',target:'price'},verification:'synthetic_only'};
    let model,forecast,baseline,actual;
    await s.transaction(async tx=>{
      await guardarRegla(tx,rule);
      model=(await tx.query('SELECT rule_sha FROM laplace_fin_rules')).rows[0].rule_sha;
      const base={rule_sha:model,target_subject:'market-1',target_variable:'precio',
        unit:'USD',decision_at:T2,sealed_at:T2,target_at:T3,input_cutoff:T2,
        input_snapshot_sha:cap.capture_sha256,estimate_text:'101.5',
        prediction_kind:'probabilistic',status:'candidate'};
      forecast=await guardarPronostico(tx,base);
      baseline=await guardarPronostico(tx,{...base,estimate_text:'100',prediction_kind:'baseline'});
      await assert.rejects(()=>guardarPronostico(tx,{...base,input_cutoff:T1}),
        /snapshot de datos capturado despues/);
      await assert.rejects(()=>guardarPronostico(tx,{...base,decision_at:T1}),
        /prediccion no pudo sellarse/);
      const inserted=await guardarObservacion(tx,{
        family:'I001',domain:'mercado',subject_id:'market-1',variable:'precio',
        observed_at:T3,known_at:T4,unit:'USD',value_text:'102',
        value_kind:'exact_decimal',source_id:'exchange',
        source_url:'https://example.org/exchange',source_record_id:'trade-1'});
      assert.equal(inserted,true);
      actual=(await tx.query('SELECT assertion_sha FROM laplace_fin_observations WHERE source_id=$1',
        ['exchange'])).rows[0].assertion_sha;
      await assert.rejects(()=>guardarEvaluacion(tx,{forecast_sha:forecast.forecast_sha,
        actual_assertion_sha:actual,evaluated_at:T3,scores:{mae:'0.5'},evidence:{}}),
        /resultado no conocido/);
      assert.equal(await guardarEvaluacion(tx,{
        forecast_sha:forecast.forecast_sha,
        actual_assertion_sha:actual,baseline_forecast_sha:baseline.forecast_sha,
        evaluated_at:T4,scores:{mae_usd:'0.5',baseline_mae_usd:'2'},evidence:{test:'future_observed'}}),true);
    });
    const n=(await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_forecasts')).rows[0].n;
    assert.equal(n,2);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_evaluations')).rows[0].n,1);
    assert.throws(()=>normalizarPronostico({rule_sha:model,target_subject:'market-1',
      target_variable:'precio',unit:'USD',decision_at:T2,sealed_at:T2,
      target_at:T1,input_cutoff:T2,input_snapshot_sha:cap.capture_sha256,
      status:'candidate',estimate_text:'1',prediction_kind:'deterministic'}),
      /prediccion no pudo sellarse/);
  }finally{await s.close()}
});

test('EF001 nunca trunca silenciosamente un corte ni inventa ceros',async()=>{
  const s=await db();
  try{
    await s.transaction(async tx=>{
      for(let i=0;i<3;i++)await guardarObservacion(tx,obs({subject_id:'s'+i,
        source_record_id:'r'+i,value_text:String(i)}));
    });
    await assert.rejects(()=>consultarCorte(s,{asOf:T2,limit:2}),
      /corte excede presupuesto/);
    assert.equal((await consultarCorte(s,{asOf:T2,limit:3})).known_series,3);
  }finally{await s.close()}
});


test('EF001 catalogo mundial: no fabrica fuentes, son contratos para todos los sectores',async()=>{
  const s=await db();
  try{
    const catalog=await consultarCatalogo(s.db);
    assert.equal(catalog.desired_domains,WORLD_DOMAIN_CATALOG.length);
    assert.ok(catalog.desired_domains>=40);
    assert.ok(catalog.domains.some(x=>x.domain_id==='mercados_L3_ordenes'));
    assert.ok(catalog.domains.some(x=>x.domain_id==='flujos_privados_anonimos'));
    assert.ok(catalog.domains.some(x=>x.domain_id==='meteorologia_desastres'));
    assert.equal(catalog.full_world_captured,false);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_observations')).rows[0].n,0);
    await s.migrate();
    assert.equal((await consultarCatalogo(s.db)).desired_domains,catalog.desired_domains);
  }finally{await s.close()}
});

test('EF001 puente XI no pierde decimales host, etiqueta aproximaciones y excluye excesos',()=>{
  const cases=[
    normalizarObservacion(obs({value_text:'12.125',source_record_id:'valid'})),
    normalizarObservacion(obs({family:'U003',value_text:'0.123456789',
      value_kind:'float64_approx',unit:'ratio',source_record_id:'float'})),
    normalizarObservacion(obs({source_record_id:'big',value_text:'99999999999999999999999999999999'})),
    normalizarObservacion(obs({source_record_id:'missing',value_status:'missing',
      value_kind:'none',value_text:null,missing_reason:'restricted'}))
  ];
  const projection=prepararLotesXI(cases,{cutoff:T2,batchSize:1});
  assert.equal(projection.imported,2);
  assert.equal(projection.excluded.length,2);
  assert.equal(projection.batches.length,2);
  assert.equal(projection.batches[0].states[0].value,1212500000);
  assert.equal(projection.dictionary[0].original_value_text,'12.125');
  assert.equal(projection.dictionary[0].encoding,'exact_integer_scaled_1e8');
  assert.equal(projection.dictionary[1].estimated_precision_not_improved,true);
  assert.equal(projection.materializes_full_world,false);
  const compiled=compilarLotesXI(projection);
  assert.equal(compiled.length,2);
  assert.ok(compiled.every(x=>x.materialized_bytes<=32784));
  assert.ok(compiled.every(x=>x.xi_program.includes('mem_materialize')));
  assert.throws(()=>prepararLotesXI(cases,{cutoff:T2,batchSize:2048}),
    /excede 1024/);
});

test('EF001 puente nativo XI/Ether original valida bytes sin reemplazar runtime',
  {skip:!process.env.MUNDO_X_QUANTUM},()=>{
  const row=normalizarObservacion(obs({value_text:'0.015',source_record_id:'tiny'}));
  const p=prepararLotesXI([row],{cutoff:T2});
  const out=probarLotesXI(process.env.MUNDO_X_QUANTUM,p);
  assert.equal(out.exact_roundtrip,true);
  assert.equal(out.results[0].materialized_bytes,48);
  assert.equal(out.results[0].active_qubits,0);
});


test('EF001 importa captura U003 original archivada, sin inventar las 563 señales',async()=>{
  const s=await db();
  try{
    const raw=JSON.parse(readFileSync(new URL('../evidencia/continuidad-u003-20261030/captura-integrada.json',import.meta.url),'utf8'));
    const result=await importarU003(s,raw);
    assert.equal(raw.universal_state.known_states,563);
    assert.equal(result.total_observations,563);
    assert.equal(result.added_observations,563);
    assert.equal(result.complete_world,false);
    const asOf=await consultarCorte(s,{asOf:raw.at});
    assert.ok(asOf.states.length>400);
    assert.ok(asOf.states.every(x=>new Date(x.known_at).toISOString()<=raw.at));
    assert.equal(asOf.global_coverage_complete,false);
  }finally{await s.close()}
});


test('EF001 reproyecta historia I001 previa al nuevo esquema sin alterar evento ni revisiones',async()=>{
  const s=await db();
  try{
    const r=rawRecord({id:'legacy',adapter:'macro_json',
      url:'https://example.org/legacy'},JSON.stringify({
      id:'historical',revision:'r1',series_id:'US-RATE',value:'5.123456789012345678901',
      unit:'percent',observed_at:T1}),{received_at:T2});
    const event=normalize(r)[0];
    await s.db.query('INSERT INTO input_events(known_at,event_key,type,subject,source_id,event_time,event) '+
      'VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',[
      event.known_at,event.event_key,event.type,event.subject,event.source_id,
      event.event_time,JSON.stringify(event)]);
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM laplace_fin_observations')).rows[0].n,0);
    const one=await reindexarI001(s,{asOf:T2,pageSize:1});
    assert.equal(one.scanned,1);
    assert.equal(one.inserted,1);
    assert.equal(one.complete,true);
    const again=await reindexarI001(s,{asOf:T2,pageSize:1});
    assert.equal(again.inserted,0);
    assert.equal((await consultarCorte(s,{asOf:T2})).states[0].value_text,
      '5.123456789012345678901');
    assert.equal((await s.db.query('SELECT count(*)::int AS n FROM input_events')).rows[0].n,1);
  }finally{await s.close()}
});

test('EF001 no admite consultar escenarios futuros ni IDs de simulacion inventados',async()=>{
  const s=await db();
  try{
    await assert.rejects(()=>consultarEstadosDispersos(s,{asOf:T2,scenario_id:'fake'}),
      /escenario inexistente/);
  }finally{await s.close()}
});
