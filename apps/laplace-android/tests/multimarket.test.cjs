const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets');
const Markets=require(path.join(root,'market-universe.js'));
const E=require(path.join(root,'engine.js'));

function marketBars(days=45,g=300){
 let p=100;const rows=[],base=Date.UTC(2026,7,3)/1000;
 for(let day=0;day<days;day++){
   const date=new Date((base+day*86400)*1000),dow=date.getUTCDay();
   if(dow===0||dow===6)continue;
   const len=g===300?78:g===3600?6:1;
   for(let bar=0;bar<len;bar++){
     const time=base+day*86400+(g===86400?0:14*3600+bar*g),
       open=p;
     p*=Math.exp(.0018*Math.sin(rows.length*.087)+.0003*Math.cos(rows.length*.021));
     rows.push([time,Math.min(open,p)*.997,Math.max(open,p)*1.003,open,p,
       20+2*Math.sin(rows.length*.11)**2]);
   }
 }
 return rows;
}
test('Catálogo 3.7 tiene símbolos tipados y coincide con allowlist Java',()=>{
 assert.equal(Markets.ITEMS.length,31);
 assert.equal(Markets.ITEMS.filter(x=>x.market==='crypto').length,10);
 assert.equal(Markets.ITEMS.filter(x=>x.market==='equity').length,21);
 assert.equal(new Set(E.ALLOWED_ASSETS).size,31);
 assert.equal(Markets.isEquity('SPY'),true);
 assert.equal(Markets.isEquity('VOO'),true);
 assert.equal(Markets.isCrypto('XRP-USD'),true);
 assert.equal(Markets.isCrypto('FAKE-ASSET'),false);
 assert.match(Markets.robinhood('AAPL'),/^https:\/\/robinhood\.com\/us\/en\/stocks\/aapl\/$/);
 assert.match(Markets.robinhood('BTC-USD'),/\/crypto\/BTC\/$/);
 const java=fs.readFileSync(path.resolve(root,
   '../java/com/entidadlaplace/mobile/MarketCatalog.java'),'utf8');
 for(const item of Markets.ITEMS)
  assert.ok(java.includes('"'+item.symbol+'"'),item.symbol+' sin allowlist nativa');
 assert.equal(E.selectResolution(240,'SPY'),300);
 assert.equal(E.selectResolution(720,'SPY'),3600);
 assert.equal(E.selectResolution(1440,'SPY'),86400);
 assert.equal(E.selectResolution(90*1440,'SPY'),86400);
 assert.equal(E.selectResolution(240,'BTC-USD'),3600);
 assert.equal(E.historyConfig('AAPL',15).days,30);
 assert.equal(E.historyConfig('NVDA',720).days,180);
 assert.equal(E.historyConfig('SPY',129600).days,1825);
});
test('Analiza sesión nocturna/fin de semana de bolsa sin inventar barras',()=>{
 const rows=marketBars(45),input=E.candlesFromCoinbase(rows,300);
 assert.ok(input.length>1000);
 assert.ok(input.some((x,i)=>i>0&&x.time-input[i-1].time>300),
   'Las sesiones deben conservar cortes de fin de semana');
 const stock=E.analyze(input,{asset:'SPY',granularity:300,horizonMinutes:120});
 assert.equal(stock.market,'equity');
 assert.equal(stock.resolutionSemantics,'trading_bars_not_elapsed_calendar_time');
 assert.equal(stock.ready,true,stock.reason);
 assert.ok(stock.validation.evaluated>0);
 const estimate=E.forecast(stock,{basePrice:100,sourceTime:input.at(-1).time+300});
 assert.equal(estimate.forecastTime,null,'Bolsa NO posee vencimiento horario fijo');
 assert.match(estimate.timeSemantics,/sesiones/);
 assert.ok(estimate.estimate>0);
 assert.equal(estimate.automaticTrading,false);
});
test('En bolsa 90 días significa 90 sesiones; no 90*24 horas',()=>{
 const input=E.candlesFromCoinbase(marketBars(1600,86400),86400);
 const m=E.analyze(input,{asset:'VOO',granularity:86400,horizonMinutes:129600});
 assert.equal(m.horizonBars,90);
 assert.equal(m.market,'equity');
 assert.ok(m.patterns<=18);
 assert.equal(m.validation.independentProspectiveValidation,false);
 if(m.ready)assert.equal(E.forecast(m,{basePrice:120,sourceTime:input.at(-1).time+86400}).forecastTime,null);
});
test('Source pin y proveedores no convierten Yahoo en Robinhood',()=>{
 const equity=fs.readFileSync(path.resolve(root,
   '../java/com/entidadlaplace/mobile/EquityHistory.java'),'utf8');
 assert.match(equity,/query1\.finance\.yahoo\.com/);
 assert.match(equity,/HttpURLConnection/);
 assert.match(equity,/indicativo/);
 assert.doesNotMatch(equity,/robinhood\.com\/api|oauth|accessToken/);
 assert.match(equity,/code!=200/);
});
