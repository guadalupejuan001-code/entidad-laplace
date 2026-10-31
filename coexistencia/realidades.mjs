/* Bounded native scenario ensemble. Each '?' is an explicitly declared
 * equal-amplitude independent bit. Classical scenario weights are separate
 * from Born probabilities; neither is inferred as real-world truth here.
 */
import {affineProjection,executeXI,digest,RUNTIME_REF} from '../inteligencia/laplace.mjs';
import {restoreDual} from './modelo.mjs';
const need=(ok,message)=>{if(!ok)throw new Error(message)};
const BASE=2000000000000000n;
export const MAX_SCENARIOS=1024,MAX_QUERY_QUBITS=4096;

function scenarios(raw,width){
  need(Array.isArray(raw)&&raw.length>0&&raw.length<=MAX_SCENARIOS,'escenarios permitidos: 1..1024');
  need(raw.length*(width+1)<=MAX_QUERY_QUBITS,'presupuesto de 4096 direcciones de qubit excedido');
  const ids=new Set();
  return raw.map(row=>{
    need(row&&Object.keys(row).sort().join(',')==='id,input,weight','campos de escenario: id,input,weight');
    need(typeof row.id==='string'&&/^[a-zA-Z0-9_.:-]{1,80}$/.test(row.id)&&!ids.has(row.id),'id de escenario invalido/duplicado');
    ids.add(row.id);
    need(typeof row.input==='string'&&row.input.length===width&&/^[01?]+$/.test(row.input),
      'cada escenario requiere '+width+' bits 0,1 o ?');
    need(Number.isInteger(row.weight)&&row.weight>=1&&row.weight<=1000000,'peso entero permitido: 1..1000000');
    return {id:row.id,input:row.input,weight:row.weight};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}

export function simulateRealities(binary,dualCheckpoint,rawScenarios){
  const {context}=restoreDual(binary,dualCheckpoint);
  need(dualCheckpoint.deterministic,'la simulacion requiere una ley identificada; no inventar leyes tras una refutacion');
  const law=affineProjection(binary,dualCheckpoint.deterministic),items=scenarios(rawScenarios,law.width);
  const q=(row,bit)=>(BASE+BigInt(row*(law.width+1)+bit)).toString();
  const source=['# Laplace: escenarios declarados ejecutados por el XI original','background zero'];
  for(let row=0;row<items.length;row++){
    for(let bit=0;bit<law.width;bit++){
      if(items[row].input[bit]==='1')source.push('x '+q(row,bit));
      if(items[row].input[bit]==='?')source.push('h '+q(row,bit));
    }
    const target=q(row,law.width);
    if(law.coefficients[0][0]==='1')source.push('x '+target);
    for(let bit=0;bit<law.width;bit++)if(law.coefficients[bit+1][0]==='1'){
      source.push('cx '+q(row,bit)+' '+target);
    }
    source.push('probz '+target);
  }
  source.push('stats');
  const xi=source.join('\n')+'\n',run=executeXI(binary,xi);
  const measured=run.output.filter(row=>row.type==='probz'),stats=run.output.filter(row=>row.type==='stats');
  need(measured.length===items.length&&stats.length===1,'resultados de escenarios incompletos');
  let totalWeight=0,twicePositiveMass=0,twiceExpectedPositive=0,positive=0,negative=0,uncertain=0;
  const results=items.map((item,row)=>{
    const p=measured[row].probability_one;
    need(measured[row].address===q(row,law.width)&&[0,0.5,1].includes(p),'observable XI inesperado');
    totalWeight+=item.weight;twicePositiveMass+=item.weight*(2*p);twiceExpectedPositive+=2*p;
    if(p===1)positive++;else if(p===0)negative++;else uncertain++;
    return {...item,positive_probability:p,negative_probability:1-p};
  });
  const positiveMass=twicePositiveMass/2,expectedPositive=twiceExpectedPositive/2;
  const result={schema:'laplace-realities-v1',runtime_ref:RUNTIME_REF,objective:context.objective,
    assumed_law_xi_sha256:dualCheckpoint.deterministic.xi_sha256,
    selected_features:context.selected_features,scenario_sha256:digest(JSON.stringify(items)),
    assumptions:'cada ? es un bit independiente equiprobable; pesos clasicos declarados, no aprendidos por esta simulacion',
    method:'marginales Born nativas y suma ponderada de escenarios',
    labels:{positive:'supera_el_coste_supuesto',negative:'no_supera_el_coste_supuesto'},
    scenario_count:items.length,known_positive_scenarios:positive,known_negative_scenarios:negative,
    uncertain_scenarios:uncertain,expected_positive_count:expectedPositive,
    expected_negative_count:items.length-expectedPositive,total_weight:totalWeight,
    positive_mass:positiveMass,negative_mass:totalWeight-positiveMass,
    positive_probability:twicePositiveMass/(2*totalWeight),negative_probability:1-twicePositiveMass/(2*totalWeight),
    scenarios:results,xi_sha256:digest(xi),
    native:{active_qubits:stats[0].active_qubits,components:stats[0].components,
      largest_component:stats[0].largest_component,tableau_bytes:stats[0].tableau_bytes,
      address_bytes:stats[0].address_bytes,query_qubit_address_bound:items.length*(law.width+1)},
    exhaustive_state_enumeration:false,random_samples_drawn:0,quantum_hardware:false,
    real_world_calibration_demonstrated:false};
  return {analysis:{...result,analysis_sha256:digest(JSON.stringify(result))},xi};
}
