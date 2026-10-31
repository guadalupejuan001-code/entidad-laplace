#!/usr/bin/env node
/* EF001: consola de base financiera en el mismo PGlite I001.
 * Detener el servidor de entrada antes de abrir la misma base local.
 * No descarga cuentas, no opera ni inicia un predictor automáticamente.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Store} from '../input/almacen.mjs';
import {consultarCatalogo} from '../estado-financiero/catalogo-mundial.mjs';
import {prepararLotesXI,compilarLotesXI,probarLotesXI} from '../estado-financiero/puente-xi.mjs';
import {importarU003,consultarCorte,consultarEstadosDispersos,coberturaCorte}
  from '../estado-financiero/repositorio.mjs';

const args=process.argv.slice(2);
const usage='Comandos: node tools/estado-financiero.mjs migrar [DIRECTORIO_BD]'+
  '\n  importar-u003 CAPTURA_SELLADA.json [DIRECTORIO_BD]'+
  '\n  corte FECHA_UTC [DIRECTORIO_BD] [FAMILIA]'+
  '\n  disperso FECHA_UTC [DIRECTORIO_BD] [ESCENARIO_SHA]'+
  '\n  cobertura FECHA_UTC [DIRECTORIO_BD]'+
  '\n  mapa [DIRECTORIO_BD]'+
  '\n  xi FECHA_UTC [DIRECTORIO_BD] [BINARIO_XI_ORIGINAL]'+
  '\nBD por defecto: registros/input/postgres (la misma base del modulo I001).'+
  '\nDetener I001 antes de usar PGlite local; con PostgreSQL servidor usar su cliente habilitado.';
const mode=args.shift();
if(!mode||mode==='--help'||mode==='--ayuda'){console.log(usage);process.exit(0)}
const needsPath=mode==='importar-u003'||['corte','disperso','cobertura','xi'].includes(mode);
if(!['migrar','importar-u003','corte','disperso','cobertura','mapa','xi'].includes(mode)||
  needsPath&&!args.length){console.error(usage);process.exitCode=2}
else{
  const first=needsPath?args.shift():null;
  const dir=resolve(args.shift()??'registros/input/postgres');
  const family=args.shift()??null;
  if(args.length){console.error('Argumentos excedidos');process.exitCode=2}
  else{
    let store;
    try{
      store=await Store.open({embeddedDirectory:dir});
      await store.migrate();
      let result;
      if(mode==='migrar'){
        result={schema:'EF001',status:'migrated_or_already_present',storage:dir,
          existing_i001_retained:true,no_tables_dropped:true};
      }else if(mode==='importar-u003'){
        const raw=await readFile(resolve(first));
        if(raw.length>32*1024*1024)throw Error('Captura excede 32 MiB');
        result=await importarU003(store,JSON.parse(raw.toString('utf8')));
      }else if(mode==='corte'){
        result=await consultarCorte(store,{asOf:first,family});
      }else if(mode==='mapa'){
        result=await consultarCatalogo(store.db);
      }else if(mode==='xi'){
        const state=await consultarCorte(store,{asOf:first});
        const projection=prepararLotesXI(state.states,{cutoff:first});
        const compiled=compilarLotesXI(projection);
        result={as_of:first,read:state.states.length,projected:projection.imported,
          excluded:projection.excluded,original_units_retained:true,
          batches:compiled.map(({xi_program,...details})=>details),
          proof:family?probarLotesXI(resolve(family),projection):'native_binary_not_supplied',
          automatic_trading:false};
      }else if(mode==='disperso'){
        result=await consultarEstadosDispersos(store,{asOf:first,scenario_id:family});
      }else result=await coberturaCorte(store,{asOf:first});
      console.log(JSON.stringify(result,null,2));
    }catch(error){
      console.error('EF001: '+String(error.message));process.exitCode=1;
    }finally{
      if(store)try{await store.close()}catch(error){
        console.error('EF001 cierre: '+String(error.message));process.exitCode=1;
      }
    }
  }
}
