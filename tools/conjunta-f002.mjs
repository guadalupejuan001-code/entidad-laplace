#!/usr/bin/env node
/* F002: consume archivos EF002 reales, emite estudio retrospectivo y diario
 * prospectivo sellado. No consulta el futuro ni ejecuta operaciones.
 */
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {descubrirManifiestosEF002,leerArchivoEF002} from '../estado-financiero/captura.mjs';
import {normalizarCapturaU003} from '../estado-financiero/modelo.mjs';
import {ejecutarPrediccionF002,evaluarPronosticoF002,
  resumirValidacionProspectivaF002,trazaOriginalF002} from '../prediccion/conjunta-f002.mjs';
const [command,archiveArg,outputArg,journalArg,...extra]=process.argv.slice(2);
const help='Uso: node tools/conjunta-f002.mjs ejecutar ARCHIVO_EF002 SALIDA [LAPLACE_MODELOS]\n'+
 'Cada captura se verifica con hashes. Publica abstención o candidato shadow,\n'+
 'y puntúa los pronósticos anteriores sin modificar sus archivos.\n';
const sha=s=>createHash('sha256').update(s).digest('hex');
const need=(x,m)=>{if(!x)throw Error(m)};
const readJson=async f=>JSON.parse(await readFile(f,'utf8'));
if(command==='--help'||command==='-h'||!command){console.log(help)}
else if(command!=='ejecutar'||!archiveArg||!outputArg||extra.length){
  console.error(help);process.exitCode=2;
}else{
  try{
    const archive=resolve(archiveArg),output=resolve(outputArg);
    need(output!==archive&&!output.startsWith(archive+'/'),'salida dentro del archivo no permitida');
    const paths=await descubrirManifiestosEF002(archive);
    need(paths.length>0,'no hay archivos EF002 verificables');
    const captures=[];
    for(const path of paths)captures.push((await leerArchivoEF002(path)).capture);
    // Solo evidencia heredada EXPLÍCITAMENTE declarada, con sello real.
    // No se convierten resultados de laboratorios ni simulaciones en mercado.
    const lastArchivedAt=Math.max(...captures.map(c=>Date.parse(c.at)));
    const oldPaths=[
      'evidencia/fuentes-primarias-20261030/captura-integrada.json',
      'evidencia/continuidad-u003-20261030/captura-integrada.json',
      'evidencia/capital-u004-20261030/primera-captura-mundial-parcial.json',
      'evidencia/capital-u004-20261030/captura-mundial.json',
      'evidencia/entrenamiento-x002-20261030/fuentes-mundiales/captura.json'
    ];
    const supplemental=[];
    if(process.env.LAPLACE_F002_INCLUDE_LEGACY==='true'){
      for(const rel of oldPaths){
        const path=resolve(new URL('../'+rel,import.meta.url).pathname);
        const raw=await readFile(path,'utf8');
        const c=JSON.parse(raw);
        normalizarCapturaU003(c); // Sello de toda la captura y snapshot.
        need(Date.parse(c.at)<=lastArchivedAt,'evidencia heredada posterior al archivo principal');
        if(captures.some(x=>x.capture_sha256===c.capture_sha256))continue;
        captures.push(c);
        supplemental.push({path:rel,capture_sha256:c.capture_sha256,
          source_file_sha256:sha(raw),captured_at:c.at});
      }
    }
    captures.sort((a,b)=>a.at.localeCompare(b.at));
    const version=sha(await readFile(new URL('../prediccion/conjunta-f002.mjs',import.meta.url)));
    const model=ejecutarPrediccionF002(captures,{issuedAt:new Date().toISOString()});
    const trace=trazaOriginalF002(captures);
    const outputSubdirs=['informes-f002','pronosticos-f002','evaluaciones-f002','trazas-f002'];
    for(const folder of outputSubdirs)await mkdir(join(output,folder),{recursive:true});
    const tail=captures.at(-1).capture_sha256,policy=version.slice(0,12);
    const reportName='informes-f002/status-'+tail+'-'+policy+'.json';
    const traceName='trazas-f002/trace-'+tail+'.json';
    await writeFile(join(output,traceName),JSON.stringify(trace,null,2)+'\n',
      {flag:'wx',mode:0o600});
    const report={...model,model_source_sha256:version,
      source_branch:'laplace-archivo',archive_count:captures.length,
      verified_real_archives_only:true,
      archive_manifests_verified:paths.length,
      supplemental_evidence_verified:supplemental,
      raw_trace_sha256:trace.trace_sha256,
      raw_trace_filename:traceName,
      raw_trace_series:trace.source_series_all_latest_or_previous,
      input_capture_sha256:tail,automatic_trading:false,
      production_activation_allowed:false,prospectively_validated:false};
    await writeFile(join(output,reportName),JSON.stringify(report,null,2)+'\n',
      {flag:'wx',mode:0o600});
    let forecastName=null;
    if(model.status==='experimental_shadow_frozen'){
      // Un solo pronóstico por captura: una ejecución tardía/repetida no
      // puede multiplicar artificialmente el número de apuestas prospectivas.
      forecastName='pronosticos-f002/forecast-'+
        model.forecast.decision_capture_sha256+'.json';
      await writeFile(join(output,forecastName),
        JSON.stringify(model.forecast,null,2)+'\n',{flag:'wx',mode:0o600});
    }
    const past=journalArg?resolve(journalArg):null;
    async function list(folder,regex){
      if(!past)return [];
      try{
        return (await readdir(join(past,folder))).filter(x=>regex.test(x))
          .sort().map(x=>join(past,folder,x));
      }catch(e){if(e.code==='ENOENT')return [];throw e}
    }
    const oldForecasts=await list('pronosticos-f002',/^forecast-[a-f0-9]{64}\.json$/);
    const oldEvaluations=await list('evaluaciones-f002',/^evaluation-[a-f0-9]{64}\.json$/);
    const evaluations=[];
    let evaluated=0,waiting=0,unscorable=0;
    for(const file of oldEvaluations)evaluations.push(await readJson(file));
    for(const file of oldForecasts){
      const f=await readJson(file),outcome=evaluarPronosticoF002(f,captures);
      if(outcome.status==='waiting_for_outcome'){waiting++;continue}
      if(outcome.status==='unscorable_missed_target_window'){unscorable++;continue}
      const fileName='evaluaciones-f002/evaluation-'+outcome.evaluation_sha256+'.json';
      await writeFile(join(output,fileName),JSON.stringify(outcome,null,2)+'\n',
        {flag:'wx',mode:0o600});
      evaluations.push(outcome);evaluated++;
    }
    const score=resumirValidacionProspectivaF002(evaluations);
    const status={schema:'laplace-f002-cycle-v1',status:model.status,
      reason:model.reason??null,archive_count:captures.length,
      latest_capture_at:captures.at(-1).at,latest_capture_sha256:tail,
      observed_source_series:model.distinct_source_series,
      observed_domains:model.observed_domains,
      matched_verified_outcomes:model.matched_outcomes,
      training_pairs:model.training?.observed_training_pairs??model.observed_training_pairs??0,
      validation_pairs:model.training?.observed_validation_pairs??model.observed_validation_pairs??0,
      holdout_pairs:model.training?.observed_holdout_pairs??model.observed_holdout_pairs??0,
      forecast_sha256:model.forecast?.forecast_sha256??null,
      shadow_saved_path:forecastName,report_path:reportName,
      raw_trace_sha256:trace.trace_sha256,
      raw_trace_filename:traceName,
      raw_trace_series:trace.source_series_all_latest_or_previous,
      earlier_forecasts_checked:oldForecasts.length,
      new_real_outcomes_evaluated:evaluated,awaiting_later_capture:waiting,
      missed_capture_windows:unscorable,
      prospective_scorecard:score,
      model_source_sha256:version,
      verified_real_archives_only:true,archive_manifests_verified:paths.length,
      supplemental_evidence_verified:supplemental.length,
      skipped_correlated_decisions:model.skipped_correlated_decisions??null,
      automatic_trading:false,central_f001_price_modified:false,
      production_activation_allowed:false};
    await writeFile(join(output,'resumen-f002.json'),JSON.stringify(status,null,2)+'\n',
      {flag:'wx',mode:0o600});
    console.log(JSON.stringify(status));
  }catch(e){console.error('F002: '+String(e?.stack??e));process.exitCode=1}
}
