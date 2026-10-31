import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {learn,predict,planReduction,prepareLearning,parseTransitions,transitions,digest}
  from '../inteligencia/laplace.mjs';
import {hiddenWorld,observeTransitions} from '../inteligencia/experimento.mjs';

const binary=process.env.MUNDO_X_QUANTUM;
const native={skip:binary?false:'requires original pinned Mundo X executable from CI'};
const time='2020-01-01T00:00:00Z',cutoff='2020-01-02T00:00:00Z';
const row=(id,before,after,known_at=time)=>({id,before,after,observed_at:time,known_at});
const xor=(a,b)=>String(Number(a)^Number(b));
// Independent classical oracle, only used to evaluate the native learner.
const truth=state=>xor(state[0],state[2])+xor('1',state[1])+state[3]+xor(state[2],state[3]);
const allInputs=Array.from({length:16},(_,v)=>v.toString(2).padStart(4,'0'));
const data=allInputs.map((before,i)=>row('p'+i,before,truth(before)));

test('the design planner uses input rank and proposes an informative experiment',()=>{
  const initial=planReduction(['0000','1000']);
  assert.equal(initial.rank,2);
  assert.ok(initial.next_probe);
  assert.equal(planReduction(['0000','1000',initial.next_probe]).rank,3);
  const full=planReduction(['0000','0100','1000','0010','0001','1111']);
  assert.equal(full.rank,5);assert.equal(full.next_probe,null);
  assert.ok(full.operations.some(op=>op.op==='swap'));
});

test('strict transition contract rejects mixed systems, dates, duplicates and resource excess',()=>{
  assert.throws(()=>transitions([row('a','0','01')]),/bits/);
  assert.throws(()=>transitions([row('a','0','0'),row('b','00','00')]),/mezclar/);
  assert.throws(()=>transitions([row('a','0','0'),row('a','0','0')]),/duplicado/);
  assert.throws(()=>transitions([row('a','0','0','2019-12-01T00:00:00Z')]),/antes/);
  assert.throws(()=>transitions([{...row('a','0','0'),hidden_law:'leak'}]),/campos/);
  assert.throws(()=>transitions([row('a','0'.repeat(17),'0'.repeat(17))]),/ancho/);
  assert.throws(()=>transitions(Array.from({length:129},(_,i)=>row('a'+i,'0','0'))),/maximo/);
  assert.throws(()=>parseTransitions('{broken'),/JSON invalido/);
});

test('training preparation never projects a late target, even for an earlier event',()=>{
  const late=row('late','1111','0000','2021-01-01T00:00:00Z');
  assert.deepEqual(prepareLearning([...data,late],cutoff),prepareLearning(data,cutoff));
  assert.deepEqual(prepareLearning([...data,late].reverse(),cutoff),prepareLearning(data,cutoff));
  assert.equal(prepareLearning([late],cutoff).status,'sin_observaciones');
  assert.equal(prepareLearning([late],cutoff).checkpoint,null);
});

test('native XI learns unknown affine rules and generalizes to inputs withheld from training',native,()=>{
  const selected=['0000','0100','1000','0010','0001','1111'];
  const training=selected.map((before,i)=>row('s'+i,before,truth(before)));
  const learned=learn(binary,training,cutoff);
  assert.equal(learned.status,'ley_identificada');
  assert.deepEqual(learned.rules,['y0 = x0 XOR x2','y1 = 1 XOR x1','y2 = x3','y3 = x2 XOR x3']);
  assert.equal(learned.rank,5);
  assert.ok(learned.native.memory_bindings>0);
  for(const state of allInputs)assert.equal(predict(binary,learned.checkpoint,state).states[0],truth(state));
  const forecast=predict(binary,learned.checkpoint,'1010',32);
  let state='1010';
  for(const predicted of forecast.states){state=truth(state);assert.equal(predicted,state)}
});

test('insufficient evidence abstains and asks for a rank-increasing observation',native,()=>{
  const short=learn(binary,data.slice(0,2),cutoff);
  assert.equal(short.status,'evidencia_insuficiente');
  assert.equal(short.checkpoint,null);
  assert.equal(planReduction([...data.slice(0,2).map(r=>r.before),short.next_probe]).rank,short.rank+1);
  const conflict=learn(binary,[row('a','0000','0000'),row('b','0000','1000')],cutoff);
  assert.equal(conflict.status,'ley_refutada');
  assert.equal(conflict.checkpoint,null);
});

