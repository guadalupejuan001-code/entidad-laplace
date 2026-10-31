/*
 * LAPLACE P002 — three interacting massive bodies, planar softened Newtonian
 * gravity. This is a source-to-XI compiler, NOT a physics interpreter.
 *
 * The force calculation, signed arithmetic, square-root iterations, symplectic
 * integration and persistent state updates execute in REVERSE-PC XI Machine.
 *
 * Fixed-point units: Q=100000 ticks per unit of length, velocity and mass.
 * G=1 in the corresponding (length^3)/(mass*time^2) units.
 * dt=1/1024 time unit; Plummer softening epsilon=0.05 length units.
 */
import {createHash} from 'node:crypto';

export const ESCALA=100000;
export const DT_DENOMINADOR=1024;
export const SUAVIZADO=5000;
export const UMBRAL_ACERCAMIENTO=25000;
export const MAX_PASOS_POR_PROGRAMA=64;
export const MAX_PASOS_ACUMULADOS=254;
export const MEMORIA_BASE=7000000003000000n;
export const CAMPOS=Object.freeze(['x','y','vx','vy','masa','ax','ay']);
const OFFSETS=Object.freeze({x:0,y:16,vx:32,vy:48,masa:64,ax:80,ay:96});
const STRIDE=256n;
const EVENTO=MEMORIA_BASE+3n*STRIDE;
const RELOJ=EVENTO+1n;
const MARCA=EVENTO+2n;
const MIN_POS=-300000,MAX_POS=300000;
const MAX_VEL=1000000,MAX_MASA=100000;
const need=(v,s)=>{if(!v)throw new Error(s)};
const integer=(v,s,lo,hi)=>{
  need(typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi,s+' fuera del dominio entero');
  return v;
};
const sha=text=>createHash('sha256').update(text).digest('hex');
export const DIRECCIONES=Object.freeze({
  evento:EVENTO.toString(),reloj:RELOJ.toString(),marca:MARCA.toString()
});
export const DIRECCIONES_ESTADO=Object.freeze(Array.from({length:3},(_,body)=>
  Object.fromEntries(CAMPOS.map(field=>[field,(MEMORIA_BASE+BigInt(body)*STRIDE+BigInt(OFFSETS[field])).toString()]))));

export function validarEscenario(scenario){
  need(scenario&&typeof scenario==='object'&&!Array.isArray(scenario),'escenario P002 invalido');
  const keys=Object.keys(scenario).sort().join(',');
  need(keys==='cuerpos,modo,pasos'||keys==='modo,pasos','campos: modo,pasos y cuerpos al iniciar');
  need(scenario.modo==='iniciar'||scenario.modo==='continuar','modo P002 invalido');
  const pasos=integer(scenario.pasos,'pasos',0,MAX_PASOS_POR_PROGRAMA);
  if(scenario.modo==='continuar'){
    need(scenario.cuerpos===undefined,'la continuacion usa solo la memoria Ether existente');
    return {modo:'continuar',pasos,cuerpos:null};
  }
  need(Array.isArray(scenario.cuerpos)&&scenario.cuerpos.length===3,'se requieren exactamente tres cuerpos');
  const cuerpos=scenario.cuerpos.map((body,i)=>{
    need(body&&typeof body==='object'&&!Array.isArray(body),'cuerpo invalido');
    need(Object.keys(body).sort().join(',')==='masa,vx,vy,x,y','propiedades de cuerpo '+i+' invalidas');
    return Object.freeze({
      x:integer(body.x,'x'+i,MIN_POS,MAX_POS),
      y:integer(body.y,'y'+i,MIN_POS,MAX_POS),
      vx:integer(body.vx,'vx'+i,-MAX_VEL,MAX_VEL),
      vy:integer(body.vy,'vy'+i,-MAX_VEL,MAX_VEL),
      masa:integer(body.masa,'masa'+i,1,MAX_MASA)
    });
  });
  need(cuerpos.some((a,i)=>cuerpos.some((b,j)=>i<j&&
    (a.x!==b.x||a.y!==b.y))),'se requieren posiciones distinguibles');
  return {modo:'iniciar',pasos,cuerpos};
}

