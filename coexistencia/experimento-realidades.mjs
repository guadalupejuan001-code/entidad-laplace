import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {trainDual,predictDual} from './modelo.mjs';
import {closedNarrativeData} from './experimento.mjs';
import {simulateRealities} from './realidades.mjs';
import {readJournal,registerForecast,registerRealities,reconcileJournal,patternResults,provePattern} from './patrones.mjs';
const need=(ok,message)=>{if(!ok)throw new Error(message)};

export function realitiesExperiment(binary,directory){
  const out=resolve(directory);mkdirSync(out,{recursive:true});
  const journal=join(out,'03_registro_patrones.jsonl');
  need(readJournal(journal).length===0,'usar un directorio nuevo para el experimento de realidades');
  const save=(name,value)=>writeFileSync(join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
  const data=closedNarrativeData(),trained=trainDual(binary,data.records,data.config);
  need(trained.deterministic.selected_features.length===2,'el control requiere dos variables independientes');
  const items=Array.from({length:512},(_,i)=>({id:'scenario-'+String(i).padStart(4,'0'),input:'??',weight:1}));
  const run=simulateRealities(binary,trained.checkpoint,items);
  need(run.analysis.native.active_qubits>1000,'no se ejecutaron mas de mil qubits activos');
  need(run.analysis.positive_probability===0.5&&run.analysis.expected_positive_count===256,
    'probabilidad de paridad incierta incorrecta');
  save('00_modelo_dual.json',trained.checkpoint);
  save('01_escenarios_512.json',items);
  save('02_simulacion_nativa.xi',run.xi);
  const issued=registerForecast(journal,predictDual(binary,trained.checkpoint,data.records,data.config.validation_end)).event;
  registerRealities(journal,issued.forecast_id,run.analysis);
  // Unequal weights make counting alternatives as if equally likely wrong.
  const weighted=simulateRealities(binary,trained.checkpoint,[
    {id:'positive',input:'00',weight:9},
    {id:'negative',input:'10',weight:1},
    {id:'uncertain',input:'??',weight:1}
  ]);
  need(weighted.analysis.positive_probability===9.5/11,'se ignoraron los pesos de escenarios');
  registerRealities(journal,issued.forecast_id,weighted.analysis);
  reconcileJournal(journal,data.records,data.test_end);
  const registry=patternResults(readJournal(journal));
  need(registry.patterns[0].metrics.issued===1&&registry.patterns[0].metrics.simulation_runs===2,
    'los analisis duplicaron el numero de pronosticos');
  const proof=provePattern(binary,readJournal(journal),issued.pattern_id);
  save('04_resultados_por_patron.json',registry);
  save('05_pesos_desiguales.xi',weighted.xi);
  save('06_patron_en_ether.xi',proof.checkpoint.xi);
  const r=run.analysis,w=weighted.analysis;
  const summary={suite:'LAPLACE_E004_REALIDADES_XI_MAS_DE_1000_QUBITS',synthetic:true,
    selected_features:r.selected_features,scenario_count:r.scenario_count,
    expected_positive_count:r.expected_positive_count,expected_negative_count:r.expected_negative_count,
    positive_mass:r.positive_mass,negative_mass:r.negative_mass,
    positive_probability:r.positive_probability,negative_probability:r.negative_probability,native:r.native,
    unequal_weights:{scenario_count:w.scenario_count,expected_positive_count:w.expected_positive_count,
      positive_mass:w.positive_mass,negative_mass:w.negative_mass,total_weight:w.total_weight,
      positive_probability:w.positive_probability},
    journal:{forecasts:registry.patterns[0].metrics.issued,analyses:registry.patterns[0].metrics.simulation_runs,
      patterns:registry.patterns.length,events:registry.events},pattern_ether_proof:proof.native,
    exhaustive_state_enumeration:false,quantum_hardware:false,
    physical_realities_demonstrated:false,real_world_calibration_demonstrated:false,
    scope:'circuitos Clifford compactos con incertidumbre y pesos declarados; no simula cualquier universo de 1536 qubits'};
  save('resultado.json',summary);return summary;
}
