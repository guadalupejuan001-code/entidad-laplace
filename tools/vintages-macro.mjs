import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {persistMacroCapture,readMacroJournal,macroAsOf} from '../universo/vintages-macro.mjs';

const [input,destination,cutoff]=process.argv.slice(2);
if(!input||!destination)throw Error('Uso: node tools/vintages-macro.mjs CAPTURA.json DIRECTORIO [CORTE_UTC]');
const capture=JSON.parse(readFileSync(resolve(input),'utf8')),directory=resolve(destination);
mkdirSync(directory,{recursive:true});
const summary=persistMacroCapture(directory,capture),snapshot=macroAsOf(readMacroJournal(directory),cutoff??capture.at);
writeFileSync(join(directory,'macro-as-of.json'),JSON.stringify(snapshot,null,2)+'\n');
writeFileSync(join(directory,'macro-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,as_of:snapshot.cutoff,known_states:snapshot.known_states},null,2));
