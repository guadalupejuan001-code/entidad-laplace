/* Una comprobación común para los tres registros. Consulta cierres, no ticks;
 * no reentrena ni cambia la predicción emitida. */
(function(root){
'use strict';
const E=root.LaplaceMath??(typeof require==='function'?require('./engine.js'):null);
const M=root.LaplaceMarkets??(typeof require==='function'?require('./market-universe.js'):null);
const seconds=()=>Date.now()/1000,finite=Number.isFinite;
const pendingReasons=new Set(['awaiting_source','awaiting_session','source_missing','missing_bars',
 'origin_missing','source_error','source_window_expired','invalid_period']);
const retryAt=(f,now)=>finite(f.verification?.checkedAt)&&f.verification.checkedAt<=now&&
 finite(f.verification.nextTryAt)&&f.verification.nextTryAt<=f.verification.checkedAt+86400?f.verification.nextTryAt:0;
const targetOf=f=>M.isEquity(f.asset)?(f.sourceCloseAt+f.horizonBars*f.granularity):
 Math.ceil((f.targetCloseAt??f.targetAt)/f.granularity)*f.granularity;
const originOf=f=>f.originTime??(finite(f.sourceCloseAt)?f.sourceCloseAt-f.granularity:
 Math.floor(f.sourceTime/f.granularity)*f.granularity);
function phase(f,now=seconds()){
 if(f.status==='verified')return 'verified';
 if(!finite(targetOf(f))||!finite(originOf(f)))return 'invalid_period';
 if(targetOf(f)>now)return 'waiting';
 return pendingReasons.has(f.verification?.reason)?f.verification.reason:'due';
}
function plan(entries,now,{force=false}={}){
 const eligible=entries.filter(({record:f})=>f.status==='pending'&&(!finite(targetOf(f))||targetOf(f)<=now)&&
  (force||!(retryAt(f,now)>now)));
 const groups=[];
 for(const item of eligible.sort((a,b)=>a.record.asset.localeCompare(b.record.asset)||
  a.record.granularity-b.record.granularity||originOf(a.record)-originOf(b.record))){
  const f=item.record,g=f.granularity,market=M.isEquity(f.asset)?'equity':'crypto';
  const start=originOf(f),end=targetOf(f);
  if(!E.ALLOWED_ASSETS.includes(f.asset)||![300,3600,86400].includes(g)||
   !Number.isSafeInteger(start)||start<=0||start%g||!Number.isSafeInteger(end)||end%g||end<=start)
   {groups.push({asset:f.asset,market,granularity:g,start,end,invalid:true,entries:[item]});continue}
  if(market==='crypto'&&(end-start)/g>280){groups.push({asset:f.asset,market,granularity:g,start,end,invalid:true,entries:[item]});continue}
  let group=groups.at(-1);
  if(!group||group.invalid||group.asset!==f.asset||group.granularity!==g||
    market==='crypto'&&(start>group.end||(Math.max(end,group.end)-group.start)/g>280)){
   group={asset:f.asset,market,granularity:g,minutes:f.minutes,start,end,
    days:(market==='equity'?{300:30,3600:180,86400:1825}:{300:14,3600:45,86400:1000})[g],entries:[]};groups.push(group);
  }
  group.end=Math.max(group.end,end);group.entries.push(item);
 }
 return groups;
}
function missingReason(f,rows,now){
 if(!rows.length)return {reason:now-targetOf(f)>2*f.granularity?'source_missing':'awaiting_source',lastCloseAt:null};
 const g=f.granularity,bars=E.candlesFromCoinbase(rows,g).filter(b=>b.time+g<=now);
 const lastCloseAt=bars.at(-1)?.time+g||null,i=bars.findIndex(b=>b.time===originOf(f));
 if(i<0)return {reason:M.isEquity(f.asset)&&bars[0]?.time>originOf(f)?'source_window_expired':'origin_missing',lastCloseAt};
 if(M.isEquity(f.asset))return {reason:i+f.horizonBars>=bars.length?'awaiting_session':'missing_bars',lastCloseAt};
 if(lastCloseAt<targetOf(f))return {reason:'awaiting_source',lastCloseAt};
 return {reason:'missing_bars',lastCloseAt};
}
function create({now=seconds,visible=()=>true,changed=()=>{},stateChanged=()=>{},
 setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const providers=new Map();let fetcher=null,timer=null,active=null,lastCheckAt=null,lastReport=null,running=false,cooldownUntil=0;
 let progress={group:0,total:0,asset:null};
 const entries=()=>[...providers].flatMap(([engine,p])=>p.records().map(record=>({engine,record})));
 const state=()=>({running,lastCheckAt,lastReport,progress:{...progress},pending:entries().filter(x=>x.record.status==='pending').length});
 function emit(){changed(state())}
 function schedule(delay){
  if(timer!==null){clearTimer(timer);timer=null}
  if(!fetcher||active||!visible())return;
  const pending=entries().filter(x=>x.record.status==='pending');if(!pending.length)return;
  const t=now(),next=Math.min(...pending.map(({engine,record:f})=>providers.get(engine).busy?.()?t+5:
   Math.max(finite(targetOf(f))?targetOf(f)+3:t,retryAt(f,t))));
  timer=setTimer(()=>{timer=null;sync()},Math.max((cooldownUntil-t)*1000,
   delay??Math.max(500,Math.min(60000,(next-t)*1000))));
 }
 async function work(force){
  running=true;stateChanged(state());emit();const report={evaluated:0,attempted:0,errors:[],groups:0};
  try{
   const available=entries().filter(x=>!providers.get(x.engine).busy?.());
   const groups=plan(available,now(),{force}).slice(0,24);
   progress={group:0,total:groups.length,asset:null};
   for(const group of groups){
    if(!visible()&&!force)break;
    const {entries:members,...request}=group;let rows=null,error=null;
    progress={group:progress.group+1,total:groups.length,asset:group.asset};emit();
    try{
     if(group.invalid)throw Error('El registro no conserva un período válido.');
     rows=await fetcher(request);if(!Array.isArray(rows))throw Error('La fuente no entregó una serie.');
     if(rows.length)rows=E.candlesFromCoinbase(rows,group.granularity).filter(b=>b.time+group.granularity<=now());
    }catch(e){error=String(e.message??e);report.errors.push({kind:group.invalid?'validation':'source',asset:group.asset,message:error})}
    report.groups++;
    for(const engine of new Set(members.map(x=>x.engine))){
     const p=providers.get(engine),ids=new Set(members.filter(x=>x.engine===engine).map(x=>x.record.id));
     const current=p.records(),subset=current.filter(f=>ids.has(f.id)&&f.status==='pending');
     if(!subset.length)continue;
     const at=now();let evaluated,step='evaluation';
     try{
      evaluated=!error&&rows?.length?p.evaluate(subset,rows,{...request,now:at}).records:subset;
      let completed=0;const updates=new Map(evaluated.map(f=>{
       if(f.status==='verified'){completed++;return [f.id,{...f,verification:{
        schema:'laplace-close-check-v1',reason:'verified',checkedAt:at,requestedFrom:group.start,requestedTo:group.end}}]}
       const info=error?{reason:group.invalid?'invalid_period':'source_error',message:error}:missingReason(f,rows??[],at);
       const retry=info.reason==='source_window_expired'||info.reason==='invalid_period'?86400:
        info.reason==='source_missing'?600:info.reason==='awaiting_session'?300:
        info.reason==='awaiting_source'?30:info.reason==='source_error'?60:120;
       return [f.id,{...f,verification:{schema:'laplace-close-check-v1',...info,checkedAt:at,nextTryAt:at+retry,
        requestedFrom:group.start,requestedTo:group.end}}];
      }));
      step='storage';p.update(current.map(f=>updates.get(f.id)??f));report.evaluated+=completed;report.attempted+=subset.length;emit();
     }catch(e){cooldownUntil=at+60;report.errors.push({kind:step,asset:group.asset,engine,message:String(e.message??e)})}
    }
   }
  }catch(e){report.errors.push({message:String(e.message??e)})}
  finally{lastCheckAt=now();lastReport=report;running=false;progress.asset=null;stateChanged(state());emit()}
  return report;
 }
 function sync({force=false}={}){
  if(active)return active;
  if(!force&&now()<cooldownUntil){schedule();return Promise.resolve(lastReport)}
  if(!fetcher)return Promise.resolve({evaluated:0,attempted:0,errors:[{message:'Fuentes todavía no disponibles.'}],groups:0});
  active=Promise.resolve().then(()=>work(force)).finally(()=>{active=null;schedule()});return active;
 }
 return {entries,state,sync,phase,configure(fetch){fetcher=fetch;schedule(700)},
  register(engine,provider){providers.set(engine,provider);emit();schedule(700)},
  changed(){emit();schedule()},wake(){schedule(200)},
  suspend(){if(timer!==null){clearTimer(timer);timer=null}},dispose(){fetcher=null;this.suspend()}};
}
root.LaplaceVerification={create,plan,phase,targetOf,originOf};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LaplaceVerification;
else{
 root.LaplaceVerifier=create({visible:()=>document.visibilityState==='visible',
  changed:detail=>root.dispatchEvent(new CustomEvent('laplace:ledger',{detail})),
  stateChanged:detail=>root.dispatchEvent(new CustomEvent('laplace:verification',{detail}))});
 document.addEventListener('visibilitychange',()=>document.hidden?root.LaplaceVerifier.suspend():root.LaplaceVerifier.wake());
 root.addEventListener('online',()=>root.LaplaceVerifier.wake());
}
})(typeof window!=='undefined'?window:globalThis);
