#!/usr/bin/env node
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {sourceText} from '../universo/capital/http.mjs';
import {validarVelas} from '../seguimiento/modelo.mjs';
import {TRAINING_PLAN,partitionPlan,trainExperiment,verifyTrainingReport,hash} from '../experimentos/entrenamiento-x002.mjs';

export async function collectTrainingBars(directory,{fetchImpl=fetch,now=()=>new Date().toISOString(),cutoff}={}){
  mkdirSync(join(directory,'entradas'),{recursive:true});
  const started=now(),end=cutoff??new Date(Math.floor(Date.parse(started)/300000)*300000).toISOString();
  const partitions=partitionPlan(end),start=Date.parse(partitions.training[0])-86400000;
  const declaration={schema:'laplace-x002-run-plan-v1',declared_at:started,cutoff:end,plan:TRAINING_PLAN,
    partitions,selection_before_download:true};
  writeFileSync(join(directory,'plan.json'),JSON.stringify({...declaration,sha256:hash(declaration)},null,2)+'\n',{flag:'wx'});
  const sources=[],raw=[];
  for(let t=start;t<Date.parse(end);t+=86400000){
    const stop=Math.min(t+86400000,Date.parse(end)),url=new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles');
    url.searchParams.set('start',new Date(t).toISOString());url.searchParams.set('end',new Date(stop).toISOString());
    url.searchParams.set('granularity','300');
    const response=await sourceText('Coinbase BTC-USD candles',url.toString(),{fetchImpl,now,maxBytes:524288,
      archiveResponse:async record=>{
        const ref='entradas/'+record.body_sha256+'.gz.b64',path=join(directory,ref);
        if(!existsSync(path))writeFileSync(path,gzipSync(record.text,{level:9}).toString('base64')+'\n',{flag:'wx'});
        return ref;
      }});
    sources.push({...response.source,requested_start:new Date(t).toISOString(),requested_end:new Date(stop).toISOString()});
    writeFileSync(join(directory,'fuentes.json'),JSON.stringify(sources,null,2)+'\n');
    if(!response.ok)throw Error('Historia X002 incompleta: '+response.source.reason);
    const rows=JSON.parse(response.text);if(!Array.isArray(rows)||rows.length>500)throw Error('Respuesta OHLCV inválida');
    raw.push(...rows.filter(r=>Array.isArray(r)&&r[0]*1000>=t&&(r[0]+300)*1000<=stop));
  }
  const bars=validarVelas(raw,{corte:end,maximo:10000});
  const capture={schema:'laplace-x002-candles-v1',started_at:started,received_at:now(),cutoff:end,
    reference_availability:'historical_candle_close_is_assumed_not_attested',rows:bars,rows_sha256:hash(bars),sources};
  writeFileSync(join(directory,'velas.json'),JSON.stringify(capture)+'\n',{flag:'wx'});
  return capture;
}
export function replayTrainingBars(directory,capture){
  const raw=[];
  for(const source of capture.sources){
    if(!/^entradas\/[a-f0-9]{64}\.gz\.b64$/.test(source.archive_ref??''))throw Error('Archivo de fuente inválido');
    const text=gunzipSync(Buffer.from(readFileSync(join(directory,source.archive_ref),'utf8').trim(),'base64'),{maxOutputLength:524288}).toString();
    if(hash(text)!==source.body_sha256)throw Error('Respuesta histórica alterada');
    const start=Date.parse(source.requested_start),end=Date.parse(source.requested_end);
    raw.push(...JSON.parse(text).filter(r=>r[0]*1000>=start&&(r[0]+300)*1000<=end));
  }
  const bars=validarVelas(raw,{corte:capture.cutoff,maximo:10000});
  if(hash(bars)!==capture.rows_sha256||hash(capture.rows)!==capture.rows_sha256)throw Error('Historia reconstruida diferente');
  return bars;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [binary,directoryRaw,input]=process.argv.slice(2);
  if(!binary||!directoryRaw)throw Error('uso: node tools/entrenar.mjs BIN_TEMPORAL DIRECTORIO [CAPTURA_EXISTENTE]');
  const directory=resolve(directoryRaw);mkdirSync(directory,{recursive:true});
  const data=input?JSON.parse(readFileSync(resolve(input))):await collectTrainingBars(directory);
  if(hash(data.rows)!==data.rows_sha256)throw Error('Hash de velas inválido');
  const report=trainExperiment(binary,data.rows,{cutoff:data.cutoff});verifyTrainingReport(report);
  writeFileSync(join(directory,'resultado.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  mkdirSync(join(directory,'modelos'),{recursive:true});
  for(const h of report.horizons.filter(x=>x.frozen)){
    writeFileSync(join(directory,'modelos',h.horizon_minutes+'m.xi'),h.frozen.xi,{flag:'wx'});
    writeFileSync(join(directory,'modelos',h.horizon_minutes+'m.json'),JSON.stringify({
      ...h.frozen,xi:undefined,frozen_sha256:h.frozen_sha256,
      calibration_retains_state_information:h.calibration_retains_state_information},null,2)+'\n',{flag:'wx'});
  }
  const summary={schema:report.schema,generated_at:report.generated_at,bars:report.bars,partitions:report.partitions,
    evaluation:report.evaluation,availability_assumption:report.availability_assumption,
    horizons:report.horizons.map(h=>({minutes:h.horizon_minutes,status:h.status,prior_strength:h.selected_prior_strength,
      calibration_lambda:h.calibrator?.lambda,native:h.native,calibrated:h.calibrated,
      calibration_retains_state_information:h.calibration_retains_state_information,
      baseline:h.prior_baseline,m001:h.m001?{...h.m001,predictions:undefined}:null,common_direction:h.common_direction})),
    report_sha256:report.report_sha256,production_changed:false,financial_edge_demonstrated:false};
  writeFileSync(join(directory,'resumen.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary,null,2));
}
