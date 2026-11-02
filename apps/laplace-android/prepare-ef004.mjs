/* Incluye TODAS las capturas EF002, con sus bytes y sellos verificados. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizarCapturaU003} from '../../estado-financiero/modelo.mjs';
const root=resolve(process.argv[2]??'world_archive/capturas');
const files=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){
 const f=join(p,e.name);if(e.isDirectory())walk(f);else if(e.name.endsWith('.manifest.json'))files.push(f)}}walk(root);
if(!files.length)throw Error('El archivo EF004 no contiene capturas');
const captures=[],index=[];
for(const file of files.sort()){
 const m=JSON.parse(readFileSync(file,'utf8')),bytes=readFileSync(file.replace('.manifest.json','.json.gz'));
 if(createHash('sha256').update(bytes).digest('hex')!==m.archive_sha256)throw Error('Archivo comprimido alterado');
 const raw=gunzipSync(bytes,{maxOutputLength:64*1024*1024});
 if(raw.length!==m.original_bytes)throw Error('Longitud incorrecta');
 const c=JSON.parse(raw.toString());normalizarCapturaU003(c);
 if(c.capture_sha256!==m.capture_sha256||c.universal_state.snapshot_sha256!==m.snapshot_sha256)throw Error('Manifestación no corresponde a la captura');
 captures.push(c);index.push(m);
}
const output={schema:'laplace-ef004-mobile-archive-v1',captures,index,
 source_branch:'laplace-archivo',archive_count:captures.length,
 includes_all_available_captures:true,synthetic_data:false};
const dest=resolve(dirname(fileURLToPath(import.meta.url)),'app/src/main/assets/ef004-archive.js');
writeFileSync(dest,'window.LAPLACE_EF004_ARCHIVE = '+JSON.stringify(output)+';\n');
console.log('EF004:',captures.length,'capturas auténticas completas empaquetadas');
