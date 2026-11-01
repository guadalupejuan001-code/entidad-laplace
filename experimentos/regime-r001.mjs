/* Laplace 3.8 — régimen observable, sin fuga futura ni trading. */
export const REGIME_SCHEMA='laplace-regime-r001-v1';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function detectRegimes(bars,{lookback=24,baseline=288}={}){
 if(!Array.isArray(bars)||bars.length<baseline+lookback+2)throw Error('Historia insuficiente');
 const result=[];
 for(let i=baseline+lookback;i<bars.length;i++){
  const window=bars.slice(i-lookback,i+1);
  const returns=window.slice(1).map((r,k)=>Math.log(r[4]/window[k][4]));
  const volatility=Math.sqrt(mean(returns.map(x=>x*x)));
  const past=[];
  for(let j=i-baseline;j<i;j++){
   if(j<lookback)continue;
   const w=bars.slice(j-lookback,j+1);
   const rr=w.slice(1).map((r,k)=>Math.log(r[4]/w[k][4]));
   past.push(Math.sqrt(mean(rr.map(x=>x*x))));
  }
  if(past.length<30)continue;
  const sorted=[...past].sort((a,b)=>a-b);
  const high=sorted[Math.floor(.75*(sorted.length-1))];
  const low=sorted[Math.floor(.25*(sorted.length-1))];
  const trend=Math.log(bars[i][4]/bars[i-lookback][4]);
  const regime=volatility>=high?'high_volatility':volatility<=low?'low_volatility':'normal_volatility';
  result.push({at:bars[i][0],regime,trend:trend>volatility*2?'up':trend< -volatility*2?'down':'mixed',
   volatility,threshold_low:low,threshold_high:high,
   based_on_closed_bars_only:true,prospectively_validated:false});
 }
 return {schema:REGIME_SCHEMA,observations:result.length,states:result,
  causal_claim:false,production_activation_allowed:false,automatic_trading:false};
}
