import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./app/src/main/assets/engine.js'),A=require('./app/src/main/assets/activity-engine.js');
const root=new URL('../../',import.meta.url),report=JSON.parse(readFileSync(new URL('evidencia/lqt1000/resultados.json',root)));
const source=readFileSync(new URL(report.source,root));
if(createHash('sha256').update(source).digest('hex')!==report.sourceSHA256)throw Error('OHLCV source hash mismatch');
const rows=JSON.parse(source).rows.slice(-report.rows),bars=E.candlesFromCoinbase(rows,300),n=rows.length;
const horizons=[];
for(const result of report.horizons){
 const h=result.minutes/5,start=Math.floor(n*.85),step=h*Math.max(1,Math.floor((n-start)/(h*64))),cases=[];
 for(let i=start;i+h<n&&cases.length<64;i+=step){
  const prefix=bars.slice(0,i+1),m=E.analogsAt(prefix,i,300,h,{asset:'BTC-USD'});
  if(m.reason)throw Error('M001 abstained at comparison origin');
  const activity=A.analyze(prefix,{asset:'BTC-USD',granularity:300,minutes:result.minutes,asOf:bars[i].time+300});
  if(activity.status!=='forecast')throw Error(activity.reason);
  const predicted=[bars[i].close*Math.exp(m.returnLog),activity.outputs.volatility.predicted,activity.outputs.volume.predicted];
  let square=0,volume=0;for(let j=i+1;j<=i+h;j++){square+=Math.log(bars[j].close/bars[j-1].close)**2;volume+=bars[j].volume;}
  const actual=[bars[i+h].close,100*Math.sqrt(square),volume];
  cases.push({origin:bars[i].time,knownThrough:bars[i].time+300,targetCloseAt:bars[i+h].time+300,
   reference:bars[i].close,predicted,actual,errors:predicted.map((x,k)=>Math.abs(x-actual[k])),
   directionCorrect:Math.sign(predicted[0]-bars[i].close)===Math.sign(actual[0]-bars[i].close)});
 }
 if(cases.length!==result.quantum.test.cases)throw Error('Different test case counts');
 const legacy={cases:cases.length,mae:[0,1,2].map(k=>cases.reduce((s,c)=>s+c.errors[k]/cases.length,0)),
  directionCorrect:cases.filter(c=>c.directionCorrect).length};
 horizons.push({minutes:result.minutes,quantum:result.quantum.test,matchedClassical:result.matchedClassical.test,
  legacy,legacyCases:cases});
 console.log(JSON.stringify({minutes:result.minutes,quantumMAE:result.quantum.test.outputs.map(x=>x.mae),legacyMAE:legacy.mae}));
}
const out={schema:'laplace-lqt1000-legacy-comparison-v1',sourceSHA256:report.sourceSHA256,algorithmSHA256:report.algorithmSHA256,
 protocol:'Identical closed-candle origins, targets and units. LQT frozen during initial test; M001/M005 re-evaluate known past at each origin, as in the app.',
 legacySourceSHA256:Object.fromEntries(['engine.js','activity-engine.js'].map(f=>[f,createHash('sha256').update(readFileSync(new URL('./app/src/main/assets/'+f,import.meta.url))).digest('hex')])),
 usesSpotTicker:false,prospectivelyValidated:false,horizons};
const destination=new URL('evidencia/lqt1000/comparacion-anterior.json',root);
if(process.argv.includes('--verify')){
 const previous=JSON.parse(readFileSync(destination));
 if(previous.algorithmSHA256!==out.algorithmSHA256||previous.sourceSHA256!==out.sourceSHA256)throw Error('Comparison source mismatch');
 for(let i=0;i<horizons.length;i++){
  if(previous.horizons[i].legacy.cases!==horizons[i].legacy.cases)throw Error('Different comparison cases');
  for(let k=0;k<3;k++)if(Math.abs(previous.horizons[i].legacy.mae[k]-horizons[i].legacy.mae[k])>1e-8)throw Error('Different legacy error');
 }
}else writeFileSync(destination,JSON.stringify(out,null,2)+'\n');
