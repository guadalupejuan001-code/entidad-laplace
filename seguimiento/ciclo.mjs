/* Un ciclo puede ejecutarse por cron/GitHub Actions o por proceso local.
 * Nunca hace órdenes. No reconstruye predicciones para horas no ejecutadas. */
import {existsSync,readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchQuote} from '../bitcoin/agente.mjs';
import {emitirPronosticos,evaluarPronostico,validarVelas,HORIZONTES} from './modelo.mjs';
import {leerDiario,añadirEvento,guardarResumen} from './diario.mjs';
import {huellaContenido} from '../universo/integridad.mjs';
const ROOT='https://api.exchange.coinbase.com/products/BTC-USD/candles';
const iso=n=>new Date(n).toISOString(),debe=(c,m)=>{if(!c)throw Error(m)};
export async function consultarVelas({inicio,fin,granularidad,fetchImpl=fetch,timeoutMs=12000}){
  const url=new URL(ROOT);url.searchParams.set('start',iso(inicio));url.searchParams.set('end',iso(fin));url.searchParams.set('granularity',String(granularidad));
  const res=await fetchImpl(url.toString(),{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',headers:{Accept:'application/json','User-Agent':'LaPlaceDIG-M001/1.0'}});
  debe(res.ok,'HTTP '+res.status);
  const reader=res.body?.getReader();debe(reader,'Respuesta vacía');
  let n=0;const chunks=[];
  try{for(;;){const p=await reader.read();if(p.done)break;n+=p.value.length;debe(n<=524288,'Respuesta supera 512 KiB');chunks.push(Buffer.from(p.value))}}
  catch(e){await reader.cancel();throw e}
  const raw=JSON.parse(Buffer.concat(chunks).toString());
  debe(Array.isArray(raw)&&raw.length<=500,'Velas excesivas o inválidas');
  return {raw,fuente:url.toString()};
}
async function historia({now,fetchImpl,dias=14}){
  const fin=Math.floor(Date.parse(now())/300000)*300000,inicio=fin-dias*86400000,raw=[];
  // Ventanas de 24h: 288 velas, por debajo del límite de 300 por petición.
  for(let t=inicio;t<fin;t+=86400000){
    const r=await consultarVelas({inicio:t,fin:Math.min(t+86400000,fin),granularidad:300,fetchImpl});
    raw.push(...r.raw.filter(x=>x[0]*1000>=t&&(x[0]+300)*1000<=Math.min(t+86400000,fin)));
  }
  return validarVelas(raw,{corte:iso(fin)});
}
export async function ejecutarCiclo({directorio='registros/seguimiento',fetchImpl=fetch,now=()=>new Date().toISOString(),
  horizontes=HORIZONTES,revision=process.env.GITHUB_SHA??'local',leerHistoria,leerCotizacion,
  leerObjetivo,maxEvaluaciones=40}={}){
  mkdirSync(directorio,{recursive:true});const lock=join(directorio,'.en-curso');
  let fd;
  try{fd=openSync(lock,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,at:now()}));closeSync(fd)}
  catch(e){throw Error('Seguimiento ocupado o bloqueo pendiente: '+e.message)}
  const started=now(),hour=iso(Math.floor(Date.parse(started)/3600000)*3600000);
  let eventos;
  try{
    eventos=leerDiario(directorio);
    const add=(tipo,datos)=>añadirEvento(directorio,eventos,tipo,datos,now());
    const resultados=new Set(eventos.filter(x=>x.tipo==='resultado').map(x=>x.datos.pronostico_id));
    const intentos=new Map(eventos.filter(x=>x.tipo==='dato_ausente').map(x=>[x.datos.pronostico_id,x.registrado_en]));
    const vencidos=eventos.filter(x=>x.tipo==='pronostico'&&x.datos.precio_predicho!==null&&
      !resultados.has(x.datos.id)&&Date.parse(x.datos.criterio.fin_vela)+30000<=Date.parse(now()))
      .sort((a,b)=>(intentos.get(a.datos.id)??'').localeCompare(intentos.get(b.datos.id)??'')||a.secuencia-b.secuencia)
      .slice(0,maxEvaluaciones);
    for(const e of vencidos){
      const p=e.datos;
      try{
        const r=leerObjetivo?await leerObjetivo(p):await consultarVelas({inicio:Date.parse(p.criterio.inicio_vela),
          fin:Date.parse(p.criterio.fin_vela),granularidad:60,fetchImpl});
        const rows=r.raw.filter(x=>Array.isArray(x)&&x[0]*1000===Date.parse(p.criterio.inicio_vela));
        debe(rows.length===1,'No hay una vela inequívoca del minuto objetivo');
        const resultado=evaluarPronostico(p,rows[0],{consultadoEn:now(),fuente:r.fuente});
        add('resultado',resultado);
      }catch(error){add('dato_ausente',{pronostico_id:p.id,motivo:String(error.message).slice(0,240),
        siguiente_accion:'Reintentar sin clasificar como acierto ni fallo'});}
    }
    // Una emisión por horizonte y hora real ejecutada. No se rellenan horas perdidas.
    const emitidos=new Set(eventos.filter(x=>x.tipo==='pronostico'&&
      iso(Math.floor(Date.parse(x.datos.emitido_en)/3600000)*3600000)===hour).map(x=>x.datos.horizonte_minutos));
    const faltan=horizontes.filter(h=>!emitidos.has(h));
    if(faltan.length){
      try{
        const velas=leerHistoria?await leerHistoria():await historia({now,fetchImpl});
        const q=leerCotizacion?await leerCotizacion():await fetchQuote({fetchImpl,now,timeoutMs:12000});
        const emitidoEn=now();
        // No emitir retroactivamente con una hora antigua al terminar la descarga.
        debe(Math.floor(Date.parse(emitidoEn)/3600000)===Math.floor(Date.parse(started)/3600000),
          'Cambió la hora durante la captura; se reintentará sin retrofechar');
        const preds=emitirPronosticos(velas,q,{emitidoEn,horizontes:faltan,revision});
        for(const p of preds)add('pronostico',p);
        // Entradas conservadas comprimidas, sin alterarlas. Se excluyen del panel.
        const {gzipSync}=await import('node:zlib');
        const inputs={cotizacion:q,velas,emitido_en:emitidoEn};
        const name='entrada-'+huellaContenido(inputs)+'.json.gz';
        mkdirSync(join(directorio,'entradas'),{recursive:true});
        const path=join(directorio,'entradas',name);
        if(!existsSync(path))writeFileSync(path,gzipSync(JSON.stringify(inputs)),{flag:'wx',mode:0o600});
      }catch(error){add('error_fuente',{hora:hour,etapa:'emision',mensaje:String(error.message).slice(0,300)});}
    }
    add('ciclo',{inicio:started,fin:now(),hora:hour,revision,operaciones:0});
    return guardarResumen(directorio,eventos,now());
  }finally{unlinkSync(lock)}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),opcion=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
  const directorio=opcion('--directorio',process.env.LAPLACE_SEGUIMIENTO_DIRECTORIO??'registros/seguimiento');
  const hs=opcion('--horizontes',HORIZONTES.join(',')).split(',').map(Number);
  const {validarHorizontes}=await import('./modelo.mjs');validarHorizontes(hs);
  const run=async()=>{try{const s=await ejecutarCiclo({directorio,horizontes:hs});console.log(JSON.stringify(s));}
    catch(e){console.error('LAPLACE seguimiento: '+e.message);process.exitCode=1;}};
  await run();
  if(args.includes('--continuo')){
    console.log('Seguimiento horario activo mientras este proceso siga abierto. Sin órdenes.');
    let ocupado=false;
    setInterval(async()=>{if(ocupado)return;ocupado=true;try{await run()}finally{ocupado=false}},3600000);
  }
}
