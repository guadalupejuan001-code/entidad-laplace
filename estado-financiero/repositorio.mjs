/* EF001: repositorio aditivo sobre I001/PGlite/PostgreSQL.
 * Las lecturas son point-in-time, las escrituras append-only e idempotentes.
 * No entrena modelos ni opera mercados; XI/Ether sigue siendo runtime original.
 */
import {need,sha,stable,decimal,identifier,sourceURL,validateEvent} from '../input/contrato.mjs';
import {utcTime} from '../universo/estados.mjs';
import {normalizarObservacion,observacionI001,observacionU003,
  normalizarCapturaU003,normalizarCoberturasU003,normalizarRelacion,
  normalizarRegla,normalizarEscenario,normalizarDelta,normalizarPronostico,
  recordSha} from './modelo.mjs';

const ident=(x)=>identifier(x,'identificador EF001',500);
const time=x=>utcTime(x);
const hash=x=>{need(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),'hash SHA256 invalido');return x};
const json=x=>JSON.stringify(x);
const MAX_BUDGET=4096;
const COLUMNS={
  laplace_fin_observations:['assertion_sha','family','domain','subject_id','variable',
    'instrument_id','market_id','counterparty_id','jurisdiction','currency',
    'population_id','observed_at','known_at','published_at','valid_from','valid_to',
    'value_text','value_kind','value_status','missing_reason','unit','source_id',
    'source_url','source_record_id','source_revision','raw_sha256',
    'parent_event_key','capture_sha256','metadata'],
  laplace_fin_relations:['relation_sha','from_id','to_id','relation_kind',
    'evidence_type','amount_text','unit','population_id','observed_at','known_at',
    'source_id','source_url','source_record_id','metadata'],
  laplace_fin_coverage:['coverage_sha','capture_sha','family','source_id',
    'availability','observed_count','known_at','reason','scope','license_ref'],
  laplace_fin_captures:['capture_sha','snapshot_sha','capture_kind','captured_at',
    'cutoff_at','state_count','manifest','provenance'],
  laplace_fin_rules:['rule_sha','rule_kind','execution_engine','code_sha256',
    'discovered_at','recorded_at','law','assumptions','evidence','verification'],
  laplace_fin_scenarios:['scenario_id','parent_id','scenario_kind','base_cutoff',
    'created_at','assumptions','initial_state_sha'],
  laplace_fin_sparse_deltas:['delta_sha','state_key','logical_address','rule_sha',
    'scenario_id','operation','state_value','state_unit','state_kind',
    'observed_at','known_at','origin','evidence_sha'],
  laplace_fin_forecasts:['forecast_sha','rule_sha','scenario_id',
    'target_subject','target_variable','unit','decision_at','sealed_at','target_at',
    'input_cutoff','input_snapshot_sha','estimate_text','distribution',
    'prediction_kind','status','metadata'],
  laplace_fin_interventions:['intervention_sha','scenario_id','state_key','action',
    'value_text','unit','effective_at','declared_at','assumptions'],
  laplace_fin_evaluations:['evaluation_sha','forecast_sha','actual_assertion_sha',
    'baseline_forecast_sha','evaluated_at','scores','evidence',
    'model_selected_using_evaluation'],
  laplace_fin_entity_versions:['revision_sha','entity_id','entity_kind',
    'display_name','jurisdiction','identifiers','attributes','source_id',
    'source_url','observed_at','known_at','classification']
};
const JSON_COLUMNS=new Set(['metadata','scope','manifest','provenance','law',
  'assumptions','evidence','attributes','identifiers','distribution','scores']);
const insertSQL=Object.fromEntries(Object.entries(COLUMNS).map(([table,cols])=>
  [table,'INSERT INTO '+table+' ('+cols.join(',')+') VALUES ('+
    cols.map((_,i)=>'$'+(i+1)).join(',')+') ON CONFLICT DO NOTHING RETURNING '+cols[0]]));
