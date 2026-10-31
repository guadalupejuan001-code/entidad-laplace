/*
 * Laplace E001: discover affine binary transition laws from observations.
 * The host plans Gaussian row operations using INPUTS ONLY. Native XI applies
 * those operations to the observed outputs and executes every forecast.
 * No alternate quantum runtime, external model or host outcome solver.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {timestamp} from '../historia/contrato.mjs';

export const RUNTIME_REF='3d29556eff4d1079c791abab38e203fc209f1722';
export const MAX_WIDTH=16;
export const MAX_TRANSITIONS=128;
export const MAX_STEPS=32;
const MAX_PROGRAM_BYTES=2*1024*1024;
const MODEL_BASE=940000000000000000000000000000n;
const FORECAST_BASE=950000000000000000000000000000n;
const QBASE=1000000000000000n;
const SCHEMA='laplace-affine-xi-v1';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message)};
const address=(row,bit,stride)=>(QBASE+BigInt(row*stride+bit)).toString();
const bits=(value,width)=>{
  need(typeof value==='string'&&/^[01]+$/.test(value)&&value.length===width,
    'el estado debe contener exactamente '+width+' bits (indice 0 a la izquierda)');
  return value;
};

export function transitions(rows){
  need(Array.isArray(rows)&&rows.length<=MAX_TRANSITIONS,
    'maximo '+MAX_TRANSITIONS+' transiciones por experimento');
  const ids=new Set();
  const out=rows.map(row=>{
    need(row&&typeof row==='object'&&!Array.isArray(row),'transicion invalida');
    need(Object.keys(row).sort().join(',')==='after,before,id,known_at,observed_at',
      'campos de transicion: id,before,after,observed_at,known_at');
    need(typeof row.id==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(row.id),
      'id de transicion invalido');
    need(!ids.has(row.id),'id de transicion duplicado: '+row.id);
    ids.add(row.id);
    const width=row.before?.length;
    need(Number.isInteger(width)&&width>=1&&width<=MAX_WIDTH,
      'ancho binario permitido: 1..'+MAX_WIDTH);
    const before=bits(row.before,width),after=bits(row.after,width);
    const observed_at=timestamp(row.observed_at,'observed_at');
    const known_at=timestamp(row.known_at,'known_at');
    need(known_at>=observed_at,'una transicion no puede conocerse antes de ocurrir');
    return Object.freeze({id:row.id,before,after,observed_at,known_at});
  });
  need(new Set(out.map(r=>r.before.length)).size<=1,'no mezclar anchos/sistemas');
  return Object.freeze(out.sort((a,b)=>a.known_at.localeCompare(b.known_at)||a.id.localeCompare(b.id)));
}

export function parseTransitions(source){
  need(typeof source==='string'&&Buffer.byteLength(source)<=MAX_PROGRAM_BYTES,
    'el diario de transiciones excede 2 MiB');
  return transitions(source.split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{
    try{return JSON.parse(line)}catch{throw new Error('JSON invalido en transicion '+(i+1))}
  }));
}

// Labels (after) never enter this planner. The same inputs always give the same
// elimination plan, regardless of the unknown law or its observed outcomes.
export function planReduction(inputs){
  need(Array.isArray(inputs)&&inputs.length>0&&inputs.length<=MAX_TRANSITIONS,'faltan entradas');
  const width=inputs[0].length;
  need(width>=1&&width<=MAX_WIDTH,'ancho fuera de presupuesto');
  const matrix=inputs.map(input=>[1,...bits(input,width)].map(Number));
  const operations=[],pivots=[];
  let rank=0;
  for(let col=0;col<=width;col++){
    const pivot=matrix.findIndex((row,i)=>i>=rank&&row[col]===1);
    if(pivot<0)continue;
    if(pivot!==rank){
      [matrix[rank],matrix[pivot]]=[matrix[pivot],matrix[rank]];
      operations.push({op:'swap',a:rank,b:pivot});
    }
    for(let row=0;row<matrix.length;row++){
      if(row===rank||matrix[row][col]===0)continue;
      for(let k=0;k<=width;k++)matrix[row][k]^=matrix[rank][k];
      operations.push({op:'add',a:rank,b:row});
    }
    pivots.push(col);rank++;
  }
  const inSpan=input=>{
    const v=[1,...input].map(Number);
    for(let row=0;row<rank;row++){
      if(v[pivots[row]])for(let col=0;col<=width;col++)v[col]^=matrix[row][col];
    }
    return v.every(x=>x===0);
  };
  // A full experimental design requires only zero and the unit vectors, not
  // enumeration of the exponentially large input space.
  const probes=['0'.repeat(width),...Array.from({length:width},(_,i)=>
    '0'.repeat(i)+'1'+'0'.repeat(width-i-1))];
  return {width,rank,pivots,operations,
    next_probe:probes.find(input=>!inSpan(input))??null};
}

export function executeXI(binary,source){
  need(typeof binary==='string'&&binary.length>0,'falta ruta al XI original');
  need(typeof source==='string'&&Buffer.byteLength(source)<=MAX_PROGRAM_BYTES,
    'programa XI excede presupuesto de 2 MiB');
  const started=performance.now();
  const result=spawnSync(resolve(binary),['-'],{
    input:source,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024
  });
  if(result.error)throw result.error;
  need(result.status===0,'fallo del XI original: '+String(result.stderr||result.stdout).slice(0,600));
  let output;
  try{output=result.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}
  catch{throw new Error('respuesta XI invalida')}
  need(output.every(x=>x&&typeof x==='object'&&!Array.isArray(x)),'registros XI invalidos');
  return {output,elapsed_ms:performance.now()-started};
}

function materialized(run,base,count,bindings){
  const views=run.output.filter(x=>x.type==='memory_materialization');
  const mem=run.output.filter(x=>x.type==='memory_stats');
  const core=run.output.filter(x=>x.type==='stats');
  need(views.length===1&&views[0].address===base.toString()&&views[0].bytes===count,
    'materializacion XI de direccion/tamano inesperados');
  const hex=views[0].hex;
  need(typeof hex==='string'&&hex.length===count*2&&/^[0-9a-f]+$/i.test(hex),
    'bytes XI incompletos o no clasicos');
  need(mem.length===1&&mem[0].model==='inverse-ether-memory'&&
    mem[0].quantum_bindings===bindings&&mem[0].overrides===0,
    'las reglas deben leerse mediante enlaces Inverse Ether Memory explicitos');
  need(core.length===1&&Number.isInteger(core[0].active_qubits),'faltan estadisticas nativas');
  return {bytes:Buffer.from(hex,'hex'),memory:mem[0],core:core[0]};
}

function rowStrings(bytes,count,width){
  const byteWidth=Math.ceil(width/8);
  return Array.from({length:count},(_,row)=>{
    if(width%8)need((bytes[(row+1)*byteWidth-1]>>>(width%8))===0,'padding XI no nulo');
    return Array.from({length:width},(_,bit)=>
      String((bytes[row*byteWidth+Math.floor(bit/8)]>>>(bit%8))&1)).join('');
  });
}

function expose(source,base,count,width){
  const byteWidth=Math.ceil(width/8),stride=byteWidth*8;
  for(let row=0;row<count;row++)for(let byte=0;byte<byteWidth;byte++){
    source.push('mem_bind '+(base+BigInt(row*byteWidth+byte))+' '+address(row,byte*8,stride));
  }
  source.push('mem_materialize '+base+' '+count*byteWidth,'mem_stats','stats');
}

export function prepareLearning(records,cutoff){
  const when=timestamp(cutoff,'cutoff');
  const visible=transitions(records).filter(row=>row.known_at<=when);
  if(!visible.length)return {status:'sin_observaciones',cutoff:when,checkpoint:null};
  const plan=planReduction(visible.map(row=>row.before));
  const {width,rank}=plan,stride=Math.ceil(width/8)*8;
  const source=['# LaPlaceDIG E001: eliminacion de evidencia por XI original',
    '# El host planifica pivotes con entradas; XI transforma las salidas.',
    'background zero','mem_reset 0'];
  for(let row=0;row<visible.length;row++)for(let bit=0;bit<width;bit++){
    if(visible[row].after[bit]==='1')source.push('x '+address(row,bit,stride));
  }
  const add=(a,b)=>{
    for(let bit=0;bit<width;bit++)source.push('cx '+address(a,bit,stride)+' '+address(b,bit,stride));
  };
  for(const op of plan.operations){
    add(op.a,op.b);
    if(op.op==='swap'){add(op.b,op.a);add(op.a,op.b)}
  }
  expose(source,MODEL_BASE,visible.length,width);
  const xi=source.join('\n')+'\n';
  need(Buffer.byteLength(xi)<=MAX_PROGRAM_BYTES,'plan de aprendizaje excede presupuesto');
  return {status:'preparado',cutoff:when,rank,width,next_probe:plan.next_probe,
    checkpoint:{schema:SCHEMA,runtime_ref:RUNTIME_REF,width,rank,
      rows:visible.length,cutoff:when,training_ids:visible.map(r=>r.id),
      training_sha256:digest(JSON.stringify(visible)),xi_sha256:digest(xi),xi}};
}

function readCheckpoint(binary,checkpoint){
  need(checkpoint&&checkpoint.schema===SCHEMA&&checkpoint.runtime_ref===RUNTIME_REF,
    'checkpoint incompatible con Laplace E001');
  const {width,rows,rank,xi}=checkpoint;
  need(Number.isInteger(width)&&width>=1&&width<=MAX_WIDTH,'ancho de checkpoint invalido');
  need(Number.isInteger(rows)&&rows>=1&&rows<=MAX_TRANSITIONS,'filas de checkpoint invalidas');
  need(Number.isInteger(rank)&&rank>=1&&rank<=Math.min(rows,width+1),'rango invalido');
  timestamp(checkpoint.cutoff,'checkpoint cutoff');
  need(typeof xi==='string'&&digest(xi)===checkpoint.xi_sha256,'hash del programa aprendido no coincide');
  const run=executeXI(binary,xi),byteCount=rows*Math.ceil(width/8);
  const view=materialized(run,MODEL_BASE,byteCount,byteCount);
  const reduced=rowStrings(view.bytes,rows,width);
  const contradictions=reduced.slice(rank).filter(row=>row.includes('1')).length;
  return {reduced,contradictions,elapsed_ms:run.elapsed_ms,
    native:{active_qubits:view.core.active_qubits,tableau_bytes:view.core.tableau_bytes,
      address_bytes:view.core.address_bytes,memory_bindings:view.memory.quantum_bindings,
      explicit_qubit_address_bound:rows*Math.ceil(width/8)*8}};
}

export function learn(binary,records,cutoff){
  const prepared=prepareLearning(records,cutoff);
  if(!prepared.checkpoint)return prepared;
  const result=readCheckpoint(binary,prepared.checkpoint);
  const common={cutoff:prepared.cutoff,width:prepared.width,rank:prepared.rank,
    required_rank:prepared.width+1,observations:prepared.checkpoint.rows,
    contradictions:result.contradictions,native:result.native,elapsed_ms:result.elapsed_ms};
  if(result.contradictions)return {...common,status:'ley_refutada',checkpoint:null,
    reason:'no existe una ley afin fija que explique todas las observaciones conocidas'};
  if(prepared.rank<prepared.width+1)return {...common,status:'evidencia_insuficiente',checkpoint:null,
    next_probe:prepared.next_probe,
    reason:'varias leyes siguen siendo compatibles; proponer una entrada informativa'};
  return {...common,status:'ley_identificada',checkpoint:prepared.checkpoint,
    rules:describeRules(result.reduced.slice(0,prepared.width+1),prepared.width)};
}

function describeRules(coefficients,width){
  return Array.from({length:width},(_,output)=>{
    const terms=[];
    if(coefficients[0][output]==='1')terms.push('1');
    for(let input=0;input<width;input++)if(coefficients[input+1][output]==='1')terms.push('x'+input);
    return 'y'+output+' = '+(terms.length?terms.join(' XOR '):'0');
  });
}

export function affineProjection(binary,checkpoint){
  const restored=readCheckpoint(binary,checkpoint);
  need(restored.contradictions===0&&checkpoint.rank===checkpoint.width+1,
    'abstencion: no hay una ley afin identificada para simular');
  return {width:checkpoint.width,coefficients:restored.reduced.slice(0,checkpoint.width+1),
    rules:describeRules(restored.reduced.slice(0,checkpoint.width+1),checkpoint.width)};
}

export function predict(binary,checkpoint,state,steps=1){
  need(Number.isInteger(steps)&&steps>=1&&steps<=MAX_STEPS,'pasos permitidos: 1..'+MAX_STEPS);
  // Replay the learned XI state; JSON never supplies learned coefficients.
  const restored=readCheckpoint(binary,checkpoint);
  need(restored.contradictions===0&&checkpoint.rank===checkpoint.width+1,
    'abstencion: checkpoint sin una ley identificada consistente');
  const width=checkpoint.width,stride=Math.ceil(width/8)*8;
  bits(state,width);
  const coefficients=restored.reduced.slice(0,width+1);
  const source=['# Laplace: consecuencias de la ley recuperada del checkpoint XI',
    'background zero','mem_reset 0'];
  // row 0 is the first FUTURE state; the current state is in a separate bank.
  const initialRow=steps;
  for(let bit=0;bit<width;bit++)if(state[bit]==='1')source.push('x '+address(initialRow,bit,stride));
  for(let step=0;step<steps;step++){
    const previous=step===0?initialRow:step-1;
    for(let output=0;output<width;output++){
      const target=address(step,output,stride);
      if(coefficients[0][output]==='1')source.push('x '+target);
      for(let input=0;input<width;input++)if(coefficients[input+1][output]==='1'){
        source.push('cx '+address(previous,input,stride)+' '+target);
      }
    }
  }
  expose(source,FORECAST_BASE,steps,width);
  const xi=source.join('\n')+'\n';
  const run=executeXI(binary,xi),byteCount=steps*Math.ceil(width/8);
  const view=materialized(run,FORECAST_BASE,byteCount,byteCount);
  const states=rowStrings(view.bytes,steps,width);
  const forecast={schema:'laplace-forecast-v1',status:'prediccion_condicional',
    model_xi_sha256:checkpoint.xi_sha256,training_sha256:checkpoint.training_sha256,
    cutoff:checkpoint.cutoff,initial_state:state,steps,states};
  return {...forecast,forecast_sha256:digest(JSON.stringify(forecast)),xi,
    rules:describeRules(coefficients,width),native:{active_qubits:view.core.active_qubits,
      tableau_bytes:view.core.tableau_bytes,address_bytes:view.core.address_bytes,
      memory_bindings:view.memory.quantum_bindings,
      explicit_qubit_address_bound:(steps+1)*stride},
    elapsed_ms:restored.elapsed_ms+run.elapsed_ms,
    scope:'ley binaria afin fija; certeza dentro del modelo, no probabilidad del mundo real'};
}
