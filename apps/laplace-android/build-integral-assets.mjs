/* Bundler de identidad byte a byte de los motores F001 y Laplace.
   La APK no usa un nuevo simulador cuando existe código canónico. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const strip=s=>s.replace(/\bexport\s+(?=(?:const|function|async function)\s)/g,'');
const dest=resolve(root,'apps/laplace-android/app/src/main/assets/fusion-integral.js');
const output="/* Motores F001/Laplace y observatorio de capacidades, fuentes canónicas. ARCHIVO GENERADO. */\n(function(root){\n'use strict';\nconst F001=(function(){\n"+strip(read('prediccion/fusion-temporal.mjs'))+
  "\nreturn {FUSION_SCHEMA,HORIZON_PLAN,HISTORIA_REQUERIDA,\n prepararSerie,proyectarHorizonte,evaluarContexto,fusionTemporal,adquirirEnParalelo};\n})();\nconst FIELD=(function(){\n"+strip(read('ecuacion/laplace-financiero.mjs'))+
  "\nreturn {LAPLACE_FIN_VERSION,auditarUniversoLaplace,aplicarLaplaceAHorizontes};\n})();\nconst REGISTRY=(function(){\n"+
  strip(read('nucleo/registro-capacidades.mjs'))+
  "\nreturn {CAPABILITY_SCHEMA,CAPABILITY_CATALOG,resumirCapacidades};\n})();\nroot.LaplaceIntegral=Object.freeze({...F001,...FIELD,...REGISTRY});\n})(typeof window!=='undefined'?window:globalThis);\n";
if(process.argv.includes('--verify')){
 if(readFileSync(dest,'utf8')!==output)
  throw Error('El paquete Android diverge del núcleo original F001/Laplace');
 console.log('Identidad F001 y Laplace comprobada');
}else{
 writeFileSync(dest,output,'utf8');
 console.log('Fuentes F001 y Laplace empaquetadas sin alterar el cálculo');
}
