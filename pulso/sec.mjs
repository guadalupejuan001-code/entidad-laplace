/* Capturas SEC oficiales: EX-21 declara filiales; 13F declara posiciones. */
import {need,cik,hash} from './registro.mjs';
import {utcTime} from '../universo/estados.mjs';
export const INSTITUTIONS=Object.freeze([
  {cik:'0002012383',ticker:'BLK',name:'BlackRock, Inc.',aliases:['BlackRock']},
  {cik:'0000019617',ticker:'JPM',name:'JPMorgan Chase & Co.',aliases:['JPMorgan','JP Morgan','J.P. Morgan','jepi morgan']}
]);
export function plain(s){
  return String(s).replace(/<!--[^]*?-->/g,'').replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi,'')
    .replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{
      const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);
      return v>0&&v<=0x10ffff?String.fromCodePoint(v):' ';
    }).replace(/&(amp|nbsp|quot|apos|lt|gt);/g,(_,x)=>({amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>'}[x]))
    .replace(/\s+/g,' ').trim();
}
export function parseExhibit21(text){
  need(Buffer.byteLength(text)<=8_000_000,'EX-21 demasiado grande');
  need(/subsidiar/i.test(plain(text)),'EX-21 sin declaración de filiales');
  const rows=[],ignored=[];let index=0;
  for(const match of text.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)){
    const cells=[...match[1].matchAll(/<t[dh]\b[^>]*>([^]*?)<\/t[dh]>/gi)].map(m=>plain(m[1])).filter(Boolean);
    const row=index++;
    if(!cells.length)continue;
    if(cells.length!==2||/^(?:name|december|jurisdiction)/i.test(cells[0])){ignored.push({row,cells});continue}
    const [name,jurisdiction]=cells;
    need(name.length<500&&jurisdiction.length<160,'fila EX-21 inválida');
    rows.push({name,jurisdiction,row,evidence_sha256:hash(match[1])});
  }
  need(rows.length>0,'EX-21 sin filas reconocibles');
  const suspicious=ignored.filter(x=>x.cells.length>1&&!x.cells.some(c=>/name|jurisdiction|laws of|december/i.test(c)));
  need(suspicious.length===0,'EX-21 requiere revisar filas no reconocidas');
  return {rows,ignored,omissions_disclosed:/omitt|excluded|not significant/i.test(plain(text)),
    complete_control_tree:false,direct_parentage_verified:false};
}
function tag(xml,name,required=true){
  const r=new RegExp('<(?:[\\w.-]+:)?'+name+'(?:\\s[^>]*)?>([^]*?)<\\/(?:[\\w.-]+:)?'+name+'\\s*>','i').exec(xml);
  if(!r){need(!required,'13F sin '+name);return null}return plain(r[1]);
}
function integer(s,field){need(typeof s==='string'&&/^\d+$/.test(s),field+' no es entero no negativo');return BigInt(s)}
export function parse13F(text,cover){
  need(Buffer.byteLength(text)<=40_000_000,'13F excede 40 MB');
  need(!/<!DOCTYPE|<!ENTITY/i.test(text),'XML con DTD no permitido');
  const expected=Number(integer(tag(cover,'tableEntryTotal'),'tableEntryTotal'));
  const valueExpected=integer(tag(cover,'tableValueTotal'),'tableValueTotal');
  const groups=new Map();let rows=0,total=0n;
  for(const m of text.matchAll(/<(?:[\w.-]+:)?infoTable\b[^>]*>([^]*?)<\/(?:[\w.-]+:)?infoTable\s*>/gi)){
    const b=m[1],name=tag(b,'nameOfIssuer'),title=tag(b,'titleOfClass'),cusip=tag(b,'cusip').toUpperCase();
    need(/^[A-Z0-9*@#]{9}$/.test(cusip),'CUSIP inválido en fila '+rows);
    const value=integer(tag(b,'value'),'value'),shares=integer(tag(b,'sshPrnamt'),'shares');
    const shareType=tag(b,'sshPrnamtType'),putCall=tag(b,'putCall',false)??null;
    need(['SH','PRN'].includes(shareType)&&[null,'Put','Call','PUT','CALL'].includes(putCall),'tipo de posición inválido');
    const key=JSON.stringify([name,cusip,title,putCall,shareType]);
    const g=groups.get(key)??{name,cusip,title,put_call:putCall,share_type:shareType,
      reported_value:'0',reported_quantity:'0',raw_rows:0,first_row:rows,last_row:rows,
      investment_discretion:[],other_managers:[],voting:{sole:'0',shared:'0',none:'0'}};
    g.reported_value=(BigInt(g.reported_value)+value).toString();
    g.reported_quantity=(BigInt(g.reported_quantity)+shares).toString();g.raw_rows++;g.last_row=rows;
    const d=tag(b,'investmentDiscretion'),manager=tag(b,'otherManager',false);
    g.investment_discretion=[...new Set([...g.investment_discretion,d])].sort();
    if(manager)g.other_managers=[...new Set([...g.other_managers,manager])].sort();
    const voting=tag(b,'votingAuthority');
    // Extract from the original block: plain() intentionally removes XML tags.
    need(voting!==null,'13F sin votingAuthority');
    for(const [key,t]of [['sole','Sole'],['shared','Shared'],['none','None']])
      g.voting[key]=(BigInt(g.voting[key])+integer(tag(b,t),t)).toString();
    groups.set(key,g);rows++;total+=value;
  }
  need(rows===expected,'filas 13F no coinciden con portada: '+rows+' / '+expected);
  need(total===valueExpected,'valor 13F no coincide con portada: '+total+' / '+valueExpected);
  need(rows>0,'13F vacío');
  return {positions:[...groups.values()],raw_rows:rows,reported_value:total.toString(),
    value_unit:'USD_as_reported_no_multiplier',ownership_percentage:null,control_inferred:false,
    confidential_omissions:tag(cover,'isConfidentialOmitted',false),
    amendment_type:tag(cover,'amendmentType',false)};
}
export function recentFilings(submission,form,cutoff){
  const r=submission?.filings?.recent;need(Array.isArray(r?.form),'submissions SEC inválido');
  const time=utcTime(cutoff);
  return r.form.flatMap((f,i)=>{
    if(f!==form)return [];
    const acceptance=utcTime(r.acceptanceDateTime[i]);if(acceptance>time)return [];
    const accession=r.accessionNumber[i],report_date=r.reportDate[i];
    need(/^\d{10}-\d{2}-\d{6}$/.test(accession)&&/^\d{4}-\d{2}-\d{2}$/.test(report_date),'metadatos SEC inválidos');
    need(utcTime(report_date+'T00:00:00Z')<=acceptance,'periodo SEC futuro');
    return [{form:f,accession,report_date,accepted_at:acceptance}];
  }).sort((a,b)=>b.report_date.localeCompare(a.report_date)||b.accepted_at.localeCompare(a.accepted_at));
}
export function archiveBase(institution,filing){
  return 'https://www.sec.gov/Archives/edgar/data/'+Number(cik(institution.cik))+'/'+filing.accession.replace(/-/g,'')+'/';
}
export async function fetchSECText(url,{maxBytes=40_000_000,timeoutMs=60000,userAgent,fetchImpl=fetch}={}){
  const u=new URL(url);need(u.protocol==='https:'&&['www.sec.gov','data.sec.gov'].includes(u.hostname),'URL SEC no permitida');
  need(typeof userAgent==='string'&&userAgent.length>=12,'SEC requiere User-Agent identificable');
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),redirect:'error',
    headers:{'User-Agent':userAgent,Accept:'application/json, text/html, application/xml'}});
  need(response.ok,'SEC HTTP '+response.status);
  const chunks=[];let size=0;
  for await(const part of response.body){size+=part.byteLength;need(size<=maxBytes,'respuesta SEC excede presupuesto');chunks.push(Buffer.from(part))}
  return {url,text:Buffer.concat(chunks).toString('utf8'),received_at:new Date().toISOString()};
}
export async function collectInstitutionSources({fetchText=fetchSECText,userAgent,institutions=INSTITUTIONS}={}){
  const sources={},bundles=[],status=[];
  const get=async(url,key)=>{
    await new Promise(done=>setTimeout(done,150));
    const raw=await fetchText(url,{userAgent});sources[key]=raw;return raw;
  };
  const tickers=await get('https://www.sec.gov/files/company_tickers.json','tickers');
  for(const institution of institutions){
    try{
      const key=institution.ticker,submission=await get('https://data.sec.gov/submissions/CIK'+institution.cik+'.json',key+'-submission');
      const s=JSON.parse(submission.text);need(cik(s.cik)===institution.cik&&s.tickers.includes(key),'identidad institucional no coincide');
      const annual=recentFilings(s,'10-K',submission.received_at)[0],holding=recentFilings(s,'13F-HR',submission.received_at)[0];
      need(annual&&holding,'submissions reciente sin 10-K / 13F; revisar archivos históricos');
      const parts={};
      for(const [kind,filing]of [['subsidiaries',annual],['holdings',holding]]){
        const base=archiveBase(institution,filing),idx=await get(base+'index.json',key+'-'+kind+'-index');
        const files=JSON.parse(idx.text).directory.item.map(x=>x.name);
        const matches=files.filter(n=>kind==='subsidiaries'?/ex(?:hibit)?[-_]?21(?=[_.-]|$).*\.htm[l]?$/i.test(n):/\.xml$/i.test(n)&&n!=='primary_doc.xml'&&!/FilingSummary/i.test(n));
        need(matches.length===1,'documento SEC ambiguo: '+key+' '+kind);
        const document=await get(base+encodeURIComponent(matches[0]),key+'-'+kind);
        const cover=kind==='holdings'?await get(base+'primary_doc.xml',key+'-cover'):null;
        const amendments=recentFilings(s,kind==='holdings'?'13F-HR/A':'10-K/A',submission.received_at).filter(x=>x.report_date===filing.report_date);
        parts[kind]={filing,document,cover,unresolved_amendments:amendments};
      }
      bundles.push({institution,submission,tickers,...parts});status.push({ticker:key,status:'captured'});
    }catch(error){status.push({ticker:institution.ticker,status:'unavailable',reason:error.message})}
  }
  return {bundles,sources,status};
}
