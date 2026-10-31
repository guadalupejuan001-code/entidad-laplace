/**
 * LAPLACE P005 — exabyte-grid challenge: actually run the original XI/RXE.
 * Independently evaluate 224 spot checks and the global population.
 * The brute-force N*T baseline is ONLY an operation-count counterfactual;
 * no actual exabyte RAM was allocated and no optimized-CPU benchmark claimed.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {EJEMPLO,compilarMegaceldas,leerResultado,
 programaLecturaResultados,verificarResultadosPersistidos} from '../escala/compilar.mjs';
const [,,binary,target]=process.argv;
if(!binary||!target)throw Error('uso: node tests/exabyte-experimento.mjs REVERSE_PC_BIN RESULT.json');
const folder=dirname(resolve(target));mkdirSync(folder,{recursive:true});
const file=join(folder,'Exabyte-P005.xi');
const rxe=join(folder,'Exabyte-P005.rxe');
const start=join(folder,'start.rvp'),after=join(folder,'after.rvp'),
  snap=join(folder,'verified.rvp');
const sha=v=>createHash('sha256').update(v).digest('hex');
function run(...args){
 const begin=performance.now();
 const p=spawnSync(resolve(binary),args,{encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
 assert.equal(p.status,0,(p.stderr||p.error?.message||String(p.status)).slice(-1000));
 return {stdout:p.stdout,ms:Math.round((performance.now()-begin)*1000)/1000};
}
// Independent BigInt mathematics verifies the original recurrence via Lucas.
function reference(manifest){
 const N=BigInt(manifest.logical_cells),half=N/2n,t=BigInt(manifest.settings.steps),
   seeds=manifest.source_seed_positions.map(BigInt);
 const bits=manifest.queries.map(x=>{
  const pos=BigInt(x);let xor=0;
  for(const origin of seeds){
   let delta=pos-origin;
   if(delta>=half)delta-=N;
   if(delta< -half)delta+=N;
   const y=t+delta;
   if(y<0n||y>2n*t||y%2n!==0n)continue;
   const choose=y/2n;
   if((choose&~t)===0n)xor^=1;
  }
  return xor;
 });
 const count=manifest.settings.seed_count*(2**t.toString(2).replace(/0/g,'').length);
 assert.ok(Number.isSafeInteger(count));
 return {bits,count};
}
const model=compilarMegaceldas(EJEMPLO);
const {xi,...savedManifest}=model;
writeFileSync(file,xi,{flag:'wx'});
writeFileSync(join(folder,'manifest.json'),JSON.stringify(savedManifest,null,2)+'\n',{flag:'wx'});
const c=run('compile',file,rxe,'LAPLACE P005 EXABYTE');
writeFileSync(join(folder,'rxe-compiler.json'),c.stdout,{flag:'wx'});
const inspect=run('inspect-rxe',rxe);
writeFileSync(join(folder,'rxe-inspection.json'),inspect.stdout,{flag:'wx'});
run('init',start);
const executed=run('run',rxe,start,after);
writeFileSync(join(folder,'xi-output.jsonl'),executed.stdout,{flag:'wx'});
const actual=leerResultado(executed.stdout,model);
const independent=reference(model);
assert.deepEqual(actual.queries.map(x=>x.bit),independent.bits);
assert.equal(actual.active_cells,independent.count);
const source=leerResultado(run('run',file,start,join(folder,'after-source.rvp')).stdout,model);
assert.deepEqual(source.queries,actual.queries);
assert.equal(source.active_cells,actual.active_cells);
const queryScript=join(folder,'read-results.xi');
writeFileSync(queryScript,programaLecturaResultados(model),{flag:'wx'});
const read=run('run',queryScript,after,snap);
assert.ok(verificarResultadosPersistidos(read.stdout,actual),'Ether output mismatch');
const rss=[];
for(let i=0;i<3;i++){
 const stat=join(folder,'rss-'+i+'.txt');
 const p=spawnSync('/usr/bin/time',['-f','%M','-o',stat,
   resolve(binary),'run',rxe,start,join(folder,'rss-'+i+'.rvp')],
   {encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
 assert.equal(p.status,0,p.stderr||p.error?.message||String(p.status));
 const kb=Number(readFileSync(stat,'utf8').trim());
 assert.ok(Number.isFinite(kb)&&kb>0);
 rss.push(kb);
}
const N=BigInt(model.logical_cells),t=BigInt(model.settings.steps);
const report={
 schema:'LAPLACE_P005_EXABYTE_EXECUTED',as_of:new Date().toISOString(),
 runtime:'REVERSE-PC XI Machine / Inverse Ether Memory',
 initial_state:'16 separated unit seeds, entire other field implicit 0',
 law:model.recurrence,
 verified:{all_queries:true,population:true,xi_equals_rxe:true,
   persistent_answers:true,independent_reference:'Lucas binomial parity using BigInt; XI uses a divide/mod instruction loop'},
 logical_cells:model.logical_cells,
 dense_one_byte_bytes:model.dense_one_byte_bytes,
 dense_bitpacked_bytes:model.dense_bitpacked_bytes,
 hypothetical_dense_cell_updates:(N*t).toString(),
 temporal_steps:model.settings.steps,
 seeds:model.settings.seed_count,
 seed_positions:model.source_seed_positions,
 query_count:actual.queries.length,
 query_results:actual.queries,
 lit_cells:actual.queries.filter(x=>x.bit===1).length,
 dark_cells:actual.queries.filter(x=>x.bit===0).length,
 exact_total_active_cells:String(actual.active_cells),
 active_fraction:Number(actual.active_cells)/Number(model.logical_cells),
 entropy_caveat:'No assumption of dense random data; the entire field is generated by a very compact, exactly solvable local rule',
 xi_sha256:model.xi_sha256,
 actual_xi_ms_one_run:executed.ms,
 actual_rss_samples_kib:rss,
 actual_rss_median_kib:[...rss].sort((a,b)=>a-b)[1],
 logical_output_region_bytes:model.result_state_region_bytes,
 inverse_ether_overrides:actual.memory_stats.overrides,
 quantum_components:actual.quantum_stats.clifford_components+
   actual.quantum_stats.adaptive_components+actual.quantum_stats.reduced_components,
 output_sha256:sha(executed.stdout),
 rxe:JSON.parse(inspect.stdout),
 caveats:[
 'A conventional machine using the same analytic Lucas method also solves this efficiently.',
 'The enormous figure measures the logically addressed domain, NOT allocated RAM or quantum capacity.',
 'No dense full-state was computed; only exact samples and an exact global count were computed.',
 'This proof applies to Rule 90 and disjoint seed cones, not general chaotic physics.'
 ],
 pass:true
};
assert.ok(report.lit_cells>=30&&report.dark_cells>=30);
assert.equal(report.quantum_components,0);
writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pass:true,logical_cells:report.logical_cells,
 steps:report.temporal_steps,global_active:report.exact_total_active_cells,
 checked_queries:report.query_count,lit:report.lit_cells,dark:report.dark_cells,
 runtime_ms:report.actual_xi_ms_one_run,
 resident_memory_kib:report.actual_rss_median_kib,
 inverse_memory_exceptions:report.inverse_ether_overrides},null,2));
