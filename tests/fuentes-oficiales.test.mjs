import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  numeric,parseCanadaPolicy,parseBrazilPolicy,parseEcbPolicy,parseTwse,parseB3Public,
  parseMoexIndex,parseMoexDatedFutures,fetchOfficialCentralBanks,OFFICIAL_URLS
} from '../universo/fuentes-oficiales.mjs';
import {parseFredInitialReleaseVersion,fetchExactMacroVintages,parseNeso,parsePortWatch,parseOpenSky,parseBisPolicyCsv} from '../universo/fuentes-u003.mjs';
import {parseWorldBank,parseWeather} from '../universo/fuentes-globales.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {encodeGlobalSnapshot} from '../universo/ether-global.mjs';
import {observeWorldU003} from '../universo/global-u003.mjs';

const at='2026-10-30T16:00:00.000Z',url='https://example.org/data';
const options={capturedAt:at,url};
test('missing numeric data stays absent while an actual zero is retained',()=>{
  for(const x of [null,undefined,'',' ','.','NA',true,[],{}])assert.ok(Number.isNaN(numeric(x)));
  assert.equal(numeric('0'),0);assert.equal(numeric('-1.25'),-1.25);
});
test('official Canadian policy series rejects future and missing rates',()=>{
  const rows=parseCanadaPolicy({observations:[{d:'2026-10-29',V39079:{v:'2.5'}},
    {d:'2026-10-30',V39079:{v:null}},{d:'2026-10-31',V39079:{v:'999'}}]},options);
  assert.equal(rows[0].value,2.5);assert.equal(rows[0].known_at,at);
  assert.throws(()=>parseCanadaPolicy({observations:[{d:'2026-10-31',V39079:{v:'2'}}]},options));
});
test('BCB uses bounded reference dates and preserves the actual Selic target',()=>{
  const rows=parseBrazilPolicy([{data:'29/10/2026',valor:'13.5'},{data:'31/10/2026',valor:'0'},
    {data:'30/10/2026',valor:''},{data:'31/02/2026',valor:'123'}],options);
  assert.equal(rows[0].value,13.5);assert.equal(rows[0].variable,'BR_selic_target');
});
test('ECB validates the series identity and handles quoted CSV fields',()=>{
  const csv='KEY,TIME_PERIOD,OBS_VALUE,TITLE\r\nOTHER,2026-10-30,100,wrong\r\n'+
    'FM.D.U2.EUR.4F.KR.DFR.LEV,2026-10-29,2.5,"Deposit, facility"\r\n'+
    'FM.D.U2.EUR.4F.KR.DFR.LEV,2026-10-30,,missing\r\n';
  assert.equal(parseEcbPolicy(csv,options)[0].value,2.5);
});
test('TWSE converts ROC calendar and excludes a daily session before its close',()=>{
  const data=[{Date:'1151029',TAIEX:'25000',TradeVolume:'100',TradeValue:'200',Transaction:'30'},
    {Date:'1151030',TAIEX:'26000',TradeVolume:null,TradeValue:'300',Transaction:'40'}];
  const rows=parseTwse(data,{...options,capturedAt:'2026-10-30T05:00:00.000Z'});
  assert.equal(rows.length,4);assert.equal(rows[0].value,25000);
  assert.equal(rows[0].observed_at,'2026-10-29T05:30:00.000Z');
  assert.equal(parseTwse(data,options).length,3);
});
test('B3 public mover sample retains local clock and never becomes the whole market',()=>{
  const raw={BizSts:{cd:'OK'},Msg:{dtTm:'2026-10-30 12:59:00'},
    SctyHghstIncrLst:[{symb:'VALE3',SctyQtn:{curPrc:61,prcFlcn:0}}],
    SctyHghstDrpLst:[{symb:'VALE3',SctyQtn:{curPrc:61,prcFlcn:0}},{symb:'MISS3',SctyQtn:{curPrc:null,prcFlcn:null}}]};
  const rows=parseB3Public(raw,options);assert.equal(rows.length,2);
  assert.equal(rows[0].observed_at,'2026-10-30T15:59:00.000Z');
  assert.throws(()=>parseB3Public({...raw,Msg:{dtTm:'2026-10-30 13:01:00'}},options),/futura/);
});
test('MOEX daily index excludes the current unclosed candle',()=>{
  const raw={candles:{columns:['end','close'],data:[['2026-10-29 23:59:59',2500],['2026-10-30 23:59:59',9000]]}};
  const rows=parseMoexIndex(raw,options);assert.equal(rows[0].value,2500);
  assert.equal(rows[0].observed_at,'2026-10-29T20:59:59.000Z');
});
test('dated commodity contracts preserve expiry and reject expired, absent and future quotes',()=>{
  const raw={securities:{columns:['SECID','ASSETCODE','SHORTNAME','LASTTRADEDATE'],data:[
    ['BRX6','BR','BR-11.26','2026-11-02'],['BRV6','BR','BR-10.26','2026-10-01'],
    ['GDZ6','GOLD','GOLD-12.26','2026-12-17'],['NGX6','NG','NG-11.26','2026-11-25']]},
    marketdata:{columns:['SECID','LAST','SYSTIME'],data:[['BRX6',100,'2026-10-30 18:55:00'],
      ['BRV6',200,'2026-10-30 18:55:00'],['GDZ6',null,'2026-10-30 18:55:00'],['NGX6',3,'2026-10-30 19:01:00']]}};
  const result=parseMoexDatedFutures(raw,options);assert.equal(result.observations.length,1);
  assert.equal(result.contracts[0].contract_id,'BRX6');assert.equal(result.contracts[0].last_trade_date,'2026-11-02');
  assert.equal(result.contracts[0].continuous,false);assert.equal(result.contracts[0].unit_verified,false);
});
test('ALFRED vintage day cannot enter a retrospective snapshot at invented midnight',()=>{
  const version=parseFredInitialReleaseVersion({observations:[{date:'2026-09-01',realtime_start:'2026-10-30',value:'4.3'}]},
    {...options,series:'UNRATE',url:url+'?api_key=private-value'});
  assert.equal(version.vintage.vintage_date,'2026-10-30');
  assert.equal(version.vintage.publication_at,null);assert.equal(version.vintage.historical_intraday_eligible,false);
  assert.equal(version.observation.known_at,at);assert.ok(!JSON.stringify(version).includes('private-value'));
  const snapshot=universeSnapshot([version.observation],{cutoff:'2026-10-30T08:29:00.000Z'});
  assert.equal(snapshot.known_states,0);assert.equal(snapshot.withheld_future,1);
});
test('ALFRED authenticated request never exports API credentials',async()=>{
  let authenticated=0;
  const result=await fetchExactMacroVintages({now:()=>at,apiKey:'secret-test-value',fetchImpl:async request=>{
    assert.equal(new URL(request).searchParams.get('api_key'),'secret-test-value');authenticated++;
    return new Response(JSON.stringify({observations:[{date:'2026-09-01',realtime_start:'2026-10-01',value:'4.3'}]}));
  }});
  assert.equal(authenticated,6);assert.equal(result.vintages.length,6);
  assert.ok(!JSON.stringify(result).includes('secret-test-value'));
  assert.ok(result.sources.every(x=>x.exact_publication_time===false));
});
test('missing macro, port, electricity and weather values are never manufactured zeros',()=>{
  assert.equal(parseWorldBank([{},[{countryiso3code:'USA',date:'2026',value:null}]],{...options,indicator:'NY.GDP.MKTP.KD.ZG',economies:['USA']}).length,0);
  assert.equal(parsePortWatch({features:[{attributes:{date:'2026-10-29',portcalls_sum:null,import_sum:0}}]},options).length,1);
  const rows=parseWeather({current:{time:'2026-10-30T15:00',temperature_2m:null,precipitation:0}},
    {...options,grid:[{id:'cell',lat:0,lon:0}]});assert.equal(rows.length,1);assert.equal(rows[0].value,0);
});
test('NESO validates 46 and 50 period days using Europe/London time',()=>{
  const record=(day,period)=>({success:true,result:{records:[{SETTLEMENT_DATE:day,SETTLEMENT_PERIOD:period,FORECAST_ACTUAL_INDICATOR:'A',ND:0,TSD:null}]}});
  const rows=parseNeso(record('2026-07-01',1),options);assert.equal(rows.length,1);assert.equal(rows[0].observed_at,'2026-06-30T23:00:00.000Z');
  assert.throws(()=>parseNeso(record('2026-03-29',47),options),/periodo inexistente/);
  assert.equal(parseNeso(record('2026-10-25',50),options)[0].observed_at,'2026-10-25T23:30:00.000Z');
});
test('BIS and OpenSky discard missing numeric fields and null aircraft locations',()=>{
  assert.equal(parseBisPolicyCsv('FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE\nM,US,2026-09,\n', {...options,areas:['US']}).length,0);
  const rows=parseOpenSky({time:Date.parse(at)/1000,states:[[null,null,null,null,null,null,null,null,false,null]]},options);
  assert.equal(rows.find(x=>x.variable==='global_aircraft_visible').value,0);
  assert.ok(!rows.some(x=>x.variable==='global_airborne_mean_velocity'));
});
test('future weather and macro reference periods cannot contaminate a snapshot',()=>{
  assert.throws(()=>parseWeather({current:{time:'2026-10-30T16:15',temperature_2m:20}},
    {...options,grid:[{id:'cell',lat:0,lon:0}]}),/futuro/);
  assert.equal(parseWorldBank([{},[{countryiso3code:'USA',date:'2027',value:4}]],
    {...options,indicator:'NY.GDP.MKTP.KD.ZG',economies:['USA']}).length,0);
});
test('primary-source captures use response receipt time, archive hashes and isolate an HTTP failure',async()=>{
  let tick=Date.parse(at);const archived=[];
  const result=await fetchOfficialCentralBanks({now:()=>new Date(tick).toISOString(),fetchImpl:async request=>{
    tick+=1000;
    if(request.includes('bcb.gov.br'))return new Response('down',{status:503});
    if(request===OFFICIAL_URLS.canada)return new Response(JSON.stringify({observations:[{d:'2026-10-29',V39079:{v:'2.5'}}]}));
    return new Response('KEY,TIME_PERIOD,OBS_VALUE\nFM.D.U2.EUR.4F.KR.DFR.LEV,2026-10-29,2.5\n');
  },archiveResponse:async record=>{archived.push(record);return 'entradas/'+record.body_sha256+'.txt'}});
  assert.equal(result.observations.length,2);assert.equal(result.sources.filter(x=>x.status==='unavailable').length,1);
  assert.equal(archived.length,2);
  for(const a of archived)assert.equal(createHash('sha256').update(a.text).digest('hex'),a.body_sha256);
  assert.ok(result.observations.every(x=>x.known_at>at));
  assert.ok(result.sources.filter(x=>x.status==='observed').every(x=>x.raw_response_archived));
  assert.equal(encodeGlobalSnapshot(universeSnapshot(result.observations,{cutoff:result.captured_at})).records,2);
});
test('U003 integration reports absent groups accurately while retaining official states',async()=>{
  const result=await observeWorldU003({now:()=>at,timeoutMs:50,includeAir:false,fetchImpl:async request=>{
    if(request===OFFICIAL_URLS.canada)return new Response(JSON.stringify({observations:[{d:'2026-10-29',V39079:{v:'2.5'}}]}));
    return new Response('not available',{status:404});
  }});
  assert.equal(result.universal_state.known_states,1);
  assert.ok(result.coverage.groups.some(g=>g.group==='official_central_banks'&&g.status==='observed'));
  assert.ok(result.coverage.groups.filter(g=>g.signals===0).every(g=>g.status!=='observed'));
  assert.equal(result.availability_policy.exact_historical_publication_time,false);
});
