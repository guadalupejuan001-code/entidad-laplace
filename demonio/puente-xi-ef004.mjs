/* EF004 -> XI/Ether original: la captura conocida entra como estado,
 * no como pesos artificiales o prueba de ventaja predictiva.
 */
import {normalizarCapturaU003,observacionU003} from '../estado-financiero/modelo.mjs';
import {prepararLotesXI,compilarLotesXI,probarLotesXI}
  from '../estado-financiero/puente-xi.mjs';
export function prepararMemoriaNativaEF004(capture,{batchSize=1024}={}){
  const c=normalizarCapturaU003(capture);
  const records=capture.universal_state.states.map(row=>observacionU003(row,c.capture_sha));
  const projection=prepararLotesXI(records,{cutoff:c.captured_at,batchSize});
  const compiled=compilarLotesXI(projection);
  return {capture_sha256:c.capture_sha,at:c.captured_at,
    raw_states:records.length,projected:projection.imported,
    excluded:projection.excluded,
    batches:compiled.map(({xi_program,...rest})=>rest),
    total_materialization_bytes:compiled.reduce((s,x)=>s+x.materialized_bytes,0),
    xi_runtime_original:true,no_new_qubits:true,
    projection,financial_prediction_generated:false};
}
export function verificarMemoriaNativaEF004(binary,capture,options={}){
  const x=prepararMemoriaNativaEF004(capture,options);
  const proof=probarLotesXI(binary,x.projection);
  return {capture_sha256:x.capture_sha256,raw_states:x.raw_states,
    projected:x.projected,excluded:x.excluded,
    total_materialization_bytes:x.total_materialization_bytes,
    roundtrip_verificado:proof.exact_roundtrip,
    batches:proof.results.length,checks:proof.results.map(({status,
      records,materialized_bytes,exact_roundtrip,active_qubits})=>({
      status,records,materialized_bytes,exact_roundtrip,active_qubits})),
    no_quantum_advantage_claim:true,forecasts_generated:0};
}
