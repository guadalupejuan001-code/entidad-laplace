#!/usr/bin/env node
/* A local WAL admission experiment, explicitly not a full pipeline benchmark. */
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {join} from 'node:path';
import {Journal} from '../input/journal.mjs';
import {rawRecord,need} from '../input/contrato.mjs';
const output=process.argv[2];need(output,'uso: node tools/benchmark-entrada.mjs SALIDA_NUEVA.json');
const count=5000,concurrency=128,body=Buffer.from('x'.repeat(400));
const dir=await mkdtemp(join(tmpdir(),'laplace-admission-')),wal=await new Journal(dir).open(),latencies=[];
let next=0;const started=performance.now();
try{
  await Promise.all(Array.from({length:concurrency},async()=>{
    for(;;){const n=next++;if(n>=count)return;const t=performance.now();await wal.append({raw:rawRecord({id:'synthetic/benchmark',adapter:'status',url:'https://example.org'},body,{native_id:String(n)})});latencies.push(performance.now()-t)}
  }));
  const elapsed=performance.now()-started;latencies.sort((a,b)=>a-b);
  const replayed=[...wal.records()].length;need(replayed===count,'acknowledged/replayed count mismatch');
  const result={schema:'laplace.input.benchmark.i001',captured_at:new Date().toISOString(),stage:'local_WAL_admission_through_fsync',
    synthetic:true,events:count,concurrency,source_body_bytes:400,persisted_bytes:wal.bytes,elapsed_ms:elapsed,
    throughput_events_per_second:count/(elapsed/1000),latency_ms:{p50:latencies[Math.floor(count*.5)],p99:latencies[Math.floor(count*.99)]},
    exact_replay_records:replayed,host:{node:process.version,cpu:cpus()[0]?.model},
    kafka_replication_included:false,SQL_included:false,NLP_included:false,predictive_accuracy_measured:false,
    scope:'single temporary development environment; no production throughput claim'};
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}finally{await wal.close()}
