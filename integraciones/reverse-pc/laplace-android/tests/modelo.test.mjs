import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as original from '../upstream/seguimiento/modelo.mjs';
import * as android from '../../reverse-os-android/app/src/main/assets/laplace/modelo.mjs';
import {huellaContenido} from '../../reverse-os-android/app/src/main/assets/laplace/integridad.mjs';
import {huellaContenido as syncHash} from '../upstream/universo/integridad.mjs';
const start=Date.parse('2026-10-10T00:00:00Z')/1000;
function dataset(n=4032){let p=80000;return Array.from({length:n},(_,i)=>{const o=p;p*=Math.exp(.0003*Math.sin(i*.32)-.00004+(i%40===0?.0007:0));return [start+i*300,Math.min(o,p)*.9999,Math.max(o,p)*1.0001,o,p,4+i%30]})}
const bars=dataset();
const t=new Date((start+4032*300+20)*1000).toISOString();
const q={asset:'BTC-USD',value:String(bars.at(-1)[4]*.999),observed_at:t,known_at:t};
const cfg={emitidoEn:t,horizontes:[15,30,60,240,1440,10080],revision:'prueba-paridad'};
test('1: paridad exacta del algoritmo, los seis precios, soporte, hashes e identificadores',async()=>{
 assert.deepEqual(await android.emitirPronosticos(bars,q,cfg),original.emitirPronosticos(bars,q,cfg));
});
test('2: un descenso calculado se publica, no se sustituye por persistencia',async()=>{
 const down=bars.map((b,i)=>[b[0],10000-i-1,10000-i+1,10000-i,10000-i,10]);
 const quote={...q,value:'5900'};const ps=await android.emitirPronosticos(down,quote,cfg);
 assert.ok(ps.every(p=>p.precio_predicho<p.precio_inicial));
});
test('3: resultados y rechazos de manipulación coinciden con M001',async()=>{
 const ps=await android.emitirPronosticos(bars,q,cfg),p=ps[0];
 await android.verificarPronostico(p);
 await assert.rejects(()=>android.verificarPronostico({...p,precio_predicho:1}),/modificado/);
 const sec=Date.parse(p.criterio.inicio_vela)/1000,row=[sec,79000,81000,80000,79980,100];
 const args={consultadoEn:new Date(Date.parse(p.criterio.fin_vela)+30000).toISOString(),fuente:'https://example.org/test'};
 assert.deepEqual(await android.evaluarPronostico(p,row,args),original.evaluarPronostico(p,row,args));
});
test('4: no incorpora barras futuras ni cambia el pronóstico al adulterarlas',async()=>{
 const future=[start+4032*300,1,500000,1,400000,10000];
 assert.deepEqual(await android.emitirPronosticos([...bars,future],q,cfg),await android.emitirPronosticos(bars,q,cfg));
});
test('5: rechaza precio vencido, futuros y horizontes inválidos',async()=>{
 await assert.rejects(()=>android.emitirPronosticos(bars,q,{...cfg,emitidoEn:new Date(Date.parse(t)+200000).toISOString()}),/antigua/);
 assert.throws(()=>android.validarHorizontes([15,15]),/duplicados/);
 assert.throws(()=>android.validarHorizontes([14]),/cinco/);
});
test('6: WebCrypto y SHA-256 original producen el mismo sello canónico',async()=>{
 const o={unicode:'México',number:1.55,array:[null,false,'x'],nested:{a:2}};
 assert.equal(await huellaContenido(o),syncHash(o));
});
test('7: siete días no se inventa cuando el historial es insuficiente',async()=>{
 const ps=await android.emitirPronosticos(bars.slice(-100),q,cfg);
 assert.equal(ps.at(-1).precio_predicho,null);assert.equal(ps.at(-1).estado_modelo,'sin_patrones');
});
test('8: fuentes upstream y adaptación generada están fijadas y reproducibles',()=>{
 const lock=JSON.parse(readFileSync(new URL('../upstream-lock.json',import.meta.url)));
 for(const [p,h] of Object.entries(lock.files))assert.equal(createHash('sha256').update(readFileSync(new URL('../upstream/'+p,import.meta.url))).digest('hex'),h);
 execFileSync(process.execPath,[new URL('../prepare.mjs',import.meta.url).pathname,'--check']);
});
test('9: entrada del escritorio, manifiesto Android y aislamiento del runtime',()=>{
 const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
 assert.match(read('reverse-os-android/app/src/main/AndroidManifest.xml'),/LaplaceActivity[^\n]*android:exported="false"/);
 assert.match(read('reverse-os-android/app/src/main/assets/workbench/desktop.js'),/if\(app==='laplace'\)/);
 assert.match(read('reverse-os-android/app/src/main/java/com/reversepc/os/WorkbenchActivity.java'),/openLaplace/);
 const host=read('reverse-os-android/app/src/main/java/com/reversepc/os/LaplaceActivity.java');
 assert.doesNotMatch(host,/SessionStore|setAllowUniversalAccessFromFileURLs\(true\)/);
 assert.match(host,/NativeRuntime\.initialize\(\)/);assert.match(host,/NativeRuntime\.execute\(/);
 assert.doesNotMatch(host,/loadState\(|writeState\(|session\.rvp/);
 assert.match(host,/setInstanceFollowRedirects\(false\)/);assert.match(host,/setBlockNetworkLoads\(true\)/);
});
test('10: contrato de compilación comprueba todos los recursos obligatorios',()=>{
 const result=JSON.parse(execFileSync(process.execPath,[new URL('../verify.mjs',import.meta.url).pathname],{encoding:'utf8'}));
 assert.equal(result.valid,true);assert.equal(result.node_server_required_on_phone,false);
});

test('11: U002 global queda fijado a 369 señales y a XI/Ether nativo',()=>{
 const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
 const host=read('reverse-os-android/app/src/main/java/com/reversepc/os/LaplaceActivity.java');
 const compiler=read('reverse-os-android/app/src/main/java/com/reversepc/os/LaplaceGlobalCompiler.java');
 const xi=read('reverse-os-android/app/src/main/assets/laplace/u002-native.xi');
 const app=read('reverse-os-android/app/src/main/assets/laplace/app.mjs');
 assert.match(host,/global_u002/);assert.match(host,/native_u002/);assert.match(host,/LaplaceGlobalCompiler\.compile/);
 assert.match(compiler,/SIGNALS=369/);assert.match(compiler,/laplace-u002-native-xi-v1/);
 assert.match(xi,/LAPLACE U002/);assert.match(xi,/__GLOBAL_BYTES__/);assert.match(xi,/mem_stats/);
 assert.match(app,/known_signals===369/);assert.match(app,/host\('native_u002'/);assert.match(app,/Sincronizar 369/);
});
