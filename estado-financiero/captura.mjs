/* EF002 - ciclo mundial observado, archivo recuperable e importacion en EF001.
 * SOLO datos publicos. La captura se calcula con los conectores reales U003.
 * Los fallos/restricciones no se convierten en cero, predicciones ni ordenes.
 */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,relative,resolve,dirname,basename} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {getHeapStatistics} from 'node:v8';
import {freemem} from 'node:os';
import {sha,need,stable} from '../input/contrato.mjs';
import {utcTime} from '../universo/estados.mjs';
import {observeWorldU003} from '../universo/global-u003.mjs';
import {normalizarCapturaU003} from './modelo.mjs';
import {importarU003} from './repositorio.mjs';
import {resumirFuentesEF002} from './resumen-fuentes.mjs';

export const EF002_VERSION='laplace-ef002-public-world-capture-v1';
const APPROVED_GROUPS=['derivatives_d001','swaps_otc_d002','etf_fund_flows_c001',
  'bis_banking_b001','blockchain_defi_k001'];
// Presupuesto de seguridad del proceso, no techo de estados ni de capturas.
function budgetArchivo(){
  const env=process.env.LAPLACE_EF002_MAX_ARCHIVE_BYTES;
  if(env!==undefined){
    const value=Number(env);
    need(Number.isSafeInteger(value)&&value>0,'presupuesto de archivo inválido');
    return value;
  }
  return Math.floor(Math.min(getHeapStatistics().heap_size_limit,freemem())/4);
}
function credentialsNotInUrls(value){
  if(Array.isArray(value))return value.forEach(credentialsNotInUrls);
  if(!value||typeof value!=='object')return;
  for(const [key,v] of Object.entries(value)){
    if((key==='url'||key==='source_url'||key==='portal')&&typeof v==='string'&&/^https?:\/\//i.test(v)){
      const u=new URL(v);
      for(const k of u.searchParams.keys())
        need(!/^(api_?key|access_?token|authorization|client_?secret|password|token|secret)$/i.test(k),
          'archivo contiene potencial credencial en URL de fuente');
      need(!u.username&&!u.password,'usuario/clave en URL archivada');
    }
    credentialsNotInUrls(v);
  }
}
export function resumirCapturaFinanciera(capture,{import_result=null}={}){
  const c=normalizarCapturaU003(capture);
  credentialsNotInUrls(capture);
  const families=new Map((capture.coverage?.groups??[]).map(x=>[x.group,x]));
  const groups=APPROVED_GROUPS.map(id=>{
    const row=families.get(id);
    return {id,attempted:!!row,observed_signals:row?.signals??0,
      status:row?.status??'not_attempted'};
  });
  return {schema:EF002_VERSION,captured_at:c.captured_at,
    cutoff_at:c.cutoff_at,capture_sha256:c.capture_sha,
    snapshot_sha256:c.snapshot_sha,
    states_observed:c.state_count,domains:capture.universal_state.domains.length,
    source_summary:resumirFuentesEF002(capture.source_status??[]),additional_financial_groups:groups,
    import_result,coverage_complete:false,provider_signatures_verified:false,
    world_predictive_advantage_demonstrated:false,automatic_trading:false};
}
export function opcionesPublicas({env=process.env}={}){
  // Las fuentes sin autorización quedan explícitamente sin activar.
  return {
    includeDerivatives:true,includeOtcSwaps:true,
    includeBanking:true,includeBlockchainDeFi:true,
    includeEtfFunds:Boolean(env.SEC_USER_AGENT),
    includeAir:Boolean(env.OPENSKY_CLIENT_ID&&env.OPENSKY_CLIENT_SECRET),
    includeDirectExchanges:true,
    finraTradeDate:null,finraWeekStart:null,finraMonthStart:null
  };
}
export async function ejecutarCicloEF002({store,collector=observeWorldU003,
  options=opcionesPublicas(),minimumStates=1}={}){
  need(store&&typeof store.transaction==='function','requiere almacenamiento EF001 real');
  need(Number.isInteger(minimumStates)&&minimumStates>=1,'minimo de estados invalido');
  const capture=await collector(options);
  const summary=resumirCapturaFinanciera(capture);
  need(summary.states_observed>=minimumStates,'sin señales reales verificables: no guardar captura vacia');
  const imported=await importarU003(store,capture);
  return {capture,summary:resumirCapturaFinanciera(capture,{import_result:imported})};
}
function archiveName(capture){
  const at=utcTime(capture.at).replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  return at+'-'+capture.capture_sha256.slice(0,12);
}
export async function guardarArchivoEF002({capture,summary,directory}){
  const info=resumirCapturaFinanciera(capture);
  need(summary?.capture_sha256===info.capture_sha256&&
    summary?.snapshot_sha256===info.snapshot_sha256,'resumen no coincide con la captura');
  const raw=Buffer.from(JSON.stringify(capture));
  need(raw.length<=budgetArchivo(),
    'captura excede recursos disponibles de memoria; usar presupuesto mayor o infraestructura con más memoria');
  const compressed=gzipSync(raw,{level:9,mtime:0});
  const day=info.captured_at.slice(0,10).replace(/-/g,'/');
  const key=archiveName(capture);
  const folder=resolve(directory,day);
  await mkdir(folder,{recursive:true});
  const payload=key+'.json.gz',index=key+'.manifest.json';
  const manifest={schema:EF002_VERSION,archive_format:'gzip-json',
    captured_at:info.captured_at,relative_payload:day+'/'+payload,
    archive_sha256:sha(compressed),original_bytes:raw.length,
    compressed_bytes:compressed.length,
    capture_sha256:info.capture_sha256,snapshot_sha256:info.snapshot_sha256,
    sources_observed:summary.source_summary.reduce((n,g)=>n+g.observed_sources,0),
    states_observed:info.states_observed,coverage_complete:false,
    contains_public_data_only:true,automatic_trading:false};
  // 'wx' no permite que un segundo ciclo sustituya una captura anterior.
  await writeFile(join(folder,payload),compressed,{flag:'wx',mode:0o600});
  await writeFile(join(folder,index),JSON.stringify({...manifest,summary},null,2)+'\n',
    {flag:'wx',mode:0o600});
  return {payload_path:join(folder,payload),manifest_path:join(folder,index),
    ...manifest};
}
export async function leerArchivoEF002(manifestPath){
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  need(manifest.schema===EF002_VERSION&&manifest.archive_format==='gzip-json',
    'formato de archivo EF002 desconocido');
  need(typeof manifest.relative_payload==='string'&&
    /^\d{4}\/\d{2}\/\d{2}\/\d{8}T\d{6}Z-[a-f0-9]{12}\.json\.gz$/.test(manifest.relative_payload),
    'ruta de archivo no canonica');
  const expectedBasename=basename(manifest.relative_payload).replace(/\.json\.gz$/,'.manifest.json');
  need(basename(manifestPath)===expectedBasename,'manifest no coincide con el payload');
  const payloadPath=join(dirname(manifestPath),basename(manifest.relative_payload));
  const raw=await readFile(payloadPath);
  need(raw.length===manifest.compressed_bytes&&sha(raw)===manifest.archive_sha256,
    'archivo corrupto o modificado');
  need(Number.isSafeInteger(manifest.original_bytes)&&manifest.original_bytes>0,
    'manifest carece de tamaño original validado');
  need(manifest.original_bytes<=budgetArchivo(),
    'archivo no cabe en el presupuesto de memoria del proceso');
  const uncompressed=gunzipSync(raw,{maxOutputLength:manifest.original_bytes});
  need(uncompressed.length===manifest.original_bytes,'tamaño descomprimido incorrecto');
  const capture=JSON.parse(uncompressed.toString('utf8'));
  const summary=resumirCapturaFinanciera(capture);
  need(summary.capture_sha256===manifest.capture_sha256&&
    summary.snapshot_sha256===manifest.snapshot_sha256&&
    summary.states_observed===manifest.states_observed&&
    summary.captured_at===manifest.captured_at,'archivo no coincide con manifest');
  return {capture,summary,manifest};
}
export async function recuperarArchivosEF002(store,manifests,{maxFiles=null}={}){
  need(Array.isArray(manifests)&&
    (maxFiles===null||Number.isSafeInteger(maxFiles)&&maxFiles>=0&&
      manifests.length<=maxFiles),'presupuesto opcional de archivos excedido');
  // El archivo usa YYYY/MM/DD/timestamp-SHA, por lo que la ruta normalizada
  // proporciona orden cronológico sin materializar todos los gzip a la vez.
  const ordered=[...manifests].sort();
  let inserted=0,duplicates=0,states=0;
  for(const path of ordered){
    const {capture}=await leerArchivoEF002(path);
    const result=await importarU003(store,capture);
    inserted+=result.added_observations;
    duplicates+=Number(!result.created_capture);
    states+=result.total_observations;
  }
  return {archives_checked:ordered.length,imported_new_states:inserted,
    duplicate_captures:duplicates,states_encountered:states,
    serial_restore_without_loading_all_archives:true,
    no_fixed_file_count_cap:true,
    exact_known_at_preserved:true,missing_is_not_zero:true,automatic_trading:false};
}
export async function descubrirManifiestosEF002(directory,{maxFiles=null}={}){
  need(maxFiles===null||(Number.isSafeInteger(maxFiles)&&maxFiles>=0),
    'presupuesto de archivos opcional inválido');
  const root=resolve(directory),found=[],pending=[root];
  while(pending.length){
    const dir=pending.pop();
    for(const e of await readdir(dir,{withFileTypes:true})){
      if(e.isSymbolicLink())throw Error('simbolos de archivo no admitidos');
      if(e.isDirectory())pending.push(join(dir,e.name));
      else if(e.isFile()&&e.name.endsWith('.manifest.json'))found.push(join(dir,e.name));
      need(maxFiles===null||found.length<=maxFiles,'presupuesto opcional de archivos excedido');
    }
  }
  return found.sort();
}
