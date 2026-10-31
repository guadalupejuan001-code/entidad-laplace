import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_SYMBOLS} from '../universo/catalogo-global.mjs';
import {localMaskXN01,globalMaskAt,alignedSamples,experimentOne} from '../experimentos/u002-predictive-xg01.mjs';
const start=Math.floor(Date.parse('2026-10-20T13:30:00Z')/300000)*300;
function histories(n=320){
  const map=new Map();
  MARKET_SYMBOLS.forEach((s,k)=>{
    let p=100+k,v=1000;const bars=[];
    for(let i=0;i<n;i++){
      const regime=Math.floor(i/12)%2===0?1:-1;
      const noise=((i+k*3)%7-3)*0.00005;
      const ret=(regime*(k%5===0?.0004:.0008))+noise;
      const o=p;p*=Math.exp(ret);v=1000+(i+k)%30;
      bars.push([start+i*300,Math.min(o,p)*.9999,Math.max(o,p)*1.0001,o,p,v]);
    }
    map.set(s,bars);
  });
  // Target reacts to the shared regime but retains local variation.
  for(const target of ['SPY','AAPL','NVDA']){
    const b=map.get(target);let p=200;
    for(let i=0;i<b.length;i++){
      const regime=Math.floor(i/12)%2===0?1:-1,ret=regime*.001+((i%5)-2)*.00003,o=p;p*=Math.exp(ret);
      b[i]=[b[i][0],Math.min(o,p)*.9999,Math.max(o,p)*1.0001,o,p,1200+i%20];
    }
  }
  return map;
}
test('XN01 local mask remains 4-bit and current data only',()=>{
 const h=histories(30),b=h.get('SPY'),m=localMaskXN01(b,15);
 assert.ok(Number.isInteger(m)&&m>=0&&m<16);
 const copy=b.map(x=>[...x]);copy[25][4]*=5;copy[25][2]=Math.max(copy[25][2],copy[25][4]);
 assert.equal(localMaskXN01(copy,15),m);
});
test('global mask compresses cross-market breadth plus VIX and DXY into 4 bits',()=>{
 const h=histories(40),idx=new Map([...h].map(([s,b])=>[s,new Map(b.map((x,i)=>[x[0],{b:x,i}]))]));
 const m=globalMaskAt(idx,h.get('SPY')[20][0]);
 assert.ok(Number.isInteger(m)&&m>=0&&m<16);
});
test('XG01 creates chronological held-out folds and never changes production',()=>{
 const h=histories(),samples=alignedSamples(h,'SPY'),r=experimentOne(samples,'SPY',{plan:{train:120,validation:40,test:40,strength:8,weights:[0,.25,.5,.75,1],min_global_coverage:28}});
 assert.ok(r.folds>=2);assert.ok(r.local.count>0);assert.equal(r.local.count,r.fused.count);
 assert.ok(r.fold_details.every(f=>f.partitions.train[1]===f.partitions.validation[0]&&f.partitions.validation[1]===f.partitions.test[0]));
});
