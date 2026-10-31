/* Reproducible, synthetic evidence. Hidden world laws never enter learn(). */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {learn,predict,executeXI,digest} from './laplace.mjs';

const need=(ok,message)=>{if(!ok)throw new Error(message)};
function random(seed){
  let value=seed>>>0;
  return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value};
}
const asBits=(value,width)=>Array.from({length:width},(_,bit)=>String((value>>>bit)&1)).join('');

// This generator is the environment, not the learner's hypothesis or answer.
// It supplies only experimentally observed (before, after) pairs to learn().
export function hiddenWorld(width,seed){
  need(Number.isInteger(width)&&width>=2&&width<=16,'ancho del mundo: 2..16');
  const rand=random(seed),gates=[];
  for(let k=0;k<width*5;k++){
    const a=(rand()>>>8)%width;
    if(k%5===0){gates.push({op:'x',a});continue}
    let b=(rand()>>>8)%width;
    if(a===b)b=(b+1)%width;
    gates.push({op:'cx',a,b});
  }
  return {width,gates};
}

function gateLines(world){
  return world.gates.map(g=>g.op==='x'?'x '+g.a:'cx '+g.a+' '+g.b);
}

export function observeTransitions(binary,world,inputs){
  const source=['# Entorno experimental: observar entradas independientes','background zero'];
  const gates=gateLines(world);
  for(const input of inputs){
    need(input.length===world.width&&/^[01]+$/.test(input),'entrada de mundo invalida');
    const prepare=[...input].flatMap((bit,i)=>bit==='1'?['x '+i]:[]);
    source.push(...prepare,...gates);
    for(let bit=0;bit<world.width;bit++)source.push('probz '+bit);
    // X and CNOT are self-inverse. Reset by uncomputation, never measurement.
    source.push(...gates.slice().reverse(),...prepare.slice().reverse(),'compact');
  }
  source.push('stats');
  const xi=source.join('\n')+'\n',run=executeXI(binary,xi);
  const observed=run.output.filter(row=>row.type==='probz');
  need(observed.length===world.width*inputs.length,'faltan observaciones del entorno');
  const outputs=inputs.map((_,row)=>Array.from({length:world.width},(_,bit)=>{
    const item=observed[row*world.width+bit];
    need(item.address===String(bit)&&[0,1].includes(item.probability_one),
      'observacion no determinista o direccion incorrecta');
    return String(item.probability_one);
  }).join(''));
  return {outputs,xi};
}

function observeTrajectory(binary,world,initial,steps,{eventTick=null,eventSite=0}={}){
  const source=['# Realidad ejecutada despues de guardar el pronostico','background zero'];
  for(let bit=0;bit<world.width;bit++)if(initial[bit]==='1')source.push('x '+bit);
  for(let tick=1;tick<=steps;tick++){
    if(tick===eventTick)source.push('# Causa externa desconocida','x '+eventSite);
    source.push(...gateLines(world));
    for(let bit=0;bit<world.width;bit++)source.push('probz '+bit);
  }
  source.push('stats');
  const xi=source.join('\n')+'\n';
  const observed=executeXI(binary,xi).output.filter(row=>row.type==='probz');
  need(observed.length===steps*world.width,'trayectoria incompleta');
  const states=Array.from({length:steps},(_,row)=>Array.from({length:world.width},(_,bit)=>{
    const item=observed[row*world.width+bit];
    need(item.address===String(bit)&&[0,1].includes(item.probability_one),'observacion invalida');
    return String(item.probability_one);
  }).join(''));
  return {states,xi};
}

function compare(predicted,actual){
  need(predicted.length===actual.length,'horizontes distintos');
  let matched=0,bitErrors=0,first=null;
  for(let tick=0;tick<actual.length;tick++){
    need(predicted[tick].length===actual[tick].length,'anchos distintos');
    if(predicted[tick]===actual[tick])matched++;
    else if(first===null)first=tick+1;
    for(let bit=0;bit<actual[tick].length;bit++)if(predicted[tick][bit]!==actual[tick][bit])bitErrors++;
  }
  return {states:actual.length,matched_states:matched,bit_errors:bitErrors,first_divergence:first};
}