test('nonlinear truth tables and newly observed external changes refute a fixed affine law',native,()=>{
  const nonlinear=['00','01','10','11'].map((before,i)=>
    row('and'+i,before,String(Number(before[0])&Number(before[1]))+before[0]));
  assert.equal(learn(binary,nonlinear,cutoff).status,'ley_refutada');
  const learned=learn(binary,data,cutoff);
  const changed=row('shock','0000','1000','2020-01-03T00:00:00Z');
  assert.equal(learn(binary,[...data,changed],cutoff).checkpoint.xi_sha256,learned.checkpoint.xi_sha256);
  const after=learn(binary,[...data,changed],'2020-01-03T00:00:00Z');
  assert.equal(after.status,'ley_refutada');assert.equal(after.checkpoint,null);
});

test('checkpoint replay recovers the learned state without stored JSON coefficients',native,()=>{
  const trained=learn(binary,data,cutoff),checkpoint=JSON.parse(JSON.stringify(trained.checkpoint));
  assert.equal(Object.hasOwn(checkpoint,'coefficients'),false);
  const original=predict(binary,checkpoint,'1101',4);
  assert.deepEqual(predict(binary,checkpoint,'1101',4).states,original.states);
  assert.equal(predict(binary,checkpoint,'1101',4).forecast_sha256,original.forecast_sha256);
  assert.throws(()=>predict(binary,{...checkpoint,xi:checkpoint.xi+'x 0\n'},'1101'),/hash/);
  assert.throws(()=>predict(binary,checkpoint,'1101',33),/pasos/);
  assert.throws(()=>predict(binary,checkpoint,'11'),/bits/);
  assert.throws(()=>predict('/not/a/native/runtime',checkpoint,'1101'),/ENOENT/);
  assert.equal(digest(checkpoint.xi),checkpoint.xi_sha256);
});

test('native discovery scales to a 16-bit hidden world and more than 100 explicit qubit addresses',native,()=>{
  const world=hiddenWorld(16,0xABCDE);
  const inputs=['0'.repeat(16),...Array.from({length:16},(_,i)=>'0'.repeat(i)+'1'+'0'.repeat(15-i))];
  const observed=observeTransitions(binary,world,inputs);
  const training=inputs.map((before,i)=>row('wide'+i,before,observed.outputs[i]));
  const learned=learn(binary,training,cutoff);
  assert.equal(learned.status,'ley_identificada');assert.equal(learned.rank,17);
  assert.equal(learned.native.explicit_qubit_address_bound,272);
  const unseen=['1010111001011010','1111111111111111','0111010100010010'];
  const reality=observeTransitions(binary,world,unseen);
  for(let i=0;i<unseen.length;i++)assert.equal(predict(binary,learned.checkpoint,unseen[i]).states[0],reality.outputs[i]);
});

test('CLI persists a model across processes, preserves old files and never writes a refuted model',native,()=>{
  const directory=mkdtempSync(join(tmpdir(),'laplace-cli-'));
  const tool=fileURLToPath(new URL('../tools/laplace.mjs',import.meta.url));
  const cli=(...args)=>spawnSync(process.execPath,[tool,...args],{encoding:'utf8',timeout:60000});
  try{
    const ledger=join(directory,'observaciones.jsonl'),model=join(directory,'modelo.json');
    writeFileSync(ledger,data.map(r=>JSON.stringify(r)).join('\n'));
    const created=cli('aprender-leyes',ledger,cutoff,resolve(binary),model);
    assert.equal(created.status,0,created.stderr);
    assert.equal(JSON.parse(created.stdout).status,'ley_identificada');
    const original=readFileSync(model,'utf8');
    const forecast=cli('predecir-estado',model,'1010','2',resolve(binary));
    assert.equal(forecast.status,0,forecast.stderr);
    assert.deepEqual(JSON.parse(forecast.stdout).states,[truth('1010'),truth(truth('1010'))]);
    assert.equal(cli('aprender-leyes',ledger,cutoff,resolve(binary),model).status,1);
    assert.equal(readFileSync(model,'utf8'),original);
    const refutedModel=join(directory,'refutado.json');
    writeFileSync(ledger,[...data,row('conflict','0000','0000')].map(r=>JSON.stringify(r)).join('\n'));
    const refuted=cli('aprender-leyes',ledger,cutoff,resolve(binary),refutedModel);
    assert.equal(refuted.status,0,refuted.stderr);
    assert.equal(JSON.parse(refuted.stdout).status,'ley_refutada');
    assert.equal(existsSync(refutedModel),false);
  }finally{rmSync(directory,{recursive:true,force:true})}
});
