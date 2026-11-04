/* Verify the inlined worker under file://, the origin scheme used by Android. */
const {chromium}=require('playwright-core'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.LaplaceBridge={fetchQuote(id,asset){setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,quote:{asset,
    price:100,time:new Date().toISOString(),receivedAt:Date.now(),market:'crypto',source:'SIMULATED TEST'}}),10)},
    fetchCandles(id,asset,g){
     const end=Math.floor(Date.now()/1000/g)*g,rows=[];let value=100;
     for(let i=0;i<1200;i++){value*=Math.exp(.001*Math.sin(i*.2));rows.push([end-(1200-i)*g,value*.99,value*1.01,value,value,10+i%7]);}
     setTimeout(()=>window.LaplaceMobile.receive(id,{ok:true,granularity:g,candles:rows}),10);
    }};
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app/src/main/assets/index.html')).href);
  await page.waitForFunction(()=>window.LaplaceUIHealth?.initialized);
  await page.locator('#activityRun').click();
  await page.waitForFunction(()=>window.LaplaceActivityMobile.state().records.length===1,null,{timeout:20000});
  assert.match(await page.locator('#activityVolume').textContent(),/BTC/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({fileOrigin:true,inlineWorker:true,futureForecastSaved:true,jsErrors:0}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
