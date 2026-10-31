/**
 * LAPLACE P005 — compile a sparse exact Rule-90 experiment into REVERSE XI.
 *
 * The production physics (binary recurrence, Lucas bit test, cyclic wrapping,
 * total population, sparse-memory queries) is run in XI Machine on Ether.
 * JavaScript only validates configuration and serializes declared input bytes.
 *
 * The notional grid is 2^60 B if represented with one byte/cell, and even a
 * packed whole-grid bitfield would require 2^57 B. This does not allocate it.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const SOURCE=fileURLToPath(new URL('./exabyte.xi',import.meta.url));
const FIELD_BASE=3000000000000000000n; // separate from all metadata regions
const INPUT_BASE=7000000009000000n;
const OUTPUT_BASE=7000000010000000n;
const need=(test,message)=>{if(!test)throw new Error(message)};
const sha=data=>createHash('sha256').update(data).digest('hex');
const decimal=(value,name)=>{
  need(typeof value==='string'||typeof value==='bigint'||
    (typeof value==='number'&&Number.isSafeInteger(value)),
    name+' requiere un entero decimal exacto (cadena para valores grandes)');
  const s=String(value);
  need(/^(0|[1-9][0-9]*)$/.test(s),name+' no es decimal natural');
  return BigInt(s);
};
const num=(value,name,lo,hi)=>{
  need(typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=lo&&value<=hi,name+' fuera del intervalo');
  return value;
};
export const DEFAULT_STEPS=String((1n<<50n)-1n-(1n<<9n)-(1n<<17n)-(1n<<33n));
export const DEFAULT=Object.freeze({cell_bits:60,seed_count:16,steps:DEFAULT_STEPS});
export const MAX_QUERIES=256;
export const STATE_ADDRESSES=Object.freeze({
  field_base:FIELD_BASE.toString(),queries_base:INPUT_BASE.toString(),
  answers_base:OUTPUT_BASE.toString()
});
export function posicionesEjemplo(input=DEFAULT){
  const n=1n<<BigInt(input.cell_bits),step=decimal(input.steps,'steps');
  const gap=n/BigInt(input.seed_count);
  const shifts=[
    -step,-step+2n,-step+2n*(1n<<9n),-step+2n*(1n<<10n),
    -step+2n*(1n<<17n),-step+2n*(1n<<18n),
    -step+2n*(1n<<33n),-step+2n*(1n<<34n),
    0n,1n,step-2n,step,step+1n,2n*step+1n
  ];
  need(shifts.length*input.seed_count<=MAX_QUERIES,
    'demasiadas consultas predeterminadas');
  return Array.from({length:input.seed_count},(_,i)=>
    shifts.map(off=>((BigInt(i)*gap+off)%n+n)%n+'')).flat();
}
export function validarExperimento(raw){
  need(raw&&typeof raw==='object'&&!Array.isArray(raw),
    'experimento de exabyte inválido');
  need(Object.keys(raw).every(x=>
    ['cell_bits','seed_count','steps','queries'].includes(x)),
    'campo de experimento no declarado');
  const bits=num(raw.cell_bits,'cell_bits',8,60);
  const seeds=num(raw.seed_count,'seed_count',1,16);
  need((seeds&(seeds-1))===0,'seed_count debe ser 1,2,4,8 o16');
  const size=1n<<BigInt(bits),gap=size/BigInt(seeds),
    t=decimal(raw.steps,'steps');
  need(t<=(1n<<50n)-1n,'el horizonte supera 2^50-1');
  need(2n*t<gap,'se requieren conos causales disjuntos: 2*t<espaciado');
  // Only a bound on JSON-safe count. The production count is computed by XI.
  const ones=t.toString(2).replace(/0/g,'').length;
  need(ones+Math.log2(seeds)<=52,
    'población exacta fuera del presupuesto de enteros JSON seguros');
  need(Array.isArray(raw.queries)&&raw.queries.length>=1&&
    raw.queries.length<=MAX_QUERIES,'se requieren 1..256 consultas');
  const queries=raw.queries.map((x,i)=>{
    const q=decimal(x,'queries['+i+']');
    need(q<size,'coordenada fuera del universo circular');
    return q;
  });
  return Object.freeze({bits,seeds,size,gap,t,queries});
}
export function compilarMegaceldas(raw){
  const m=validarExperimento(raw);
  const source=['#!reverse-pc-machine-v1',
    '# LAPLACE P005: campo logico de '+m.size+' celdas; NO RAM densa.',
    '# Semillas almacenadas en direcciones Ether disjuntas de consultas.',
    '# El calculo de cada celda y la poblacion se ejecuta SOLO en XI.'];
  const seeds=Array.from({length:m.seeds},(_,i)=>BigInt(i)*m.gap);
  for(const position of seeds)
    source.push('store8 '+(FIELD_BASE+position)+' 1');
  for(let i=0;i<m.queries.length;i++){
    let coord=m.queries[i];
    for(let byte=0;byte<8;byte++){
      source.push('store8 '+(INPUT_BASE+BigInt(i)*8n+BigInt(byte))+
        ' '+Number(coord&255n));
      coord>>=8n;
    }
    need(coord===0n,'coordenada excedió 64 bits');
  }
  let core=readFileSync(SOURCE,'utf8');
  const binding={
    __RING_SIZE__:m.size,__TIME__:m.t,
    __SEED_COUNT__:m.seeds,__SEED_SPACING__:m.gap,
    __HALF_SIZE__:m.size/2n,__QUERY_COUNT__:m.queries.length,
    __INPUT_BASE__:INPUT_BASE,__FIELD_BASE__:FIELD_BASE,
    __OUTPUT_BASE__:OUTPUT_BASE
  };
  for(const [marker,value] of Object.entries(binding)){
    const n=core.split(marker).length-1;
    need(n===1,'etiqueta XI ambigua: '+marker+' ('+n+')');
    core=core.split(marker).join(String(value));
  }
  need(!/__[_A-Z0-9]+__/.test(core),'marcador XI no resuelto');
  const xi=source.join('\n')+'\n'+core.trimEnd()+'\n';
  need(Buffer.byteLength(xi)<1048576,'fuente XI excedió 1 MiB');
  return {
    schema:'LAPLACE_P005_RULE90_EXABYTE_XI',
    xi,xi_sha256:sha(xi),
    recurrence:'cell(t+1,i)=cell(t,i-1) XOR cell(t,i+1)',
    settings:{cell_bits:m.bits,seed_count:m.seeds,
      steps:m.t.toString(),query_count:m.queries.length,
      nonoverlap_proven_by:'2*steps < ring_size/seed_count'},
    logical_cells:m.size.toString(),
    dense_one_byte_bytes:m.size.toString(),
    dense_bitpacked_bytes:(m.size/8n).toString(),
    source_seed_positions:seeds.map(x=>x.toString()),
    queries:m.queries.map(x=>x.toString()),
    memory_addresses:STATE_ADDRESSES,
    output_count_format:'safe decimal integer (cell count <2^53)',
    result_state_region_bytes:m.queries.length,
    limitation:'linear binary cellular automaton; other rules may lack a compact exact shortcut'
  };
}
export function leerResultado(stdout,manifest){
  need(typeof stdout==='string'&&manifest?.schema==='LAPLACE_P005_RULE90_EXABYTE_XI',
    'manifest o salida XI incompatible');
  const rec=stdout.split(/\r?\n/).filter(Boolean).map(line=>{
    try{return JSON.parse(line)}catch{throw Error('respuesta XI no es JSONL')}
  });
  const prints=rec.filter(x=>x.type==='register').map(x=>x.value);
  const q=manifest.settings.query_count;
  need(prints.length===2*q+4&&prints.every(Number.isSafeInteger),
    'salida incompleta o con entera perdida de precisión');
  const queries=[];
  for(let i=0;i<q;i++){
    need(prints[2*i]===i&&[0,1].includes(prints[2*i+1]),
      'respuesta XI corrupta en consulta '+i);
    queries.push({index:i,position:manifest.queries[i],bit:prints[2*i+1]});
  }
  const population=prints[2*q],time=prints[2*q+1],
    seeds=prints[2*q+2],queryCount=prints[2*q+3];
  need(population>=0&&time===Number(manifest.settings.steps)&&
    seeds===manifest.settings.seed_count&&queryCount===q,'cabecera XI no coincide');
  const memory=rec.find(x=>x.type==='memory_stats');
  const quantum=rec.find(x=>x.type==='quantum_stats');
  need(memory?.model==='inverse-ether-memory'&&quantum,
    'no hay prueba de ejecución original XI/Ether');
  return {schema:manifest.schema,queries,active_cells:population,
    steps:manifest.settings.steps,seed_count:seeds,logical_cells:manifest.logical_cells,
    memory_stats:memory,quantum_stats:quantum,xi_sha256:manifest.xi_sha256};
}
export function programaLecturaResultados(manifest){
  need(manifest?.schema==='LAPLACE_P005_RULE90_EXABYTE_XI',
    'manifest de consulta inválido');
  return '#!reverse-pc-machine-v1\n'+Array.from(
    {length:manifest.settings.query_count},(_,i)=>
      'mem_read '+(OUTPUT_BASE+BigInt(i))).join('\n')+'\nmem_stats\nqstats\n';
}
export function verificarResultadosPersistidos(stdout,result){
  need(result?.schema==='LAPLACE_P005_RULE90_EXABYTE_XI','resultado incompatible');
  const rec=String(stdout).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line))
    .filter(x=>x.type==='memory_read');
  need(rec.length===result.queries.length,'faltan respuestas de InverseMemory');
  return rec.every((x,i)=>x.address===(OUTPUT_BASE+BigInt(i)).toString()&&
    x.deterministic===true&&x.value===result.queries[i].bit);
}
export const EJEMPLO=Object.freeze({
 ...DEFAULT,queries:Object.freeze(posicionesEjemplo(DEFAULT))
});
