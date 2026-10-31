'use strict';
/*
 * Connection to the original Ether/InverseMemory runtime of Mundo X.
 * This adapter contains NO alternative market predictor and NO simulator.
 * All memory writes and reads are performed by native XI on the real runtime.
 * Current quantum CLI is stateless between runs: the authoritative archive is
 * the validated local JSONL input, not the ephemeral XI transaction.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {asOf,stringifyJSONL,timestamp,KIND} from './contrato.mjs';

const BASE=930000000000000000000000000000n;
const MAX_BYTES=8192;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(condition,message)=>{if(!condition)throw new Error(message)};
export function prepareEtherProjection(records,cutoff){
  const when=timestamp(cutoff,'cutoff');
  const observed=asOf(records,when);
  need(observed.length>0,'sin_datos: no hay observaciones publicadas antes del corte');
  const serialized=stringifyJSONL(observed);
  const bytes=Buffer.from(serialized,'utf8');
  need(bytes.length>=1&&bytes.length<=MAX_BYTES,
    'el lote excede '+MAX_BYTES+' bytes; dividir en fragmentos antes de usar XI');
  const source=['# LaPlaceDIG: hechos con conocimiento anterior al corte',
    '# Ether: fondo por regla, diferencias finitas, lectura explicita',
    'mem_reset 0'];
  let count=0;
  for(let k=0;k<bytes.length;k++){
    if(bytes[k]===0)continue;
    source.push('mem_store '+(BASE+BigInt(k)).toString()+' '+bytes[k]);
    count++;
  }
  source.push('mem_materialize '+BASE.toString()+' '+bytes.length,
    'mem_stats','stats');
  return {
    xi:source.join('\n')+'\n',bytes,records:observed,
    cutoff:when,sha256:sha(bytes),nonzero_bytes:count,base_address:BASE.toString()
  };
}
export function proveWithOriginalEther(binary,records,cutoff){
  need(typeof binary==='string'&&binary.length>0,'required path to Mundo X mundo_x_quantum binary');
  const input=prepareEtherProjection(records,cutoff);
  const child=spawnSync(resolve(binary),['-'],{
    input:input.xi,encoding:'utf8',maxBuffer:4*1024*1024,timeout:60000
  });
  if(child.error)throw child.error;
  need(child.status===0,'Mundo X XI failed: '+String(child.stderr||child.stdout).slice(0,600));
  let output;
  try{output=child.stdout.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s))}
  catch{throw new Error('Mundo X XI returned unparseable output')}
  const mat=output.find(x=>x.type==='memory_materialization');
  const mem=output.find(x=>x.type==='memory_stats');
  const core=output.find(x=>x.type==='stats');
  need(mat?.address===input.base_address,'XI materialization address mismatch');
  need(mat.bytes===input.bytes.length,'XI returned incorrect amount of bytes');
  const actual=Buffer.from(mat.hex,'hex');
  need(actual.equals(input.bytes),'Inverse Ether Memory altered the historical data');
  need(mem?.model==='inverse-ether-memory','unexpected XI memory backend');
  need(mem.overrides===input.nonzero_bytes,'unexpected exception count');
  need(mem.quantum_bindings===0,'unexpected quantum bindings');
  need(core?.active_qubits===0,'implicit classical facts should not allocate qubits');
  return Object.freeze({
    status:'XI_VERIFICADO',
    fuente:'Mundo X QuantumRuntime original / Inverse Ether Memory',
    cutoff:input.cutoff,visible_records:input.records.length,
    observed_kinds:Object.fromEntries(KIND.map(k=>
      [k,input.records.filter(row=>row.kind===k).length])),
    sha256:input.sha256,exact_roundtrip:true,
    logical_address:input.base_address,
    materialized_bytes:input.bytes.length,
    inverse_memory_overrides:mem.overrides,
    active_qubits:core.active_qubits,
    quantum_hardware:false,forecasts_generated:0,
    note:'Prueba de conservacion sin perdidas de datos historicos en una transaccion XI; no demuestra compresion financiera ni prediccion del futuro'
  });
}
