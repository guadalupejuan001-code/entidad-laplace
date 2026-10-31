import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';

const [,,binary,outDir='build/xn01-proof']=process.argv;
if(!binary)throw Error('usage: node xn01-native.mjs REVERSE_PC [OUT_DIR]');
mkdirSync(outDir,{recursive:true});
const template=readFileSync(new URL('../../reverse-os-android/app/src/main/assets/laplace/x001-native.xi',import.meta.url),'utf8');
const CLOSE=1_000_000,VOLUME=2_000_000,SV=2_500_000,LV=2_600_000;
const u32=(v,s)=>Math.round(v*s);
const store32=(a,v)=>Array.from({length:4},(_,i)=>`store8 ${a+i} ${Math.floor(v/2**(i*8))%256}`).join('\n');
const valid=(bars,i)=>i>=6&&Array.from({length:6},(_,k)=>i-5+k).every(j=>bars[j][0]-bars[j-1][0]===300);
function program(bars){
  const b=bars.slice(-240),lines=[`set r15 ${b.length}`];
  b.forEach((r,i)=>{
    lines.push(store32(CLOSE+i*4,u32(r[4],100)),store32(VOLUME+i*4,u32(r[5],1)));
    lines.push(`store8 ${SV+i} ${valid(b,i)?1:0}`);
    lines.push(`store8 ${LV+i} ${valid(b,i)&&i+1<b.length&&b[i+1][0]-b[i][0]===300?1:0}`);
  });
  return template.replace('# __INPUT_BYTES__',lines.join('\n'));
}
function state(b,i){
  const close=j=>u32(b[j][4],100),volume=j=>u32(b[j][5],1);
  const d=close(i)-close(i-1),sum=Array.from({length:6},(_,k)=>i-5+k).reduce((s,j)=>s+Math.abs(close(j)-close(j-1)),0);
  const vol=Array.from({length:6},(_,k)=>i-5+k).reduce((s,j)=>s+volume(j),0);
  return (close(i)>=close(i-1)?1:0)|(close(i)>=close(i-3)?2:0)|(Math.abs(d)*6>sum?4:0)|(volume(i)*6>vol?8:0);
}
function reference(bars){
  const b=bars.slice(-240),cur=state(b,b.length-1);let same=0,upSame=0,up=0,n=0;
  for(let i=6;i<b.length-1;i++){
    if(!valid(b,i)||b[i+1][0]-b[i][0]!==300)continue;
    const y=u32(b[i+1][4],100)>u32(b[i][4],100);n++;if(y)up++;
    if(state(b,i)===cur){same++;if(y)upSame++;}
  }
  const prior=Math.trunc((up+1)*10000/(n+2));
  const p=Math.trunc((upSame*10000+8*prior)/(same+8));
  return {mask:cur,p,direction:p>=5000?1:0,support:same,prior,training:n,confidence:p>=5000?p:10000-p};
}
function run(bars,name){
  const xi=program(bars),path=join(outDir,name+'.xi'),initial=join(outDir,name+'-in.rvp'),final=join(outDir,name+'-out.rvp');
  writeFileSync(path,xi);let r=spawnSync(resolve(binary),['init',initial],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);
  r=spawnSync(resolve(binary),['run',path,initial,final],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr||r.stdout);
  const rows=r.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.type==='register');
  const map=Object.fromEntries(rows.map(x=>[x.register,x.value])),actual={mask:map.r0,p:map.r8,direction:map.r9,support:map.r3,prior:map.r7,training:map.r6,confidence:map.r10};
  assert.deepEqual(actual,reference(bars));return {actual,program_bytes:Buffer.byteLength(xi)};
}
const start=Math.floor(Date.parse('2026-10-01T13:30:00Z')/1000/300)*300;
let p=500;const bars=Array.from({length:220},(_,i)=>{const o=p;const phase=i%19;p*=phase<11?1.0012:.9987;return [start+i*300,Math.min(o,p)*.9998,Math.max(o,p)*1.0002,o,p,1000+(i%9)*130]});
const normal=run(bars,'normal');
writeFileSync(join(outDir,'result.json'),JSON.stringify({schema:'xn01-native-proof-v1',normal,backend:'reverse_pc XI Machine / InverseMemory'},null,2)+'\n');
console.log(JSON.stringify({ok:true,...normal.actual,program_bytes:normal.program_bytes}));
