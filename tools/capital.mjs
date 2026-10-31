import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {observeCapital} from '../universo/capital/global.mjs';
import {persistMacroCapture,readMacroJournal,macroAsOf} from '../universo/vintages-macro.mjs';

const directory=resolve(process.argv[2]??'registros/capital-u004');
mkdirSync(join(directory,'entradas'),{recursive:true});
const archiveResponse=async record=>{
  const ref='entradas/'+record.body_sha256+'.gz.b64',path=join(directory,ref);
  if(!existsSync(path))writeFileSync(path,gzipSync(record.text,{level:9}).toString('base64')+'\n',{flag:'wx',mode:0o600});
  return ref;
};
const capture=await observeCapital({archiveResponse,timeoutMs:45000});
const macro=persistMacroCapture(directory,capture),history=macroAsOf(readMacroJournal(directory),capture.at);
const summary={schema:'laplace-capital-summary-u004-v1',at:capture.at,coverage:capture.coverage,
  cot_markets:capture.cot_reports.map(r=>({code:r.market_code,date:r.reference_date,dataset:r.dataset})),
  yield_curve_date:capture.yield_curve?.reference_date??null,
  us_liquidity_date:capture.us_liquidity?.reference_date??null,
  global_liquidity_index:false,macro_journal:macro,prediction_inputs_enabled:false,
  capture_sha256:capture.capture_sha256};
const filename=capture.at.replace(/[:.]/g,'-')+'-'+capture.capture_sha256.slice(0,12)+'.json';
mkdirSync(join(directory,'capturas'),{recursive:true});
writeFileSync(join(directory,'capturas',filename),JSON.stringify(capture,null,2)+'\n',{flag:'wx'});
writeFileSync(join(directory,'captura.json'),JSON.stringify(capture,null,2)+'\n');
writeFileSync(join(directory,'resumen.json'),JSON.stringify(summary,null,2)+'\n');
writeFileSync(join(directory,'macro-as-of.json'),JSON.stringify(history,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(!capture.coverage.known_signals)process.exitCode=1;
