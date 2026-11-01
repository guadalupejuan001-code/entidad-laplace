import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {detectRegimes,auditRegimeTransitions,REGIME_SCHEMA,
  REGIME_AUDIT_SCHEMA,REGIMES} from '../experimentos/regime-r001.mjs';

const step=300,start=1700000000-(1700000000%300);
function synthetic(n=2400){
 let price=10000;
 const rows=[];
 for(let i=0;i<n;i++){
  const before=price,vol=i%900<450?.0002:.002;
  price*=Math.exp(vol*(.7*Math.sin(.36*i)+.35*Math.cos(.11*i)));
  rows.push([start+i*step,Math.min(price,before)*.9997,
    Math.max(price,before)*1.0003,before,price,20+Math.sin(.22*i)**2*10]);
 }
 return rows;
}
const cutoff=rows=>new Date((rows.at(-1)[0]+step)*1000).toISOString();
test('R001 clasifica volatilidad con umbrales históricos y respeta fronteras',()=>{
 const data=synthetic();
 const out=detectRegimes(data,{cutoff:cutoff(data)});
 assert.equal(out.schema,REGIME_SCHEMA);
 assert.equal(out.status,'observed_statistical_states');
 assert.ok(out.states.length>1400);
 assert.equal(out.gaps,0);
 assert.equal(out.production_activation_allowed,false);
 assert.equal(out.automatic_trading,false);
 assert.ok(out.states.every(x=>REGIMES.includes(x.regime)));
 assert.ok(out.states.every(x=>x.threshold_low<=x.threshold_high));
 assert.ok(out.states.every(x=>x.baseline_samples>=192));
 assert.ok(out.states.every(x=>Date.parse(x.known_at)===(x.at+300)*1000));
 assert.ok(out.states.some(x=>x.regime==='high_volatility'));
 assert.ok(out.states.some(x=>x.regime==='low_volatility'));
});
test('R001 nunca usa futuro para detectar el estado anterior',()=>{
 const original=synthetic(2300);
 const changed=structuredClone(original);
 for(let i=1700;i<changed.length;i++){
  const row=changed[i],old=row[3],close=row[4]*1.3;
  changed[i]=[row[0],Math.min(old,close)*.99,
    Math.max(old,close)*1.01,old,close,row[5]];
 }
 const a=detectRegimes(original,{cutoff:cutoff(original)});
 const b=detectRegimes(changed,{cutoff:cutoff(changed)});
 assert.deepEqual(a.states.filter(x=>x.original_index<1700),
                  b.states.filter(x=>x.original_index<1700));
 assert.notDeepEqual(a.states.at(-1),b.states.at(-1));
});
test('R001 abstiene en huecos, no los interpola como volatilidad baja',()=>{
 const original=synthetic(2300),missing=original.filter((_,i)=>i!==1000);
 const normal=detectRegimes(original,{cutoff:cutoff(original)});
 const hole=detectRegimes(missing,{cutoff:cutoff(original)});
 assert.equal(hole.gaps,1);
 assert.ok(hole.excluded_without_sufficient_past>0);
 assert.ok(hole.states.length<normal.states.length);
 assert.ok(hole.states.every(x=>x.threshold_high>=x.threshold_low));
 const audit=auditRegimeTransitions(missing,{cutoff:cutoff(original)});
 assert.ok(audit.valid_transition_pairs<hole.observations);
 assert.equal(audit.automatic_trading,false);
});
test('rechaza futuro, OHLCV inconsistente, duplicados, orden y límites',()=>{
 const rows=synthetic(1000),cut=cutoff(rows);
 assert.throws(()=>detectRegimes(rows.slice(0,20),{cutoff:cut}),/insuficiente/i);
 assert.throws(()=>detectRegimes(rows,{cutoff:new Date(Date.parse(cut)-300000).toISOString()}),/futura|abierta/);
 assert.throws(()=>detectRegimes([...rows,rows.at(-1)],{cutoff:cut}),/duplicada|desordenada/);
 assert.throws(()=>detectRegimes(rows.map((x,i)=>i===4?[...x.slice(0,1),-1,...x.slice(2)]:x),
  {cutoff:cut}),/inválida/);
 const invalid=structuredClone(rows);invalid[9][4]=NaN;
 assert.throws(()=>detectRegimes(invalid,{cutoff:cut}),/no finita/);
 assert.throws(()=>detectRegimes(rows,{granularity:3600,cutoff:cut}),/cinco minutos/);
});
test('R001 comprueba transiciones y magnitud con tres tests fuera de ajuste',()=>{
 const data=synthetic(2400),audit=auditRegimeTransitions(data,{cutoff:cutoff(data)});
 assert.equal(audit.schema,REGIME_AUDIT_SCHEMA);
 assert.equal(audit.status,'retrospective_audit_completed');
 assert.equal(audit.next_regime_is_not_price_direction,true);
 assert.equal(audit.folds.length,3);
 assert.ok(audit.holdout_transition_pairs>300);
 const observedPeriods=[];
 for(const fold of audit.folds){
  assert.equal(fold.status,'retrospective_evaluation_only');
  assert.equal(fold.no_holdout_selection,true);
  assert.ok(fold.train_pairs>=300&&fold.test_pairs>=30);
  assert.equal(fold.model.trained_transitions,fold.train_pairs);
  assert.equal(fold.magnitude_model.trained_labels,fold.train_pairs);
  assert.equal(fold.magnitude_model.no_future_labels_used,true);
  assert.ok(fold.magnitude_score.conditional_mae_bps>=0);
  assert.ok(fold.magnitude_score.unconditional_mae_bps>=0);
  assert.equal(fold.magnitude_score.bootstrap_interval.repetitions,300);
  assert.equal(fold.magnitude_score.bootstrap_interval.block_size,12);
  assert.ok(Number.isFinite(fold.magnitude_score.bootstrap_interval.lower_bps));
  assert.ok(Number.isFinite(fold.magnitude_score.bootstrap_interval.upper_bps));
  assert.ok(fold.magnitude_score.bootstrap_interval.lower_bps<=
    fold.magnitude_score.bootstrap_interval.upper_bps);
  assert.ok(fold.score.conditional_brier>=0);
  assert.ok(fold.score.unconditional_brier>=0);
  assert.ok(fold.score.always_stay_brier>=0);
  assert.ok(Number.isFinite(fold.score.relative_gain_vs_always_stay));
  assert.equal(fold.cases.length,fold.test_pairs);
  assert.ok(Date.parse(fold.holdout_start)>=Date.parse(fold.decision_cutoff));
  for(const name of REGIMES){
    const sum=Object.values(fold.model.conditional[name]).reduce((x,y)=>x+y,0);
    assert.ok(Math.abs(sum-1)<1e-9);
  }
  observedPeriods.push([fold.holdout_start,fold.holdout_end]);
 }
 for(let i=1;i<observedPeriods.length;i++)
  assert.ok(Date.parse(observedPeriods[i][0])>=Date.parse(observedPeriods[i-1][1]));
 assert.equal(audit.production_activation_allowed,false);
 assert.equal(audit.prospectively_validated,false);
});
test('alterar la última parte no altera entrenamiento ni primer test histórico',()=>{
 const original=synthetic(),modified=structuredClone(original);
 for(let i=2100;i<modified.length;i++){
  const row=modified[i],next=row[4]*.88;
  modified[i]=[row[0],Math.min(row[3],next)*.999,
    Math.max(row[3],next)*1.001,row[3],next,row[5]];
 }
 const before=auditRegimeTransitions(original,{cutoff:cutoff(original)});
 const after=auditRegimeTransitions(modified,{cutoff:cutoff(modified)});
 assert.deepEqual(before.folds[0],after.folds[0]);
 assert.notDeepEqual(before.folds[2].cases,after.folds[2].cases);
});
test('historia BTC archivada real: el informe nunca declara causalidad ni ventaja',()=>{
 const archive=JSON.parse(readFileSync(new URL('../evidencia/entrenamiento-x002-20261030/velas.json',import.meta.url),'utf8'));
 assert.equal(archive.reference_availability,'historical_candle_close_is_assumed_not_attested');
 const digest=createHash('sha256').update(JSON.stringify(archive.rows)).digest('hex');
 assert.equal(digest,archive.rows_sha256);
 const result=auditRegimeTransitions(archive.rows,{cutoff:archive.cutoff});
 assert.equal(result.status,'retrospective_audit_completed');
 assert.equal(result.observations>6000,true);
 assert.equal(result.gaps,0);
 assert.equal(result.folds.length,3);
 assert.ok(result.folds.every(x=>x.status==='retrospective_evaluation_only'));
 assert.equal(result.no_causal_claim,true);
 assert.equal(result.production_activation_allowed,false);
 assert.equal(result.automatic_trading,false);
});
