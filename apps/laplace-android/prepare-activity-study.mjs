import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),vm=require('node:vm');
const asset='apps/laplace-android/app/src/main/assets/';
const context={};vm.runInNewContext(readFileSync(asset+'market-universe.js','utf8'),context);
vm.runInNewContext(readFileSync(asset+'engine.js','utf8'),context);
vm.runInNewContext(readFileSync(asset+'activity-engine.js','utf8'),context);
const file='evidencia/entrenamiento-x002-20261030/velas.json',bytes=readFileSync(file),data=JSON.parse(bytes);
const rows=data.rows.slice(-4032),reports=[];
for(const minutes of [5,15,30,60,120]){
 const result=context.LaplaceActivity.analyze(rows,{asset:'BTC-USD',minutes,granularity:300,
  asOf:rows.at(-1)[0]+300});reports.push(result);
 console.log(JSON.stringify({minutes,status:result.status,volatility:result.outputs?.volatility.test,
  volume:result.outputs?.volume.test,weights:result.weights}));
}
mkdirSync('evidencia/actividad-m005',{recursive:true});
writeFileSync('evidencia/actividad-m005/resultados.json',JSON.stringify({
 schema:'laplace-m005-retrospective-study-v1',data_sha256:createHash('sha256').update(bytes).digest('hex'),
 engine_sha256:createHash('sha256').update(readFileSync(asset+'activity-engine.js')).digest('hex'),
 data_cutoff:data.cutoff,rows:rows.length,source:'BTC-USD · Coinbase Exchange archive',
 knowledge:'retrospective candle-close assumption; no authenticated past vintages',
 prospectively_validated:false,reports},null,2)+'\n');
