const need=(c,m)=>{if(!c)throw Error(m)};
export const BOLSA_LAB=Object.freeze({
  SPY:{accuracy:0.5148936170212766,baseline:0.4595744680851064,brier:0.25544831160465975,baseline_brier:0.25158087258091055},
  AAPL:{accuracy:0.4658119658119658,baseline:0.4978723404255319,brier:0.26087168404022,baseline_brier:0.2509044158985818},
  NVDA:{accuracy:0.5191489361702127,baseline:0.5319148936170213,brier:0.2576195733099689,baseline_brier:0.24943622183474493}
});
export function parseStockChart(raw,symbol,receivedAt){
  const r=raw?.chart?.result?.[0],q=r?.indicators?.quote?.[0],ts=r?.timestamp;
  need(r&&q&&Array.isArray(ts),'La fuente bursátil no devolvió una serie compatible');
  const cutoff=Date.parse(receivedAt)/1000,bars=[];
  for(let i=0;i<ts.length;i++){
    const row=[ts[i],q.low?.[i],q.high?.[i],q.open?.[i],q.close?.[i],q.volume?.[i]];
    if(!row.every(Number.isFinite)||row[0]%300!==0||(row[0]+300)>cutoff)continue;
    const [t,l,h,o,c,v]=row;if(l<=0||h<l||o<l||o>h||c<l||c>h||v<0)continue;
    bars.push(row);
  }
  bars.sort((a,b)=>a[0]-b[0]);
  need(bars.length>=80,'Historial bursátil insuficiente');
  return {symbol,currency:r.meta?.currency??'USD',exchange:r.meta?.exchangeName??'—',
    timezone:r.meta?.exchangeTimezoneName??'—',bars,
    note:'La decisión se calcula en XN01/XI-Ether; este módulo solo normaliza la fuente.'};
}
