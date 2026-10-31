import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {ledgerHash} from '../historia/contrato.mjs';
import {candleFacts,archiveFacts,unzipSingle} from '../bitcoin/historico.mjs';
import {fitCalibration,calibratedProbability,historicalView,calibrateHistory,pastComparisons} from '../bitcoin/calibracion.mjs';
import {syntheticNarrativeData} from '../narrativa/experimento.mjs';
const binary=process.env.MUNDO_X_QUANTUM,native={skip:binary?false:'requires original pinned Mundo X executable'};
test('daily candle close occurs at bucket end; downloaded known_at is never its old bucket timestamp',()=>{
  const records=candleFacts('[[1609459200,1,100,2,99.12345678,1000]]',{
    sourceUrl:'https://api.exchange.coinbase.com/products/BTC-USD/candles',capturedAt:'2026-10-28T00:00:00Z',
    start:'2021-01-01T00:00:00Z',end:'2021-01-03T00:00:00Z'});
  assert.equal(records[0].value,'99.12345678');assert.equal(records[0].observed_at,'2021-01-02T00:00:00.000Z');
  assert.equal(records[0].known_at,'2026-10-28T00:00:00.000Z');
  assert.throws(()=>candleFacts('["[1609459200,1,100,2,99.12345678,1000]"]',{
    sourceUrl:records[0].source_url,capturedAt:records[0].known_at,start:'2021-01-01T00:00:00Z',end:'2021-01-03T00:00:00Z'}),/esquema/);
  const history={records,ledger_sha256:ledgerHash(records)};
  assert.equal(historicalView(history)[0].known_at,records[0].known_at);
  assert.equal(historicalView(history,'exploratory_close_availability')[0].known_at,records[0].observed_at);
  assert.equal(records[0].known_at,'2026-10-28T00:00:00.000Z');
  assert.throws(()=>historicalView({...history,ledger_sha256:'bad'}),/hash/);
});
test('archived event availability follows DATEADDED and archive version, not old event day',()=>{
  const row=Array(61).fill('');row[0]='42';row[1]='20200101';row[26]='073';row[28]='07';
  row[59]='20261001000000';row[60]='https://example.org/original-report';
  const result=archiveFacts(row.join('\t'),{slot:'2026-10-01T00:00:00Z',lastModified:'2026-10-01T00:15:00Z',capturedAt:'2026-10-28T00:00:00Z'});
  assert.equal(result.records.length,1);assert.equal(result.records[0].event_code,'RELIEF_ACCESS');
  assert.equal(result.records[0].observed_at,'2026-10-01T00:00:00.000Z');
  assert.equal(result.records[0].known_at,'2026-10-02T00:00:00.000Z');
  row[59]='20261002000000';
  assert.equal(archiveFacts(row.join('\t'),{slot:'2026-10-01T00:00:00Z',lastModified:'2026-10-01T00:15:00Z',capturedAt:'2026-10-28T00:00:00Z'}).records.length,0);
});
test('bounded ZIP reader rejects wrong names and oversized materialization',()=>{
  const name=Buffer.from('sample.CSV'),raw=Buffer.from('hello'),compressed=deflateRawSync(raw),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(8,8);header.writeUInt32LE(compressed.length,18);
  header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
  const zip=Buffer.concat([header,name,compressed]);assert.equal(unzipSingle(zip,'sample.CSV'),'hello');
  assert.throws(()=>unzipSingle(zip,'other.CSV'),/nombre/);
  zip.writeUInt32LE(9000000,22);assert.throws(()=>unzipSingle(zip,'sample.CSV'),/limites/);
});
test('calibration fits only its partition, preserves abstentions, and rejects future target availability',()=>{
  const rows=Array.from({length:8},(_,i)=>({decision_at:`2020-01-${String(i+1).padStart(2,'0')}T00:00:00.000Z`,
    due_at:`2020-01-${String(i+2).padStart(2,'0')}T00:00:00.000Z`,target_known_at:'2020-01-09T00:00:00.000Z',probability:0.9,y:0}));
  const cuts={start:'2020-01-01T00:00:00Z',end:'2020-01-09T00:00:00Z'};
  const fitted=fitCalibration(rows,cuts);assert.equal(fitted.lambda,0);assert.ok(fitted.prior<0.2);
  assert.equal(calibratedProbability(null,fitted),null);
  assert.equal(fitCalibration(rows.slice(0,7),cuts).lambda,1);
  assert.throws(()=>fitCalibration([...rows,{...rows[0],target_known_at:'2020-01-10T00:00:00.000Z'}],cuts),/futuras/);
});
test('changing held-out prices cannot change the first frozen model, calibrator or sealed forecasts',native,()=>{
  const data=syntheticNarrativeData(),start=data.config.start_at;
  const end=new Date(Date.parse(start)+51*86400000).toISOString();
  const records=data.records.filter(row=>row.known_at<=end);
  const history={start,end,records,ledger_sha256:ledgerHash(records),synthetic:true};
  const original=calibrateHistory(binary,history),fold=original.folds[0],testStart=fold.partitions.test[0];
  assert.equal(original.folds.length,1);assert.equal(original.raw.count,7);
  const changed=records.map(row=>row.kind==='precio'&&row.observed_at>testStart?{...row,value:'2.00'}:row);
  const result=calibrateHistory(binary,{...history,records:changed,ledger_sha256:ledgerHash(changed)});
  assert.deepEqual(result.folds[0].frozen,fold.frozen);
  assert.equal(result.folds[0].forecasts_sha256,fold.forecasts_sha256);
  assert.equal(original.live_activation,false);
});
test('committed real historical evidence reconciles counts and does not promote a failed calibration',()=>{
  const history=JSON.parse(readFileSync(new URL('../evidencia/BTC-HISTORICO.json',import.meta.url)));
  const result=JSON.parse(readFileSync(new URL('../evidencia/BTC-CALIBRACION.json',import.meta.url)));
  assert.equal(history.synthetic,false);assert.equal(ledgerHash(history.records),history.ledger_sha256);
  assert.equal(result.source_ledger_sha256,history.ledger_sha256);assert.equal(result.raw.count,42);
  assert.equal(result.pattern_results.reduce((sum,p)=>sum+p.count,0),42);
  assert.equal(result.live_activation,false);assert.equal(result.certified_point_in_time,false);
  assert.equal(result.calibration_improved_held_out,false);assert.equal(result.narrative_beats_baseline,false);
  const comparisons=pastComparisons(history,result);
  assert.equal(comparisons.rows.length,42);assert.equal(comparisons.rows.filter(row=>row.probability!==null).length,14);
  assert.deepEqual(comparisons,JSON.parse(readFileSync(new URL('../evidencia/BTC-PASADO.json',import.meta.url))));
  for(const fold of result.folds){assert.equal(fold.native.exact_roundtrip,true);
    assert.ok(fold.calibrated.count>0);assert.equal(fold.frozen.calibrator.end,fold.partitions.test[0]);}
});
