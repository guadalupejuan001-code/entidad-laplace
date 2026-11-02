// XN01 remains pinned byte-for-byte. XN02 only widens its four counters to u32.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const assets=fileURLToPath(new URL('./app/src/main/assets/',import.meta.url));
let source=readFileSync(assets+'xn01-native.xi','utf8');
source=source.replace('# LAPLACE XN01 — mercado intradia sobre XI/Ether.',
  '# LAPLACE XN02 — XN01 con contadores uint32; formulas originales, XI/Ether original.')
  .replace('(64..240)','(64..1440)');
const counters=new Map([0,1,2,3].map(i=>[3000000+i,3010000+4*i]));
source=source.split('\n').flatMap(line=>{
  const words=line.split(' '),op=words[0];
  if(op==='load8'&&counters.has(Number(words[2]))){
    const reg=words[1],address=counters.get(Number(words[2]));
    return [`load8 ${reg} ${address}`,...[1,2,3].flatMap(i=>[
      `load8 r11 ${address+i}`,`mul r11 ${256**i}`,`add ${reg} r11`])];
  }
  if(op==='store8'&&counters.has(Number(words[1]))){
    const address=counters.get(Number(words[1])),value=words[2];
    return [0,1,2,3].flatMap(i=>value==='0'?[`store8 ${address+i} 0`]:[
      `mov r11 ${value}`,...(i?[`div r11 ${256**i}`]:[]),
      'mod r11 256',`store8 ${address+i} r11`]);
  }
  return [line];
}).join('\n');
if(process.argv.includes('--verify')){
  if(readFileSync(assets+'xn02-native.xi','utf8')!==source)
    throw Error('XN02 no coincide con la ampliación reproducible de XN01');
}else writeFileSync(assets+'xn02-native.xi',source);
const java=fileURLToPath(new URL('./app/src/main/java/com/entidadlaplace/mobile/',import.meta.url));
const compiler=readFileSync(java+'LaplaceXiCompiler.java','utf8')
  .split('    public static JSONObject parse(')[0]
  .replace('import org.json.JSONObject;\n','')
  .replaceAll('LaplaceXiCompiler','LaplaceXiWideCompiler')
  .replace('MAX_ROWS=240','MAX_ROWS=1440')
  .replace('programa XI XN01','programa XI XN02 (contadores uint32)')
  .replace('256*1024','512*1024')
  .replace('Programa XN01 supera 256 KiB','Programa XN02 supera 512 KiB')+'}\n';
if(process.argv.includes('--verify')){
  if(readFileSync(java+'LaplaceXiWideCompiler.java','utf8')!==compiler)
    throw Error('Compilador XN02 no coincide con la serialización original ampliada');
}else writeFileSync(java+'LaplaceXiWideCompiler.java',compiler);