async function insert(tx,table,body){
  const cols=COLUMNS[table];need(cols&&cols.every(x=>Object.hasOwn(body,x)),
    'campos obligatorios EF001 incompletos '+table);
  const vals=cols.map(k=>JSON_COLUMNS.has(k)&&body[k]!=null?json(body[k]):body[k]);
  return (await tx.query(insertSQL[table],vals)).rows.length===1;
}
export async function guardarObservacion(tx,raw){
  return insert(tx,'laplace_fin_observations',normalizarObservacion(raw));
}
export async function proyectarI001(tx,event){
  const o=observacionI001(event);
  return o?insert(tx,'laplace_fin_observations',o):false;
}
export async function guardarRelacion(tx,raw){
  return insert(tx,'laplace_fin_relations',normalizarRelacion(raw));
}
export async function guardarEntidad(tx,raw){
  need(raw&&typeof raw==='object','entidad invalida');
  const observed_at=time(raw.observed_at),known_at=time(raw.known_at);
  need(observed_at<=known_at,'version de entidad futura');
  need(['asserted','verified','uncertain'].includes(raw.classification??'asserted'),
    'clasificacion de identidad invalida');
  const body={entity_id:ident(raw.entity_id),entity_kind:ident(raw.entity_kind),
    display_name:ident(raw.display_name),jurisdiction:raw.jurisdiction??null,
    identifiers:raw.identifiers??{},attributes:raw.attributes??{},
    source_id:ident(raw.source_id),source_url:sourceURL(raw.source_url),
    observed_at,known_at,classification:raw.classification??'asserted'};
  need(typeof body.identifiers==='object'&&body.identifiers&&!Array.isArray(body.identifiers),
    'identificadores invalidos');
  need(typeof body.attributes==='object'&&body.attributes&&!Array.isArray(body.attributes),
    'atributos invalidos');
  return insert(tx,'laplace_fin_entity_versions',{...body,revision_sha:recordSha(body)});
}
export async function guardarRegla(tx,raw){
  return insert(tx,'laplace_fin_rules',normalizarRegla(raw));
}
export async function guardarEscenario(tx,raw){
  const s=normalizarEscenario(raw);
  if(s.parent_id){
    const p=(await tx.query('SELECT base_cutoff,created_at FROM laplace_fin_scenarios WHERE scenario_id=$1',[s.parent_id])).rows[0];
    need(p,'escenario padre ausente');
    need(new Date(p.created_at).toISOString()<=s.created_at,'escenario creado antes del padre');
  }
  return {inserted:await insert(tx,'laplace_fin_scenarios',s),scenario_id:s.scenario_id};
}
export async function guardarDelta(tx,raw){
  const d=normalizarDelta(raw);
  if(d.origin==='assumption')need(d.scenario_id!==null,
    'supuesto solo existe en escenario aislado');
  return insert(tx,'laplace_fin_sparse_deltas',d);
}
export async function guardarIntervencion(tx,raw){
  need(raw&&typeof raw==='object','intervencion invalida');
  const scenario_id=ident(raw.scenario_id),declared_at=time(raw.declared_at),
    effective_at=time(raw.effective_at);
  const scenario=(await tx.query('SELECT base_cutoff,created_at FROM laplace_fin_scenarios WHERE scenario_id=$1',[scenario_id])).rows[0];
  need(scenario,'escenario de intervencion ausente');
  need(declared_at>=new Date(scenario.created_at).toISOString(),
    'intervencion declarada antes de crear escenario');
  const value_text=raw.value_text??null,unit=raw.unit??null;
  need(value_text===null||(typeof value_text==='string'&&value_text.length<=1000),'valor de intervencion invalido');
  need((value_text===null)===(unit===null),'unidad de intervencion incompatible');
  const body={scenario_id,state_key:ident(raw.state_key),action:ident(raw.action),
    value_text,unit,effective_at,declared_at,assumptions:raw.assumptions??{}};
  return insert(tx,'laplace_fin_interventions',{...body,intervention_sha:recordSha(body)});
}
export async function guardarPronostico(tx,raw){
  const f=normalizarPronostico(raw);
  const rule=(await tx.query('SELECT recorded_at,verification FROM laplace_fin_rules WHERE rule_sha=$1',
    [f.rule_sha])).rows[0];
  need(rule,'ley no registrada');
  need(new Date(rule.recorded_at).toISOString()<=f.input_cutoff,
    'el modelo no estaba congelado al corte de entrada');
  const capture=(await tx.query('SELECT captured_at FROM laplace_fin_captures WHERE capture_sha=$1',
    [f.input_snapshot_sha])).rows[0];
  need(capture,'snapshot real de entrada no registrado');
  need(new Date(capture.captured_at).toISOString()<=f.input_cutoff,
    'snapshot de datos capturado despues de decision');
  if(f.scenario_id){
    const s=(await tx.query('SELECT created_at,base_cutoff FROM laplace_fin_scenarios WHERE scenario_id=$1',[f.scenario_id])).rows[0];
    need(s&&new Date(s.created_at).toISOString()<=f.decision_at,
      'escenario no existia al sellar pronostico');
  }
  return {inserted:await insert(tx,'laplace_fin_forecasts',f),
    forecast_sha:f.forecast_sha};
}
export async function guardarEvaluacion(tx,raw){
  need(raw&&typeof raw==='object','evaluacion invalida');
  const forecast_sha=hash(raw.forecast_sha),actual_assertion_sha=hash(raw.actual_assertion_sha);
  const evaluated_at=time(raw.evaluated_at);
  const f=(await tx.query('SELECT * FROM laplace_fin_forecasts WHERE forecast_sha=$1',[forecast_sha])).rows[0];
  const actual=(await tx.query('SELECT * FROM laplace_fin_observations WHERE assertion_sha=$1',[actual_assertion_sha])).rows[0];
  need(f&&f.status==='candidate'&&actual,'prediccion u objetivo no evaluable');
  need(actual.value_status==='observed','solo resultado real observado');
  need(actual.subject_id===f.target_subject&&actual.variable===f.target_variable&&
    actual.unit===f.unit,'objetivo o unidad difieren');
  need(new Date(actual.observed_at).toISOString()>=new Date(f.target_at).toISOString(),
    'resultado anterior al objetivo');
  need(new Date(actual.known_at).toISOString()<=evaluated_at&&
    new Date(f.target_at).toISOString()<=evaluated_at,'resultado no conocido');
  let baseline_forecast_sha=raw.baseline_forecast_sha??null;
  if(baseline_forecast_sha){
    hash(baseline_forecast_sha);
    const b=(await tx.query('SELECT * FROM laplace_fin_forecasts WHERE forecast_sha=$1',[baseline_forecast_sha])).rows[0];
    need(b&&b.prediction_kind==='baseline'&&b.target_subject===f.target_subject&&
      b.target_variable===f.target_variable&&b.unit===f.unit&&
      new Date(b.target_at).toISOString()===new Date(f.target_at).toISOString()&&
      new Date(b.decision_at).toISOString()===new Date(f.decision_at).toISOString(),
      'baseline no comparable pareada');
  }
  need(raw.scores&&typeof raw.scores==='object'&&!Array.isArray(raw.scores),
    'se requieren metricas explicitas');
  need(raw.evidence&&typeof raw.evidence==='object'&&!Array.isArray(raw.evidence),
    'se requiere evidencia de evaluacion');
  const body={forecast_sha,actual_assertion_sha,baseline_forecast_sha,evaluated_at,
    scores:raw.scores,evidence:raw.evidence,model_selected_using_evaluation:false};
  return insert(tx,'laplace_fin_evaluations',{...body,evaluation_sha:recordSha(body)});
}
export async function importarU003(store,capture){
  const c=normalizarCapturaU003(capture);
  const observations=capture.universal_state.states.map(x=>observacionU003(x,c.capture_sha));
  const coverage=normalizarCoberturasU003(capture);
  return store.transaction(async tx=>{
    const created=await insert(tx,'laplace_fin_captures',c);
    let n=0,missing=0;
    for(const o of observations)n+=Number(await insert(tx,'laplace_fin_observations',o));
    for(const item of coverage)missing+=Number(await insert(tx,'laplace_fin_coverage',item));
    return {capture_sha:c.capture_sha,snapshot_sha:c.snapshot_sha,
      added_observations:n,covered_sources:missing,created_capture:created,
      total_observations:observations.length,complete_world:false,
      prediction_activated:false,automatic_trading:false};
  });
}
/* Reproyectar I001 histórico que ya estaba en input_events antes de EF001.
 * Orden estable por (known_at,event_key), sin reescribir la fuente ni su known_at.
 * Un presupuesto finito explícito evita prometer un replay infinito.
 */
