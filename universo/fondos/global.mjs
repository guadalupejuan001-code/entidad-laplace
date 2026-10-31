/* C001-A: public SEC N-PORT-P ingestion for SPY and SPYM (not IBIT).
 * SEC filings.recent identifies form/accession/acceptance. The archive index
 * verifies XML existence if primaryDocument is HTML; never guess a URL.
 * No browsing of nonpublic or confidential filings; no trading.
 */
import {utcTime} from '../estados.mjs';
import {NPORT_FUNDS,C001_SCHEMA,C001_LIMITS,TRUSTS_NOT_COVERED_BY_NPORT} from './catalogo.mjs';
import {secSubmissionsUrl,secArchiveUrl,selectPublicNport,pickXmlFromIndex,
  parsePublicNport,fetchSecText} from './sec-nport.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};

export async function observeEtfNport({
  funds=NPORT_FUNDS,fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=12000,userAgent=process.env.SEC_USER_AGENT,
  archiveResponse
}={}){
  need(Array.isArray(funds)&&funds.length>=1&&funds.length<=C001_LIMITS.maxFunds&&
    new Set(funds).size===funds.length&&funds.every(f=>NPORT_FUNDS.includes(f)),
    'C001 fondos fuera del catálogo o duplicados');
  const started=utcTime(now());
  if(typeof userAgent!=='string'||userAgent.length<12||/^(?:node|laplace|bot|test)(?:\/|\s|$)/i.test(userAgent)){
    const sources=funds.map(f=>({name:'SEC-NPORT-'+f.id,status:'requires_contact',
      url:secSubmissionsUrl(f),reason:'Configure SEC_USER_AGENT identificable con contacto real en el entorno del servidor',
      signals:0,missing_is_zero:false,first_seen_at:started}));
    return {
      schema:C001_SCHEMA,started_at:started,at:utcTime(now()),observations:[],
      sources,filings:[],coverage:{funds_requested:funds.length,funds_observed:0,
        funds_missing:funds.length,signals:0},
      unsupported_trusts:[...TRUSTS_NOT_COVERED_BY_NPORT],
      collection_status:'requires_identifiable_sec_user_agent',
      etf_daily_creations_observed:false,share_counts_observed:false,
      prediction_inputs_enabled:false,automatic_trading:false
    };
  }
  const jobs=await Promise.allSettled(funds.map(async fund=>{
    const submissionsUrl=secSubmissionsUrl(fund);
    const opts={fetchImpl,timeoutMs,userAgent,now,maxBytes:C001_LIMITS.maxSubmissionsBytes};
    const submissions=await fetchSecText(submissionsUrl,opts);
    const candidates=selectPublicNport(JSON.parse(submissions.raw),{fund,cutoff:utcTime(now())});
    if(!candidates.selected)return {fund,status:'not_published',source_url:submissionsUrl,
      reason:'No public NPORT-P or NPORT-P/A accepted before cutoff'};
    const filing=candidates.selected;
    let url;
    if(/^[A-Za-z0-9_-]{1,90}\.xml$/.test(filing.primary_document)){
      url=secArchiveUrl(fund,filing.accession,filing.primary_document);
    }else{
      const indexUrl=secArchiveUrl(fund,filing.accession,'index.json'),
        index=await fetchSecText(indexUrl,{...opts,maxBytes:C001_LIMITS.maxIndexBytes});
      url=pickXmlFromIndex(JSON.parse(index.raw),{fund,accession:filing.accession});
    }
    const xml=await fetchSecText(url,{...opts,maxBytes:C001_LIMITS.maxXmlBytes});
    const parsed=parsePublicNport(xml.raw,{fund,filing,
      knownAt:xml.received_at,sourceUrl:url});
    const archived=archiveResponse?await archiveResponse({
      fund_id:fund.id,source_url:url,received_at:xml.received_at,
      body_sha256:parsed.source_sha256,source_text:xml.raw}):null;
    // Only the selected accepted version contributes; amendments never double count.
    return {fund,status:'observed',source_url:url,parsed,
      filing,other_public_filings:candidates.other_public_filings,
      submissions_sha256:submissions.sha256,archived_ref:archived??null};
  }));
  const observations=[],filings=[],sources=[];
  for(let i=0;i<jobs.length;i++){
    const f=funds[i],result=jobs[i];
    if(result.status==='rejected'){
      sources.push({name:'SEC-NPORT-'+f.id,status:'unavailable',
        url:secSubmissionsUrl(f),received_at:utcTime(now()),signals:0,
        reason:String(result.reason?.message??result.reason).slice(0,220),
        missing_is_zero:false});
      continue;
    }
    const x=result.value;
    if(x.status!=='observed'){
      sources.push({name:'SEC-NPORT-'+f.id,status:x.status,
        url:x.source_url,received_at:utcTime(now()),signals:0,
        reason:x.reason,missing_is_zero:false});
      continue;
    }
    observations.push(...x.parsed.observations);
    const p=x.parsed;
    filings.push({fund_id:f.id,cik:f.cik,series_id:f.series_id,
      source_url:x.source_url,accession:p.accession,form:p.form,report_period:p.report_period,
      filing_accepted_at:p.filing_accepted_at,known_at:p.known_at,
      sha256:p.source_sha256,submissions_sha256:x.submissions_sha256,
      three_month_flow_slots:p.reported_month_slots,raw_response_archived:Boolean(x.archived_ref),
      archive_ref:x.archived_ref,redemption_normalization:p.redemption_normalization,
      shares_outstanding_available:false,nav_per_share_available:false});
    sources.push({name:'SEC-NPORT-'+f.id,status:'observed',url:x.source_url,
      signals:p.observations.length,received_at:p.known_at,
      form:p.form,accession:p.accession,period:p.report_period,
      body_sha256:p.source_sha256,submissions_sha256:x.submissions_sha256,
      historical_intraday_available:false,source_data_type:'fund_level_quarterly_reporting',
      raw_response_archived:Boolean(x.archived_ref)});
  }
  const ids=new Set();
  for(const o of observations){need(!ids.has(o.id),'C001 estados duplicados');ids.add(o.id)}
  const completed=utcTime(now());
  return {
    schema:C001_SCHEMA,started_at:started,at:completed,group:'fund_flows_c001',
    observations,filings,sources,
    coverage:{funds_requested:funds.length,funds_observed:filings.length,
      funds_missing:funds.length-filings.length,signals:observations.length},
    collection_status:filings.length===funds.length?'observed':'partial_or_unavailable',
    funds_not_etfs_without_verified_metadata:false,
    sample_scope:'SPY and SPYM known public SEC registrants, not all ETFs',
    unsupported_trusts:[...TRUSTS_NOT_COVERED_BY_NPORT],
    etf_daily_creations_observed:false,share_counts_observed:false,
    net_assets_not_nav_per_share:true,quarter_flows_not_daily:true,
    retroactive_publication_inferred:false,financial_edge_demonstrated:false,
    prediction_inputs_enabled:false,automatic_trading:false
  };
}