export function experiment(binary,directory){
  const out=resolve(directory);mkdirSync(out,{recursive:true});
  const save=(name,value)=>writeFileSync(join(out,name),
    typeof value==='string'?value:JSON.stringify(value,null,2)+'\n','utf8');
  const world=hiddenWorld(16,0x1A91ACE),rand=random(0xC0FFEE);
  const inputs=[];
  while(inputs.length<48){
    const input=asBits(rand()>>>8,world.width);
    if(!inputs.includes(input))inputs.push(input);
  }
  const observations=observeTransitions(binary,world,inputs);
  save('00_observar_entorno.xi',observations.xi);
  const records=inputs.map((before,i)=>{
    const time=new Date(Date.UTC(2020,0,1,0,i)).toISOString();
    return {id:'sintetico-'+i,before,after:observations.outputs[i],observed_at:time,known_at:time};
  });
  save('00_transiciones_sinteticas.json',records);
  const cutoff='2020-01-01T01:00:00Z';
  const trained=learn(binary,records,cutoff);
  need(trained.status==='ley_identificada','el aprendiz no identifico la ley oculta');
  save('01_checkpoint.json',trained.checkpoint);
  save('01_aprendizaje.xi',trained.checkpoint.xi);
  // Restore from disk. Forecast and seal BEFORE executing the held-out future.
  const restored=JSON.parse(readFileSync(join(out,'01_checkpoint.json'),'utf8'));
  let initial=asBits(rand()>>>8,world.width);
  while(inputs.includes(initial))initial=asBits(rand()>>>8,world.width);
  const forecast=predict(binary,restored,initial,32);
  // Timing is a measurement, not part of the deterministic forecast seal.
  const {elapsed_ms,...sealedForecast}=forecast;
  save('02_pronostico_antes_de_observar.json',sealedForecast);
  save('02_pronostico.xi',forecast.xi);
  const sealed=digest(readFileSync(join(out,'02_pronostico_antes_de_observar.json')));
  const reality=observeTrajectory(binary,world,initial,32);
  const shock=observeTrajectory(binary,world,initial,32,{eventTick:9,eventSite:3});
  save('03_futuro_revelado.xi',reality.xi);
  save('04_causa_externa.xi',shock.xi);
  need(sealed===digest(readFileSync(join(out,'02_pronostico_antes_de_observar.json'))),
    'se modifico el pronostico despues de observar');
  const generalization=compare(forecast.states,reality.states);
  need(generalization.matched_states===32,'fallo fuera de las observaciones de entrenamiento');
  const unknown=compare(forecast.states,shock.states);
  need(unknown.first_divergence===9,'el sistema oculto no distingue la causa externa');
  const changed={id:'evento-desconocido',before:reality.states[7],after:shock.states[8],
    observed_at:'2020-01-02T00:00:00Z',known_at:'2020-01-02T00:01:00Z'};
  const updated=learn(binary,[...records,changed],'2020-01-02T00:01:00Z');
  need(updated.status==='ley_refutada'&&updated.checkpoint===null,'no se retiro la ley refutada');
  // The same late evidence must have no influence on the earlier learned state.
  const earlier=learn(binary,[...records,changed],cutoff);
  need(earlier.checkpoint.xi_sha256===trained.checkpoint.xi_sha256,'fuga de informacion futura');
  const insufficient=learn(binary,records.slice(0,4),cutoff);
  need(insufficient.status==='evidencia_insuficiente'&&insufficient.next_probe,'falsa certeza con pocas muestras');
  const summary={suite:'LAPLACE_E001_APRENDER_LEYES_XI',synthetic:true,
    grammar:'F(x) = b XOR A*x sobre GF(2); ancho 1..16',
    host:'cronologia, plan de pivotes desde entradas, compilacion y auditoria',
    native_xi:'transformacion de salidas, recuperacion de coeficientes y ejecucion de pronosticos',
    training_observations:trained.observations,rank:trained.rank,required_rank:trained.required_rank,
    training_ids:trained.checkpoint.training_ids,
    independent_initial_state:initial,checkpoint_replayed_from_disk:true,
    forecast_sealed_before_reveal:true,sealed_file_sha256:sealed,
    learned_rules:trained.rules,unseen_future:generalization,
    persistence:compare(Array(32).fill(initial),reality.states),unknown_event:unknown,
    after_contradiction:updated.status,abstains_after_contradiction:updated.checkpoint===null,
    insufficient_evidence:{status:insufficient.status,next_probe:insufficient.next_probe},
    future_leakage_check:true,training_native:trained.native,forecast_native:forecast.native,
    xi_sha256:trained.checkpoint.xi_sha256,forecast_sha256:forecast.forecast_sha256,
    limits:{financial_prediction_demonstrated:false,general_intelligence:false,
      arbitrary_nonlinear_law_discovery:false,quantum_hardware:false,
      quantum_speedup_demonstrated:false,persistent_runtime_session:false}};
  save('resultado.json',summary);
  return summary;
}