export async function reindexarI001(store,{asOf=new Date().toISOString(),pageSize=250,maxEvents=100000}={}){
  const cut=time(asOf);
  need(Number.isInteger(pageSize)&&pageSize>=1&&pageSize<=1000,'pagina invalida');
  need(Number.isInteger(maxEvents)&&maxEvents>=1&&maxEvents<=1000000,'presupuesto historico invalido');
  let cursor=null,scanned=0,inserted=0,more=true;
  while(more&&scanned<maxEvents){
    const size=Math.min(pageSize,maxEvents-scanned);
    const params=cursor?[cut,cursor.known_at,cursor.event_key,size]:[cut,size];
    const query=cursor?
      'SELECT event,known_at,event_key FROM input_events WHERE known_at<=$1 AND (known_at,event_key)>($2::timestamptz,$3) ORDER BY known_at,event_key LIMIT $4':
      'SELECT event,known_at,event_key FROM input_events WHERE known_at<=$1 ORDER BY known_at,event_key LIMIT $2';
    const rows=(await store.db.query(query,params)).rows;
    if(!rows.length){more=false;break;}
    inserted+=await store.transaction(async tx=>{
      let added=0;
      for(const row of rows){
        validateEvent(row.event);
        added+=Number(await proyectarI001(tx,row.event));
      }
      return added;
    });
    scanned+=rows.length;
    const last=rows.at(-1);
    cursor={known_at:new Date(last.known_at).toISOString(),event_key:last.event_key};
    more=rows.length===size;
  }
  return {as_of:cut,scanned,inserted,complete:!more,
    source_events_unchanged:true,preserved_original_known_at:true,
    note:more?'Limite alcanzado: ampliar presupuesto y repetir; no declarar inventario completo':
      'Todos los eventos I001 hasta el corte fueron visitados'};
}
// No mezclar dos monedas, poblaciones BIS o mercados distintos aunque usen igual fuente.
const SERIES_DIMENSIONS="family,domain,subject_id,variable,source_id,unit,"+
  "COALESCE(population_id,''),COALESCE(currency,''),"+
  "COALESCE(instrument_id,''),COALESCE(market_id,''),"+
  "COALESCE(counterparty_id,''),COALESCE(jurisdiction,'')";
