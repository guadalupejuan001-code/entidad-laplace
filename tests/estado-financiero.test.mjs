import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../input/almacen.mjs';
import {sha,rawRecord} from '../input/contrato.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';
import {normalizarObservacion,normalizarDelta,normalizarCapturaU003,
  normalizarPronostico} from '../estado-financiero/modelo.mjs';
import {guardarObservacion,importarU003,consultarCorte,coberturaCorte,
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
