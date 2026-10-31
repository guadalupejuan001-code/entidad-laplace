/**
 * LaPlaceDIG P003 -- flat ΛCDM background universe from a=10^-30 to a=1.
 *
 * A *compiler*, not a second physics runtime. All Friedmann density scaling,
 * expansion rate, temperature, Hubble time and compact state writes run in
 * XI Machine / REVERSE-PC / Inverse Ether Memory.
 *
 * Represent cosmological quantities as mantissa × 10^exponent. This avoids
 * trying to allocate or represent a~10^-30 as a native signed 64-bit integer.
 * The host does not calculate any cosmic output. A floating-point reference
 * exists only in tests and must not enter this module.
 */
import {createHash} from 'node:crypto';

const need=(condition,message)=>{if(!condition)throw new Error(message)};
const hash=value=>createHash('sha256').update(value).digest('hex');
const Q=100000000n; // normalizer used for density terms, not physical Q-bits
const MEMORY=7000000004000000n;
const RECORD_BYTES=27;
export const DEFAULT_PARAMETERS=Object.freeze({
  min_exp:-30,max_exp:0,detalle:'decadas',
  omega_r_micro:92,omega_m_micro:315000,omega_lambda_micro:684908,
  H0_km_s_Mpc:67.4,T0_K:2.7255,
  H0_mantissa:2184285,H0_exponent:-24,
  rho_critical_energy_mantissa:7668948,rho_critical_energy_exponent:-16
});
export const FIELDS=Object.freeze([
 'a_log10_exponent','a_digit','H_mantissa','H_exponent',
 'T_mantissa','T_exponent','energy_mantissa','energy_exponent',
 'hubble_time_mantissa','hubble_time_exponent',
 'radiation_parts_100000','matter_parts_100000','vacuum_parts_100000'
]);
export const UNITS=Object.freeze({
  H:'s^-1',T:'K',energy:'J/m^3',hubble_time:'s',
  fractions:'parts per 100000',scale_factor:'a = a_digit × 10^a_log10_exponent'
});
function integer(v,name,lo,hi){
  need(typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi,
    name+' debe ser un entero en ['+lo+','+hi+']');
  return v;
}
export function validarCosmologia(raw={}){
  need(raw&&typeof raw==='object'&&!Array.isArray(raw),'configuracion cosmologica invalida');
  need(Object.keys(raw).every(k=>[
    'min_exp','max_exp','omega_r_micro','omega_m_micro','omega_lambda_micro','detalle'
  ].includes(k)),'se aceptan solo los parametros cosmologicos declarados');
  const x={...DEFAULT_PARAMETERS,...raw};
  integer(x.min_exp,'min_exp',-30,0);
  integer(x.max_exp,'max_exp',-30,0);
  need(x.max_exp>=x.min_exp,'rango cosmologico invertido');
  need(['decadas','digitos'].includes(x.detalle),'detalle debe ser decadas o digitos');
  for(const k of ['omega_r_micro','omega_m_micro','omega_lambda_micro']){
    integer(x[k],k,1,999998);
  }
  need(x.omega_r_micro+x.omega_m_micro+x.omega_lambda_micro===1000000,
    'modelo espacialmente plano requiere suma de densidades Ω = 1000000');
  return Object.freeze(x);
}
export function compilarCosmologia(raw={}){
  const p=validarCosmologia(raw);
  const source=['#!reverse-pc-machine-v1',
    '# LAPLACE P003: evolución de fondo ΛCDM, ley de Friedmann.',
    '# Los valores físicos se calculan dentro de XI; host solo compila constantes.',
    '# No se integra la singularidad inicial ni se simula inflación/partículas.',
    'set r0 '+p.min_exp,'set r1 1',
    'label cosmos_epoch',
    '# E = -4 log10(a), expresado como exponente decimal de densidad.',
    'mov r2 r0','mul r2 -4',
    '# Componente radiación Ωr a^-4. M escala de densidad = 10^14.',
    'set r3 '+(BigInt(p.omega_r_micro)*Q),
    'mov r7 r1','mul r7 r1','mul r7 r1','mul r7 r1','div r3 r7',
    '# Materia Ωm a^-3, con denominador b^3 * 10^(-k).',
    'set r4 '+(BigInt(p.omega_m_micro)*Q),
    'mov r7 r1','mul r7 r1','mul r7 r1','div r4 r7',
    'set r7 0','sub r7 r0',
    'label cosmos_matter_shift',
    'cmp r7 0','jle cosmos_matter_done',
    'div r4 10','sub r7 1','jmp cosmos_matter_shift',
    'label cosmos_matter_done',
    '# Lambda constante, dividida entre 10^(-4k).',
    'set r5 '+(BigInt(p.omega_lambda_micro)*Q),
    'mov r7 r2',
    'label cosmos_lambda_shift',
    'cmp r7 0','jle cosmos_lambda_done',
    'div r5 10','sub r7 1','jmp cosmos_lambda_shift',
    'label cosmos_lambda_done',
    'mov r6 r3','add r6 r4','add r6 r5',
    'cmp r6 0','jle cosmos_bad',
    '# H = H0 sqrt(E²). Raíz entera Newton en XI.',
    'mov r8 r6',
    'label cosmos_sqrt',
    'mov r9 r6','div r9 r8','add r9 r8','div r9 2',
    'cmp r9 r8','jge cosmos_root',
    'mov r8 r9','jmp cosmos_sqrt',
    'label cosmos_root',
    // sqrt(M)/1e7 *10^(-2k); H0 = 2184285×10^-24 s^-1.
    'mov r10 r8','mul r10 '+p.H0_mantissa,
    'mov r11 r0','mul r11 -2','sub r11 31',
    'label cosmos_h_normalize',
    'cmp r10 9999999','jle cosmos_h_done',
    'div r10 10','add r11 1','jmp cosmos_h_normalize',
    'label cosmos_h_done',
    // T0=2.7255 K, T = T0 / (b×10^k).
    'set r14 2725500','div r14 r1',
    'set r15 -6','sub r15 r0',
    'label cosmos_t_normalize',
    'cmp r14 1000000','jge cosmos_t_done',
    'mul r14 10','sub r15 1','jmp cosmos_t_normalize',
    'label cosmos_t_done',
    // rho_c,0*c²=7.668948e-10 J/m³; rho/rho_c0= M 10^-4k/1e14.
    'mov r12 r6','mov r13 r0','mul r13 -4','sub r13 14',
    'label cosmos_rho_normalize',
    'cmp r12 9999999','jle cosmos_rho_done',
    'div r12 10','add r13 1','jmp cosmos_rho_normalize',
    'label cosmos_rho_done',
    'mul r12 '+p.rho_critical_energy_mantissa,
    'add r13 '+p.rho_critical_energy_exponent,
    'label cosmos_energy_normalize',
    'cmp r12 9999999','jle cosmos_energy_done',
    'div r12 10','add r13 1','jmp cosmos_energy_normalize',
    'label cosmos_energy_done',
    // One Hubble time is NOT the age of the universe.
    'set r8 1000000000000','div r8 r10',
    'set r9 0','sub r9 r11','sub r9 12',
    'label cosmos_time_normalize',
    'cmp r8 1000000','jge cosmos_time_done',
    'mul r8 10','sub r9 1','jmp cosmos_time_normalize',
    'label cosmos_time_done',
    '# Each observed epoch emits 13 separately auditable registers.',
    'print r0','print r1','print r10','print r11','print r14','print r15',
    'print r12','print r13','print r8','print r9',
    '# Compute address of 27-byte packed Ether epoch record.',
    'mov r2 r0','sub r2 '+p.min_exp
  ];
  const fine=p.detalle==='digitos';
  const includesExtras=!fine&&p.min_exp<=-4&&p.max_exp>=-4;
  const count=fine?Array.from({length:p.max_exp-p.min_exp+1},(_,i)=>
    p.min_exp+i===0?1:9).reduce((a,b)=>a+b,0):
    p.max_exp-p.min_exp+1+(includesExtras?2:0);
  if(fine){
    source.push('mul r2 9','mov r7 r1','sub r7 1','add r2 r7');
  }
  if(includesExtras){
    source.push('cmp r0 -4','jle cosmos_index_early',
      'add r2 2','label cosmos_index_early',
      'cmp r0 -4','jne cosmos_index_done',
      'cmp r1 3','jne cosmos_index_not3','add r2 1',
      'label cosmos_index_not3','cmp r1 9','jne cosmos_index_done',
      'add r2 2','label cosmos_index_done');
  }
  source.push('mul r2 '+RECORD_BYTES,'add r2 '+MEMORY);
  let labels=0;
  const emit=(...lines)=>source.push(...lines);
  function writeByte(register,{zigzag=false}={}){
    emit('mov r7 r'+register);
    if(zigzag){
      const positive='cosmos_zpos_'+(++labels),end='cosmos_zend_'+labels;
      emit('cmp r7 0','jge '+positive,'mul r7 -2','sub r7 1',
        'jmp '+end,'label '+positive,'mul r7 2','label '+end);
    }
    emit('store8 $r2 r7','add r2 1');
  }
  function writeMantissa(reg){
    // After printing, destroying this register is safe.
    for(let byte=0;byte<3;byte++)emit('mov r7 r'+reg,'mod r7 256',
      'store8 $r2 r7','div r'+reg+' 256','add r2 1');
  }
  writeByte(0,{zigzag:true});
  writeByte(1);
  writeMantissa(10);writeByte(11,{zigzag:true});
  writeMantissa(14);writeByte(15,{zigzag:true});
  writeMantissa(12);writeByte(13,{zigzag:true});
  writeMantissa(8);writeByte(9,{zigzag:true});
  // Fractions of the total density. Divide by 1000 before scaling to avoid
  // signed 64-bit overflow even when Ω_i approaches 1.
  emit('mov r8 r6','div r8 1000');
  for(const component of [3,4,5]){
    emit('div r'+component+' 1000','mul r'+component+' 100000',
      'div r'+component+' r8','print r'+component);
    writeMantissa(component);
  }
  if(fine){
    emit('# Resuelve los digitos 1..9 de cada decada, salvo a=1.',
      'cmp r0 0','jge cosmos_next_epoch',
      'cmp r1 9','jge cosmos_next_epoch',
      'add r1 1','jmp cosmos_epoch');
  }else{
    emit('# Muestras extra cerca de igualdad y recombinación.',
      'cmp r0 -4','jne cosmos_next_epoch',
      'cmp r1 1','je cosmos_digit3',
      'cmp r1 3','je cosmos_digit9',
      'jmp cosmos_next_epoch',
      'label cosmos_digit3','set r1 3','jmp cosmos_epoch',
      'label cosmos_digit9','set r1 9','jmp cosmos_epoch');
  }
  emit('label cosmos_next_epoch','set r1 1','add r0 1',
    'cmp r0 '+(p.max_exp+1),'jlt cosmos_epoch',
    'mem_stats','qstats','halt',
    'label cosmos_bad','set r7 0','div r7 0','halt');
  const xi=source.join('\n')+'\n';
  need(Buffer.byteLength(xi)<1024*1024,'programa de cosmología demasiado largo');
  return {
    schema:'LAPLACE_P003_LCDM_XI_V1',xi,
    xi_sha256:hash(xi),
    config_sha256:hash(JSON.stringify(p)),
    configuration:Object.fromEntries(
      ['min_exp','max_exp','omega_r_micro','omega_m_micro',
        'omega_lambda_micro','H0_km_s_Mpc','T0_K','detalle'].map(k=>[k,p[k]])),
    epoch_count:count,
    memory_base:MEMORY.toString(),record_bytes:RECORD_BYTES,
    logical_output_bytes:RECORD_BYTES*count,
    units:UNITS,
    physical_scope:'Friedmann flat ΛCDM background extrapolation, not the initial singularity'
  };
}
export const EJEMPLO=Object.freeze({
  min_exp:-30,max_exp:0,omega_r_micro:92,
  omega_m_micro:315000,omega_lambda_micro:684908
});
export function interpretarCosmos(stdout,compiler){
  need(typeof stdout==='string'&&compiler?.schema==='LAPLACE_P003_LCDM_XI_V1',
    'lectura cosmologica incompatible');
  const rows=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>{
    try{return JSON.parse(line)}catch{throw Error('XI devolvió JSONL inválido')}
  });
  const values=rows.filter(r=>r.type==='register').map(r=>r.value);
  need(values.length===compiler.epoch_count*FIELDS.length &&
    values.every(Number.isSafeInteger),'faltan registros cosmológicos XI');
  const epochs=Array.from({length:compiler.epoch_count},(_,i)=>
    Object.fromEntries(FIELDS.map((k,j)=>[k,values[i*FIELDS.length+j]])));
  for(let i=0;i<epochs.length;i++){
    const e=epochs[i];
    need(e.a_digit>=1&&e.a_digit<=9 &&
      [e.H_mantissa,e.T_mantissa,e.energy_mantissa,
        e.hubble_time_mantissa].every(x=>x>=1000000&&x<=9999999),
      'mantisa científica XI fuera de rango');
    need([e.radiation_parts_100000,e.matter_parts_100000,
      e.vacuum_parts_100000].every(x=>x>=0&&x<=100000),
      'fracción cosmológica fuera de rango');
  }
  const memory=rows.find(x=>x.type==='memory_stats');
  const quantum=rows.find(x=>x.type==='quantum_stats');
  need(memory?.model==='inverse-ether-memory'&&quantum,
    'falta procedencia Inverse Ether Memory + QuantumRuntime');
  return {schema:compiler.schema,epochs,scope:compiler.physical_scope,
    xi_sha256:compiler.xi_sha256,memory,quantum};
}
export function leerProgramaMemoria(compiler){
  need(compiler?.schema==='LAPLACE_P003_LCDM_XI_V1','manifest incorrecto');
  const lines=['#!reverse-pc-machine-v1'];
  for(let i=0;i<compiler.logical_output_bytes;i++)
    lines.push('mem_read '+(MEMORY+BigInt(i)));
  lines.push('mem_stats','qstats');
  return lines.join('\n')+'\n';
}
export function decodificarMemoria(stdout,compiler){
  need(compiler?.schema==='LAPLACE_P003_LCDM_XI_V1','manifest incorrecto');
  const rows=String(stdout).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line))
    .filter(x=>x.type==='memory_read');
  need(rows.length===compiler.logical_output_bytes,'bytes Ether insuficientes');
  const fields=[];
  const readNumber=(start,len)=>{
    let n=0;
    for(let i=0;i<len;i++){
      const row=rows[start+i],address=(MEMORY+BigInt(start+i)).toString();
      need(row.address===address&&row.deterministic===true&&
        Number.isInteger(row.value)&&row.value>=0&&row.value<=255,
        'byte Ether no determinista o incorrecto en '+address);
      n+=row.value*256**i;
    }
    return n;
  };
  for(let e=0;e<compiler.epoch_count;e++){
    const b=e*RECORD_BYTES,unzigzag=n=>n%2===0?n/2:-(n+1)/2;
    // Packed memory field order: k,b,H,Hexp,T,Texp,E,Eexp,tH,tHexp,fr,fm,fL.
    const row={
      a_log10_exponent:unzigzag(readNumber(b,1)),
      a_digit:readNumber(b+1,1),
      H_mantissa:readNumber(b+2,3),
      H_exponent:unzigzag(readNumber(b+5,1)),
      T_mantissa:readNumber(b+6,3),
      T_exponent:unzigzag(readNumber(b+9,1)),
      energy_mantissa:readNumber(b+10,3),
      energy_exponent:unzigzag(readNumber(b+13,1)),
      hubble_time_mantissa:readNumber(b+14,3),
      hubble_time_exponent:unzigzag(readNumber(b+17,1)),
      radiation_parts_100000:readNumber(b+18,3),
      matter_parts_100000:readNumber(b+21,3),
      vacuum_parts_100000:readNumber(b+24,3)
    };
    fields.push(row);
  }
  return fields;
}
export const valorCientifico=(mantissa,exponent)=>mantissa*10**exponent;