// Encode an input once. Physics iteration and state updates never occur here.
function bytesZigZag(value){
  const n=BigInt(value);
  let u=n<0n?-2n*n-1n:2n*n;
  const bytes=[];
  for(let i=0;i<8;i++){bytes.push(Number(u&255n));u>>=8n;}
  need(u===0n,'entero fuera de 64 bits');
  return bytes;
}

export function compilarGravedad(scenario){
  const model=validarEscenario(scenario),source=['#!reverse-pc-machine-v1',
    '# P002: gravedad tres cuerpos. Todas las operaciones fisicas son XI.',
    '# Q=100000; G=1; h=1/1024; suavizado Plummer 0.05.',
    '# Memoria: valores ZigZag i64 little-endian y dos bytes de reloj/evento.'];
  let unique=0;
  const emit=(...lines)=>source.push(...lines);
  const label=prefix=>'p002_'+prefix+'_'+(++unique);
  const addr=(body,field)=>(MEMORIA_BASE+BigInt(body)*STRIDE+BigInt(OFFSETS[field]));
  const store=(address,reg)=>{
    need(reg!==14&&reg!==15,'registro reservado para serializar');
    const positive=label('store_positive'),done=label('store_done');
    emit('mov r14 r'+reg,'cmp r14 0','jge '+positive,
      'mul r14 -2','sub r14 1','jmp '+done,
      'label '+positive,'mul r14 2','label '+done);
    for(let i=0;i<8;i++)emit('mov r15 r14','mod r15 256',
      'store8 '+(address+BigInt(i))+' r15','div r14 256');
  };
  const load=(address,reg)=>{
    need(reg!==15,'r15 es registro temporal de lectura');
    const positive=label('load_positive');
    emit('set r'+reg+' 0');
    for(let i=7;i>=0;i--)emit('mul r'+reg+' 256',
      'load8 r15 '+(address+BigInt(i)),'add r'+reg+' r15');
    emit('mov r15 r'+reg,'mod r15 2','div r'+reg+' 2',
      'cmp r15 0','je '+positive,'add r'+reg+' 1','mul r'+reg+' -1',
      'label '+positive);
  };
  const fail='p002_error_presupuesto';
  if(model.modo==='iniciar'){
    for(let i=0;i<3;i++)for(const field of CAMPOS){
      const value=model.cuerpos[i][field]??0;
      for(const [byte,b]of bytesZigZag(value).entries())
        emit('store8 '+(addr(i,field)+BigInt(byte))+' '+b);
    }
    emit('store8 '+EVENTO+' 0','store8 '+RELOJ+' 0','store8 '+MARCA+' 77');
  }else{
    emit('load8 r14 '+MARCA,'cmp r14 77','jne '+fail);
  }
  emit('set r0 '+model.pasos,
    'label p002_bucle','cmp r0 0','je p002_resultado',
    'load8 r14 '+RELOJ,'add r14 1','cmp r14 '+MAX_PASOS_ACUMULADOS,
    'jgt '+fail,'store8 '+RELOJ+' r14');

  // A step begins by zeroing accelerations. The state is not recomputed in JS.
  for(let i=0;i<3;i++)for(const component of ['ax','ay']){
    for(let byte=0;byte<8;byte++)emit('store8 '+(addr(i,component)+BigInt(byte))+' 0');
  }
  // Directed pairwise gravitational interactions: i <- j. Each mass acts on
  // both other bodies. No fixed central potential and no precomputed force.
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    if(i===j)continue;
    load(addr(i,'x'),1);
    load(addr(i,'y'),2);
    load(addr(j,'x'),3);
    load(addr(j,'y'),4);
    load(addr(j,'masa'),5);
    emit('mov r6 r3','sub r6 r1',
      'mov r7 r4','sub r7 r2',
      'mov r8 r6','mul r8 r8',
      'mov r9 r7','mul r9 r9','add r8 r9');
    // Encounter detection at the START of each step, before applying forces.
    const eventDone=label('evento_terminado');
    emit('cmp r8 '+(UMBRAL_ACERCAMIENTO*UMBRAL_ACERCAMIENTO),
      'jgt '+eventDone,'load8 r14 '+EVENTO,
      'cmp r14 0','jne '+eventDone,
      'load8 r14 '+RELOJ,'store8 '+EVENTO+' r14',
      'label '+eventDone);
    emit('add r8 '+(SUAVIZADO*SUAVIZADO));
    // Integer Newton square root of r²+eps², starting above its square root.
    const dxAbs=label('dx_abs'),dyAbs=label('dy_abs');
    const sqrtLoop=label('sqrt_loop'),sqrtEnd=label('sqrt_end');
    emit('mov r9 r6','cmp r9 0','jge '+dxAbs,'mul r9 -1',
      'label '+dxAbs,
      'mov r10 r7','cmp r10 0','jge '+dyAbs,'mul r10 -1',
      'label '+dyAbs,'add r9 r10','add r9 '+SUAVIZADO,
      'label '+sqrtLoop,
      'mov r10 r8','div r10 r9','add r10 r9','div r10 2',
      'cmp r10 r9','jge '+sqrtEnd,
      'mov r9 r10','jmp '+sqrtLoop,'label '+sqrtEnd);
    // approx force  -grad[-G*m_i*m_j /sqrt(r²+eps²)].
    // invR² = Q³/r²; dir = (dx*Q)/sqrt(r²).
    // a_i = (G*mass_j/Q) * ((dir*invR²)/Q)/Q (Q-scaled acceleration).
    // For the bounded domain products stay within signed i64.
    emit('set r10 1000000000000000','div r10 r8',
      'mov r11 r6','mul r11 '+ESCALA,'div r11 r9',
      'mov r12 r7','mul r12 '+ESCALA,'div r12 r9',
      'mul r11 r10','div r11 '+ESCALA,
      'mul r12 r10','div r12 '+ESCALA,
      'mul r5 '+ESCALA,'div r5 '+ESCALA,
      'mul r11 r5','div r11 '+ESCALA,
      'mul r12 r5','div r12 '+ESCALA);
    load(addr(i,'ax'),13);load(addr(i,'ay'),14);
    emit('add r11 r13','add r12 r14');
    store(addr(i,'ax'),11);store(addr(i,'ay'),12);
  }
  // Symplectic Euler: kick velocity with a(x_t), then drift using v_{t+1}.
  for(let i=0;i<3;i++){
    load(addr(i,'x'),1);load(addr(i,'y'),2);
    load(addr(i,'vx'),3);load(addr(i,'vy'),4);
    load(addr(i,'ax'),5);load(addr(i,'ay'),6);
    emit('mov r7 r5','div r7 '+DT_DENOMINADOR,'add r3 r7',
      'mov r7 r6','div r7 '+DT_DENOMINADOR,'add r4 r7',
      'mov r7 r3','div r7 '+DT_DENOMINADOR,'add r1 r7',
      'mov r7 r4','div r7 '+DT_DENOMINADOR,'add r2 r7');
    for(const [reg,limit] of [[1,500000],[2,500000],[3,MAX_VEL],[4,MAX_VEL]]){
      emit('cmp r'+reg+' '+(-limit),'jlt '+fail,
        'cmp r'+reg+' '+limit,'jgt '+fail);
    }
    store(addr(i,'x'),1);store(addr(i,'y'),2);
    store(addr(i,'vx'),3);store(addr(i,'vy'),4);
  }
  emit('sub r0 1','jmp p002_bucle','label p002_resultado');
  for(let i=0;i<3;i++)for(const field of ['x','y','vx','vy','masa']){
    load(addr(i,field),1);
    emit('print r1');
  }
  emit('load8 r1 '+EVENTO,'print r1','load8 r1 '+RELOJ,'print r1',
    'mem_stats','qstats','halt',
    'label '+fail,'set r1 0','div r1 0','halt');
  const xi=source.join('\n')+'\n';
  need(Buffer.byteLength(xi)<1024*1024,'presupuesto del programa XI excedido');
  return {schema:'LAPLACE_P002_TRES_CUERPOS_XI_1',
    xi,xi_sha256:sha(xi),modo:model.modo,pasos:model.pasos,
    config_hash:sha(JSON.stringify(model)),
    unidades:'gravedad normalizada G=1; Q=100000; paso=1/1024; suavizado=0.05',
    address_base:MEMORIA_BASE.toString(),observables:['x','y','vx','vy','masa'],
    budget:{max_steps_program:MAX_PASOS_POR_PROGRAMA,max_steps_session:MAX_PASOS_ACUMULADOS,
      max_abs_position:500000,max_abs_velocity:MAX_VEL}};
}
export const ESCENARIO_OCHO=Object.freeze({
  modo:'iniciar',pasos:32,cuerpos:[
    {x:-97000,y:24309,vx:46620,vy:43236,masa:100000},
    {x:97000,y:-24309,vx:46620,vy:43236,masa:100000},
    {x:0,y:0,vx:-93240,vy:-86472,masa:100000}
  ]
});
export function leerObservaciones(raw){
  const rows=String(raw).trim().split(/\r?\n/).filter(Boolean).map(line=>{
    try{return JSON.parse(line)}catch{throw Error('respuesta XI no es JSONL')}
  });
  const values=rows.filter(x=>x.type==='register').map(x=>x.value);
  need(values.length===17&&values.every(Number.isSafeInteger),'salida P002 incompleta');
  const bodies=Array.from({length:3},(_,i)=>{
    const [x,y,vx,vy,masa]=values.slice(i*5,i*5+5);
    return {x,y,vx,vy,masa};
  });
  const memoria=rows.find(x=>x.type==='memory_stats');
  need(memoria?.model==='inverse-ether-memory','sin lectura de Ether Memory');
  const qt=rows.find(x=>x.type==='quantum_stats');
  need(qt,'falta evidencia de REVERSE QuantumRuntime');
  return {cuerpos:bodies,
    primer_acercamiento_paso:values[15]===0?null:values[15]-1,
    pasos_acumulados:values[16],inverse_memory:memoria,quantum_stats:qt};
}
export function programaLecturaMemoria(){
  const rows=['#!reverse-pc-machine-v1'];
  for(let i=0;i<3;i++)for(const field of ['x','y','vx','vy','masa'])
    for(let byte=0;byte<8;byte++)
      rows.push('mem_read '+(MEMORIA_BASE+BigInt(i)*STRIDE+BigInt(OFFSETS[field])+BigInt(byte)));
  rows.push('mem_read '+EVENTO,'mem_read '+RELOJ,'mem_read '+MARCA);
  return rows.join('\n')+'\n';
}
export function reconstruirMemoria(raw){
  const rows=String(raw).trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x))
    .filter(x=>x.type==='memory_read');
  need(rows.length===123,'faltan bytes de estado fisico');
  let index=0;
  const bodies=[];
  for(let i=0;i<3;i++){
    const body={};
    for(const field of ['x','y','vx','vy','masa']){
      let unsigned=0n;
      const base=MEMORIA_BASE+BigInt(i)*STRIDE+BigInt(OFFSETS[field]);
      for(let byte=0;byte<8;byte++){
        const row=rows[index++];
        need(row.address===(base+BigInt(byte)).toString()&&row.deterministic===true,
          'memoria XI incoherente en '+(base+BigInt(byte)));
        unsigned+=BigInt(row.value)<<BigInt(8*byte);
      }
      const signed=(unsigned&1n)===0n?unsigned/2n:-(unsigned+1n)/2n;
      need(signed>=BigInt(Number.MIN_SAFE_INTEGER)&&signed<=BigInt(Number.MAX_SAFE_INTEGER),
        'valor de memoria no es entero seguro');
      body[field]=Number(signed);
    }
    bodies.push(body);
  }
  need(rows[index++].address===EVENTO.toString(),'evento corrupto');
  need(rows[index++].address===RELOJ.toString(),'reloj corrupto');
  need(rows[index].address===MARCA.toString()&&rows[index].value===77,'sesion P002 sin marca');
  return bodies;
}
