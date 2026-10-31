#!/usr/bin/env node
import {writeFileSync} from 'node:fs';
import {fetchIntraday,DEFAULT_SYMBOLS,cleanSymbol} from '../bolsa/mercado.mjs';
import {experiment} from '../experimentos/mercado-xi-x001.mjs';

const [,,binary,...symbolsRaw]=process.argv;
if(!binary){
  console.error('uso: node tools/bolsa-x001.mjs BIN_NATIVO [SPY AAPL NVDA ...]');
  process.exit(2);
}
const symbols=(symbolsRaw.length?symbolsRaw:DEFAULT_SYMBOLS).map(cleanSymbol);
const all=[];
for(const symbol of symbols){
  const data=await fetchIntraday(symbol,{range:'1mo'});
  const cutoff=new Date((data.bars.at(-1)[0]+300)*1000).toISOString();
  const result=experiment(binary,data.bars,{cutoff,folds:8,compareM001:false,asset:symbol});
  all.push({symbol,source:data.source,exchange:data.exchange,timezone:data.timezone,captured_at:data.captured_at,...result});
}
const out={schema:'laplace-bolsa-b001-v1',generated_at:new Date().toISOString(),symbols:all,
  warning:'Experimento de dirección a 5 minutos; sin órdenes y sin activación de producción.'};
writeFileSync('bolsa-x001-resultado.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
