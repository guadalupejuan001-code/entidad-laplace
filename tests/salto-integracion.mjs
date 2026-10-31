// E001 -> E005 end-to-end: learn hidden affine law with Mundo X XI,
// persist model checkpoint, compile into REVERSE-PC XI/RXE, seal forecast,
// THEN independently observe all states of the hidden world and verify it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {learn} from '../inteligencia/laplace.mjs';
import {hiddenWorld,observeTransitions} from '../inteligencia/experimento.mjs';

const [,,reverseBin,mundoBin,reportPath]=process.argv;
if(!reverseBin||!mundoBin||!reportPath)throw Error('uso: node tests/salto-integracion.mjs REVERSE_PC_BIN MUNDO_X_QUANTUM RESULT.json');
const work=mkdtempSync(join(tmpdir(),'laplace-e001-e005-integration-'));
const sha=text=>createHash('sha256').update(text).digest('hex');
const cli=resolve('tools/salto.mjs');
const call=(command,args)=>{
 const p=spawnSync(command,args,{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
 return {status:p.status,stdout:p.stdout||'',stderr:p.stderr||'',error:p.error?.message||null};
};
const report={schema:'laplace-e001-e005-native-integration-v1',world_synthetic:true,
   learner:'E001 original Mundo X XI',predictor:'E005 XI Machine in REVERSE-PC',
   future_not_observed_before_forecast:true,forecasts:[],pass:false};
try{
 const world=hiddenWorld(4,0x55AA33);
 const inputs=['0000','1000','0100','0010','0001','1111','0110'];
 const observed=observeTransitions(mundoBin,world,inputs);
 const records=inputs.map((before,index)=>({
   id:'E005_bridge_train_'+index,before,after:observed.outputs[index],
   observed_at:'2020-01-01T00:00:00Z',known_at:'2020-01-01T00:00:00Z'
 }));
 const trained=learn(mundoBin,records,'2020-01-02T00:00:00Z');
 assert.equal(trained.status,'ley_identificada');
 assert.equal(trained.width,4);
 assert.equal(trained.rank,5);
 const checkpoint=join(work,'checkpoint.json');
 writeFileSync(checkpoint,JSON.stringify(trained.checkpoint));
 report.training={observations:records.length,rank:trained.rank,checkpoint_sha256:sha(readFileSync(checkpoint)),
   xi_sha256:trained.checkpoint.xi_sha256};
 const initial='1010',horizons=['0','1','31','1000000','1000000000000'];
 // Store each forecast before calculating the withheld truth table.
 const origin=join(work,'initial.rvp');
 const initialized=call(resolve(reverseBin),['init',origin]);
 assert.equal(initialized.status,0,initialized.stderr);
 for(const h of horizons){
   const out=join(work,'forecast-'+h+'.xi'),exe=join(work,'forecast-'+h+'.rxe');
   const built=call(process.execPath,[cli,'aprendido',checkpoint,initial,h,resolve(mundoBin),out]);
   assert.equal(built.status,0,built.stderr);
   const compiled=call(resolve(reverseBin),['compile',out,exe,'Laplace E001 E005']);
   assert.equal(compiled.status,0,compiled.stderr);
   const execution=call(resolve(reverseBin),['run',exe,origin,join(work,'after-'+h+'.rvp')]);
   assert.equal(execution.status,0,execution.stderr);
   const outRows=execution.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
   const prints=outRows.filter(r=>r.type==='register').map(x=>x.value);
   assert.equal(prints.length,6);
   assert.equal(prints[4],1);
   report.forecasts.push({horizon:h,initial,result:prints.slice(0,4).join(''),
       matrix_products:prints[5],sha256:sha(readFileSync(out)),seal_sha256:sha(execution.stdout)});
 }
 // Integrity challenge: an altered E001 model cannot produce an E005 program.
 const forged=JSON.parse(readFileSync(checkpoint,'utf8'));
 forged.xi+='\nx 0\n';
 const forgedPath=join(work,'tampered-checkpoint.json'),badOut=join(work,'forged.xi');
 writeFileSync(forgedPath,JSON.stringify(forged));
 const corrupted=call(process.execPath,[cli,'aprendido',forgedPath,initial,'10',resolve(mundoBin),badOut]);
 assert.notEqual(corrupted.status,0,'tampered model was accepted');
 assert.equal(existsSync(badOut),false,'tampered model wrote executable source');
 report.tampered_checkpoint_rejected=true;
 // Only now reveal transition results for the complete universe.
 const universe=Array.from({length:16},(_,n)=>n.toString(2).padStart(4,'0'));
 const reality=observeTransitions(mundoBin,world,universe);
 const next=new Map(universe.map((before,i)=>[before,reality.outputs[i]]));
 const travel=h=>{
   let state=initial;const seen=new Map(),path=[];
   while(!seen.has(state)){
     seen.set(state,path.length);path.push(state);
     state=next.get(state);
     assert.ok(state!==undefined);
   }
   const start=seen.get(state),period=path.length-start;
   const index=BigInt(h)<BigInt(path.length)?Number(h):start+Number((BigInt(h)-BigInt(start))%BigInt(period));
   return path[index];
 };
 for(const f of report.forecasts){
   f.expected=travel(f.horizon);
   assert.equal(f.result,f.expected,'forecast/observation mismatch at '+f.horizon);
   f.verified=true;
 }
 report.pass=true;
}finally{
 mkdirSync(dirname(reportPath),{recursive:true});
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 rmSync(work,{recursive:true,force:true});
}
console.log(JSON.stringify({suite:report.schema,pass:report.pass,learned_rank:report.training.rank,
 forecast_horizons:report.forecasts.map(f=>f.horizon),checkpoint_tamper_rejected:report.tampered_checkpoint_rejected},null,2));
