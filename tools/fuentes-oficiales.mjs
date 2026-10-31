/* Captura manual verificable: conserva las respuestas originales además del snapshot. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fetchOfficialCentralBanks,fetchPublicDirectExchanges,fetchDatedCommodityContracts} from '../universo/fuentes-oficiales.mjs';
import {universeSnapshot} from '../universo/estados.mjs';
import {sellarCaptura} from '../universo/integridad.mjs';

const directory=resolve(process.argv[2]??'registros/fuentes-oficiales');
mkdirSync(join(directory,'entradas'),{recursive:true});
const archiveResponse=async({body_sha256,text})=>{
  const ref='entradas/'+body_sha256+'.txt';
  try{writeFileSync(join(directory,ref),text,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error}
  return ref;
};
const options={archiveResponse,timeoutMs:45000};
const groups=[];
// Tres o menos peticiones simultáneas; evita saturar conexiones/proxies móviles.
groups.push(await fetchOfficialCentralBanks(options));
groups.push(await fetchPublicDirectExchanges(options));
groups.push(await fetchDatedCommodityContracts(options));
const at=new Date().toISOString(),snapshot=universeSnapshot(groups.flatMap(x=>x.observations),{cutoff:at});
const capture=sellarCaptura({schema:'laplace-primary-sources-v1',at,universal_state:snapshot,
  source_status:groups.flatMap(x=>x.sources),contract_metadata:groups.flatMap(x=>x.contracts),
  prediction_inputs_enabled:false,automatic_trading:false});
const summary={at,known_signals:snapshot.known_states,domains:snapshot.domains,
  sources:capture.source_status.map(x=>({name:x.name,status:x.status,signals:x.signals,reason:x.reason})),
  dated_contracts:capture.contract_metadata.length,capture_sha256:capture.capture_sha256,
  exact_publication_times:false,prediction_inputs_enabled:false};
const name=at.replace(/[:.]/g,'-')+'-'+capture.capture_sha256.slice(0,12)+'.json';
mkdirSync(join(directory,'capturas'),{recursive:true});
writeFileSync(join(directory,'capturas',name),JSON.stringify(capture,null,2)+'\n',{flag:'wx',mode:0o600});
writeFileSync(join(directory,'captura.json'),JSON.stringify(capture,null,2)+'\n');
writeFileSync(join(directory,'resumen.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(!capture.source_status.some(x=>x.status==='observed'))process.exitCode=1;
