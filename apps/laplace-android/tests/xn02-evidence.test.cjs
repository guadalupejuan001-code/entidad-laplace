const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const load=p=>fs.readFileSync(path.join(root,p));
const report=JSON.parse(load('evidencia/xn02-ventanas/resultados.json'));
const e=report.evidence;
test('La evidencia XI corresponde a las velas reales y a la plantilla embarcada',()=>{
  const hash=p=>createHash('sha256').update(load(p)).digest('hex');
  assert.equal(e.dataset_sha256,hash('evidencia/entrenamiento-x002-20261030/velas.json'));
  assert.equal(e.template_sha256,hash('apps/laplace-android/app/src/main/assets/xn02-native.xi'));
  const context={window:{}};vm.runInNewContext(load('apps/laplace-android/app/src/main/assets/xn02-evidence.js').toString(),context);
  assert.equal(JSON.stringify(context.window.LAPLACE_XN02_EVIDENCE),JSON.stringify(e));
  assert.equal(e.prospectively_validated,false);
  assert.equal(e.internal_confidence_is_accuracy,false);
});
test('Todos los tamaños usan los mismos objetivos reservados y resultados reproducibles',()=>{
  for(const split of ['validation','test']){
    let targets;
    for(const window of [240,288,864,1440]){
      const cases=report.cases.filter(c=>c.split===split&&c.window===window);
      const measured=e.windows[window][split];
      assert.equal(cases.length,measured.cases);
      assert.deepEqual(cases.map(c=>c.target),targets??=cases.map(c=>c.target));
      assert.ok(cases.every(c=>c.target-c.origin===300&&c.training_rows<=window-7));
      assert.equal(cases.reduce((a,c)=>a+c.correct,0),measured.correct);
      assert.ok(Math.abs(cases.reduce((a,c)=>a+(c.p-c.actual_up)**2,0)/cases.length-measured.brier)<1e-12);
    }
  }
  const validation=report.cases.filter(c=>c.split==='validation');
  const testCases=report.cases.filter(c=>c.split==='test');
  assert.ok(Math.max(...validation.map(c=>c.target))<Math.min(...testCases.map(c=>c.origin)));
  const best=[240,288,864,1440].sort((a,b)=>e.windows[a].validation.brier-e.windows[b].validation.brier)[0];
  assert.equal(e.selected_window,best);
});
