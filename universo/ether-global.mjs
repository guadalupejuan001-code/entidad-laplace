/* U002 → XI/Ether.
 * Serializa el snapshot global a registros compactos y los materializa en
 * Inverse Ether Memory. El host codifica; XI/Ether conserva el estado exacto.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {verifyUniverseSnapshot} from './estados.mjs';

const BASE=970000000000000000000000000000n;
const MAX_RECORDS=4096,RECORD_BYTES=32,HEADER_BYTES=16,MAX_PROGRAM=4*1024*1024;
const sha=x=>createHash('sha256').update(x).digest('hex');
const need=(c,m)=>{if(!c)throw Error(m)};
function key64(row){
  return createHash('sha256').update(row.domain+'|'+row.variable+'|'+row.unit+'|'+row.id).digest().subarray(0,8);
}
export function encodeGlobalSnapshot(snapshot){
  verifyUniverseSnapshot(snapshot);const rows=snapshot.states;
  need(rows.length>=1&&rows.length<=MAX_RECORDS,'cantidad de estados globales fuera de presupuesto');
  const body=Buffer.alloc(HEADER_BYTES+rows.length*RECORD_BYTES);
  body.write('LPG2',0,'ascii');body.writeUInt32LE(rows.length,4);
  Buffer.from(snapshot.snapshot_sha256.slice(0,16),'hex').copy(body,8);
  rows.forEach((row,i)=>{
    const at=HEADER_BYTES+i*RECORD_BYTES;
    key64(row).copy(body,at);body.writeDoubleLE(row.value,at+8);
    body.writeBigInt64LE(BigInt(Date.parse(row.observed_at)),at+16);
    body.writeBigInt64LE(BigInt(Date.parse(row.known_at)),at+24);
  });
  return {bytes:body,sha256:sha(body),records:rows.length,record_bytes:RECORD_BYTES,
    base_address:BASE.toString(),snapshot_sha256:snapshot.snapshot_sha256,
    dictionary:rows.map((r,i)=>({index:i,key_sha256_64:key64(r).toString('hex'),id:r.id,domain:r.domain,variable:r.variable,unit:r.unit}))};
}
export function compileGlobalEther(snapshot){
  const enc=encodeGlobalSnapshot(snapshot),source=[
    '# LAPLACE U002 — snapshot mundial en Inverse Ether Memory',
    '# Registros: hash64 + float64 + observed_ms + known_ms',
    'mem_reset 0'
  ];
  let nonzero=0;
  for(let i=0;i<enc.bytes.length;i++)if(enc.bytes[i]!==0){source.push('mem_store '+(BASE+BigInt(i))+' '+enc.bytes[i]);nonzero++;}
  source.push('mem_materialize '+BASE+' '+enc.bytes.length,'mem_stats','stats');
  const xi=source.join('\n')+'\n';need(Buffer.byteLength(xi)<=MAX_PROGRAM,'programa U002 XI excede 4 MiB');
  return {...enc,xi,xi_sha256:sha(xi),nonzero_bytes:nonzero};
}
export function proveGlobalEther(binary,snapshot){
  need(typeof binary==='string'&&binary.length,'falta ejecutor XI/Ether');
  const compiled=compileGlobalEther(snapshot),run=spawnSync(resolve(binary),['-'],{
    input:compiled.xi,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024
  });
  if(run.error)throw run.error;need(run.status===0,'XI/Ether U002 falló: '+String(run.stderr||run.stdout).slice(0,800));
  let rows;try{rows=run.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)}
  catch{throw Error('salida XI/Ether U002 no es JSONL')};
  const mat=rows.find(x=>x.type==='memory_materialization'),mem=rows.find(x=>x.type==='memory_stats'),core=rows.find(x=>x.type==='stats');
  need(mat?.address===compiled.base_address&&mat.bytes===compiled.bytes.length,'materialización U002 incorrecta: '+JSON.stringify({actual:mat??null,esperado:{address:compiled.base_address,bytes:compiled.bytes.length}}));
  need(Buffer.from(mat.hex,'hex').equals(compiled.bytes),'Ether alteró el snapshot global');
  need(mem?.model==='inverse-ether-memory','U002 no usó Inverse Ether Memory');
  need(mem.overrides===compiled.nonzero_bytes,'conteo de excepciones Ether inesperado');
  need(core?.active_qubits===0,'estados clásicos globales no deben crear qubits implícitos');
  return {status:'U002_XI_ETHER_VERIFICADO',records:compiled.records,materialized_bytes:compiled.bytes.length,
    exact_roundtrip:true,snapshot_sha256:compiled.snapshot_sha256,encoded_sha256:compiled.sha256,
    xi_sha256:compiled.xi_sha256,base_address:compiled.base_address,
    inverse_memory_overrides:mem.overrides,active_qubits:core.active_qubits,
    prediction_generated:false};
}
