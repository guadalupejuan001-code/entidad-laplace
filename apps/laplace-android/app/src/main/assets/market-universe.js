/* Catálogo controlado de consulta; una lista de activos no equivale
 * a acceso a la cartera de Robinhood ni garantía de que el feed responda.
 */
(function(root){
'use strict';
const RAW=[["BTC-USD","Bitcoin","crypto"],["ETH-USD","Ethereum","crypto"],["SOL-USD","Solana","crypto"],["DOGE-USD","Dogecoin","crypto"],["XRP-USD","XRP","crypto"],["ADA-USD","Cardano","crypto"],["LTC-USD","Litecoin","crypto"],["LINK-USD","Chainlink","crypto"],["AVAX-USD","Avalanche","crypto"],["BCH-USD","Bitcoin Cash","crypto"],["AAPL","Apple","stock"],["NVDA","NVIDIA","stock"],["TSLA","Tesla","stock"],["AMD","AMD","stock"],["MSFT","Microsoft","stock"],["AMZN","Amazon","stock"],["GOOGL","Alphabet","stock"],["META","Meta","stock"],["PLTR","Palantir","stock"],["HOOD","Robinhood Markets","stock"],["COIN","Coinbase","stock"],["MSTR","Strategy","stock"],["SOFI","SoFi","stock"],["NFLX","Netflix","stock"],["JPM","JPMorgan","stock"],["SPY","S&P 500 ETF · SPY","etf"],["QQQ","Nasdaq-100 ETF · QQQ","etf"],["DIA","Dow Jones ETF · DIA","etf"],["IWM","Russell 2000 ETF · IWM","etf"],["VOO","Vanguard S&P 500 ETF","etf"],["VTI","Vanguard Total Market ETF","etf"]];
const ITEMS=Object.freeze(RAW.map(([symbol,name,kind])=>
  Object.freeze({symbol,name,kind,provider:kind==='crypto'?'Coinbase Exchange':
  'Yahoo Finance · chart público no oficial',market:kind==='crypto'?'crypto':'equity'})));
const BY_SYMBOL=Object.freeze(Object.fromEntries(ITEMS.map(x=>[x.symbol,x])));
const assets=Object.freeze(ITEMS.map(x=>x.symbol));
const isEquity=s=>BY_SYMBOL[s]?.market==='equity';
const isCrypto=s=>BY_SYMBOL[s]?.market==='crypto';
const sourceLabel=s=>isEquity(s)?'Yahoo Finance · indicativo, puede tener retraso':
  'Coinbase Exchange · público';
const robinhood=s=>{
 const item=BY_SYMBOL[s];if(!item)return null;
 if(item.market==='crypto')return 'https://robinhood.com/us/en/crypto/'+encodeURIComponent(s.split('-')[0])+'/';
 return 'https://robinhood.com/us/en/stocks/'+encodeURIComponent(s.toLowerCase())+'/';
};
root.LaplaceMarkets={ITEMS,BY_SYMBOL,assets,isEquity,isCrypto,sourceLabel,robinhood};
if(typeof module!=='undefined'&&module.exports)
 module.exports=root.LaplaceMarkets;
})(typeof window!=='undefined'?window:globalThis);
