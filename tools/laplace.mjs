#!/usr/bin/env node
'use strict';
// LaPlaceDIG: local data ingestion and proof. This is not a trading bot.
import {readFileSync,writeFileSync} from 'node:fs';
import {runInstitutions} from './instituciones.mjs';
import {runInput} from './entrada.mjs';
import {parseJSONL,canonicalLedger,canonicalFact,stringifyJSONL,ledgerHash,
        asOf,persistenceBaseline,timestamp,KIND} from '../historia/contrato.mjs';
import {proveWithOriginalEther} from '../historia/ether-xi.mjs';
import {parseTransitions,learn,predict} from '../inteligencia/laplace.mjs';
import {experiment} from '../inteligencia/experimento.mjs';
import {trainNarrative,predictNarrative,evaluateNarrative} from '../narrativa/modelo.mjs';
import {narrativeExperiment} from '../narrativa/experimento.mjs';
import {importReliefWeb,importGDELT} from '../narrativa/fuentes.mjs';
import {trainDual,predictDual} from '../coexistencia/modelo.mjs';
import {registerForecast,registerRealities,reconcileJournal,readJournal,patternResults,provePattern} from '../coexistencia/patrones.mjs';
import {dualExperiment} from '../coexistencia/experimento.mjs';
import {simulateRealities} from '../coexistencia/realidades.mjs';
import {realitiesExperiment} from '../coexistencia/experimento-realidades.mjs';
import {collectBitcoin,exportCaptureFacts} from '../bitcoin/agente.mjs';
import {downloadHistory} from '../bitcoin/historico.mjs';
import {calibrateHistory,pastComparisons,MODES} from '../bitcoin/calibracion.mjs';
import {causalSnapshot,causalWalkForward} from '../bitcoin/causal.mjs';
import {observeAndProject15m} from '../bitcoin/intradia15.mjs';
import {observeUniverseBTC} from '../universo/mercado.mjs';
import {observeGlobalUniverse} from '../universo/global.mjs';
import {observeWorldU003} from '../universo/global-u003.mjs';
import {proveGlobalEther} from '../universo/ether-global.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {temporalExperiment,liveTemporalProfile,queryTemporal} from '../dinamica/modelo.mjs';
import {compilarSistema} from '../fisica/compilar.mjs';
import {compilarGravedad} from '../fisica/tres-cuerpos.mjs';
import {compilarCosmologia} from '../cosmos/lcdm.mjs';
import {compilarSingularidad} from '../cosmos/singularidad.mjs';
import {compilarMegaceldas} from '../escala/compilar.mjs';

