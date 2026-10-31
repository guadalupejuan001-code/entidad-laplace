/* EF001 -> runtime XI/Ether ORIGINAL.
 * No reescribe XI ni crea qubits. Materializa a demanda lotes de <= 1024.
 * El valor decimal original y el mapa completo de unidades quedan en SQL.
 */
import {sha,units,need,sourceURL} from '../input/contrato.mjs';
import {utcTime,universeSnapshot} from '../universo/estados.mjs';
import {compileGlobalEther,proveGlobalEther} from '../universo/ether-global.mjs';

export const FINANCIAL_XI_BATCH_MAX=1024;
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
const iso=x=>utcTime(x instanceof Date?x.toISOString():x);
const time=x=>iso(x);
const abs=x=>x<0n?-x:x;
export function prepararLotesXI(rows,{cutoff,batchSize=FINANCIAL_XI_BATCH_MAX}={}){
  const at=time(cutoff);
  need(Array.isArray(rows),'se requieren filas EF001');
  need(Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=FINANCIAL_XI_BATCH_MAX,
    'lote XI excede 1024 registros / limite Ether');
  const projection=[],dictionary=[],excluded=[];
  for(const row of rows){
    const original={assertion_sha:row?.assertion_sha??null,
      family:row?.family??null,source_id:row?.source_id??null};
    try{
      need(row&&row.value_status==='observed','dato no observado o faltante');
      need(time(row.known_at)<=at&&time(row.observed_at)<=at,'dato futuro');
      const url=sourceURL(row.source_url);
      need(url.length<=1024,'URL excede presupuesto XI');
      let value,encoding;
      if(row.value_kind==='exact_decimal'){
        const scaled=units(row.value_text,8);
        need(abs(scaled)<=MAX_SAFE,'entero escalado no cabe exactamente en float64');
        value=Number(scaled);encoding='exact_integer_scaled_1e8';
      }else if(row.value_kind==='float64_approx'){
        value=Number(row.value_text);encoding='source_float64_approximation';
        need(Number.isFinite(value)&&Math.abs(value)<=1e30,'valor aproximado fuera de rango');
      }else throw Error('sin representacion numerica XI');
      const key=sha(row.assertion_sha);
      projection.push({id:'ef001-'+key.slice(0,55),domain:'financial_state',
        variable:'state_'+key.slice(0,24),unit:encoding==='source_float64_approximation'?'float64':'scaled_e8',
        value,observed_at:time(row.observed_at),known_at:time(row.known_at),source_url:url});
      dictionary.push({...original,domain:row.domain,subject_id:row.subject_id,
        variable:row.variable,unit:row.unit,encoding,original_value_text:row.value_text,
        population_id:row.population_id??null,
        currency:row.currency??null,estimated_precision_not_improved:row.value_kind==='float64_approx'});
    }catch(error){excluded.push({...original,reason:String(error.message).slice(0,180)})}
  }
  const batches=[];
  for(let i=0;i<projection.length;i+=batchSize){
    const snapshot=universeSnapshot(projection.slice(i,i+batchSize),{cutoff:at});
    batches.push(snapshot);
  }
  return {schema:'laplace-ef001-xi-bridge-v1',cutoff:at,
    imported:projection.length,excluded,batches,dictionary,
    input_row_count:rows.length,materializes_full_world:false,
    no_implicit_qubits:true,source_decimals_retained_in_sql:true,
    original_runtime_required:true,prediction_generated:false};
}
export function compilarLotesXI(projection){
  need(projection&&Array.isArray(projection.batches),'proyeccion EF001 invalida');
  return projection.batches.map(snapshot=>{
    const out=compileGlobalEther(snapshot);
    need(out.bytes.length<=32784,'lote excede 32784 bytes');
    return {snapshot_sha256:snapshot.snapshot_sha256,
      records:out.records,materialized_bytes:out.bytes.length,
      xi_program_sha256:out.xi_sha256,xi_program:out.xi};
  });
}
export function probarLotesXI(originalBinary,projection){
  need(typeof originalBinary==='string'&&originalBinary.length,'falta ejecutor XI original');
  const results=projection.batches.map(snapshot=>proveGlobalEther(originalBinary,snapshot));
  return {results,exact_roundtrip:results.length>0&&results.every(x=>x.exact_roundtrip),
    verified_by_original_ether:true,financial_prediction_certified:false};
}
