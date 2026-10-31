/* Opaque, bounded object state in ORIGINAL Inverse Ether Memory. */
import {executeXI,digest,RUNTIME_REF} from '../inteligencia/laplace.mjs';
const BASE=970000000000000000000000000000n,MAX_BYTES=24576;
const need=(ok,message)=>{if(!ok)throw new Error(message)};

export function restoreObject(binary,checkpoint){
  need(checkpoint?.schema==='laplace-object-xi-v1'&&checkpoint.runtime_ref===RUNTIME_REF,'estado XI incompatible');
  need(Number.isInteger(checkpoint.bytes)&&checkpoint.bytes>0&&checkpoint.bytes<=MAX_BYTES,'objeto excede 24 KiB');
  need(typeof checkpoint.xi==='string'&&digest(checkpoint.xi)===checkpoint.xi_sha256,'hash XI de objeto invalido');
  const run=executeXI(binary,checkpoint.xi);
  const views=run.output.filter(row=>row.type==='memory_materialization');
  const mem=run.output.filter(row=>row.type==='memory_stats'),core=run.output.filter(row=>row.type==='stats');
  need(views.length===1&&views[0].address===String(BASE)&&views[0].bytes===checkpoint.bytes&&
    typeof views[0].hex==='string'&&views[0].hex.length===checkpoint.bytes*2&&/^[a-f0-9]+$/i.test(views[0].hex),
    'materializacion de objeto XI invalida');
  const bytes=Buffer.from(views[0].hex,'hex');
  need(digest(bytes)===checkpoint.state_sha256,'hash del objeto aprendido no coincide');
  need(mem.length===1&&mem[0].model==='inverse-ether-memory'&&mem[0].overrides===checkpoint.bytes&&
    mem[0].quantum_bindings===0&&core.length===1&&core[0].active_qubits===0,'estado clasico XI inesperado');
  return {value:JSON.parse(bytes.toString('utf8')),native:{exact_roundtrip:true,
    materialized_bytes:bytes.length,overrides:mem[0].overrides,active_qubits:core[0].active_qubits}};
}

export function storeObject(binary,value){
  const bytes=Buffer.from(JSON.stringify(value),'utf8');
  need(bytes.length>0&&bytes.length<=MAX_BYTES,'objeto excede 24 KiB');
  const lines=['# LaPlaceDIG E003: contexto o patron verificable en Ether original','mem_reset 0'];
  for(let i=0;i<bytes.length;i++)if(bytes[i])lines.push('mem_store '+(BASE+BigInt(i))+' '+bytes[i]);
  lines.push('mem_materialize '+BASE+' '+bytes.length,'mem_stats','stats');
  const xi=lines.join('\n')+'\n';
  const checkpoint={schema:'laplace-object-xi-v1',runtime_ref:RUNTIME_REF,bytes:bytes.length,
    state_sha256:digest(bytes),xi_sha256:digest(xi),xi};
  const restored=restoreObject(binary,checkpoint);
  need(JSON.stringify(restored.value)===bytes.toString('utf8'),'objeto alterado durante transporte XI');
  return {checkpoint,native:restored.native};
}
