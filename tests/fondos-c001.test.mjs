import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NPORT_FUNDS,TRUSTS_NOT_COVERED_BY_NPORT} from '../universo/fondos/catalogo.mjs';
import {secSubmissionsUrl,secArchiveUrl,selectPublicNport,pickXmlFromIndex,
  parsePublicNport,fetchSecText} from '../universo/fondos/sec-nport.mjs';
import {observeEtfNport} from '../universo/fondos/global.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
const [SPY,SPYM]=NPORT_FUNDS,cut='2026-10-31T04:00:00.000Z';
const accepted='2026-08-28T12:25:47.000Z',report='2026-06-30';
const acc='0001410368-26-089410',amended='0001410368-26-089500';
const spymAcc='0001410368-26-089197';
const filing=(fund,accession=acc,form='NPORT-P')=>({form,accession,filed_date:'2026-08-28',
  report_date:report,accepted_at:accepted,primary_document:'primary_doc.xml'});
const xml=(fund,redemptions=[100,200,300],overrides={})=>{
  const {cik=fund.cik,series=fund.series_id,period=report,assets='1000.000',
    liabs='50.000',net='950.000',sales=[500,600,700],reinvestment=[10,20,30]}=overrides;
  return ['<?xml version="1.0" encoding="UTF-8"?>','<edgarSubmission><headerData><filerInfo/></headerData>',
    '<formData><genInfo><regCik>'+cik+'</regCik>',series===null?'':'<seriesId>'+series+'</seriesId>',
    '<repPdDate>'+period+'</repPdDate><repPdEnd>2026-09-30</repPdEnd></genInfo>',
    '<fundInfo><totAssets>'+assets+'</totAssets><totLiabs>'+liabs+'</totLiabs>',
    '<netAssets>'+net+'</netAssets>',...redemptions.map((r,i)=>'<mon'+(i+1)+'Flow sales="'+sales[i]+
      '" reinvestment="'+reinvestment[i]+'" redemption="'+r+'"/>'),
    '</fundInfo></formData></edgarSubmission>'].join('');
};
function submissions(fund,{amend=false,primary='primary_doc.xml',future=false}={}){
  const forms=['NPORT-P',...(amend?['NPORT-P/A']:[]),...(future?['NPORT-P']:[])];
  const accs=[fund===SPY?acc:spymAcc,...(amend?[amended]:[]),
    ...(future?['0001410368-26-089999']:[])];
  return {cik:String(Number(fund.cik)),filings:{recent:{
    form:forms,accessionNumber:accs,
    filingDate:forms.map((_,i)=>future&&i===forms.length-1?'2026-12-01':'2026-08-28'),
    reportDate:forms.map((_,i)=>future&&i===forms.length-1?'2026-09-30':report),
    acceptanceDateTime:forms.map((_,i)=>future&&i===forms.length-1?'2026-12-01T12:00:00.000Z':
      amend&&i===1?'2026-09-02T14:25:47.000Z':accepted),
    primaryDocument:forms.map(()=>primary)
  }}};
}
const respond=(data,status=200)=>new Response(typeof data==='string'?data:JSON.stringify(data),{status});
const sourceUrl=(fund,accession)=>secArchiveUrl(fund,accession,'primary_doc.xml');

