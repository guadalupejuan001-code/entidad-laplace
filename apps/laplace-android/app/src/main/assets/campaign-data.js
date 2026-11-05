(function(){
'use strict';
const cache=new Map(),D=window.LaplaceActivityData;
function selection(){const s=D.selection(),crypto=s.market==='crypto';
 const granularity=crypto?(s.minutes<=120?300:s.minutes<=1440?3600:86400):(s.minutes<=30?300:s.minutes<1440?3600:86400);
 const days=crypto?({300:28,3600:360,86400:2200}[granularity]):({300:30,3600:180,86400:1825}[granularity]);
 return {...s,granularity,days};
}
window.LaplaceCampaignData={selection,freshness:D.freshness,
 async history(s){const key=s.asset+':'+s.granularity+':'+s.days,entry=cache.get(key);
  if(entry&&Date.now()-entry.at<60000&&D.freshness(s,entry.rows.at(-1)).valid)return entry.rows;
  const rows=await window.LaplaceCampaignFetch(s);cache.set(key,{rows,at:Date.now()});return rows;
 }};
})();
