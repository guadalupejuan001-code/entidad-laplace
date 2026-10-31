/* C001: capture only the publicly disseminated SEC N-PORT-P XML of
 * explicitly identified registered funds. Derive QUARTER aggregate share
 * sales/redemptions from filed fundInfo.mon1Flow..mon3Flow (Item B.6).
 * No daily ETF creation, NAV/share or share-count reconstruction.
 */
import {createHash} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {observation,utcTime} from '../estados.mjs';
import {NPORT_FUNDS,C001_SCHEMA,C001_LIMITS} from './catalogo.mjs';
const need=(yes,msg)=>{if(!yes)throw Error(msg)};
const hash=s=>createHash('sha256').update(s).digest('hex');
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ACCESSION=/^\d{10}-\d{2}-\d{6}$/;
const allowedFunds=new Map(NPORT_FUNDS.map(f=>[f.id,f]));
const MAX_CENTS=BigInt(Number.MAX_SAFE_INTEGER);
function date(s){
  need(typeof s==='string'&&DATE.test(s),'SEC fecha inválida');
  const ms=Date.parse(s+'T00:00:00.000Z');
  need(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s,'SEC fecha imposible');
  return s;
}
function toUTC(s){
  need(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s),
    'SEC fecha UTC requerida');
  return utcTime(s);
}
function approvedFund(fund){
  need(fund&&allowedFunds.get(fund.id)===fund,'Fondo SEC fuera del catálogo autorizado');
  return fund;
}
function verifiedAddress(url){
  const u=new URL(url);
  need(u.protocol==='https:'&&
    ['data.sec.gov','www.sec.gov'].includes(u.hostname)&&!u.username&&!u.password&&
    !u.hash&&!u.search,'SEC recurso no autorizado');
  if(u.hostname==='data.sec.gov')need(/^\/submissions\/CIK\d{10}\.json$/.test(u.pathname),
    'SEC submissions URL no registrada');
  else need(/^\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/(?:index\.json|[A-Za-z0-9_-]{1,90}\.xml)$/.test(u.pathname),
    'SEC archivo fuera del alcance N-PORT');
  return u.toString();
}
export function secSubmissionsUrl(fund){
  approvedFund(fund);return verifiedAddress('https://data.sec.gov/submissions/CIK'+fund.cik+'.json');
}
function archivePath(fund,accession){
  approvedFund(fund);
  need(typeof accession==='string'&&ACCESSION.test(accession),'Accession SEC inválido');
  return 'https://www.sec.gov/Archives/edgar/data/'+BigInt(fund.cik).toString()+'/'+
    accession.replace(/-/g,'')+'/';
}
export function secArchiveUrl(fund,accession,file){
  need(typeof file==='string'&&/^(?:index\.json|[A-Za-z0-9_-]{1,90}\.xml)$/.test(file),
    'SEC solo acepta documentos XML públicos o index.json');
  return verifiedAddress(archivePath(fund,accession)+file);
}
function acceptedTime(raw){
  need(typeof raw==='string','SEC acceptance timestamp ausente');
  return toUTC(raw.endsWith('Z')?raw:raw+'Z'); // EDGAR metadata UTC naive time.
}
export function selectPublicNport(submissions,{fund,cutoff}){
  approvedFund(fund);
  const asOf=toUTC(cutoff),recent=submissions?.filings?.recent;
  need(recent&&typeof recent==='object'&&Array.isArray(recent.form)&&
    recent.form.length<=C001_LIMITS.maxRecentFilings,'SEC submissions sin catálogo recent');
  const fields=['accessionNumber','filingDate','reportDate','acceptanceDateTime','primaryDocument'];
  need(fields.every(k=>Array.isArray(recent[k])&&recent[k].length===recent.form.length),
    'SEC submissions columnas incompletas');
  // CIK of SEC-submissions JSON is required to match our explicit fund identity.
  need(/^\d{1,10}$/.test(String(submissions.cik??''))&&
    BigInt(String(submissions.cik))===BigInt(fund.cik),'SEC submissions de otro registrante');
  const eligible=[];
  for(let i=0;i<recent.form.length;i++){
    if(!['NPORT-P','NPORT-P/A'].includes(recent.form[i]))continue;
    const accession=recent.accessionNumber[i],filed=date(recent.filingDate[i]),
      report=date(recent.reportDate[i]),accepted=acceptedTime(recent.acceptanceDateTime[i]);
    if(accepted>asOf||filed+'T00:00:00.000Z'>asOf)continue;
    need(report+'T00:00:00.000Z'<=accepted,'SEC fecha de reporte futura');
    const file=recent.primaryDocument[i];
    need(typeof file==='string'&&file.length>0&&file.length<=120,'SEC primaryDocument inválido');
    eligible.push({form:recent.form[i],accession,filed_date:filed,
      report_date:report,accepted_at:accepted,primary_document:file});
  }
  eligible.sort((a,b)=>b.report_date.localeCompare(a.report_date)||
    b.accepted_at.localeCompare(a.accepted_at)||
    b.accession.localeCompare(a.accession));
  return {fund_id:fund.id,selected:eligible[0]??null,other_public_filings:eligible.length,
    availability_basis:'SEC acceptance time + first-seen by Laplace; not historical redisclosure'};
}
export function pickXmlFromIndex(index,{fund,accession}){
  const directory=index?.directory,items=directory?.item;
  need(Array.isArray(items)&&items.length<=1000,'SEC index.json sin lista de documentos');
  const candidates=items.filter(x=>typeof x.name==='string'&&
    /(?:^primary_doc\.xml$|^nport[^\/]{0,60}\.xml$)/i.test(x.name));
  need(candidates.length===1,'SEC index no contiene un XML N-PORT único; abstenerse');
  return secArchiveUrl(fund,accession,candidates[0].name);
}
function roundedCents(raw,label,{allowNegative=false}={}){
  const s=String(raw);
  need(typeof raw==='string'&&s.length<=42&&/^-?(?:0|[1-9]\d*)(?:\.\d{1,24})?$/.test(s),
    'SEC importe '+label+' inválido');
  const negative=s[0]==='-';
  need(!negative||allowNegative,'SEC importe '+label+' negativo no permitido');
  const abs=negative?s.slice(1):s,parts=abs.split('.'),frac=parts[1]??'';
  let cents=BigInt(parts[0])*100n+BigInt((frac+'00').slice(0,2));
  if((frac[2]??'0')>='5')cents++;
  need(cents<=MAX_CENTS,'SEC '+label+' excede presupuesto monetario exacto');
  return negative?-cents:cents;
}
function usd(cents){
  need(cents<=MAX_CENTS&&cents>=-MAX_CENTS,'SEC suma monetaria fuera de precisión');
  return Number(cents)/100;
}
function child(obj,name){
  need(obj&&typeof obj==='object'&&!Array.isArray(obj),'SEC estructura '+name+' ausente');
  const val=obj[name];
  need(val!==undefined&&val!==null&&!Array.isArray(val),'SEC campo '+name+' no único');
  return val;
}
function flowTag(info,slot){
  const data=child(info,'mon'+slot+'Flow');
  need(data&&typeof data==='object'&&!Array.isArray(data),'SEC mon'+slot+'Flow no disponible');
  return {
    sales:roundedCents(data['@_sales'],'sales'),
    reinvestment:roundedCents(data['@_reinvestment'],'reinvestment'),
    redemption_signed:roundedCents(data['@_redemption'],'redemption',{allowNegative:true})
  };
}
export function parsePublicNport(xml,{fund,filing,knownAt,sourceUrl}={}){
  approvedFund(fund);
  need(filing&&ACCESSION.test(filing.accession)&&
    ['NPORT-P','NPORT-P/A'].includes(filing.form),'SEC filing no público');
  need(sourceUrl===secArchiveUrl(fund,filing.accession,sourceUrl.split('/').at(-1)),
    'SEC documento no corresponde al registrante/accesión');
  const known=toUTC(knownAt),accepted=toUTC(filing.accepted_at);
  need(known>=accepted,'SEC captura anterior a aceptación pública');
  need(typeof xml==='string'&&Buffer.byteLength(xml)<=C001_LIMITS.maxXmlBytes&&
    !/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml),'SEC XML inseguro o excesivo');
  const valid=XMLValidator.validate(xml);
  need(valid===true,'SEC XML estructuralmente inválido');
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',
    removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,
    processEntities:false,ignoreDeclaration:true});
  const root=parser.parse(xml);
  const edgar=child(root,'edgarSubmission'),form=child(edgar,'formData'),
    info=child(form,'genInfo'),fundInfo=child(form,'fundInfo');
  const cik=String(child(info,'regCik')).trim();
  need(/^\d{1,10}$/.test(cik)&&BigInt(cik)===BigInt(fund.cik),
    'SEC CIK del XML distinto al catálogo');
  const series=String(info.seriesId??'').trim();
  need(fund.series_id===null?!series:series===fund.series_id,
    'SEC serie distinta al ETF solicitado');
  const period=date(String(child(info,'repPdDate')));
  need(period===filing.report_date,'SEC XML periodo distinto al metadata de EDGAR');
  const total=roundedCents(String(child(fundInfo,'totAssets')),'totalAssets'),
    liability=roundedCents(String(child(fundInfo,'totLiabs')),'liabilities'),
    net=roundedCents(String(child(fundInfo,'netAssets')),'netAssets');
  need(total>=0&&liability>=0&&net>=0&&
    (total-liability-net<=2n)&&(total-liability-net>=-2n),
    'SEC activos, pasivos y patrimonio no concilian');
  const flows=[1,2,3].map(s=>flowTag(fundInfo,s));
  const positive=flows.filter(f=>f.redemption_signed>0n).length,
    negative=flows.filter(f=>f.redemption_signed<0n).length;
  need(!(positive&&negative),'SEC signos de redención inconsistentes; revisión manual');
  const flowRows=flows.map((f,i)=>({
    reported_slot:i+1,
    sales_usd:usd(f.sales),
    reinvestment_usd:usd(f.reinvestment),
    redemption_magnitude_usd:usd(f.redemption_signed<0n?-f.redemption_signed:f.redemption_signed),
    redemptions_reported_negative:f.redemption_signed<0n,
    calendar_month_inferred:false
  }));
  const sales=flows.reduce((a,x)=>a+x.sales,0n),
    reinvest=flows.reduce((a,x)=>a+x.reinvestment,0n),
    redemption=flows.reduce((a,x)=>a+(x.redemption_signed<0n?-x.redemption_signed:x.redemption_signed),0n),
    excluding=sales-redemption,including=excluding+reinvest;
  const values={
    total_assets_usd:total,total_liabilities_usd:liability,net_assets_usd:net,
    reported_quarter_sales_usd:sales,reported_quarter_redemptions_usd:redemption,
    reported_quarter_reinvestment_usd:reinvest,
    reported_quarter_net_ex_reinvestment_usd:excluding,
    reported_quarter_net_including_reinvestment_usd:including
  };
  const observationAt=period+'T00:00:00.000Z';
  need(observationAt<=known,'SEC periodo futuro');
  const observations=Object.entries(values).map(([metric,cents])=>observation({
    id:'c001-'+fund.id+'-'+period+'-'+filing.accession+'-'+metric,
    domain:'flujos_fondos_sec_nport',variable:'C001_'+fund.id+'_'+metric,
    value:usd(cents),unit:'USD',observed_at:observationAt,known_at:known,
    source_url:sourceUrl
  }));
  return {
    schema:C001_SCHEMA,fund_id:fund.id,registrant_cik:fund.cik,series_id:fund.series_id,
    form:filing.form,accession:filing.accession,report_period:period,
    filing_accepted_at:accepted,known_at:known,source_url:sourceUrl,
    source_sha256:hash(xml),observations,reported_month_slots:flowRows,
    monetary_storage:'rounded_to_nearest_cent_in_bigint_before_arithmetic',
    redemption_normalization:negative?'negative_reported_magnitudes':'nonnegative_reported_magnitudes',
    fund_flow_semantics:'As-filed N-PORT B.6 fund share sales/redemptions; not verified daily ETF creation units',
    nav_per_share_available:false,shares_outstanding_available:false,
    monthly_slot_dates_inferred:false,etf_creation_redemption_daily:false,
    financial_advantage_demonstrated:false,prediction_inputs_enabled:false,
    automatic_trading:false
  };
}
export async function fetchSecText(url,{fetchImpl=fetch,userAgent,
  timeoutMs=12000,maxBytes=4_000_000,now=()=>new Date().toISOString()}={}){
  verifiedAddress(url);
  need(typeof userAgent==='string'&&userAgent.length>=12&&
    !/^(?:node|laplace|bot|test)(?:\/|\s|$)/i.test(userAgent),
    'SEC_USER_AGENT identificable obligatorio, sin datos inventados');
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),redirect:'error',
    cache:'no-store',headers:{'User-Agent':userAgent,Accept:'application/json,application/xml,text/xml',
      'Accept-Encoding':'gzip, deflate'}});
  need(response?.ok,'SEC HTTP '+(response?.status??'sin_respuesta'));
  const length=Number(response.headers?.get?.('content-length')??0);
  need(!length||length<=maxBytes,'SEC cuerpo anunciado demasiado grande');
  if(!response.body?.getReader){
    const raw=await response.text();
    need(Buffer.byteLength(raw)<=maxBytes,'SEC respuesta excesiva');
    return {raw,sha256:hash(raw),received_at:utcTime(now()),url};
  }
  const reader=response.body.getReader(),buffers=[];let bytes=0;
  try{for(;;){
    const p=await reader.read();if(p.done)break;
    bytes+=p.value.byteLength;need(bytes<=maxBytes,'SEC respuesta excesiva');
    buffers.push(Buffer.from(p.value));
  }}catch(error){await reader.cancel().catch(()=>{});throw error}
  const raw=Buffer.concat(buffers).toString('utf8');
  return {raw,sha256:hash(raw),received_at:utcTime(now()),url};
}
