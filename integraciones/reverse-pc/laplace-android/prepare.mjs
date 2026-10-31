/* Adaptación de plataforma: misma matemática M001; SHA-256 pasa a WebCrypto.
 * Fuente fijada por commit y hashes. Ninguna descarga durante la compilación. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(readFileSync(root+'/laplace-android/upstream-lock.json'));
const target=root+'/reverse-os-android/app/src/main/assets/laplace';
const hash=s=>createHash('sha256').update(s).digest('hex');
const read=p=>readFileSync(root+'/laplace-android/upstream/'+p,'utf8');
for(const [p,h] of Object.entries(lock.files))if(hash(read(p))!==h)throw Error('Fuente Laplace alterada: '+p);
let s=read('seguimiento/modelo.mjs');
const replace=(old,next)=>{if(!s.includes(old))throw Error('Adaptador incompatible: '+old);s=s.replace(old,next)};
replace("import {readFileSync} from 'node:fs';\n",'');
replace("import {createHash} from 'node:crypto';\n",'');
replace("import {huellaContenido} from '../universo/integridad.mjs';","import {huellaContenido} from './integridad.mjs';");
replace("export const CODIGO_SHA256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');","export const CODIGO_SHA256='"+lock.files['seguimiento/modelo.mjs']+"';");
replace('export function emitirPronosticos(','export async function emitirPronosticos(');
replace('const huellaEntradas=huellaContenido(', 'const huellaEntradas=await huellaContenido(');
replace('return hs.map(h=>{','return Promise.all(hs.map(async h=>{');
replace('return {...body,id:huellaContenido(body)};', 'return {...body,id:await huellaContenido(body)};');
replace('  });\n}\nexport function verificarPronostico','  }));\n}\nexport async function verificarPronostico');
replace('id===huellaContenido(body)','id===await huellaContenido(body)');
replace('export function evaluarPronostico(', 'export async function evaluarPronostico(');
replace('  verificarPronostico(p);','  await verificarPronostico(p);');
let integrity=read('universo/integridad.mjs').split('export const huellaContenido=')[0]
 .replace("import {createHash} from 'node:crypto';\n",'');
integrity+=`export async function huellaContenido(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serializarCanonico(value)));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}\n`;
const generated={'modelo.mjs':s,'integridad.mjs':integrity};
mkdirSync(target,{recursive:true});
for(const [p,body] of Object.entries(generated)){
 if(process.argv.includes('--check')){if(readFileSync(target+'/'+p,'utf8')!==body)throw Error('Regenerar '+p);}
 else writeFileSync(target+'/'+p,body);
}
console.log(JSON.stringify({upstream:lock.commit,files:Object.keys(generated),check:process.argv.includes('--check')}));
