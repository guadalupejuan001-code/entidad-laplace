import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const r=await build({entryPoints:[resolve(dir,'mobile/c04-entry.mjs')],bundle:true,write:false,
 format:'iife',platform:'browser',target:['chrome90'],alias:{'node:crypto':resolve(dir,'mobile/crypto-shim.mjs')}});
const output='/* GENERADO desde el verificador C03 y comparador C04 originales. */\n'+r.outputFiles[0].text+
 "\nif(typeof module!=='undefined'&&module.exports)module.exports=globalThis.LaplaceComparacionC04;\n";
const dest=resolve(dir,'app/src/main/assets/comparison-c04.js');
if(process.argv.includes('--verify')){
 if(readFileSync(dest,'utf8')!==output)throw Error('C04: paquete móvil diferente de sus fuentes');
 console.log('C04: identidad Node/WebView comprobada');
}else{writeFileSync(dest,output);console.log('C04: verificación y comparación empaquetadas')}
