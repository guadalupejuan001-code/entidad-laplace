#!/usr/bin/env node
/* EF004: ciclo real de aprendizaje y comprobación con archivos EF002.
 * Entrada: ramas archivadas y pronósticos históricos. Salida: registros
 * INMUTABLES con nombres derivados del SHA, nunca órdenes financieras.
 */
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {sha,stable,need} from '../input/contrato.mjs';
import {descubrirManifiestosEF002,leerArchivoEF002} from '../estado-financiero/captura.mjs';
import {aprenderNucleoEF004} from '../demonio/finanzas-ef004.mjs';
import {evaluarPronosticoEF004} from '../demonio/evaluacion-ef004.mjs';

const [command,sourceDirectory,outputDirectory,journalDirectory,...extra]=process.argv.slice(2);
const usage='Uso: node tools/nucleo-demonio.mjs ejecutar ARCHIVO_EF002 OUTPUT_DIR [HISTORIAL_EF004]\n'+
  'Lee capturas verificadas de laplace-archivo; registra modelo o abstención.\n'+
  'Si se proporciona HISTORIAL_EF004, evalúa pronósticos anteriores vencidos.\n'+
  'Sin credenciales, sin trading, sin afirmar leyes causales no demostradas.';
if(command==='--help'||!command){console.log(usage);process.exit(0)}
else if(command!=='ejecutar'||!sourceDirectory||!outputDirectory||extra.length){
  console.error(usage);process.exitCode=2;
}else{
  try{
    const archive=resolve(sourceDirectory),output=resolve(outputDirectory);
    need(output!==archive&&!output.startsWith(archive+'/'),
      'la salida debe estar fuera del archivo de capturas');
    const paths=await descubrirManifiestosEF002(archive,{maxFiles:2500});
    const captures=[];
    for(const file of paths){
      const restored=await leerArchivoEF002(file);
      captures.push(restored.capture);
    }
    captures.sort((a,b)=>a.at.localeCompare(b.at));
    need(new Set(captures.map(x=>x.capture_sha256)).size===captures.length,
      'capturas con hash repetido no se deben entrenar dos veces');
    const model=aprenderNucleoEF004(captures);
    await mkdir(join(output,'reportes'),{recursive:true});
    await mkdir(join(output,'pronosticos'),{recursive:true});
    await mkdir(join(output,'evaluaciones'),{recursive:true});
    let savedPath=null;
    if(model.status==='experimental_model_frozen'){
      savedPath='pronosticos/forecast-'+model.forecast_sha256+'.json';
      await writeFile(join(output,savedPath),JSON.stringify(model,null,2)+'\n',
        {flag:'wx',mode:0o600});
    }else{
      const tail=captures.at(-1)?.capture_sha256??'archivo-vacio';
      savedPath='reportes/status-'+tail+'.json';
      await writeFile(join(output,savedPath),JSON.stringify({
        ...model,archive_count:captures.length,
        verification:'real_archives_only_not_synthetic',
        production_activation_allowed:false,automatic_trading:false
      },null,2)+'\n',{flag:'wx',mode:0o600});
    }
    let previousFiles=[];
    if(journalDirectory){
      const location=join(resolve(journalDirectory),'pronosticos');
      try{previousFiles=(await readdir(location)).filter(x=>
        /^forecast-[a-f0-9]{64}\.json$/.test(x)).map(x=>join(location,x));}
      catch(error){if(error.code!=='ENOENT')throw error}
    }
    need(previousFiles.length<=3000,'historia de pronosticos fuera de presupuesto');
    let evaluations=0,waiting=0,missing=0;
    for(const path of previousFiles.sort()){
      const raw=await readFile(path,'utf8');
      need(raw.length<=8*1024*1024,'pronostico archivado excede presupuesto');
      const frozen=JSON.parse(raw);
      // Verificar sello incluso cuando la predicción aún no ha vencido.
      const outcome=evaluarPronosticoEF004(frozen,captures);
      if(outcome.status==='waiting_for_outcome'){waiting++;continue}
      if(outcome.status==='unscorable_missed_capture_window')missing++;
      const evidence=outcome.evaluation_sha256??sha(stable(outcome));
      const name='evaluaciones/evaluation-'+evidence+'.json';
      await writeFile(join(output,name),JSON.stringify({
        ...outcome,preserved_original_forecast:true,
        no_trading:true
      },null,2)+'\n',{flag:'wx',mode:0o600});
      evaluations++;
    }
    const report={schema:'laplace-ef004-cycle-v1',
      status:model.status,reason:model.reason??null,
      archive_count:captures.length,latest_capture_at:captures.at(-1)?.at??null,
      latest_capture_sha256:captures.at(-1)?.capture_sha256??null,
      minimum_captures:48,contiguous_captures:model.consecutive_captures??
        model.contiguous_captures??0,
      selected_targets:model.selected_targets??0,
      lagged_relationships:model.lagged_relationships??0,
      forecast_sha256:model.forecast_sha256??null,
      model_sha256:model.model_sha256??null,
      saved_path:savedPath,previous_forecasts_checked:previousFiles.length,
      prospective_evaluations_written:evaluations,
      waiting_for_future_outcomes:waiting,
      past_targets_without_comparable_capture:missing,
      no_synthetic_data_used_for_live_cycle:true,
      automatic_trading:false,production_activation_allowed:false,
      live_predictive_advantage_not_certified:true};
    await writeFile(join(output,'resumen.json'),JSON.stringify(report,null,2)+'\n',
      {flag:'wx',mode:0o600});
    console.log(JSON.stringify(report));
  }catch(error){
    console.error('EF004: '+String(error?.message??error));process.exitCode=1;
  }
}
