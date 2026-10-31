import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalLedger,ledgerHash} from '../historia/contrato.mjs';
import {causalSnapshot,causalWalkForward} from '../bitcoin/causal.mjs';

const DAY=86400000,begin=Date.parse('2026-01-01T00:00:00.000Z');
const time=i=>new Date(begin+i*DAY).toISOString();
function fixture({latePrices=false,extra=[]}={}){
  const facts=[];let value=100;
  for(let i=0;i<66;i++){
    facts.push({id:'price-'+i,kind:'precio',asset:'BTC-USD',currency:'USD',
      price_basis:'raw_close',value:value.toFixed(8),observed_at:time(i),
      known_at:latePrices?time(65):time(i),source_url:'https://example.org/price'});
    if(i%4===0)facts.push({id:'event-'+i,kind:'geopolitica',event_code:'RATE_SHOCK',
      region:'GLOBAL',summary:'Noticia hipotetica, no fuente real',observed_at:time(i),
      known_at:time(i),source_url:'https://example.org/event'});
    value*=i%4===0?1.04:0.99;
  }
  const records=canonicalLedger([...facts,...extra]);
  return {start:time(0),end:time(65),synthetic:true,records,ledger_sha256:ledgerHash(records)};
}
const config={cutoff:time(60),lookbackHours:1,minSamples:8};
test('cuenta acciones pasadas y contrasta movimientos posteriores sin fingir causalidad',()=>{
  const result=causalSnapshot(fixture(),config);
  assert.equal(result.status,'asociacion_observacional');
  assert.equal(result.past_events.length,1);
  assert.equal(result.past_events[0].repetitions,1);
  assert.ok(result.past_events[0].reportes_historicos_totales>=15);
  assert.ok(result.past_events[0].event_windows.count>=8);
  assert.ok(result.past_events[0].control_windows.count>=8);
  assert.ok(result.probability_up>result.baseline.p_up_smoothed);
  assert.equal(result.causality_proven,false);
  assert.equal(result.live_activation,false);
});
test('evento anterior cuya noticia se conocio en el futuro no contamina el pasado',()=>{
  const original=causalSnapshot(fixture(),config);
  const updated=fixture({extra:[{id:'late-news',kind:'geopolitica',event_code:'MARKET_HALT',
    region:'GLOBAL',summary:'Se publico mucho despues',observed_at:time(40),
    known_at:time(64),source_url:'https://example.org/late'}]});
  const now=causalSnapshot(updated,config);
  assert.deepEqual(now.past_events,original.past_events);
  assert.equal(now.probability_up,original.probability_up);
});
test('alterar precios del futuro no altera un pronostico emitido antes',()=>{
  const original=fixture(),snapshot=causalSnapshot(original,config);
  const changed=original.records.map(r=>r.id==='price-63'?{...r,value:'500000.00000000'}:r);
  const records=canonicalLedger(changed),revised={...original,records,ledger_sha256:ledgerHash(records)};
  assert.equal(causalSnapshot(revised,config).probability_up,snapshot.probability_up);
  assert.deepEqual(causalSnapshot(revised,config).past_events,snapshot.past_events);
});
test('rechaza libros alterados, activos ajenos y fechas no validas',()=>{
  const original=fixture();
  assert.throws(()=>causalSnapshot({...original,ledger_sha256:'alterado'},config),/hash/);
  assert.throws(()=>causalSnapshot(original,{...config,asset:'ETH-USD'}),/SOLO/);
  assert.throws(()=>causalSnapshot(original,{...config,cutoff:'2026-02-30T00:00:00Z'}),/invalid/);
});
test('strict mantiene la fecha de disponibilidad y exploratorio NO certifica el pasado',()=>{
  const late=fixture({latePrices:true});
  const strict=causalSnapshot(late,{...config,mode:'strict'});
  assert.equal(strict.probability_up,null);
  const experimental=causalSnapshot(late,{...config,mode:'exploratory_close_availability'});
  assert.equal(experimental.status,'asociacion_observacional');
  assert.ok(experimental.probability_up>0.5);
  assert.equal(experimental.certified_point_in_time,false);
  assert.ok(experimental.availability_assumption.includes('sin verificar'));
});
test('walk-forward genera pronosticos antes de medir resultados y puntua referencia',()=>{
  const evidence=causalWalkForward(fixture(),{lookbackHours:1,minSamples:8});
  assert.ok(evidence.attempted>40);
  assert.ok(evidence.scored>0);
  assert.ok(evidence.abstained>0);
  assert.ok(evidence.brier>=0&&evidence.brier<=1);
  assert.equal(evidence.rows[0].probability_up,null);
  assert.equal(evidence.certified_point_in_time,false);
  assert.equal(evidence.orders_executed,0);
});
