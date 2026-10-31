import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitTemporal,queryTemporal,executeTemporal,trainingFrames,temporalExperiment,liveTemporalProfile,addDays} from '../dinamica/modelo.mjs';
import {selectNativeTime,selectionMask} from '../dinamica/vista.mjs';
import {ledgerHash} from '../historia/contrato.mjs';
import {digest} from '../inteligencia/laplace.mjs';
import {syntheticNarrativeData} from '../narrativa/experimento.mjs';
const binary=process.env.LAPLACE_TEMPORAL,native={skip:binary?false:'requires native Laplace executor on pinned original Mundo X'};
const read=name=>JSON.parse(readFileSync(new URL('../evidencia/'+name,import.meta.url)));
const profile=read('BTC-DINAMICA-PERFIL.json');
const cycle=()=>Array.from({length:60},(_,i)=>({date:addDays('2020-01-01T00:00:00Z',i),mask:[1,2,4][i%3],y:i%3===1?0:1,
  target_known_at:addDays('2020-01-01T00:00:00Z',i+1),link:i<59}));
const cutoff=addDays('2020-01-01T00:00:00Z',60);
test('native learner propagates an unseen cycle for 1526 days without a forecast-horizon gate or JS propagation',native,()=>{
  const fitted=fitTemporal(binary,cycle(),{alpha:0,cutoff});
  assert.deepEqual(fitted.learned.state_masks,[1,2,4]);assert.equal(fitted.learned.labels,60);
  assert.deepEqual(fitted.learned.transition_matrix,[0,1,0,0,0,1,1,0,0]);
  const run=queryTemporal(binary,fitted.checkpoint,[{mask:1,steps:1526}]);
  assert.equal(run.forecasts[0].trace.length,1527);
  for(const row of run.forecasts[0].trace){
    assert.equal(row.distribution[row.step%3],1);
    assert.ok(Math.abs(row.probability+row.negative_probability-1)<1e-14);
  }
  const reversed=cycle().map(row=>({...row,mask:row.mask===2?4:row.mask===4?2:1}));
  const second=fitTemporal(binary,reversed,{alpha:0,cutoff});
  assert.notDeepEqual(second.learned.transition_matrix,fitted.learned.transition_matrix);
  assert.deepEqual(second.learned.visits,fitted.learned.visits);
});
test('propagated distribution is recovered from original InverseMemory and model corruption fails closed',native,()=>{
  const fitted=fitTemporal(binary,cycle(),{alpha:4,cutoff});
  const out=executeTemporal(binary,fitted.checkpoint.xi+'laplace_evolve 1 5\nmem_materialize 3000000 24\nmem_stats\nstats\n');
  const evolution=out.find(row=>row.type==='temporal_evolution'),bytes=Buffer.from(out.find(row=>row.type==='memory_materialization').hex,'hex');
  assert.deepEqual(Array.from({length:3},(_,i)=>bytes.readDoubleLE(i*8)),evolution.trace.at(-1).distribution);
  assert.equal(out.find(row=>row.type==='memory_stats').model,'inverse-ether-memory');
  assert.equal(out.find(row=>row.type==='stats').active_qubits,0);
  assert.throws(()=>executeTemporal(binary,fitted.checkpoint.xi+'mem_store 2000004 0\nlaplace_evolve 1 1\n'),/checksum/);
  const original=executeTemporal(binary,'background zero\nh 7\nprobz 7\n');
  assert.equal(original.find(row=>row.type==='probz').probability_one,0.5);
});
test('unobserved states and unknown prices abstain while retaining learned narrative evolution',native,()=>{
  const noPrices=cycle().map(row=>({...row,y:null,target_known_at:null}));
  const fitted=fitTemporal(binary,noPrices,{alpha:4,cutoff});
  assert.equal(fitted.learned.labels,0);
  const run=queryTemporal(binary,fitted.checkpoint,[{mask:1,steps:7},{mask:8,steps:1}]);
  assert.equal(run.forecasts[0].trace[7].probability,null);
  assert.ok(Math.abs(run.forecasts[0].trace[7].distribution.reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.equal(run.forecasts[1].status,'abstencion_estado_no_observado');
  assert.deepEqual(run.forecasts[1].trace,[]);
  assert.throws(()=>queryTemporal(binary,fitted.checkpoint,[{mask:1,steps:1.5}]),/consulta/);
  assert.throws(()=>queryTemporal(binary,{...fitted.checkpoint,xi:fitted.checkpoint.xi+'x 1\n'},[]),/hash/);
  assert.throws(()=>queryTemporal(binary,{...fitted.checkpoint,cutoff:'1900-01-01T00:00:00.000Z'},[]),/hash/);
  assert.throws(()=>fitTemporal(binary,cycle().map(row=>({...row,target_known_at:row.date})),{cutoff}),/horizonte/);
});
test('future labels and market covariates cannot alter the historical native training program',native,()=>{
  const data=syntheticNarrativeData(),end=addDays(data.config.start_at,42);
  const first=trainingFrames(data.records,{start:data.config.start_at,end});
  const revised=data.records.map(row=>row.kind==='precio'&&row.observed_at>end?{...row,value:'3.00'}:row);
  revised.push({id:'ignored-extra-economy',kind:'economia',observed_at:data.config.start_at,known_at:data.config.start_at,
    series_id:'IGNORED',unit:'index',value:'999999',source_url:'https://example.org/synthetic-economy'});
  const second=trainingFrames(revised,{start:data.config.start_at,end});
  assert.deepEqual(second,first);
  const fitted=fitTemporal(binary,first,{alpha:4,cutoff:end});
  assert.equal(fitted.checkpoint.xi_sha256,fitTemporal(binary,second,{alpha:4,cutoff:end}).checkpoint.xi_sha256);
  const delayed=data.records.map(row=>row.kind==='precio'?{...row,known_at:addDays(end,400)}:row);
  assert.equal(trainingFrames(delayed,{start:data.config.start_at,end}).filter(row=>row.y!==null).length,0);
});
test('held-out future prices cannot change model selection, checkpoint or sealed temporal forecasts',native,()=>{
  const data=syntheticNarrativeData(),end=addDays(data.config.start_at,70);
  const records=data.records.filter(row=>row.known_at<=end),history={start:data.config.start_at,end,records,ledger_sha256:ledgerHash(records)};
  const original=temporalExperiment(binary,history,{mode:'strict'}),boundary=original.folds[0].partitions.test[0];
  const changed=records.map(row=>row.kind==='precio'&&row.observed_at>boundary?{...row,value:'5.00'}:row);
  const second=temporalExperiment(binary,{...history,records:changed,ledger_sha256:ledgerHash(changed)},{mode:'strict'});
  assert.equal(second.folds[0].selected_alpha,original.folds[0].selected_alpha);
  assert.equal(second.folds[0].checkpoint.xi_sha256,original.folds[0].checkpoint.xi_sha256);
  assert.equal(second.folds[0].forecasts_sha256,original.folds[0].forecasts_sha256);
});
test('display adapter exposes native projections through 2030 regardless of the tested horizon',()=>{
  const date=addDays(profile.origin_date,1).slice(0,10),selected=selectNativeTime(profile,date);
  assert.equal(selected.mode,'native');
  const stored=profile.forecasts.find(row=>row.initial_mask===profile.default_mask).trace[selected.horizon_days];
  assert.equal(selected.probability,stored.probability);assert.equal(selected.negative_probability,stored.negative_probability);
  const future=selectNativeTime(profile,'2030-12-31');
  assert.equal(future.mode,'native');assert.equal(future.tested,false);
  assert.ok(Number.isFinite(future.probability));
  assert.ok(Math.abs(future.probability+future.negative_probability-1)<1e-12);
  assert.equal(future.probability,profile.forecasts.find(row=>row.initial_mask===profile.default_mask).trace[future.horizon_days].probability);
  assert.ok(Math.abs(future.distribution.reduce((a,b)=>a+b,0)-1)<1e-9);
  assert.equal(selectNativeTime(profile,profile.origin_date,[]).mode,'unseen_state');
  assert.throws(()=>selectionMask(profile,['BITCOIN_PRICE']),/desconocidos/);
  const first=profile.history[0];assert.equal(selectNativeTime(profile,first.decision_at.slice(0,10)).probability,first.probability);
});
test('real evidence preserves native counts, strict historical abstention and absence of financial confirmation',native,()=>{
  const history=read('BTC-HISTORICO.json'),report=read('BTC-DINAMICA.json'),strict=read('BTC-DINAMICA-ESTRICTA.json');
  assert.equal(report.folds.length,2);assert.equal(report.horizons.length,8);
  assert.ok(strict.horizons.every(row=>row.count===0));
  assert.equal(report.live_activation,false);assert.equal(report.independent_fresh_holdout,false);
  assert.equal(profile.native.learned_in_native,true);assert.equal(profile.native.propagated_in_native,true);
  assert.equal(profile.model.labels,90);assert.equal(profile.model.state_masks.length,7);
  assert.deepEqual(profile.validated_horizon_days,[]);
  const rebuilt=liveTemporalProfile(binary,history,report,{as_of:profile.as_of});
  assert.equal(rebuilt.profile_sha256,profile.profile_sha256);
  const fold=report.folds[0],run=queryTemporal(binary,fold.checkpoint,[{mask:fold.learned.state_masks[0],steps:7}]);
  assert.equal(run.forecasts[0].trace.length,8);
  assert.equal(fold.checkpoint.cutoff,fold.partitions.validation[1]);
  assert.throws(()=>queryTemporal(binary,fold.checkpoint,[{mask:fold.learned.state_masks[0],steps:1,origin_at:fold.partitions.training[1]}]),/posterior/);
  assert.ok(profile.origin_date+'T00:00:00.000Z'>profile.as_of);
  assert.equal(digest(profile.native_program),profile.native_program_sha256);
  assert.deepEqual(executeTemporal(binary,profile.native_program).filter(row=>row.type==='temporal_evolution'),profile.forecasts);
});