export async function consultarPaginaCorte(store,{asOf,limit=1024,offset=0,
  domain=null,family=null}={}){
  const cut=time(asOf);
  need(Number.isInteger(limit)&&limit>0&&limit<=1024,'pagina limite 1..1024');
  need(Number.isInteger(offset)&&offset>=0&&offset<=1000000,'paginacion fuera de presupuesto');
  let where='',params=[cut,limit+1,offset];
  if(domain){where+=' AND domain=
  const cut=time(asOf),budget=Number(limit);
  need(Number.isInteger(budget)&&budget>0&&budget<=MAX_BUDGET,'limite de consulta 1..4096');
  const params=[cut,budget+1];let where='';
  if(domain){where+=' AND domain=$'+(params.length+1);params.push(ident(domain))}
  if(family){where+=' AND family=$'+(params.length+1);params.push(ident(family))}
  const query='SELECT DISTINCT ON ('+SERIES_DIMENSIONS+') * '+
    'FROM laplace_fin_observations WHERE known_at<=$1 AND observed_at<=$1 '+where+
    ' ORDER BY '+SERIES_DIMENSIONS+',observed_at DESC,known_at DESC,assertion_sha DESC LIMIT $2';
  const rows=(await store.db.query(query,params)).rows;
  need(rows.length<=budget,'corte excede presupuesto; dividir por familia/dominio');
  return {as_of:cut,known_series:rows.length,states:rows,
    temporal_policy:'observed_at_and_known_at_at_or_before_cutoff',
    different_sources_not_summed:true,global_coverage_complete:false,
    prediction_activated:false};
}
export async function consultarEstadosDispersos(store,
  {asOf,scenario_id=null,limit=4096}={}){
  const cut=time(asOf),budget=Number(limit);
  need(Number.isInteger(budget)&&budget>0&&budget<=MAX_BUDGET,'limite disperso invalido');
  if(scenario_id){
    ident(scenario_id);
    const scenario=(await store.db.query('SELECT created_at FROM laplace_fin_scenarios WHERE scenario_id=$1',[scenario_id])).rows[0];
    need(scenario&&new Date(scenario.created_at).toISOString()<=cut,
      'escenario inexistente o creado despues del corte');
  }
  const query='SELECT * FROM (SELECT d.*,ROW_NUMBER() OVER ('+
    'PARTITION BY d.state_key,COALESCE(d.logical_address,\'\') ORDER BY '+
    'CASE WHEN d.scenario_id=$2 THEN 1 ELSE 0 END DESC,d.known_at DESC,d.delta_sha DESC) AS priority '+
    'FROM laplace_fin_sparse_deltas d WHERE d.known_at<=$1 AND d.observed_at<=$1 '+
    'AND (d.scenario_id IS NULL OR d.scenario_id=$2)) q '+
    'WHERE priority=1 ORDER BY state_key,logical_address LIMIT $3';
  const rows=(await store.db.query(query,[cut,scenario_id,budget+1])).rows;
  need(rows.length<=budget,'estado disperso excede presupuesto de materializacion');
  return {as_of:cut,scenario_id,materialized_entries:rows.length,
    states:rows.map(({priority,...r})=>r),
    representation:'sparse_overrides_no_dense_state',
    full_space_materialized:false,physical_qubits_allocated:0};
}
export async function coberturaCorte(store,{asOf,limit=4096}={}){
  const cut=time(asOf);need(Number.isInteger(limit)&&limit>=1&&limit<=MAX_BUDGET,'limite invalido');
  const rows=(await store.db.query('SELECT DISTINCT ON (family,source_id) * FROM laplace_fin_coverage '+
    'WHERE known_at<=$1 ORDER BY family,source_id,known_at DESC,coverage_sha DESC LIMIT $2',
    [cut,limit+1])).rows;
  need(rows.length<=limit,'cobertura extensa; paginar');
  return {as_of:cut,sources:rows,complete_world:false,
    available:rows.filter(x=>x.availability==='observed').length,
    restricted_or_missing:rows.filter(x=>x.availability!=='observed').length};
}
+(params.length+1);params.push(ident(domain))}
  if(family){where+=' AND family=
  const cut=time(asOf),budget=Number(limit);
  need(Number.isInteger(budget)&&budget>0&&budget<=MAX_BUDGET,'limite de consulta 1..4096');
  const params=[cut,budget+1];let where='';
  if(domain){where+=' AND domain=$'+(params.length+1);params.push(ident(domain))}
  if(family){where+=' AND family=$'+(params.length+1);params.push(ident(family))}
  const query='SELECT DISTINCT ON ('+SERIES_DIMENSIONS+') * '+
    'FROM laplace_fin_observations WHERE known_at<=$1 AND observed_at<=$1 '+where+
    ' ORDER BY '+SERIES_DIMENSIONS+',observed_at DESC,known_at DESC,assertion_sha DESC LIMIT $2';
  const rows=(await store.db.query(query,params)).rows;
  need(rows.length<=budget,'corte excede presupuesto; dividir por familia/dominio');
  return {as_of:cut,known_series:rows.length,states:rows,
    temporal_policy:'observed_at_and_known_at_at_or_before_cutoff',
    different_sources_not_summed:true,global_coverage_complete:false,
    prediction_activated:false};
}
export async function consultarEstadosDispersos(store,
  {asOf,scenario_id=null,limit=4096}={}){
  const cut=time(asOf),budget=Number(limit);
  need(Number.isInteger(budget)&&budget>0&&budget<=MAX_BUDGET,'limite disperso invalido');
  if(scenario_id){
    ident(scenario_id);
    const scenario=(await store.db.query('SELECT created_at FROM laplace_fin_scenarios WHERE scenario_id=$1',[scenario_id])).rows[0];
    need(scenario&&new Date(scenario.created_at).toISOString()<=cut,
      'escenario inexistente o creado despues del corte');
  }
  const query='SELECT * FROM (SELECT d.*,ROW_NUMBER() OVER ('+
    'PARTITION BY d.state_key,COALESCE(d.logical_address,\'\') ORDER BY '+
    'CASE WHEN d.scenario_id=$2 THEN 1 ELSE 0 END DESC,d.known_at DESC,d.delta_sha DESC) AS priority '+
    'FROM laplace_fin_sparse_deltas d WHERE d.known_at<=$1 AND d.observed_at<=$1 '+
    'AND (d.scenario_id IS NULL OR d.scenario_id=$2)) q '+
    'WHERE priority=1 ORDER BY state_key,logical_address LIMIT $3';
  const rows=(await store.db.query(query,[cut,scenario_id,budget+1])).rows;
  need(rows.length<=budget,'estado disperso excede presupuesto de materializacion');
  return {as_of:cut,scenario_id,materialized_entries:rows.length,
    states:rows.map(({priority,...r})=>r),
    representation:'sparse_overrides_no_dense_state',
    full_space_materialized:false,physical_qubits_allocated:0};
}
export async function coberturaCorte(store,{asOf,limit=4096}={}){
  const cut=time(asOf);need(Number.isInteger(limit)&&limit>=1&&limit<=MAX_BUDGET,'limite invalido');
  const rows=(await store.db.query('SELECT DISTINCT ON (family,source_id) * FROM laplace_fin_coverage '+
    'WHERE known_at<=$1 ORDER BY family,source_id,known_at DESC,coverage_sha DESC LIMIT $2',
    [cut,limit+1])).rows;
  need(rows.length<=limit,'cobertura extensa; paginar');
  return {as_of:cut,sources:rows,complete_world:false,
    available:rows.filter(x=>x.availability==='observed').length,
    restricted_or_missing:rows.filter(x=>x.availability!=='observed').length};
}
+(params.length+1);params.push(ident(family))}
  const query='SELECT * FROM (SELECT DISTINCT ON ('+SERIES_DIMENSIONS+') * '+
    'FROM laplace_fin_observations WHERE known_at<=$1 AND observed_at<=$1 '+where+
    ' ORDER BY '+SERIES_DIMENSIONS+',observed_at DESC,known_at DESC,assertion_sha DESC) latest '+
    'ORDER BY '+SERIES_DIMENSIONS+' LIMIT $2 OFFSET $3';
  const rows=(await store.db.query(query,params)).rows;
  return {as_of:cut,offset,limit,states:rows.slice(0,limit),
    next_offset:rows.length>limit?offset+limit:null,
    complete:rows.length<=limit,world_complete:false,
    persisted_data_not_world_omniscience:true};
}
export async function consultarCorte(store,{asOf,limit=4096,domain=null,family=null}={}){
  const cut=time(asOf),budget=Number(limit);
  need(Number.isInteger(budget)&&budget>0&&budget<=MAX_BUDGET,'limite de consulta 1..4096');
  const params=[cut,budget+1];let where='';
  if(domain){where+=' AND domain=$'+(params.length+1);params.push(ident(domain))}
  if(family){where+=' AND family=$'+(params.length+1);params.push(ident(family))}
  const query='SELECT DISTINCT ON ('+SERIES_DIMENSIONS+') * '+
    'FROM laplace_fin_observations WHERE known_at<=$1 AND observed_at<=$1 '+where+
    ' ORDER BY '+SERIES_DIMENSIONS+',observed_at DESC,known_at DESC,assertion_sha DESC LIMIT $2';
  const rows=(await store.db.query(query,params)).rows;
  need(rows.length<=budget,'corte excede presupuesto; dividir por familia/dominio');
  return {as_of:cut,known_series:rows.length,states:rows,
    temporal_policy:'observed_at_and_known_at_at_or_before_cutoff',
    different_sources_not_summed:true,global_coverage_complete:false,
    prediction_activated:false};
}
export async function consultarEstadosDispersos(store,
  {asOf,scenario_id=null,limit=4096}={}){
  const cut=time(asOf),budget=Number(limit);
  need(Number.isInteger(budget)&&budget>0&&budget<=MAX_BUDGET,'limite disperso invalido');
  if(scenario_id){
    ident(scenario_id);
    const scenario=(await store.db.query('SELECT created_at FROM laplace_fin_scenarios WHERE scenario_id=$1',[scenario_id])).rows[0];
    need(scenario&&new Date(scenario.created_at).toISOString()<=cut,
      'escenario inexistente o creado despues del corte');
  }
  const query='SELECT * FROM (SELECT d.*,ROW_NUMBER() OVER ('+
    'PARTITION BY d.state_key,COALESCE(d.logical_address,\'\') ORDER BY '+
    'CASE WHEN d.scenario_id=$2 THEN 1 ELSE 0 END DESC,d.known_at DESC,d.delta_sha DESC) AS priority '+
    'FROM laplace_fin_sparse_deltas d WHERE d.known_at<=$1 AND d.observed_at<=$1 '+
    'AND (d.scenario_id IS NULL OR d.scenario_id=$2)) q '+
    'WHERE priority=1 ORDER BY state_key,logical_address LIMIT $3';
  const rows=(await store.db.query(query,[cut,scenario_id,budget+1])).rows;
  need(rows.length<=budget,'estado disperso excede presupuesto de materializacion');
  return {as_of:cut,scenario_id,materialized_entries:rows.length,
    states:rows.map(({priority,...r})=>r),
    representation:'sparse_overrides_no_dense_state',
    full_space_materialized:false,physical_qubits_allocated:0};
}
export async function coberturaCorte(store,{asOf,limit=4096}={}){
  const cut=time(asOf);need(Number.isInteger(limit)&&limit>=1&&limit<=MAX_BUDGET,'limite invalido');
  const rows=(await store.db.query('SELECT DISTINCT ON (family,source_id) * FROM laplace_fin_coverage '+
    'WHERE known_at<=$1 ORDER BY family,source_id,known_at DESC,coverage_sha DESC LIMIT $2',
    [cut,limit+1])).rows;
  need(rows.length<=limit,'cobertura extensa; paginar');
  return {as_of:cut,sources:rows,complete_world:false,
    available:rows.filter(x=>x.availability==='observed').length,
    restricted_or_missing:rows.filter(x=>x.availability!=='observed').length};
}
