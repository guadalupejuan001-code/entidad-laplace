/* XG01 — A/B intradía: XN01 local vs U002-global vs fusión validada.
 * Usa únicamente la porción U002 con historia intradía reconstruible (mercados).
 * Clima/macro/sismos quedan fuera hasta existir snapshots históricos punto-en-tiempo.
 * Ningún dato del test elige pesos ni parámetros.
 */
import {MARKET_SYMBOLS} from '../universo/catalogo-global.mjs';
import {chartUrl,parseChart} from '../bolsa/mercado.mjs';

export const XG01_SCHEMA='laplace-u002-predictive-ab-xg01-v1';
export const TARGETS=Object.freeze(['SPY','AAPL','NVDA']);
export const PLAN=Object.freeze({train:120,validation:40,test:40,strength:8,weights:[0,.25,.5,.75,1],min_global_coverage:28});
const need=(c,m)=>{if(!c)throw Error(m)};
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const brier=rows=>rows.length?avg(rows.map(x=>(x.p-x.y)**2)):null;
const accuracy=rows=>rows.length?avg(rows.map(x=>Number((x.p>=.5)===Boolean(x.y)))):null;

async function readJSON(url,fetchImpl,timeoutMs){
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-XG01/1.0'}});
  need(r.ok,'HTTP '+r.status+' '+new URL(url).hostname);
  const body=await r.text();need(body.length<2_000_000,'respuesta demasiado grande');
  return JSON.parse(body);
}
async function poolMap(items,limit,fn){
  const out=Array(items.length),cursor={i:0};
  async function worker(){for(;;){const i=cursor.i++;if(i>=items.length)return;try{out[i]={ok:true,value:await fn(items[i])}}catch(error){out[i]={ok:false,error}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
}
export async function fetchHistories({fetchImpl=fetch,timeoutMs=12000,symbols=MARKET_SYMBOLS}={}){
  const settled=await poolMap(symbols,4,async symbol=>{
    const url=chartUrl(symbol,{range:'5d',interval:'5m'});
    return {symbol,url,parsed:parseChart(await readJSON(url,fetchImpl,timeoutMs),symbol)};
  });
  const histories=new Map(),failures=[];
  settled.forEach((r,i)=>r.ok?histories.set(symbols[i],r.value.parsed.bars):failures.push({symbol:symbols[i],reason:String(r.error?.message??r.error)}));
  return {histories,failures};
}
function mapBars(bars){return new Map(bars.map((b,i)=>[b[0],{b,i}]));}
function continuous(bars,i,n=6){
  if(i<n)return false;for(let j=i-n+1;j<=i;j++)if(bars[j][0]-bars[j-1][0]!==300)return false;return true;
}
export function localMaskXN01(bars,i){
  if(!continuous(bars,i,6))return null;
  const ci=bars[i][4],d5=ci-bars[i-1][4],d15=ci-bars[i-3][4];
  let sumAbs=0,sumVol=0;for(let j=i-5;j<=i;j++){sumAbs+=Math.abs(bars[j][4]-bars[j-1][4]);sumVol+=bars[j][5];}
  return (d5>=0?1:0)|(d15>=0?2:0)|(Math.abs(d5)*6>sumAbs?4:0)|(bars[i][5]*6>sumVol?8:0);
}
function returnAt(index,t,delta){
  const now=index.get(t),old=index.get(t-delta);if(!now||!old)return null;
  const a=now.b[4],b=old.b[4];return a>0&&b>0?Math.log(a/b):null;
}
export function globalMaskAt(indexes,t,{minCoverage=PLAN.min_global_coverage}={}){
  let up5=0,n5=0,up30=0,n30=0;
  for(const [symbol,index] of indexes){
    const r5=returnAt(index,t,300),r30=returnAt(index,t,1800);
    if(Number.isFinite(r5)){n5++;if(r5>=0)up5++}
    if(Number.isFinite(r30)){n30++;if(r30>=0)up30++}
  }
  if(n5<minCoverage||n30<minCoverage)return null;
  const vix=returnAt(indexes.get('^VIX')??new Map(),t,300);
  const dxy=returnAt(indexes.get('DX-Y.NYB')??new Map(),t,300);
  if(!Number.isFinite(vix)||!Number.isFinite(dxy))return null;
  return (up5/n5>=.5?1:0)|(up30/n30>=.5?2:0)|(vix<=0?4:0)|(dxy<=0?8:0);
}
function stats(rows,key,strength=PLAN.strength){
  const positives=rows.reduce((s,r)=>s+r.y,0),prior=(positives+1)/(rows.length+2),by=new Map();
  for(const r of rows){const mask=r[key];if(mask===null)continue;const old=by.get(mask)??{n:0,up:0};old.n++;old.up+=r.y;by.set(mask,old)}
  return {prior,by,strength};
}
function predict(model,mask){
  if(mask===null)return null;const row=model.by.get(mask)??{n:0,up:0};
  return {p:(row.up+model.strength*model.prior)/(row.n+model.strength),support:row.n};
}
function score(rows,local,global,weight){
  const out=[];
  for(const r of rows){
    const l=predict(local,r.local),g=predict(global,r.global);if(!l||!g)continue;
    out.push({p:weight*l.p+(1-weight)*g.p,y:r.y,local:l.p,global:g.p});
  }
  return {rows:out,count:out.length,brier:brier(out),accuracy:accuracy(out)};
}
export function alignedSamples(histories,target){
  need(histories instanceof Map&&histories.has(target),'target sin historia');
  const indexes=new Map([...histories].map(([s,b])=>[s,mapBars(b)])),bars=histories.get(target),rows=[];
  for(let i=6;i<bars.length-1;i++){
    if(bars[i+1][0]-bars[i][0]!==300)continue;
    const local=localMaskXN01(bars,i),global=globalMaskAt(indexes,bars[i][0]);
    if(local===null||global===null)continue;
    rows.push({t:bars[i][0],local,global,y:Number(bars[i+1][4]>bars[i][4])});
  }
  return rows;
}
export function experimentOne(samples,target,{plan=PLAN}={}){
  const needRows=plan.train+plan.validation+plan.test;need(samples.length>=needRows,'muestras insuficientes para '+target+': '+samples.length);
  const folds=[];
  for(let testEnd=needRows;testEnd<=samples.length;testEnd+=plan.test){
    const testStart=testEnd-plan.test,valStart=testStart-plan.validation,trainStart=valStart-plan.train;
    if(trainStart<0)continue;
    const train=samples.slice(trainStart,valStart),validation=samples.slice(valStart,testStart),test=samples.slice(testStart,testEnd);
    const lm=stats(train,'local'),gm=stats(train,'global');
    const candidates=plan.weights.map(weight=>({weight,...score(validation,lm,gm,weight)}))
      .sort((a,b)=>(a.brier??Infinity)-(b.brier??Infinity)||Math.abs(b.weight-.5)-Math.abs(a.weight-.5));
    const chosen=candidates[0];
    const fit=samples.slice(trainStart,testStart),localFit=stats(fit,'local'),globalFit=stats(fit,'global');
    const local=score(test,localFit,globalFit,1),global=score(test,localFit,globalFit,0),fused=score(test,localFit,globalFit,chosen.weight);
    const prior=(fit.reduce((s,r)=>s+r.y,0)+1)/(fit.length+2),baseRows=fused.rows.map(r=>({p:prior,y:r.y}));
    folds.push({target,selected_local_weight:chosen.weight,
      partitions:{train:[trainStart,valStart],validation:[valStart,testStart],test:[testStart,testEnd]},
      local:{count:local.count,brier:local.brier,accuracy:local.accuracy},
      global:{count:global.count,brier:global.brier,accuracy:global.accuracy},
      fused:{count:fused.count,brier:fused.brier,accuracy:fused.accuracy},
      baseline:{count:baseRows.length,brier:brier(baseRows),accuracy:accuracy(baseRows),prior},
      validation:candidates.map(x=>({weight:x.weight,brier:x.brier,accuracy:x.accuracy,count:x.count}))
    });
  }
  need(folds.length>0,'sin folds para '+target);
  const aggregate=key=>{
    const rows=folds.map(f=>f[key]).filter(x=>x.count&&Number.isFinite(x.accuracy)),n=rows.reduce((s,x)=>s+x.count,0);
    return {count:n,accuracy:n?rows.reduce((s,x)=>s+x.count*x.accuracy,0)/n:null,
      brier:n?rows.reduce((s,x)=>s+x.count*x.brier,0)/n:null};
  };
  const local=aggregate('local'),global=aggregate('global'),fused=aggregate('fused'),baseline=aggregate('baseline');
  return {target,samples:samples.length,folds:folds.length,local,global,fused,baseline,
    fused_accuracy_minus_local:fused.accuracy-local.accuracy,
    fused_brier_skill_vs_local:local.brier?1-fused.brier/local.brier:null,fold_details:folds};
}
export async function runXG01({fetchImpl=fetch,timeoutMs=12000,targets=TARGETS}={}){
  const {histories,failures}=await fetchHistories({fetchImpl,timeoutMs});
  need(histories.size>=PLAN.min_global_coverage,'muy pocas series globales: '+histories.size);
  const results=targets.filter(t=>histories.has(t)).map(t=>experimentOne(alignedSamples(histories,t),t));
  const sumCount=key=>results.reduce((s,r)=>s+r[key].count,0),weighted=(key,metric)=>{
    const n=sumCount(key);return n?results.reduce((s,r)=>s+r[key].count*r[key][metric],0)/n:null;
  };
  return {schema:XG01_SCHEMA,generated_at:new Date().toISOString(),market_series_loaded:histories.size,market_series_failed:failures,
    scope:'Porción intradía de U002: mercados globales. No usa clima/macro/sismos sin archivo histórico.',
    targets:results,aggregate:{
      local:{count:sumCount('local'),accuracy:weighted('local','accuracy'),brier:weighted('local','brier')},
      global:{count:sumCount('global'),accuracy:weighted('global','accuracy'),brier:weighted('global','brier')},
      fused:{count:sumCount('fused'),accuracy:weighted('fused','accuracy'),brier:weighted('fused','brier')},
      baseline:{count:sumCount('baseline'),accuracy:weighted('baseline','accuracy'),brier:weighted('baseline','brier')}
    },production_changed:false,automatic_trading:false};
}
