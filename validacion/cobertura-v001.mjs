/* V001 — coverage is a dated audit, NOT evidence that all world finance is known.
 * A connector "implemented" is different from a live observed source; a
 * historical snapshot has NO right to be used for decisions before known_at.
 */
import {utcTime,observation} from '../universo/estados.mjs';
import {verificarSelloCaptura} from '../universo/integridad.mjs';

export const V001_SCHEMA='laplace-validacion-final-v001-v1';
export const CATALOG=Object.freeze([
  {id:'U002_U003',kind:'world_context',status:'historical_partial',
    reference:'evidencia/continuidad-u003-20261030/captura-integrada.json',
    observed_live:true,predictor_center_affected:false,
    caveat:'world snapshots are as-of receipt; GDELT, licensed and optional sources partial'},
  {id:'U004',kind:'capital_public',status:'historical_partial',
    reference:'evidencia/capital-u004-20261030/resumen.json',
    observed_live:true,predictor_center_affected:false,
    caveat:'COT weekly, US Treasury and Fed data; not a global ledger'},
  {id:'O001_A',kind:'off_exchange_finra',status:'pilot_live',
    reference:'https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/41168250940',
    observed_live:true,predictor_center_affected:false,
    caveat:'daily public FINRA Reg SHO is short-sale volume, NOT short interest'},
  {id:'O001_B',kind:'ats_weekly_blocks',status:'needs_authorized_credentials',
    reference:'docs/FINRA_O001B_WEEKLY_BLOCKS.md',
    observed_live:false,predictor_center_affected:false,
    caveat:'ATS/non-ATS query API needs credentials; offline tests only'},
  {id:'D001',kind:'crypto_derivatives',status:'pilot_partial',
    reference:'https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/41169680228',
    observed_live:true,predictor_center_affected:false,
    caveat:'Hyperliquid and Deribit sampled; Binance HTTP451; no verified liquidation feed'},
  {id:'D002',kind:'otc_swaps',status:'pilot_partial',
    reference:'https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41175187520',
    observed_live:true,predictor_center_affected:false,
    caveat:'3 delayed CFTC aggregate tables; SDR Part43 normalization has no live adapter'},
  {id:'C001',kind:'etf_fund_flows',status:'needs_live_sec_capture',
    reference:'docs/ETF_FONDOS_C001.md',
    observed_live:false,predictor_center_affected:false,
    caveat:'NPORT parser SPY/SPYM tested, SEC contact and actual XML verification pending; IBIT 10-Q separate'},
  {id:'B001',kind:'cross_border_banking',status:'pilot_live',
    reference:'https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41175476309',
    observed_live:true,predictor_center_affected:false,
    caveat:'4 BIS LBS/CBS series, 32 quarterly states; no LBS + CBS sum or true flow inferred'},
  {id:'K001',kind:'public_blockchain_defi',status:'pilot_live',
    reference:'https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41176213081',
    observed_live:true,predictor_center_affected:false,
    caveat:'BTC/ETH blocks and DefiLlama snapshots; TVL and supply are not net capital flows'}
].map(Object.freeze));