function usage(){
  process.stdout.write('LaPlaceDIG — laboratorio del demonio digital\n'
   +'  node tools/laplace.mjs validar hechos.jsonl\n'
   +'  node tools/laplace.mjs corte hechos.jsonl 2020-01-01T00:00:00Z\n'
   +'  node tools/laplace.mjs referencia hechos.jsonl CORTE_UTC ACTIVO\n'
   +'  node tools/laplace.mjs verificar-ether hechos.jsonl CORTE_UTC RUTA_MUNDO_X_QUANTUM\n'
   +'  node tools/laplace.mjs convertir-precios precios.csv > hechos.jsonl\n'
   +'  node tools/laplace.mjs aprender-leyes transiciones.jsonl CORTE_UTC BIN_XI MODELO.json\n'
   +'  node tools/laplace.mjs predecir-estado MODELO.json ESTADO_BINARIO PASOS BIN_XI\n'
   +'  node tools/laplace.mjs experimento-aprendiz BIN_XI DIRECTORIO_RESULTADOS\n'
   +'  node tools/laplace.mjs entrenar-narrativa hechos.jsonl CONFIG.json BIN_XI MODELO.json\n'
   +'  node tools/laplace.mjs probabilidad-narrativa MODELO.json hechos.jsonl CORTE_UTC BIN_XI\n'
   +'  node tools/laplace.mjs evaluar-narrativa MODELO.json hechos.jsonl FIN_TEST_UTC BIN_XI\n'
   +'  node tools/laplace.mjs experimento-narrativa BIN_XI DIRECTORIO_RESULTADOS\n'
   +'  node tools/laplace.mjs importar-narrativa reliefweb|gdelt CAPTURA.json > hechos.jsonl\n'
   +'  node tools/laplace.mjs entrenar-dual hechos.jsonl CONFIG.json BIN_XI MODELO_DUAL.json\n'
   +'  node tools/laplace.mjs pronostico-dual MODELO_DUAL.json hechos.jsonl CORTE_UTC BIN_XI REGISTRO.jsonl\n'
   +'  node tools/laplace.mjs contrastar-dual REGISTRO.jsonl hechos.jsonl CORTE_UTC\n'
   +'  node tools/laplace.mjs patrones REGISTRO.jsonl\n'
   +'  node tools/laplace.mjs verificar-patron REGISTRO.jsonl ID_PATRON BIN_XI\n'
   +'  node tools/laplace.mjs experimento-dual BIN_XI DIRECTORIO_NUEVO\n'
   +'  node tools/laplace.mjs analizar-realidades MODELO_DUAL hechos.jsonl CORTE_UTC ESCENARIOS.json BIN_XI REGISTRO.jsonl\n'
   +'  node tools/laplace.mjs experimento-realidades BIN_XI DIRECTORIO_NUEVO\n'
   +'  node tools/laplace.mjs actualizar-bitcoin CAPTURA_NUEVA.json [HECHOS_NUEVOS.jsonl]\n'
   +'  node tools/laplace.mjs descargar-bitcoin INICIO_UTC FIN_UTC HISTORIA_NUEVA.json\n'
   +'  node tools/laplace.mjs bitcoin-15m [RESULTADO_NUEVO.json]\n'   +'  node tools/laplace.mjs universo-btc-15m [RESULTADO_NUEVO.json]\n'
   +'  node tools/laplace.mjs universo-global [RESULTADO_NUEVO.json]\n'
   +'  node tools/laplace.mjs universo-global-u003 [RESULTADO_NUEVO.json]\n'
   +'  node tools/laplace.mjs verificar-universo-global CAPTURA_U002.json BIN_XI\n'
   +'  node tools/laplace.mjs universo-corte OBSERVACIONES.json CORTE_UTC [RESULTADO_NUEVO.json]\n'
   +'  node tools/laplace.mjs analizar-causas-bitcoin HISTORIA.json CORTE_UTC [strict|exploratory_close_availability]\n'
   +'  node tools/laplace.mjs probar-causas-bitcoin HISTORIA.json [strict|exploratory_close_availability]\n'
   +'  node tools/laplace.mjs calibrar-bitcoin HISTORIA.json BIN_XI INFORME_NUEVO.json strict|exploratory_close_availability [CASOS_NUEVOS.json]\n'
   +'  node tools/laplace.mjs entrenar-dinamica HISTORIA.json BIN_NATIVO INFORME_NUEVO.json strict|exploratory_close_availability\n'
   +'  node tools/laplace.mjs perfil-dinamica HISTORIA.json INFORME.json BIN_NATIVO PERFIL_NUEVO.json\n'
   +'  node tools/laplace.mjs consultar-dinamica CHECKPOINT.json MASCARA PASOS BIN_NATIVO\n'
   +'  node tools/laplace.mjs crear-fisica ESCENARIO.json SALIDA.xi\n'
   +'  node tools/laplace.mjs crear-gravedad ESCENARIO.json SALIDA.xi\n'
   +'  node tools/laplace.mjs crear-cosmos PARAMETROS.json SALIDA.xi\n'
   +'  node tools/laplace.mjs crear-singularidad PARAMETROS.json SALIDA.xi\n'
   +'  node tools/laplace.mjs crear-exabyte PARAMETROS.json SALIDA.xi\n'
   +'Datos historicos siempre identificados por fuente y fecha de disponibilidad. Sin cotizaciones inventadas.\n');
}
function must(v,message){if(!v)throw Error(message)}
function readJsonl(name){must(name,'missing JSONL file');return parseJSONL(readFileSync(name,'utf8'))}
function convertPriceCSV(filename){
  must(filename,'missing CSV filename');
  const rows=readFileSync(filename,'utf8').replace(/\r/g,'').trim().split('\n');
  must(rows.shift()==='id,asset,observed_at,known_at,value,price_basis,currency,source_url',
      'Expected the exact CSV header id,asset,observed_at,known_at,value,price_basis,currency,source_url');
  must(rows.length>0,'empty CSV');
  must(rows.length<=10000,'too many rows');
  const result=rows.map((line,index)=>{
    const cells=line.split(',');
    must(cells.length===8,'CSV line '+(index+2)+' must have eight unquoted columns; use JSONL for commas in fields');
    const [id,asset,observed_at,known_at,value,price_basis,currency,source_url]=cells;
    return canonicalFact({id,kind:'precio',observed_at,known_at,value,asset,price_basis,currency,source_url});
  });
  return stringifyJSONL(result);
}
function summary(rows){
  return {
    status:'ARCHIVO_LOCAL_VALIDADO',count:rows.length,
    kinds:Object.fromEntries(KIND.map(k=>[k,rows.filter(x=>x.kind===k).length])),
    historical_sha256:ledgerHash(rows),
    earliest_known_at:rows[0]?.known_at??null,
    latest_known_at:rows.at(-1)?.known_at??null,
    warning:'No implica que los precios ni fechas sean autenticos: verifica procedencia y licencia de la fuente'
  };
}
async function main(){
  const [, ,command,...params]=process.argv;
  if(command==='instituciones'){await runInstitutions(params);return;}
  if(command==='entrada'){await runInput(params);return;}
  if(!command||['ayuda','help','--help'].includes(command)){usage();return;}
  if(command==='crear-exabyte'){
    must(params.length===2,'uso: crear-exabyte PARAMETROS.json SALIDA.xi');
    const model=compilarMegaceldas(JSON.parse(readFileSync(params[0],'utf8')));
    writeFileSync(params[1],model.xi,{flag:'wx'});
    console.log(JSON.stringify({path:params[1],schema:model.schema,
      logical_cells:model.logical_cells,steps:model.settings.steps,
      queries:model.settings.query_count,xi_sha256:model.xi_sha256,
      warning:'Campo logico compactado; no se materializo un exabyte fisico'},null,2));
    return;
  }
  if(command==='crear-singularidad'){
    must(params.length===2,'uso: crear-singularidad PARAMETROS.json SALIDA.xi');
    const model=compilarSingularidad(JSON.parse(readFileSync(params[0],'utf8')));
    writeFileSync(params[1],model.xi,{flag:'wx'});
    console.log(JSON.stringify({path:params[1],schema:model.schema,
      epochs:model.epoch_count,logical_state_bytes:model.logical_state_bytes,
      xi_sha256:model.xi_sha256,
      t_zero:model.formal_boundary.t_zero},null,2));
    return;
  }
  if(command==='crear-cosmos'){
    must(params.length===2,'uso: crear-cosmos PARAMETROS.json SALIDA.xi');
    const compiled=compilarCosmologia(JSON.parse(readFileSync(params[0],'utf8')));
    writeFileSync(params[1],compiled.xi,{flag:'wx'});
    console.log(JSON.stringify({path:params[1],schema:compiled.schema,
      epochs:compiled.epoch_count,memory_bytes:compiled.logical_output_bytes,
      xi_sha256:compiled.xi_sha256,
      evidence_scope:compiled.physical_scope},null,2));
    return;
  }
  if(command==='crear-gravedad'){
    must(params.length===2,'uso: crear-gravedad ESCENARIO.json SALIDA.xi');
    const model=compilarGravedad(JSON.parse(readFileSync(params[0],'utf8')));
    writeFileSync(params[1],model.xi,{flag:'wx'});
    console.log(JSON.stringify({path:params[1],schema:model.schema,sha256:model.xi_sha256,
      pasos:model.pasos,autoridad:'XI / REVERSE-PC / Inverse Ether Memory'},null,2));
    return;
  }
  if(command==='crear-fisica'){
    must(params.length===2,'uso: crear-fisica ESCENARIO.json SALIDA.xi');
    const program=compilarSistema(JSON.parse(readFileSync(params[0],'utf8')));
    writeFileSync(params[1],program.xi,{flag:'wx'});
    console.log(JSON.stringify({path:params[1],schema:program.schema,
      xi_sha256:program.xi_sha256,config_sha256:program.configuration_sha256,
      horizon:program.configuration.horizonte_s,
      fisica:'billar elastico 2D en REVERSE XI / Inverse Ether Memory'},null,2));
    return;
  }
  if(command==='entrenar-dinamica'){
    must(params.length===4&&MODES.includes(params[3]),'uso: entrenar-dinamica HISTORIA.json BIN_NATIVO INFORME_NUEVO.json strict|exploratory_close_availability');
    const report=temporalExperiment(params[1],JSON.parse(readFileSync(params[0],'utf8')),{mode:params[3]});
    writeFileSync(params[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({file:params[2],folds:report.folds.length,horizons:report.horizons,live_activation:report.live_activation},null,2));return;
  }
  if(command==='perfil-dinamica'){
    must(params.length===4,'uso: perfil-dinamica HISTORIA.json INFORME.json BIN_NATIVO PERFIL_NUEVO.json');
    const profile=liveTemporalProfile(params[2],JSON.parse(readFileSync(params[0],'utf8')),JSON.parse(readFileSync(params[1],'utf8')));
    writeFileSync(params[3],JSON.stringify(profile,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({file:params[3],states:profile.model.state_masks.length,labels:profile.model.labels,native:profile.native,profile_sha256:profile.profile_sha256},null,2));return;
  }
  if(command==='consultar-dinamica'){
    must(params.length===4&&/^\d+$/.test(params[1])&&/^\d+$/.test(params[2]),'uso: consultar-dinamica CHECKPOINT.json MASCARA PASOS BIN_NATIVO');
    console.log(JSON.stringify(queryTemporal(params[3],JSON.parse(readFileSync(params[0],'utf8')),[{mask:Number(params[1]),steps:Number(params[2])}]),null,2));return;
  }
  if(command==='universo-global-u003'){
    must(params.length<=1,'uso: universo-global-u003 [RESULTADO_NUEVO.json]');
    const result=await observeWorldU003();
    const output=JSON.stringify(result,null,2)+'\n';
    if(params[0])writeFileSync(params[0],output,{flag:'wx'});
    console.log(output.trim());return;
  }
  if(command==='universo-global'){
    must(params.length<=1,'uso: universo-global [RESULTADO_NUEVO.json]');
    const result=await observeGlobalUniverse();
    const output=JSON.stringify(result,null,2)+'\n';
    if(params[0])writeFileSync(params[0],output,{flag:'wx'});
    console.log(output.trim());return;
  }
  if(command==='verificar-universo-global'){
    must(params.length===2,'uso: verificar-universo-global CAPTURA_U002.json BIN_XI');
    const capture=JSON.parse(readFileSync(params[0],'utf8'));
    const snapshot=capture?.universal_state??capture;
    console.log(JSON.stringify(proveGlobalEther(params[1],snapshot),null,2));return;
  }
  if(command==='universo-btc-15m'){
    must(params.length<=1,'uso: universo-btc-15m [RESULTADO_NUEVO.json]');
    const result=await observeUniverseBTC();
    const output=JSON.stringify(result,null,2)+'\n';
    if(params[0])writeFileSync(params[0],output,{flag:'wx'});
    console.log(output.trim());return;
  }
  if(command==='universo-corte'){
    must(params.length>=2&&params.length<=3,'uso: universo-corte OBSERVACIONES.json CORTE_UTC [RESULTADO_NUEVO.json]');
    const records=JSON.parse(readFileSync(params[0],'utf8'));
    const result=universeSnapshot(records,{cutoff:params[1]});
    const output=JSON.stringify(result,null,2)+'\n';
    if(params[2])writeFileSync(params[2],output,{flag:'wx'});
    console.log(output.trim());return;
  }
  if(command==='bitcoin-15m'){
    must(params.length<=1,'uso: bitcoin-15m [RESULTADO_NUEVO.json]');
    const measurement=await observeAndProject15m();
    const output=JSON.stringify(measurement,null,2)+'\n';
    if(params[0])writeFileSync(params[0],output,{flag:'wx'});
    console.log(output.trim());return;
  }
  if(command==='analizar-causas-bitcoin'){
    must(params.length===2||params.length===3,'uso: analizar-causas-bitcoin HISTORIA.json CORTE_UTC [strict|exploratory_close_availability]');
    const mode=params[2]??'strict';must(MODES.includes(mode),'modo historico invalido');
    const history=JSON.parse(readFileSync(params[0],'utf8'));
    console.log(JSON.stringify(causalSnapshot(history,{cutoff:params[1],mode}),null,2));return;
  }
  if(command==='probar-causas-bitcoin'){
    must(params.length===1||params.length===2,'uso: probar-causas-bitcoin HISTORIA.json [strict|exploratory_close_availability]');
    const mode=params[1]??'strict';must(MODES.includes(mode),'modo historico invalido');
    const history=JSON.parse(readFileSync(params[0],'utf8'));
    console.log(JSON.stringify(causalWalkForward(history,{mode}),null,2));return;
  }
  if(command==='actualizar-bitcoin'){
    must(params.length===1||params.length===2,'uso: actualizar-bitcoin CAPTURA_NUEVA.json [HECHOS_NUEVOS.jsonl]');
    const capture=await collectBitcoin();
    writeFileSync(params[0],JSON.stringify(capture,null,2)+'\n',{flag:'wx'});
    if(params[1])writeFileSync(params[1],stringifyJSONL(exportCaptureFacts(capture)),{flag:'wx'});
    console.log(JSON.stringify({id:capture.id,status:capture.status,asset:capture.asset,quote:capture.quote,
      news:capture.news.length,successful_sources:capture.successful_sources,total_sources:capture.total_sources,
      capture_file:params[0],facts_file:params[1]??null},null,2));return;
  }
  if(command==='descargar-bitcoin'){
    must(params.length===3,'uso: descargar-bitcoin INICIO_UTC FIN_UTC HISTORIA_NUEVA.json');
    const history=await downloadHistory({start:params[0],end:params[1]});
    writeFileSync(params[2],JSON.stringify(history,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({file:params[2],records:history.records.length,ledger_sha256:history.ledger_sha256,
      archives_ok:history.archives.filter(row=>row.status==='ok').length,archives_failed:history.archives.filter(row=>row.status==='error').length},null,2));return;
  }
  if(command==='calibrar-bitcoin'){
    must([4,5].includes(params.length)&&MODES.includes(params[3]),'uso: calibrar-bitcoin HISTORIA.json BIN_XI INFORME_NUEVO.json strict|exploratory_close_availability [CASOS_NUEVOS.json]');
    const history=JSON.parse(readFileSync(params[0],'utf8'));
    const result=calibrateHistory(params[1],history,{mode:params[3]});
    writeFileSync(params[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    if(params[4])writeFileSync(params[4],JSON.stringify(pastComparisons(history,result),null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({file:params[2],status:result.status,mode:result.mode,raw:result.raw,calibrated:result.calibrated,
      folds:result.folds.length,availability_assumption:result.availability_assumption,live_activation:result.live_activation},null,2));return;
  }
  if(command==='analizar-realidades'){
    must(params.length===6,'uso: analizar-realidades MODELO_DUAL hechos.jsonl CORTE_UTC ESCENARIOS.json BIN_XI REGISTRO.jsonl');
    const checkpoint=JSON.parse(readFileSync(params[0],'utf8'));
    const run=simulateRealities(params[4],checkpoint,JSON.parse(readFileSync(params[3],'utf8')));
    const issued=registerForecast(params[5],predictDual(params[4],checkpoint,readJsonl(params[1]),params[2])).event;
    console.log(JSON.stringify(registerRealities(params[5],issued.forecast_id,run.analysis),null,2));return;
  }
  if(command==='experimento-realidades'){
    must(params.length===2,'uso: experimento-realidades BIN_XI DIRECTORIO_NUEVO');
    console.log(JSON.stringify(realitiesExperiment(params[0],params[1]),null,2));return;
  }
  if(command==='entrenar-dual'){
    must(params.length===4,'uso: entrenar-dual hechos.jsonl CONFIG.json BIN_XI MODELO_DUAL.json');
    const {checkpoint,...summary}=trainDual(params[2],readJsonl(params[0]),JSON.parse(readFileSync(params[1],'utf8')));
    if(checkpoint)writeFileSync(params[3],JSON.stringify(checkpoint,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({...summary,checkpoint_file:checkpoint?params[3]:null},null,2));return;
  }
  if(command==='pronostico-dual'){
    must(params.length===5,'uso: pronostico-dual MODELO_DUAL.json hechos.jsonl CORTE_UTC BIN_XI REGISTRO.jsonl');
    const forecast=predictDual(params[3],JSON.parse(readFileSync(params[0],'utf8')),readJsonl(params[1]),params[2]);
    const result=registerForecast(params[4],forecast);
    console.log(JSON.stringify(result,null,2));return;
  }
  if(command==='contrastar-dual'){
    must(params.length===3,'uso: contrastar-dual REGISTRO.jsonl hechos.jsonl CORTE_UTC');
    console.log(JSON.stringify(reconcileJournal(params[0],readJsonl(params[1]),params[2]),null,2));return;
  }
  if(command==='patrones'){
    must(params.length===1,'uso: patrones REGISTRO.jsonl');
    console.log(JSON.stringify(patternResults(readJournal(params[0])),null,2));return;
  }
  if(command==='verificar-patron'){
    must(params.length===3,'uso: verificar-patron REGISTRO.jsonl ID_PATRON BIN_XI');
    const {checkpoint,...proof}=provePattern(params[2],readJournal(params[0]),params[1]);
    console.log(JSON.stringify(proof,null,2));return;
  }
  if(command==='experimento-dual'){
    must(params.length===2,'uso: experimento-dual BIN_XI DIRECTORIO_NUEVO');
    console.log(JSON.stringify(dualExperiment(params[0],params[1]),null,2));return;
  }
  if(command==='importar-narrativa'){
    must(params.length===2&&['reliefweb','gdelt'].includes(params[0]),
      'uso: importar-narrativa reliefweb|gdelt CAPTURA.json');
    const raw=JSON.parse(readFileSync(params[1],'utf8'));
    process.stdout.write(stringifyJSONL(params[0]==='reliefweb'?importReliefWeb(raw):importGDELT(raw)));return;
  }
  if(command==='experimento-narrativa'){
    must(params.length===2,'uso: experimento-narrativa BIN_XI DIRECTORIO_RESULTADOS');
    console.log(JSON.stringify(narrativeExperiment(params[0],params[1]),null,2));return;
  }
  if(command==='entrenar-narrativa'){
    must(params.length===4,'uso: entrenar-narrativa hechos.jsonl CONFIG.json BIN_XI MODELO.json');
    const result=trainNarrative(params[2],readJsonl(params[0]),JSON.parse(readFileSync(params[1],'utf8')));
    const {checkpoint,...summary}=result;
    if(checkpoint)writeFileSync(params[3],JSON.stringify(checkpoint,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({...summary,checkpoint_file:checkpoint?params[3]:null},null,2));return;
  }
  if(['probabilidad-narrativa','evaluar-narrativa'].includes(command)){
    must(params.length===4,'uso: '+command+' MODELO.json hechos.jsonl CORTE_UTC BIN_XI');
    const checkpoint=JSON.parse(readFileSync(params[0],'utf8')),records=readJsonl(params[1]);
    const result=command==='probabilidad-narrativa'
      ?predictNarrative(params[3],checkpoint,records,params[2])
      :evaluateNarrative(params[3],checkpoint,records,params[2]);
    console.log(JSON.stringify(result,null,2));return;
  }
  if(command==='experimento-aprendiz'){
    must(params.length===2,'uso: experimento-aprendiz BIN_XI DIRECTORIO_RESULTADOS');
    console.log(JSON.stringify(experiment(params[0],params[1]),null,2));return;
  }
  if(command==='aprender-leyes'){
    must(params.length===4,'uso: aprender-leyes transiciones.jsonl CORTE_UTC BIN_XI MODELO.json');
    const result=learn(params[2],parseTransitions(readFileSync(params[0],'utf8')),params[1]);
    if(result.checkpoint)writeFileSync(params[3],JSON.stringify(result.checkpoint,null,2)+'\n',{flag:'wx'});
    const {checkpoint,...summary}=result;
    console.log(JSON.stringify({...summary,checkpoint_file:checkpoint?params[3]:null},null,2));return;
  }
  if(command==='predecir-estado'){
    must(params.length===4,'uso: predecir-estado MODELO.json ESTADO_BINARIO PASOS BIN_XI');
    must(/^[1-9][0-9]*$/.test(params[2]),'PASOS debe ser entero positivo');
    const checkpoint=JSON.parse(readFileSync(params[0],'utf8'));
    const {xi,...forecast}=predict(params[3],checkpoint,params[1],Number(params[2]));
    console.log(JSON.stringify(forecast,null,2));return;
  }
  if(command==='convertir-precios'){
    process.stdout.write(convertPriceCSV(params[0]));return;
  }
  const records=readJsonl(params[0]);
  if(command==='validar'){
    console.log(JSON.stringify(summary(records),null,2));return;
  }
  const cutoff=timestamp(params[1],'cutoff');
  if(command==='corte'){
    process.stdout.write(stringifyJSONL(asOf(records,cutoff)));return;
  }
  if(command==='referencia'){
    must(params[2],'missing asset name');
    console.log(JSON.stringify(persistenceBaseline(records,cutoff,params[2]),null,2));return;
  }
  if(command==='verificar-ether'){
    must(params[2],'missing original Mundo X quantum runtime');
    console.log(JSON.stringify(proveWithOriginalEther(params[2],records,cutoff),null,2));return;
  }
  throw Error('unknown command '+command);
}
try{await main()}catch(error){console.error('LaPlaceDIG: '+error.message);process.exitCode=1;}
