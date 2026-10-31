#!/usr/bin/env node
/* EF003: ejecutar un escenario aislado contra observaciones EF001 existentes.
 * No permite forzar un decision_at en el pasado; usa el reloj real.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Store} from '../input/almacen.mjs';
import {ejecutarEscenarioEF003} from '../estado-financiero/ejecucion.mjs';
const [file,dbdir='registros/input/postgres',...extra]=process.argv.slice(2);
if(!file||extra.length||file==='--help'){
  console.log('Uso: node tools/simular-financiero.mjs PLAN.json [DIRECTORIO_PGLITE]\n'+
    'El archivo usa SHA256 de observaciones EF001 ya almacenadas.\n'+
    'Las trayectorias futuras son condicionales, no hechos ni órdenes.\n');
  if(!file||extra.length)process.exitCode=2;
}else{
  let store;
  try{
    const bytes=await readFile(resolve(file));
    if(bytes.length>1024*1024)throw Error('Plan excede 1 MiB');
    const plan=JSON.parse(bytes.toString('utf8'));
    const url=process.env.LAPLACE_DATABASE_URL;
    store=await Store.open(url?{databaseURL:url}:{embeddedDirectory:resolve(dbdir)});
    await store.migrate({timescale:process.env.LAPLACE_TIMESCALE==='true'});
    const result=await ejecutarEscenarioEF003(store,plan);
    console.log(JSON.stringify(result,null,2));
  }catch(error){console.error('EF003: '+String(error.message));process.exitCode=1}
  finally{if(store)try{await store.close()}catch(error){console.error(error.message);process.exitCode=1}}
}
