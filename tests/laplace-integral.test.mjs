import test from 'node:test';
import assert from 'node:assert/strict';
import {ejecutarLaplaceIntegral} from '../nucleo/laplace-integral.mjs';
function bars(n,step,endSeconds){
  const end=Math.floor(endSeconds/step)*step;
  const start=end-(n+1)*step;
  let value=100;
  return Array.from({length:n},(_,i)=>{
    value*=Math.exp(.006*Math.sin(i*.11)+.003*Math.cos(i*.038));
    return [start+i*step,value*.99,value*1.01,value,value,5+i*.001];
  });
}
test('núcleo integral ejecuta F001 + campo + auditoría y EF004 se abstiene sin datos',()=>{
  const end=Date.parse('2026-10-31T16:00:00Z')/1000;
  const quote={asset:'BTC-USD',value:125,
    observed_at:new Date((end-60)*1000).toISOString(),
    known_at:new Date((end-30)*1000).toISOString()};
  const series={300:bars(4000,300,end),3600:bars(1070,3600,end),
    86400:bars(990,86400,end)};
  const report=ejecutarLaplaceIntegral({quote,series,asOf:new Date(end*1000).toISOString()});
  assert.equal(report.F001.horizons.length,14);
  assert.equal(report.F001.asset,'BTC-USD');
  assert.ok(['calculated','abstained'].includes(report.laplace_field.status));
  assert.equal(report.EF004.model_ready,false);
  assert.equal(report.modules.length,16);
  assert.ok(report.modules.some(x=>x.id==='C001'&&x.status==='no_valid_capture'));
  assert.ok(report.modules.some(x=>x.id==='X002'&&x.status==='code_not_executed_in_this_entrypoint'));
  assert.equal(report.all_financial_sources_available,false);
  assert.equal(report.no_auto_trading,true);
});
