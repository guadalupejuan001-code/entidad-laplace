/**
 * P004: compile bounded parameters to ORIGINAL XI Machine, not a second physics runtime.
 * XI calculates the radiation FLRW asymptote, the Planck boundary and curvature.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const FIELDS=Object.freeze([
 'a_exp','H_mantissa','H_exponent','T_mantissa','T_exponent',
 'energy_mantissa','energy_exponent','t_rad_mantissa','t_rad_exponent',
 'kretschmann_mantissa','kretschmann_exponent','below_planck_time'
]);
export const DEFAULT=Object.freeze({start_exp:-30,end_exp:-80});
const MEMORY=7000000005000000n;
const BYTES_PER_EPOCH=FIELDS.length*8;
const SCIENTIFIC=['H','T','energy','t_rad','kretschmann'];
const PROGRAM=fileURLToPath(new URL('./singularidad.xi',import.meta.url));
const need=(v,msg)=>{if(!v)throw new Error(msg)};
const sha=value=>createHash('sha256').update(value).digest('hex');
export const PLANCK_TIME_S=5.391247e-44;
export const BRANCH_RULES=Object.freeze({
 branch:'radiation_dominated_flat_FLRW',
 limit:'a->0+',
 classical_H:'diverges_as_a^-2',
 classical_temperature:'diverges_as_a^-1',
 classical_density:'diverges_as_a^-4',
 classical_K:'diverges_as_a^-8',
 classical_time:'approaches_0_as_a^2',
 t_zero:'NOT_A_NUMERICAL_OR_PHYSICAL_STATE',
 status:'formal_solution_breakdown_near_Planck_epoch'
});
export function validarSingularidad(raw={}){
 need(raw&&typeof raw==='object'&&!Array.isArray(raw),'configuración de singularidad inválida');
 need(Object.keys(raw).every(k=>k==='start_exp'||k==='end_exp'),
  'campos de configuración no permitidos');
 const p={...DEFAULT,...raw};
 for(const key of ['start_exp','end_exp'])
   need(typeof p[key]==='number'&&Number.isSafeInteger(p[key]),
     key+' debe ser entero');
 need(p.start_exp<=-25&&p.start_exp>=-35,'start_exp fuera de -35..-25');
 need(p.end_exp<=-40&&p.end_exp>=-80,'end_exp fuera de -80..-40');
 need(p.end_exp<=p.start_exp,'el final debe acercarse a a=0');
 return Object.freeze(p);
}
export function compilarSingularidad(raw={}){
 const p=validarSingularidad(raw);
 let text=readFileSync(PROGRAM,'utf8');
 for(const [name,value,expected] of [
   ['__START_EXP__',String(p.start_exp),2],
   ['__END_EXP__',String(p.end_exp),1],
   ['__BASE_MEMORY__',MEMORY.toString(),1]
 ]){
   need(text.split(name).length-1===expected,'directiva XI ambigua: '+name);
   text=text.split(name).join(value);
 }
 need(!/__[_A-Z0-9]+__/.test(text),'marcador XI no reemplazado');
 const xi='#!reverse-pc-machine-v1\n'+text.trimEnd()+'\n';
 need(Buffer.byteLength(xi)<1048576,'XI excede presupuesto de fuente');
 const count=p.start_exp-p.end_exp+1;
 return {schema:'LAPLACE_P004_FLRW_LIMIT_V1',
   xi,xi_sha256:sha(xi),options:p,
   epoch_count:count,bytes_per_epoch:BYTES_PER_EPOCH,
   logical_state_bytes:count*BYTES_PER_EPOCH,memory_base:MEMORY.toString(),
   formal_boundary:BRANCH_RULES,
   physical_validity:'Radiation FLRW formal extrapolation; t=0 undefined; sub-Planck flagged'
 };
}
export function interpretarSingularidad(stdout,manifest){
 need(typeof stdout==='string'&&manifest?.schema==='LAPLACE_P004_FLRW_LIMIT_V1',
   'manifest o salida XI incompatibles');
 const records=stdout.split(/\r?\n/).filter(Boolean).map(line=>{
   try{return JSON.parse(line)}catch{throw Error('XI no devolvió JSONL')}
 });
 const vals=records.filter(x=>x.type==='register').map(x=>x.value);
 need(vals.length===manifest.epoch_count*FIELDS.length&&vals.every(Number.isSafeInteger),
   'faltan registros de una época');
 const epochs=Array.from({length:manifest.epoch_count},(_,i)=>
   Object.fromEntries(FIELDS.map((key,j)=>[key,vals[i*FIELDS.length+j]])));
 for(let i=0;i<epochs.length;i++){
   const row=epochs[i];
   need(row.a_exp===manifest.options.start_exp-i,'orden temporal incorrecto');
   for(const key of SCIENTIFIC)
     need(row[key+'_mantissa']>=1000000&&row[key+'_mantissa']<=9999999,
       'mantisa científica inválida '+key);
   need(row.below_planck_time===0||row.below_planck_time===1,'estado Planck inválido');
 }
 const memory=records.find(x=>x.type==='memory_stats');
 const quantum=records.find(x=>x.type==='quantum_stats');
 need(memory?.model==='inverse-ether-memory'&&quantum,'falta evidencia REVERSE/Ether');
 return {schema:manifest.schema,epochs,memory,quantum,
  formal_boundary:manifest.formal_boundary,xi_sha256:manifest.xi_sha256};
}
export function leerProgramaMemoria(manifest){
 need(manifest?.schema==='LAPLACE_P004_FLRW_LIMIT_V1','manifest inválido');
 const lines=['#!reverse-pc-machine-v1'];
 for(let i=0;i<manifest.logical_state_bytes;i++)
   lines.push('mem_read '+(MEMORY+BigInt(i)));
 lines.push('mem_stats','qstats');
 return lines.join('\n')+'\n';
}
export function decodificarMemoria(stdout,manifest){
 need(manifest?.schema==='LAPLACE_P004_FLRW_LIMIT_V1','manifest inválido');
 const rows=String(stdout).split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x))
   .filter(x=>x.type==='memory_read');
 need(rows.length===manifest.logical_state_bytes,'faltan bytes Ether de singularidad');
 const results=[];let cursor=0;
 for(let epoch=0;epoch<manifest.epoch_count;epoch++){
   const row={};
   for(const name of FIELDS){
     let unsigned=0n;
     for(let byte=0;byte<8;byte++){
       const addr=(MEMORY+BigInt(cursor)).toString(),rec=rows[cursor++];
       need(rec?.address===addr&&rec.deterministic===true&&
         Number.isInteger(rec.value)&&rec.value>=0&&rec.value<=255,
         'memoria Ether dañada en '+addr);
       unsigned|=BigInt(rec.value)<<BigInt(byte*8);
     }
     const signed=unsigned%2n===0n?unsigned/2n:-(unsigned+1n)/2n;
     need(signed>=BigInt(Number.MIN_SAFE_INTEGER)&&
       signed<=BigInt(Number.MAX_SAFE_INTEGER),'entero fuera de precisión segura');
     row[name]=Number(signed);
   }
   results.push(row);
 }
 return results;
}
export const valorCientifico=(mantissa,exponent)=>mantissa*10**exponent;
export const magnitudLog10=(mantissa,exponent)=>Math.log10(mantissa)+exponent;
