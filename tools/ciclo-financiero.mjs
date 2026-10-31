#!/usr/bin/env node
/* EF002: persistencia recuperable del observatorio mundial público.
 * Compatible con PGlite local o PostgreSQL (mediante LAPLACE_DATABASE_URL).
 * Nunca crea una estrategia de trading ni almacena credenciales.
 */
import {resolve} from 'node:path';
import {Store} from '../input/almacen.mjs';
import {ejecutarCicloEF002,guardarArchivoEF002,recuperarArchivosEF002,
  descubrirManifiestosEF002} from '../estado-financiero/captura.mjs';
import {consultarCorte,coberturaCorte} from '../estado-financiero/repositorio.mjs';
import {consultarCatalogo} from '../estado-financiero/catalogo-mundial.mjs';

const args=process.argv.slice(2);
const cmd=args.shift();
const usage='EF002: \n  node tools/ciclo-financiero.mjs capturar DIRECTORIO_ARCHIVO [DIRECTORIO_PGLITE]\n'+
  '  node tools/ciclo-financiero.mjs recuperar DIRECTORIO_ARCHIVO [DIRECTORIO_PGLITE]\n'+
  '  node tools/ciclo-financiero.mjs estado FECHA_UTC [DIRECTORIO_PGLITE]\n'+
  '  Opcional: LAPLACE_DATABASE_URL apunta a PostgreSQL servidor en lugar de PGlite local.\n'+
  '  En PGlite detener I001 antes de ejecutar un segundo escritor.\n';
if(cmd==='--help'||cmd==='-h'||!cmd){console.log(usage);process.exit(0)}
if(!['capturar','recuperar','estado'].includes(cmd)||args.length<1||args.length>2){
  console.error(usage);process.exitCode=2;
}else{
  const target=args.shift();
  const path=args.shift()??'registros/input/postgres';
  let store;
  try{
    const db=process.env.LAPLACE_DATABASE_URL;
    store=await Store.open(db?{databaseURL:db}:{embeddedDirectory:path==='memory://'?path:resolve(path)});
    await store.migrate({timescale:process.env.LAPLACE_TIMESCALE==='true'});
    let output;
    if(cmd==='capturar'){
      const result=await ejecutarCicloEF002({store});
      const saved=await guardarArchivoEF002({capture:result.capture,
        summary:result.summary,directory:resolve(target)});
      output={cycle:result.summary,archive:saved,persistence:{
        backend:db?'postgresql_server':'embedded_postgresql',
        archive_recoverable:true,global_data_complete:false}};
    }else if(cmd==='recuperar'){
      const files=await descubrirManifiestosEF002(resolve(target));
      output=await recuperarArchivosEF002(store,files);
    }else{
      output={as_of:target,domain_catalog:(await consultarCatalogo(store.db)).desired_domains,
        current:await consultarCorte(store,{asOf:target}),
        coverage:await coberturaCorte(store,{asOf:target})};
    }
    console.log(JSON.stringify(output,null,2));
  }catch(error){
    console.error('EF002: '+String(error.message));process.exitCode=1;
  }finally{
    if(store)try{await store.close()}catch(error){
      console.error('EF002 cierre: '+String(error.message));process.exitCode=1;
    }
  }
}
