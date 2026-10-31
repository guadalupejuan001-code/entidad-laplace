/*
 * LaPlaceDIG P001 -- configuracion tipada del billar fisico 2D.
 * El anfitrion NO integra movimiento ni simula colisiones: genera codigo XI.
 * Autoridad de la evolucion y estado observado: REVERSE-PC QuantumRuntime/XI.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const SOURCE=fileURLToPath(new URL('./billar.xi',import.meta.url));
export const MAX_HORIZON_S=1000000000000n;
export const MAX_BOX_MM=1000000;
export const MAX_SPEED_MM_S=1000000;
export const STATE_BASE=7000000001000000n;
export const STATE_FIELDS=['x_mm','y_mm','vx_mm_s','vy_mm_s','masa_kg','energia_doble'];
const need=(condition,message)=>{if(!condition)throw new Error(message)};
const number=(value,label,min,max)=>{
  need(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,
    label+' debe ser un entero en ['+min+','+max+']');
  return value;
};
const horizon=(value,label)=>{
  const literal=String(value);
  need((typeof value==='number'&&Number.isSafeInteger(value))||typeof value==='string'||typeof value==='bigint',
    label+' debe ser un entero decimal');
  need(/^(0|[1-9][0-9]{0,12})$/.test(literal),'formato decimal invalido de '+label);
  const valueBig=BigInt(literal);
  need(valueBig<=MAX_HORIZON_S,label+' supera el presupuesto '+MAX_HORIZON_S);
  return valueBig;
};
const hash=x=>createHash('sha256').update(x).digest('hex');
export function validarSistema(data){
  need(data&&typeof data==='object'&&!Array.isArray(data),'sistema fisico invalido');
  const width_mm=number(data.ancho_mm,'ancho_mm',1,MAX_BOX_MM);
  const height_mm=number(data.alto_mm,'alto_mm',1,MAX_BOX_MM);
  const mass_kg=number(data.masa_kg,'masa_kg',1,1000);
  const x_mm=number(data.x_mm,'x_mm',0,width_mm);
  const y_mm=number(data.y_mm,'y_mm',0,height_mm);
  const vx_mm_s=number(data.vx_mm_s,'vx_mm_s',-MAX_SPEED_MM_S,MAX_SPEED_MM_S);
  const vy_mm_s=number(data.vy_mm_s,'vy_mm_s',-MAX_SPEED_MM_S,MAX_SPEED_MM_S);
  const horizon_s=horizon(data.horizonte_s,'horizonte_s');
  let impulse=null;
  if(data.impulso!==undefined&&data.impulso!==null){
    need(data.impulso&&typeof data.impulso==='object'&&!Array.isArray(data.impulso),'impulso invalido');
    const at_s=horizon(data.impulso.instante_s,'impulso.instante_s');
    need(at_s<=horizon_s,'impulso posterior al tiempo consultado');
    const dvx=number(data.impulso.delta_vx_mm_s,'impulso.delta_vx_mm_s',-MAX_SPEED_MM_S,MAX_SPEED_MM_S);
    const dvy=number(data.impulso.delta_vy_mm_s,'impulso.delta_vy_mm_s',-MAX_SPEED_MM_S,MAX_SPEED_MM_S);
    // The sign may flip at a wall before an impulse, so absolute maxima are additive.
    need(Math.abs(vx_mm_s)+Math.abs(dvx)<=MAX_SPEED_MM_S &&
      Math.abs(vy_mm_s)+Math.abs(dvy)<=MAX_SPEED_MM_S,'impulso excede velocidad maxima en alguna pared');
    impulse={at_s,delta_vx_mm_s:dvx,delta_vy_mm_s:dvy};
  }
  return {ancho_mm:width_mm,alto_mm:height_mm,masa_kg:mass_kg,
    x_mm,y_mm,vx_mm_s,vy_mm_s,horizonte_s:horizon_s,impulso:impulse};
}

export function compilarSistema(data){
  const w=validarSistema(data);
  const inputs=[
    '#!reverse-pc-machine-v1',
    '# LAPLACE FISICA P001: billar ideal bidimensional, unidades mm, s, kg.',
    '# Evolucion elastica exacta dentro del modelo, sin fuerza gravitatoria.',
    'set r0 '+(w.impulso?w.impulso.at_s:w.horizonte_s),
    'set r10 '+w.x_mm,'set r11 '+w.y_mm,
    'set r12 '+w.vx_mm_s,'set r13 '+w.vy_mm_s,
    'set r14 '+w.masa_kg,'set r15 '+(w.impulso?0:1)
  ];
  let core=readFileSync(SOURCE,'utf8');
  const config={
    __WIDTH_MM__:w.ancho_mm,__HEIGHT_MM__:w.alto_mm,
    __DELTA_VX_MM_S__:w.impulso?.delta_vx_mm_s??0,
    __DELTA_VY_MM_S__:w.impulso?.delta_vy_mm_s??0,
    __HORIZON_S__:w.horizonte_s,__EVENT_AT_S__:w.impulso?.at_s??0n
  };
  for(const [placeholder,value] of Object.entries(config)){
    const pieces=core.split(placeholder);
    need(pieces.length===2,'marcador de fisica desconocido o duplicado: '+placeholder);
    core=pieces.join(String(value));
  }
  need(!/__[_A-Z0-9]+__/.test(core),'marcador XI incompleto');
  const xi=[...inputs,core.trimEnd()].join('\n')+'\n';
  need(Buffer.byteLength(xi)<1048576,'fuente fisica demasiado larga');
  const input_manifest={ancho_mm:w.ancho_mm,alto_mm:w.alto_mm,
    masa_kg:w.masa_kg,x_mm:w.x_mm,y_mm:w.y_mm,
    vx_mm_s:w.vx_mm_s,vy_mm_s:w.vy_mm_s,horizonte_s:String(w.horizonte_s),
    impulso:w.impulso?{instante_s:String(w.impulso.at_s),
      delta_vx_mm_s:w.impulso.delta_vx_mm_s,delta_vy_mm_s:w.impulso.delta_vy_mm_s}:null};
  return {schema:'LAPLACE_P001_BILLAR_XI_V1',xi,configuration:input_manifest,
    xi_sha256:hash(xi),configuration_sha256:hash(JSON.stringify(input_manifest)),
    materialization_bytes:STATE_FIELDS.length*8,
    output_base:STATE_BASE.toString(),
    output_fields:STATE_FIELDS,
    model:'punto material en caja rectangular, reflexion elastica ideal y un impulso opcional'};
}
export function leerSalida(stdout){
  need(typeof stdout==='string','salida XI invalida');
  const rows=stdout.trim().split(/\r?\n/).filter(Boolean).map(x=>{
    try{return JSON.parse(x)}catch{throw new Error('salida XI JSONL invalida')}
  });
  const prints=rows.filter(x=>x.type==='register').map(x=>x.value);
  need(prints.length===6&&prints.every(Number.isSafeInteger),'faltan seis registros fisicos');
  const stats=rows.find(x=>x.type==='memory_stats');
  need(stats?.model==='inverse-ether-memory','sin evidencia de Inverse Ether Memory');
  return {estado:Object.fromEntries(STATE_FIELDS.map((field,i)=>[field,prints[i]])),
    energia_joules:prints[5]/2000000,
    mem_stats:stats,quantum_stats:rows.find(x=>x.type==='quantum_stats')??null};
}
export function recuperarEstadoMemory(reads){
  need(Array.isArray(reads)&&reads.length===STATE_FIELDS.length*8,'se requieren 48 lecturas reales');
  const result={};
  for(let field=0;field<STATE_FIELDS.length;field++){
    let encoded=0n;
    for(let i=0;i<8;i++){
      const addr=(STATE_BASE+BigInt(field*8+i)).toString();
      const row=reads[field*8+i];
      need(row?.type==='memory_read'&&row.address===addr&&row.deterministic===true &&
        Number.isInteger(row.value)&&row.value>=0&&row.value<=255,'byte Ether incorrecto en '+addr);
      encoded|=BigInt(row.value)<<BigInt(8*i);
    }
    const decoded=encoded%2n===0n?encoded/2n:-(encoded+1n)/2n;
    need(decoded>=BigInt(Number.MIN_SAFE_INTEGER)&&decoded<=BigInt(Number.MAX_SAFE_INTEGER),
      'estado fisico fuera del rango seguro');
    result[STATE_FIELDS[field]]=Number(decoded);
  }
  return result;
}
export function generarLecturaMemory(){
  return '#!reverse-pc-machine-v1\n'+Array.from({length:STATE_FIELDS.length*8},
    (_,i)=>'mem_read '+(STATE_BASE+BigInt(i))).join('\n')+'\n';
}
export const escenarioPrueba=Object.freeze({
  ancho_mm:1500,alto_mm:900,masa_kg:2,x_mm:120,y_mm:210,
  vx_mm_s:17,vy_mm_s:11,horizonte_s:'1000000'
});
