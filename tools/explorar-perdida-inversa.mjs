import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),I=require('../apps/laplace-android/app/src/main/assets/inverse-loss.js');
const base=fileURLToPath(new URL('../',import.meta.url));
const diary=process.argv[2]??base+'apps/laplace-android/tests/fixtures/btc-20261105-1h-large-miss.json';
const history=process.argv[3]??base+'evidencia/campana-c02/datos/BTC-USD-300.json.gz.b64';
const lossPct=Number(process.argv[4]??2),data=JSON.parse(readFileSync(diary,'utf8'));
const bytes=readFileSync(history),raw=history.endsWith('.gz.b64')?gunzipSync(Buffer.from(bytes.toString().trim(),'base64')):bytes;
const h=JSON.parse(raw),f=data.records?.at(-1);
if(!f||!Array.isArray(h.rows))throw Error('Se requieren un diario LQT y su archivo OHLCV.');
const analysis=I.analyze(f,{rows:h.rows,historyAsset:h.asset,historyGranularity:h.granularity,lossPct,mode:'retrospective'});
I.validate(analysis,f);
console.log(JSON.stringify({schema:'laplace-inverse-loss-audit-v1',recordId:f.id,
 historySHA256:createHash('sha256').update(raw).digest('hex'),
 sourceAvailability:h.availability??'historical snapshot; vintage not certified',analysis},null,2));
