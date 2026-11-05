// Audit an exported LQT diary without training on its outcomes or changing it.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const R=require('../apps/laplace-android/app/src/main/assets/forecast-risk.js');
const T=require('../apps/laplace-android/app/src/main/assets/quantum-tracking.js');
const path=process.argv[2]??fileURLToPath(new URL('../apps/laplace-android/tests/fixtures/btc-20261105-1h-large-miss.json',import.meta.url));
const bytes=readFileSync(path),data=JSON.parse(bytes);
if(!['laplace-lqt-backup-v1','laplace-large-miss-regression-v1'].includes(data.schema)||!Array.isArray(data.records))
 throw Error('Selecciona un respaldo LQT o un caso de regresión.');
const now=Date.parse(data.exportedAt)/1000;
if(!Number.isFinite(now))throw Error('Falta la fecha de exportación.');
const results=data.records.map(f=>{
 T.validate(f,now);
 return {id:f.id,...R.audit(f),
  retrospectiveActivity:R.assess(f,{records:data.records,mode:'retrospective'})};
});
const evaluated=results.filter(r=>r.status==='evaluated');
console.log(JSON.stringify({schema:'laplace-large-miss-audit-v1',
 sourceFileSHA256:createHash('sha256').update(bytes).digest('hex'),
 records:results.length,evaluated:evaluated.length,pending:results.length-evaluated.length,
 directionCorrect:evaluated.filter(r=>r.directionCorrect).length,
 meanAbsolutePriceError:evaluated.length?evaluated.reduce((s,r)=>s+r.absoluteError,0)/evaluated.length:null,
 worstMiss:evaluated.reduce((worst,r)=>!worst||r.absoluteError>worst.absoluteError?r:worst,null),
 protocol:{forecastValuesChanged:false,outcomesUsedForRiskIndicators:false,
  reconstructionIsNotRecordedAlert:true,rawNativeReplayAvailable:false,
  directionalOrTailProbabilityAdvantageEstablished:false},results},null,2));
