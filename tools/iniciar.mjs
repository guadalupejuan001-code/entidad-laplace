#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startInput} from '../input/servidor.mjs';
import {iniciarPanel} from '../panel/servidor.mjs';

export async function startLaplace({config,directory=process.env.LAPLACE_INPUT_DIRECTORIO??'registros/input',inputOptions={},panelOptions={}}={}){
  config??=JSON.parse(await readFile(new URL('../input/config.local.json',import.meta.url),'utf8'));
  const input=await startInput(config,{directory,...inputOptions});let panel;
  try{panel=await iniciarPanel({puerto:Number(process.env.LAPLACE_PANEL_PUERTO??4179),
    archivo:process.env.LAPLACE_PANEL_ARCHIVO??'registros/panel-laplace.json',entradaDirectorio:directory,...panelOptions})}
  catch(error){await input.close();throw error}
  let closed=false;return {input,panel,async close(){if(closed)return;closed=true;
    panel.closeIdleConnections?.();await new Promise(resolve=>panel.close(resolve));await input.close()}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const app=await startLaplace();console.log('LAPLACE: http://127.0.0.1:'+app.panel.address().port+' · Entrada de datos activa');
    const stop=async()=>{try{await app.close()}catch(error){console.error('Cierre Laplace: '+error.message);process.exitCode=1}};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }catch(error){console.error('Inicio Laplace: '+error.message);process.exitCode=1}
}
