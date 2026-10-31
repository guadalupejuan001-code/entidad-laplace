import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';

const [,,binary,outDir='build/u002-proof']=process.argv;
if(!binary)throw Error('usage: node u002-native.mjs REVERSE_PC [OUT_DIR]');
mkdirSync(outDir,{recursive:true});
const template=readFileSync(new URL('../../reverse-os-android/app/src/main/assets/laplace/u002-native.xi',import.meta.url),'utf8');
const BASE=970000000000000000000000000000n,COUNT=369,REC=32,HEAD=16;
const rows=Array.from({length:COUNT},(_,i)=>({
  id:'signal-'+i,domain:'domain-'+(i%6),variable:'variable-'+i,unit:'ratio',
  value:(i-184)/17,observed_at:'2026-10-30T14:00:00.000Z',known_at:'2026-10-30T14:01:00.000Z'
}));
const hash=x=>createHash('sha256').update(x).digest();
const bytes=Buffer.alloc(HEAD+COUNT*REC);bytes.write('LPG2',0,'ascii');bytes.writeUInt32LE(COUNT,4);
hash('synthetic-snapshot').subarray(0,8).copy(bytes,8);
rows.forEach((r,i)=>{
  const at=HEAD+i*REC;hash(r.domain+'|'+r.variable+'|'+r.unit+'|'+r.id).subarray(0,8).copy(bytes,at);
  bytes.writeDoubleLE(r.value,at+8);bytes.writeBigInt64LE(BigInt(Date.parse(r.observed_at)),at+16);bytes.writeBigInt64LE(BigInt(Date.parse(r.known_at)),at+24);
});
const stores=['mem_reset 0'];let nonzero=0;
for(let i=0;i<bytes.length;i++)if(bytes[i]){stores.push('mem_store '+(BASE+BigInt(i))+' '+bytes[i]);nonzero++;}
const xi=template.replace('# __GLOBAL_BYTES__',stores.join('\n')).replace('# __GLOBAL_MATERIALIZE__','mem_materialize '+BASE+' '+bytes.length);
const path=join(outDir,'u002-369.xi'),initial=join(outDir,'u002-in.rvp'),final=join(outDir,'u002-out.rvp');writeFileSync(path,xi);
let run=spawnSync(resolve(binary),['init',initial],{encoding:'utf8'});assert.equal(run.status,0,run.stderr||run.stdout);
run=spawnSync(resolve(binary),['run',path,initial,final],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(run.status,0,run.stderr||run.stdout);
const out=run.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),mat=out.find(x=>x.type==='memory_materialization'),mem=out.find(x=>x.type==='memory_stats');
assert.ok(mat);assert.equal(mat.address,String(BASE));assert.equal(mat.bytes,bytes.length);assert.equal(mat.hex,bytes.toString('hex'));
assert.equal(mem.model,'inverse-ether-memory');assert.equal(mem.quantum_bindings,0);assert.equal(mem.overrides,nonzero);
const proof={schema:'u002-reverse-native-proof-v1',records:COUNT,materialized_bytes:bytes.length,nonzero,exact_roundtrip:true,program_bytes:Buffer.byteLength(xi)};
writeFileSync(join(outDir,'result.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