const need=(ok,message)=>{if(!ok)throw Error(message)};
const date=s=>utcTime(s);
function limitSnapshot(c){
  need(c&&typeof c==='object'&&c.universal_state,'V001 captura mundial ausente');
  need(c.schema?.startsWith('laplace-universo-global-'),'V001 captura mundial de otro tipo');
  verificarSelloCaptura(c);
  const at=date(c.at),state=c.universal_state,items=state.states;
  need(state.cutoff===at,'V001 corte mundial diferente de la captura');
  need(Array.isArray(items)&&items.length<=4096&&state.known_states===items.length,
    'V001 número de estados o presupuesto mundial incorrectos');
  need(Array.isArray(c.source_status)&&c.source_status.length<=1000,'V001 procedencia mundial inválida');
  const ids=new Set();let withheld=0;
  for(const x of items){
    observation(x);
    need(!ids.has(x.id),'V001 estados duplicados en captura');ids.add(x.id);
    if(x.known_at>at||x.observed_at>at)withheld++;
  }
  need(withheld===0,'V001 encontró estados conocidos después del corte');
  const groups=Array.isArray(c.coverage?.groups)?c.coverage.groups:[];
  return {schema:'laplace-v001-audit-world-v1',captured_at:at,
    snapshot_sha256:state.snapshot_sha256??null,capture_sha256:c.capture_sha256,
    known_states:items.length,domains:state.domains?.length??null,
    source_status_count:c.source_status.length,
    observed_sources:c.source_status.filter(s=>s.status==='observed').length,
    failed_sources:c.source_status.filter(s=>s.status==='unavailable').length,
    optional_sources:c.source_status.filter(s=>['requires_access','requires_credentials',
      'requires_license','requires_contact'].includes(s.status)).length,
    groups_reported:groups.length,
    as_of_rule:'known_at<=cutoff and observed_at<=cutoff verified',
    usable_for_forecasts_before_capture:false,
    historical_release_times_proven:false,world_prediction_inputs_enabled:false,
    world_totality_claim_supported:false};
}
export function auditarCapturaMundial(c){return limitSnapshot(c)}

export function auditarMatrizFuentes(catalog=CATALOG,{auditedAt=new Date().toISOString()}={}){
  const at=date(auditedAt);
  need(Array.isArray(catalog)&&catalog.length>0&&catalog.length<=40,
    'V001 catálogo de fuentes no válido');
  const seen=new Set();
  for(const x of catalog){
    need(typeof x.id==='string'&&/^[A-Z0-9_]+$/.test(x.id)&&!seen.has(x.id),
      'V001 fuente duplicada o inválida');
    seen.add(x.id);
    need(typeof x.status==='string'&&typeof x.reference==='string'&&
      typeof x.caveat==='string'&&typeof x.observed_live==='boolean'&&
      x.predictor_center_affected===false,'V001 metadata de fuentes incompleta');
  }
  return {as_of:at,modules:catalog.map(x=>({...x})),
    total_modules:catalog.length,live_or_historical_partial:catalog.filter(x=>x.observed_live).length,
    needs_live_capture:catalog.filter(x=>!x.observed_live).map(x=>x.id),
    prediction_effect_identified:false,complete_world_data:false,
    licensing_and_confidential_data_not_available:true,
    no_estimated_zero_for_missing:true,
    live_status_is_dated_historical_not_current_availability:true};
}

/* Reject any feature used for a decision before it was first truly known.
 * A past "observed_at" alone does not mean the archived version existed then.
 */
export function validarDisponibilidadDeFeatures(features,{decisionAt}={}){
  const cut=date(decisionAt);
  need(Array.isArray(features)&&features.length<=4096,'V001 cantidad de features inválida');
  const ids=new Set(),out={usable:0,late:0,missing:0,unsupported:0};
  for(const f of features){
    need(f&&typeof f==='object'&&!Array.isArray(f),'V001 feature inválida');
    need(typeof f.id==='string'&&!ids.has(f.id),'V001 feature duplicada');ids.add(f.id);
    need(['observed','unavailable','requires_access','restricted','not_reported'].includes(f.status),
      'V001 estado de fuente no catalogado');
    if(f.status!=='observed'){out.missing++;continue}
    if(f.known_at===null||f.known_at===undefined){out.unsupported++;continue}
    const known=date(f.known_at),observed=date(f.observed_at);
    if(known<observed||known>cut||observed>cut){out.late++;continue}
    need(Number.isFinite(f.value),'V001 valor numérico no finito');
    out.usable++;
  }
  return {...out,decision_at:cut,
    status:out.late?'lookahead_detected':out.unsupported?'missing_timestamp':
      out.usable?'asof_valid':'no_usable_features',
    safe_for_this_decision:out.late===0&&out.unsupported===0,
    missing_must_not_be_zero:true};
}
