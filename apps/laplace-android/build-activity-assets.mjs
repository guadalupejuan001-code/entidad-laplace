import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('./app/src/main/assets/',import.meta.url));
const names=['market-universe.js','engine.js','activity-engine.js'];
const sources=names.map(n=>readFileSync(base+n,'utf8'));
const hashes=Object.fromEntries(names.map((n,i)=>[n,createHash('sha256').update(sources[i]).digest('hex')]));
const worker=sources.join('\n;\n')+`\nonmessage=e=>{const{id,rows,options}=e.data;try{
postMessage({id,ok:true,result:LaplaceActivity.analyze(rows,options)})
}catch(error){postMessage({id,ok:false,error:error.message})}};\n`;
const output='window.LAPLACE_ACTIVITY_SOURCES = '+JSON.stringify(hashes)+';\n'+
 'window.LAPLACE_ACTIVITY_WORKER_SOURCE = '+JSON.stringify(worker)+';\n';
if(process.argv.includes('--verify')){
 if(readFileSync(base+'activity-runtime.js','utf8')!==output)throw Error('Reconstruye el worker M005.');
}else writeFileSync(base+'activity-runtime.js',output);
