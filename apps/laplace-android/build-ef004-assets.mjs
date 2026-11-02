import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const sources=['demonio/finanzas-ef004.mjs','demonio/series.mjs','demonio/evaluacion-ef004.mjs',
 'estado-financiero/modelo.mjs','universo/estados.mjs','universo/integridad.mjs','input/contrato.mjs'];
const hashes=Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
const result=await build({entryPoints:[resolve(dir,'mobile/ef004-entry.mjs')],bundle:true,
 write:false,format:'iife',platform:'browser',target:['chrome90'],minify:false,
 alias:{'node:crypto':resolve(dir,'mobile/crypto-shim.mjs')}});
const code=result.outputFiles[0].text;
const output='/* GENERADO desde EF004 original. SHA-256: @noble/hashes MIT. */\n'+
 'globalThis.LAPLACE_EF004_ENGINE='+JSON.stringify({schema:'laplace-ef004-browser-bundle-v1',sources:hashes})+';\n'+
 'globalThis.LAPLACE_EF004_WORKER_SOURCE='+JSON.stringify(code)+';\n';
const dest=resolve(dir,'app/src/main/assets/ef004-runtime.js');
if(process.argv.includes('--verify')){
 if(readFileSync(dest,'utf8')!==output)throw Error('El paquete EF004 diverge de sus fuentes canónicas');
 console.log('Identidad del motor EF004 comprobada');
}else{writeFileSync(dest,output);console.log('Motor EF004 original empaquetado',code.length,'bytes')}