test('C001 01: catálogo explícito SPY/SPYM no infiere IBIT como NPORT',()=>{
  assert.deepEqual(NPORT_FUNDS.map(x=>x.id),['SPY','SPYM']);
  assert.ok(TRUSTS_NOT_COVERED_BY_NPORT.includes('IBIT'));
  assert.equal(secSubmissionsUrl(SPY),'https://data.sec.gov/submissions/CIK0000884394.json');
  assert.equal(sourceUrl(SPY,acc),
    'https://www.sec.gov/Archives/edgar/data/884394/000141036826089410/primary_doc.xml');
});
test('C001 02: enmienda reciente, fecha futura rechazada y sin duplicación',()=>{
  const list=selectPublicNport(submissions(SPY,{amend:true,future:true}),
    {fund:SPY,cutoff:cut});
  assert.equal(list.selected.form,'NPORT-P/A');
  assert.equal(list.selected.accession,amended);
  assert.equal(list.other_public_filings,2);
  assert.equal(selectPublicNport(submissions(SPY,{future:true}),{
    fund:SPY,cutoff:'2026-01-01T00:00:00.000Z'}).selected,null);
  assert.throws(()=>selectPublicNport({...submissions(SPY),cik:'9999999'},
    {fund:SPY,cutoff:cut}),/registrante/);
});
test('C001 03: índice SEC debe identificar XML único y bloquear paths arbitrarios',()=>{
  const url=pickXmlFromIndex({directory:{item:[
    {name:'primary_doc.html'},{name:'primary_doc.xml'},{name:'other.txt'}
  ]}},{fund:SPYM,accession:spymAcc});
  assert.equal(url,sourceUrl(SPYM,spymAcc));
  assert.throws(()=>pickXmlFromIndex({directory:{item:[
    {name:'primary_doc.xml'},{name:'nport2.xml'}
  ]}},{fund:SPYM,accession:spymAcc}),/único/);
  assert.throws(()=>secArchiveUrl(SPY,acc,'../../bad.xml'),/solo acepta/);
});
test('C001 04: NPORT-P validado produce 8 estados de ventas, rescates y fondos',()=>{
  const p=parsePublicNport(xml(SPY),{fund:SPY,filing:filing(SPY),
    knownAt:cut,sourceUrl:sourceUrl(SPY,acc)});
  assert.equal(p.observations.length,8);
  assert.equal(p.observations.find(x=>x.variable==='C001_SPY_reported_quarter_sales_usd').value,1800);
  assert.equal(p.observations.find(x=>x.variable==='C001_SPY_reported_quarter_redemptions_usd').value,600);
  assert.equal(p.observations.find(x=>x.variable==='C001_SPY_reported_quarter_net_ex_reinvestment_usd').value,1200);
  assert.equal(p.observations.find(x=>x.variable==='C001_SPY_reported_quarter_net_including_reinvestment_usd').value,1260);
  assert.equal(p.observations.find(x=>x.variable==='C001_SPY_net_assets_usd').value,950);
  assert.ok(p.observations.every(x=>x.known_at===cut));
  assert.equal(p.etf_creation_redemption_daily,false);
  assert.equal(p.nav_per_share_available,false);
  assert.equal(p.monthly_slot_dates_inferred,false);
});
test('C001 05: redenciones negativas históricas normalizadas; mezcla rechazada',()=>{
  const p=parsePublicNport(xml(SPY,[-100,-200,-300]),{
    fund:SPY,filing:filing(SPY),knownAt:cut,sourceUrl:sourceUrl(SPY,acc)});
  assert.equal(p.redemption_normalization,'negative_reported_magnitudes');
  assert.equal(p.observations.find(x=>x.variable.endsWith('_quarter_net_ex_reinvestment_usd')).value,1200);
  assert.ok(p.reported_month_slots.every(x=>x.redemptions_reported_negative));
  assert.throws(()=>parsePublicNport(xml(SPY,[-100,200,300]),{
    fund:SPY,filing:filing(SPY),knownAt:cut,sourceUrl:sourceUrl(SPY,acc)}),/inconsistentes/);
});
test('C001 06: redondea a centavos antes de agregar cifras exactas',()=>{
  const p=parsePublicNport(xml(SPY,[100,200,300],{
    sales:['500.005','600.005','700.005'],reinvestment:['0','0','0'],
    assets:'1000.0058',liabs:'50.0058',net:'950.00'
  }),{fund:SPY,filing:filing(SPY),knownAt:cut,sourceUrl:sourceUrl(SPY,acc)});
  assert.equal(p.observations.find(x=>x.variable.endsWith('_quarter_sales_usd')).value,1800.03);
  assert.equal(p.observations.find(x=>x.variable.endsWith('_net_assets_usd')).value,950);
});
test('C001 07: CIK, serie, periodo y activos/pasivos deben concordar',()=>{
  const kw={fund:SPYM,filing:filing(SPYM,spymAcc),knownAt:cut,sourceUrl:sourceUrl(SPYM,spymAcc)};
  assert.throws(()=>parsePublicNport(xml(SPYM,[100,200,300],{series:'S000000000'}),kw),/serie/);
  assert.throws(()=>parsePublicNport(xml(SPYM,[100,200,300],{cik:'0000000001'}),kw),/CIK/);
  assert.throws(()=>parsePublicNport(xml(SPYM,[100,200,300],{period:'2026-03-31'}),kw),/periodo/);
  assert.throws(()=>parsePublicNport(xml(SPYM,[100,200,300],{net:'400'}),kw),/concilian/);
});
test('C001 08: DTD, XML roto y destinos SEC distintos están bloqueados',()=>{
  const kw={fund:SPY,filing:filing(SPY),knownAt:cut,sourceUrl:sourceUrl(SPY,acc)};
  assert.throws(()=>parsePublicNport('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml(SPY),kw),/inseguro/);
  assert.throws(()=>parsePublicNport('<edgarSubmission><formData>',kw),/estructuralmente/);
  assert.throws(()=>parsePublicNport(xml(SPY),{...kw,sourceUrl:'https://bad.example/file.xml'}),/autorizado|SEC/);
});
test('C001 09: corte temporal impide fugas retrospectivas',()=>{
  const p=parsePublicNport(xml(SPY),{fund:SPY,filing:filing(SPY),
    knownAt:cut,sourceUrl:sourceUrl(SPY,acc)});
  assert.equal(universeSnapshot(p.observations,{cutoff:'2026-07-01T00:00:00.000Z'}).known_states,0);
  assert.equal(universeSnapshot(p.observations,{cutoff:cut}).known_states,8);
  assert.throws(()=>parsePublicNport(xml(SPY),{fund:SPY,filing:filing(SPY),
    knownAt:'2026-08-27T00:00:00.000Z',sourceUrl:sourceUrl(SPY,acc)}),/anterior/);
});
test('C001 10: ausencia de SEC_USER_AGENT no consulta ni inventa datos',async()=>{
  let requests=0;
  const report=await observeEtfNport({userAgent:'',now:()=>cut,fetchImpl:async()=>{
    requests++;throw Error('never');
  }});
  assert.equal(requests,0);
  assert.equal(report.coverage.signals,0);
  assert.equal(report.collection_status,'requires_identifiable_sec_user_agent');
  assert.ok(report.sources.every(x=>x.status==='requires_contact'));
});
test('C001 11: URLs externas, User-Agent genérico y respuestas gigantes rechazados',async()=>{
  await assert.rejects(()=>fetchSecText('https://bad.example/a.xml',{
    userAgent:'Researcher contact@example.org',fetchImpl:async()=>respond('x')}),/no autorizado/);
  await assert.rejects(()=>fetchSecText(secSubmissionsUrl(SPY),{
    userAgent:'Laplace/1.0',fetchImpl:async()=>respond('x')}),/identificable/);
  await assert.rejects(()=>fetchSecText(secSubmissionsUrl(SPY),{
    userAgent:'Researcher WithoutEmail',fetchImpl:async()=>respond('x')}),/identificable/);
  await assert.rejects(()=>fetchSecText(secSubmissionsUrl(SPY),{
    userAgent:'Researcher contact@example.org',maxBytes:2,now:()=>cut,fetchImpl:async()=>respond('excess')}),/excesiva/);
});
test('C001 12: SPY/SPYM consulta en paralelo, revisiones e índice XML',async()=>{
  const requested=[];
  const route=url=>{
    requested.push(url);
    if(url===secSubmissionsUrl(SPY))return respond(submissions(SPY,{amend:true}));
    if(url===secSubmissionsUrl(SPYM))return respond(submissions(SPYM,{primary:'primary_doc.html'}));
    if(url===secArchiveUrl(SPYM,spymAcc,'index.json'))return respond({directory:{item:[
      {name:'primary_doc.html'},{name:'primary_doc.xml'}]}});
    if(url===sourceUrl(SPY,amended))return respond(xml(SPY));
    if(url===sourceUrl(SPYM,spymAcc))return respond(xml(SPYM));
    throw Error('Unexpected SEC URL '+url);
  };
  const p=await observeEtfNport({now:()=>cut,userAgent:'Researcher contact@example.org',
    fetchImpl:async url=>route(url)});
  assert.equal(p.collection_status,'observed');
  assert.equal(p.coverage.signals,16);
  assert.equal(p.coverage.funds_observed,2);
  assert.equal(p.filings.find(x=>x.fund_id==='SPY').form,'NPORT-P/A');
  assert.equal(p.filings.find(x=>x.fund_id==='SPYM').series_id,'S000006983');
  assert.ok(p.observations.every(x=>x.known_at===cut));
  assert.equal(p.prediction_inputs_enabled,false);
  assert.equal(p.automatic_trading,false);
  assert.equal(p.etf_daily_creations_observed,false);
  assert.equal(requested.filter(x=>x===secArchiveUrl(SPYM,spymAcc,'index.json')).length,1);
});
test('C001 13: fallo SEC de un fondo no invalida el otro ni crea ceros',async()=>{
  const p=await observeEtfNport({now:()=>cut,userAgent:'Researcher contact@example.org',
    fetchImpl:async url=>{
      if(url===secSubmissionsUrl(SPY))return respond(submissions(SPY));
      if(url===sourceUrl(SPY,acc))return respond(xml(SPY));
      if(url===secSubmissionsUrl(SPYM))return respond('Forbidden',403);
      throw Error('Unexpected URL '+url);
    }});
  assert.equal(p.coverage.funds_observed,1);
  assert.equal(p.observations.length,8);
  assert.equal(p.sources.find(x=>x.name==='SEC-NPORT-SPYM').status,'unavailable');
  assert.equal(p.sources.find(x=>x.name==='SEC-NPORT-SPYM').missing_is_zero,false);
});
test('C001 14: U003 solo recibe C001 si se habilita expresamente',()=>{
  const source=readFileSync(new URL('../universo/global-u003.mjs',import.meta.url),'utf8');
  assert.match(source,/LAPLACE_C001_ENABLED==='true'/);
  assert.match(source,/if\(includeEtfFunds\)/);
});
