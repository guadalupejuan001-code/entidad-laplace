/**
 * Compilador de entradas para el motor temporal XI de REVERSE-PC.
 * JavaScript valida/serializa las condiciones; no multiplica matrices, no
 * calcula potencias, no modifica el runtime ni sustituye el estado Ether.
 * La ejecucion de la evolucion ocurre exclusivamente en nucleo.xi.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const NUCLEO=fileURLToPath(new URL('./nucleo.xi',import.meta.url));
export const DOMINIO='GF2_AFIN_XI_SALTO_E005';
export const HORIZONTE_MAX=1000000000000n;
export const ANCHO_MAX=8;
const BASE=7000000000100000n;
const ACUMULADOR=7000000000200000n;
const ENTRADA=7000000000400000n;
const requireValid=(condition,message)=>{if(!condition)throw new Error(message)};
const bin=(value,n)=>typeof value==='string'&&value.length===n&&/^[01]+$/.test(value);

export const leyEjemplo=Object.freeze([
  '0001', // desplazamiento afín: y3 = x3 XOR 1
  '1000', // x0 contribuye a y0
  '1100', // x1 a y0,y1
  '0110', // x2 a y1,y2
  '0011', // x3 a y2,y3
]);

export function validarLey(coefficients){
  requireValid(Array.isArray(coefficients),'los coeficientes deben ser filas binarias');
  const w=coefficients.length-1;
  requireValid(Number.isInteger(w)&&w>=1&&w<=ANCHO_MAX,'ancho del prototipo: 1..'+ANCHO_MAX);
  requireValid(coefficients.every(row=>bin(row,w)),'ley afín inválida: una constante y una fila por variable');
  return w;
}
export function compilarSalto({coefficients,initial,steps,modelo_sha256='experimento_sintetico'}={}){
  const w=validarLey(coefficients);
  requireValid(bin(initial,w),'estado inicial incompatible con ley');
  const h=String(steps);
  requireValid(/^(0|[1-9][0-9]{0,12})$/.test(h),'horizonte debe ser entero decimal no negativo');
  const bigint=BigInt(h);
  requireValid(bigint<=HORIZONTE_MAX,'horizonte máximo experimental: '+HORIZONTE_MAX);
  requireValid(typeof modelo_sha256==='string' &&
    (modelo_sha256==='experimento_sintetico'||/^[a-f0-9]{64}$/.test(modelo_sha256)),
    'identificador de modelo invalido: usar un SHA-256 o experimento_sintetico');
  const N=w+1;
  const matrix=[];
  for(let output=0;output<w;output++){
    const row=[];
    for(let input=0;input<w;input++)row.push(Number(coefficients[input+1][output]));
    row.push(Number(coefficients[0][output]));matrix.push(row);
  }
  matrix.push([...Array(w).fill(0),1]);
  const lines=['#!reverse-pc-machine-v1',
    '# LAPLACE E005 - evolucion de ley afín aprendida (GF2) por potenciacion binaria.',
    '# No usa datos futuros, ni simula 1 qubit por instante.',
    '# Modelo: '+modelo_sha256,'# Estados '+w+', horizonte '+h,
    '# Memoria exclusiva de este experimento; no se reinicia RVPC2.'];
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){
    const index=BigInt(i*N+j);
    lines.push('store8 '+(BASE+index)+' '+matrix[i][j]);
    lines.push('store8 '+(ACUMULADOR+index)+' '+Number(i===j));
  }
  for(let i=0;i<N;i++)lines.push('store8 '+(ENTRADA+BigInt(i))+' '+(i<w?initial[i]:'1'));
  lines.push('set r0 '+h,'set r1 '+N);
  lines.push(readFileSync(NUCLEO,'utf8').trimEnd());
  const xi=lines.join('\n')+'\n';
  requireValid(Buffer.byteLength(xi)<1024*1024,'el programa excede el presupuesto de 1 MiB');
  return {xi,width:w,horizon:h,dimension:N,law_sha256:createHash('sha256').update(JSON.stringify(coefficients)).digest('hex'),
    xi_sha256:createHash('sha256').update(xi).digest('hex'),modelo_sha256,
    conceptual_steps_naive:h,matrices_almacenadas:3,bytes_matriz_por_banco:N*N,
    observation_bytes:N,output_addresses:Array.from({length:N},(_,i)=>(7000000000500000n+BigInt(i)).toString())};
}

export function interpretarSalida(raw,width){
  requireValid(typeof raw==='string'&&Number.isInteger(width)&&width>=1&&width<=ANCHO_MAX,'salida inválida');
  const rows=raw.split(/\r?\n/).filter(Boolean).map(line=>{
    try{return JSON.parse(line)}catch{throw new Error('respuesta XI no es JSONL')}
  });
  const printed=rows.filter(x=>x?.type==='register');
  return {rows,prints:printed};
}
