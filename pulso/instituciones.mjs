/* Relaciones institucionales fechadas, reutilizando el catálogo y contrato XI/Ether. */
import {Registry,need,cik,hash,normalizeName} from './registro.mjs';
import {parseExhibit21,parse13F,archiveBase} from './sec.mjs';
import {MARKET_SYMBOLS} from '../universo/catalogo-global.mjs';
import {universeSnapshot,utcTime} from '../universo/estados.mjs';
import {canonicalLedger} from '../historia/contrato.mjs';

function tickerIndex(raw){
  const rows=Object.values(JSON.parse(raw.text)),byName=new Map(),byTicker=new Map();
  for(const row of rows){
    need(typeof row.title==='string'&&typeof row.ticker==='string','catálogo SEC inválido');
    const item={...row,cik:cik(row.cik_str)},key=normalizeName(row.title);
    if(!byName.has(key))byName.set(key,new Map());byName.get(key).set(item.cik,item);
    byTicker.set(row.ticker,item);
  }
  return {byName,byTicker};
}
export function refineInstitutionRegistry(bundles,{previous=null,symbols=MARKET_SYMBOLS}={}){
  need(Array.isArray(bundles)&&bundles.length>0,'sin instituciones capturadas');
  const registry=new Registry(previous,symbols),catalogue=bundles[0].tickers,index=tickerIndex(catalogue);
  const catalogueSource=registry.source(catalogue);
  for(const symbol of symbols){
    const item=index.byTicker.get(symbol);if(!item)continue;
    registry.upsert({id:'sec:'+item.cik,name:item.title,identifiers:{cik:item.cik,ticker:symbol},
      roles:['sec_catalogued_issuer'],source_ids:[catalogueSource.id],identity_basis:'SEC_ticker_and_CIK'});
  }
  function issuer(name,sourceId,{jurisdiction}={}){
    const candidates=index.byName.get(normalizeName(name));
    const matched=candidates?.size===1?[...candidates.values()][0]:null;
    if(matched){
      const existing=registry.identity.get('cik:'+matched.cik);
      return registry.upsert({id:existing??'sec:'+matched.cik,name:matched.title,
        identifiers:{cik:matched.cik,...(!existing?{ticker:matched.ticker}:{})},aliases:[name],
        roles:['reported_issuer'],source_ids:[sourceId,catalogueSource.id],
        identity_basis:'unique_normalized_issuer_name_match_to_SEC_catalogue_not_CUSIP_mapping',jurisdiction});
    }
    return registry.upsert({id:'reported:'+hash(normalizeName(name)+'|'+(jurisdiction??'unknown')).slice(0,32),name,
      identifiers:{},roles:[jurisdiction?'disclosed_legal_entity':'unresolved_reported_issuer'],
      source_ids:[sourceId],jurisdiction,identity_basis:'provisional_reported_name_and_jurisdiction'});
  }
  for(const bundle of bundles){
    const {institution,submission}=bundle,s=JSON.parse(submission.text),rootSource=registry.source(submission);
    need(cik(s.cik)===institution.cik&&s.tickers.includes(institution.ticker),'identidad raíz SEC incompatible');
    const root=registry.upsert({id:'sec:'+institution.cik,name:s.name,
      identifiers:{cik:institution.cik,ticker:institution.ticker},aliases:institution.aliases,
      roles:['institutional_root'],source_ids:[rootSource.id],identity_basis:'SEC_submissions_CIK_and_ticker'});
    for(const kind of ['subsidiaries','holdings']){
      const part=bundle[kind],source=registry.source(part.document),filing=part.filing;
      const base=archiveBase(institution,filing);
      need(part.document.url.startsWith(base),'documento no pertenece al accession institucional');
      need(utcTime(filing.accepted_at)<=source.known_at,'captura anterior a aceptación SEC');
      need(utcTime(filing.report_date+'T00:00:00Z')<=filing.accepted_at,'periodo de reporte futuro');
      const reportId='report:'+hash(root.id+'|'+kind+'|'+source.id).slice(0,32);
      if(registry.reports.has(reportId))continue;
      const common={root:root.id,kind,source_id:source.id,accession:filing.accession,
        report_date:filing.report_date,accepted_at:filing.accepted_at,known_at:source.known_at,
        unresolved_amendments:part.unresolved_amendments??[]};
      const at=filing.report_date+'T00:00:00.000Z';
      if(kind==='subsidiaries'){
        need(filing.form==='10-K','EX-21 requiere 10-K');
        const parsed=parseExhibit21(part.document.text);
        for(const row of parsed.rows){
          const child=issuer(row.name,source.id,{jurisdiction:row.jurisdiction});
          registry.assertion({from:root.id,to:child.id,relation:'disclosed_group_subsidiary',report_id:reportId,
            source_id:source.id,observed_at:at,attributes:{reported_name:row.name,jurisdiction:row.jurisdiction,
              row:row.row,evidence_sha256:row.evidence_sha256,direct_parent:null,ownership_percentage:null,
              scope:'direct_or_indirect_group_subsidiary_as_disclosed'}});
        }
        registry.reports.set(reportId,{id:reportId,...common,rows:parsed.rows.length,
          omissions_disclosed:parsed.omissions_disclosed,complete_control_tree:false});
      }else{
        need(filing.form==='13F-HR','importar originales 13F-HR; las enmiendas requieren conciliación');
        const coverSource=registry.source(part.cover);
        need(part.cover.url===base+'primary_doc.xml','portada 13F no corresponde al accession');
        need(new RegExp('<(?:[\\w.-]+:)?cik>0*'+Number(institution.cik)+'</(?:[\\w.-]+:)?cik>').test(part.cover.text),'portada 13F de otra institución');
        const quarter=filing.report_date.slice(5,7)+'-'+filing.report_date.slice(8,10)+'-'+filing.report_date.slice(0,4);
        need(part.cover.text.includes('>'+quarter+'<'),'portada 13F de otro periodo');
        const parsed=parse13F(part.document.text,part.cover.text);
        const knownAt=[source.known_at,coverSource.known_at].sort().at(-1);
        for(const position of parsed.positions){
          const company=issuer(position.name,source.id);
          const security=registry.upsert({id:'cusip:'+position.cusip,name:position.name+' / '+position.cusip,
            identifiers:{cusip:position.cusip},roles:['reported_security'],source_ids:[source.id],identity_basis:'CUSIP_security_identifier_not_company_identifier'});
          registry.assertion({from:security.id,to:company.id,relation:'reported_issuer_of_security',report_id:reportId,
            source_id:source.id,supporting_source_ids:[coverSource.id],known_at:knownAt,
            observed_at:at,attributes:{reported_name:position.name,cusip:position.cusip}});
          registry.assertion({from:root.id,to:security.id,relation:'reported_13f_position',report_id:reportId,
            source_id:source.id,supporting_source_ids:[coverSource.id],known_at:knownAt,
            observed_at:at,attributes:{...position,issuer_id:company.id,
              value_unit:parsed.value_unit,ownership_percentage:null,control_inferred:false}});
        }
        registry.reports.set(reportId,{id:reportId,...common,known_at:knownAt,cover_source_id:coverSource.id,
          rows:parsed.raw_rows,aggregated_positions:parsed.positions.length,reported_value:parsed.reported_value,
          value_unit:parsed.value_unit,cover_totals_verified:true,confidential_omissions:parsed.confidential_omissions,
          complete_portfolio:false,control_inferred:false});
      }
    }
  }
  return registry.seal();
}
export function institutionalSnapshot(registry,{cutoff}={}){
  new Registry(registry);const time=utcTime(cutoff),latest=new Map();
  for(const report of registry.reports){
    if(report.known_at>time||report.accepted_at>time||report.report_date>time.slice(0,10))continue;
    const key=report.root+'|'+report.kind,old=latest.get(key);
    if(!old||[report.report_date,report.accepted_at,report.known_at].join('|')>[old.report_date,old.accepted_at,old.known_at].join('|'))latest.set(key,report);
  }
  const reports=[...latest.values()].sort((a,b)=>a.id.localeCompare(b.id)),ids=new Set(reports.map(x=>x.id));
  const edges=registry.assertions.filter(e=>ids.has(e.report_id)&&e.known_at<=time&&e.observed_at<=time);
  const entityIds=[...new Set(edges.flatMap(e=>[e.from,e.to]))].sort();
  const sourceIds=new Set([...reports.flatMap(r=>[r.source_id,...(r.cover_source_id?[r.cover_source_id]:[])]),
    ...edges.flatMap(e=>[e.source_id,...(e.supporting_source_ids??[])])]);
  const sources=registry.sources.filter(s=>sourceIds.has(s.id)&&s.known_at<=time);
  const body={schema:'laplace-pulso-snapshot-p001-v1',cutoff:time,reports,edges,entity_ids:entityIds,sources,
    complete_control_tree:false,prediction_inputs_enabled:false};
  return {...body,snapshot_sha256:hash(body)};
}
export function institutionalObservations(snapshot){
  const {snapshot_sha256,...body}=snapshot;need(hash(body)===snapshot_sha256,'snapshot institucional alterado');
  const sources=new Map(snapshot.sources.map(s=>[s.id,s.url]));
  for(const e of snapshot.edges)if(e.relation==='reported_13f_position')
    need(Number.isSafeInteger(Number(e.attributes.reported_value)),'valor 13F no representable exactamente en transporte numérico');
  return snapshot.edges.filter(e=>e.relation!=='reported_issuer_of_security').map(e=>({
    id:e.id,domain:e.relation==='reported_13f_position'?'posiciones_institucionales':'filiales_institucionales',
    variable:'edge_'+hash(e.from+'|'+e.to+'|'+e.relation+'|'+JSON.stringify(e.attributes)).slice(0,40),
    value:e.relation==='reported_13f_position'?Number(e.attributes.reported_value):1,
    unit:e.relation==='reported_13f_position'?'USD_reported':'disclosed_relation',
    observed_at:e.observed_at,known_at:e.known_at,
    source_url:sources.get(e.source_id)
  }));
}
export function institutionalBatches(registry,{cutoff,batchSize=1024}={}){
  need(Number.isInteger(batchSize)&&batchSize>0&&batchSize<=4096,'tamaño de lote inválido');
  const snapshot=institutionalSnapshot(registry,{cutoff}),sources=new Map(registry.sources.map(s=>[s.id,s.url]));
  const edges=new Map(snapshot.edges.map(e=>[e.id,e]));
  const observations=institutionalObservations(snapshot).map(o=>({...o,source_url:sources.get(edges.get(o.id).source_id)}));
  const batches=[];for(let i=0;i<observations.length;i+=batchSize)batches.push(universeSnapshot(observations.slice(i,i+batchSize),{cutoff}));
  return {snapshot,batches,observations};
}
export function institutionalTrainingFacts(registry,{cutoff}={}){
  const snapshot=institutionalSnapshot(registry,{cutoff}),sources=new Map(registry.sources.map(s=>[s.id,s.url]));
  return canonicalLedger(snapshot.reports.flatMap(r=>[
    {id:'p001-'+r.id+'-rows',kind:'economia',series_id:r.root+'_'+r.kind+'_reported_rows',
      observed_at:r.report_date+'T00:00:00.000Z',known_at:r.known_at,source_url:sources.get(r.source_id),unit:'count',value:String(r.rows)},
    ...(r.kind==='holdings'?[{id:'p001-'+r.id+'-value',kind:'economia',series_id:r.root+'_13f_reported_value',
      observed_at:r.report_date+'T00:00:00.000Z',known_at:r.known_at,source_url:sources.get(r.source_id),
      unit:'USD_as_reported_not_AUM',value:r.reported_value}]:[])
  ]));
}
