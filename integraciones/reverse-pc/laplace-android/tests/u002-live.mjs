import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';

const [,,binary,outDir='build/u002-live-proof']=process.argv;
if(!binary)throw Error('usage: node u002-live.mjs REVERSE_PC [OUT_DIR]');
mkdirSync(outDir,{recursive:true});
const SOURCE_URL='https://raw.githubusercontent.com/guadalupejuan001-code/LaPlaceDIG/laplace-registro/universo/global-latest.json';
const response=await fetch(SOURCE_URL,{cache:'no-store',headers:{'User-Agent':'REVERSE-U002-live-proof/1.0'}});
assert.equal(response.status,200);const capture=await response.json();
const canonical=v=>{if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';throw Error('non-json');};
const {capture_sha256,...body}=capture;
assert.equal(createHash('sha256').update(canonical(body)).digest('hex'),capture_sha256);
assert.equal(capture.schema,'laplace-universo-global-u002-v1');assert.equal(capture.coverage.known_signals,369);assert.equal(capture.coverage.observed_sources,52);assert.equal(capture.coverage.failed_sources,0);
assert.equal(capture.universal_state.states.length,369);assert.equal(capture.prediction_inputs_enabled,false);assert.equal(capture.automatic_trading,false);

const template=readFileSync(new URL('../../reverse-os-android/app/src/main/assets/laplace/u002-native.xi',import.meta.url),'utf8');
const BASE=970000000000000000000000000000n,states=capture.universal_state.states,bytes=Buffer.alloc(16+states.length*32);
bytes.write('LPG2',0,'ascii');bytes.writeUInt32LE(states.length,4);Buffer.from(capture.universal_state.snapshot_sha256.slice(0,16),'hex').copy(bytes,8);
states.forEach((r,i)=>{const at=16+i*32,key=createHash('sha256').update(r.domain+'|'+r.variable+'|'+r.unit+'|'+r.id).digest();key.subarray(0,8).copy(bytes,at);bytes.writeDoubleLE(r.value,at+8);bytes.writeBigInt64LE(BigInt(Date.parse(r.observed_at)),at+16);bytes.writeBigInt64LE(BigInt(Date.parse(r.known_at)),at+24);});
const stores=['mem_reset 0'];let nonzero=0;for(let i=0;i<bytes.length;i++)if(bytes[i]){stores.push('mem_store '+(BASE+BigInt(i))+' '+bytes[i]);nonzero++;}
const xi=template.replace('# __GLOBAL_BYTES__',stores.join('\n')).replace('# __GLOBAL_MATERIALIZE__','mem_materialize '+BASE+' '+bytes.length);
const path=join(outDir,'u002-live.xi'),initial=join(outDir,'u002-live-in.rvp'),final=join(outDir,'u002-live-out.rvp');writeFileSync(path,xi);writeFileSync(join(outDir,'global-latest.json'),JSON.stringify(capture,null,2)+'\n');
let run=spawnSync(resolve(binary),['init',initial],{encoding:'utf8'});assert.equal(run.status,0,run.stderr||run.stdout);
run=spawnSync(resolve(binary),['run',path,initial,final],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(run.status,0,run.stderr||run.stdout);
const rows=run.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),mat=rows.find(x=>x.type==='memory_materialization'),mem=rows.find(x=>x.type==='memory_stats');
assert.equal(mat.address,String(BASE));assert.equal(mat.bytes,11824);assert.equal(mat.hex,bytes.toString('hex'));assert.equal(mem.model,'inverse-ether-memory');assert.equal(mem.quantum_bindings,0);assert.equal(mem.overrides,nonzero);
const result={schema:'u002-live-cross-proof-v1',source:SOURCE_URL,captured_at:capture.at,records:369,observed_sources:52,materialized_bytes:bytes.length,inverse_memory_overrides:nonzero,exact_roundtrip:true,snapshot_sha256:capture.universal_state.snapshot_sha256,capture_sha256};
writeFileSync(join(outDir,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
