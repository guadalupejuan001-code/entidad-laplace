import test from 'node:test';
import assert from 'node:assert/strict';
import {HORIZON_PLAN,prepararSerie,fusionTemporal,evaluarContexto,adquirirEnParalelo} from '../prediccion/fusion-temporal.mjs';
import {ventanas} from '../prediccion/fuentes-paralelas.mjs';

const cut='2026-10-30T20:00:00.000Z';
const now='2026-10-30T20:00:30.000Z';
function bars(seconds,count){
  const end=Math.floor(Date.parse(cut)/(seconds*1000))*seconds;
  return Array.from({length:count},(_,i)=>{
    const t=end-(count-i)*seconds,close=100*Math.exp(.00004*i+.002*Math.sin(i/11));
    return [t,close*.998,close*1.002,close*.999,close,100+Math.abs(10*Math.sin(i/9))];
  });
}
function quote(){return {asset:'BTC-USD',value:'100',observed_at:cut,known_at:now}}
function series(){return {'300':bars(300,4032),'3600':bars(3600,1080),'86400':bars(86400,1000)}}
function world(value=.02,known=now){
  return {at:now,universal_state:{snapshot_sha256:'abc',states:[
    {id:'a',domain:'mercado_global',variable:'SPY_return_5m',unit:'ratio',value,
      observed_at:cut,known_at:known},
    {id:'b',domain:'macro_global',variable:'us_inflation_cpi',unit:'pct',value:2.4,
      observed_at:'2026-09-01T00:00:00.000Z',known_at:now},
    {id:'c',domain:'clima_global',variable:'temperature_2m',unit:'degC',value:21,
      observed_at:cut,known_at:now}
  ]},source_status:[{name:'prueba',status:'observed'}]};
}
test('14 horizontes desde 5 minutos hasta 90 días con datos multirresolución',()=>{
  assert.equal(HORIZON_PLAN.length,14);
  assert.deepEqual(HORIZON_PLAN.map(x=>x.minutes),[5,15,30,60,120,240,480,720,1440,4320,10080,20160,43200,129600]);
  const result=fusionTemporal({quote:quote(),series:series(),world:world(),asOf:now});
  assert.equal(result.horizons.length,14);
  for(const h of result.horizons){
    assert.equal(h.status,'candidato_experimental','Horizonte '+h.minutes);
    assert.ok(h.analogs>=8,'Sin analogos '+h.minutes);
    assert.ok(h.price_candidate>0&&h.scenario_low>0&&h.scenario_high>0);
    assert.ok(h.scenario_low<=h.scenario_high);
  }
  assert.equal(result.automatic_trading,false);
  assert.equal(result.financial_advantage_demonstrated,false);
});
test('no utiliza velas abiertas o del futuro',()=>{
  const history=series(),original=fusionTemporal({quote:quote(),series:history,world:world(),asOf:now});
  const modified={'300':[...history[300],[Math.floor(Date.parse(cut)/1000),1,1000000,1,999999,99999]],
    '3600':history[3600],'86400':history[86400]};
  const after=fusionTemporal({quote:quote(),series:modified,world:world(),asOf:now});
  assert.deepEqual(after.horizons,original.horizons);
});
test('observaciones mundiales posteriores al corte no intervienen',()=>{
  const original=evaluarContexto(world(.005),now);
  const later=evaluarContexto(world(.9,'2026-10-30T20:01:00.000Z'),now);
  assert.equal(later.excluded,1);
  assert.equal(later.usable,2);
  assert.equal(later.market_stress,0);
  assert.ok(original.market_stress>later.market_stress);
});
test('todos los datos mundiales validados afectan cobertura y rango, nunca el precio central',()=>{
  const without=fusionTemporal({quote:quote(),series:series(),world:null,asOf:now});
  const withWorld=fusionTemporal({quote:quote(),series:series(),world:world(),asOf:now});
  assert.equal(withWorld.context.usable,3);
  assert.equal(withWorld.context.domains.length,3);
  assert.ok(withWorld.context.uncertainty_multiplier>without.context.uncertainty_multiplier);
  assert.deepEqual(withWorld.horizons.map(x=>x.price_candidate),without.horizons.map(x=>x.price_candidate));
  assert.notDeepEqual(withWorld.horizons.map(x=>[x.scenario_low,x.scenario_high]),without.horizons.map(x=>[x.scenario_low,x.scenario_high]));
});
test('las cinco fuentes empiezan juntas, los errores quedan visibles y no se inventan datos',async()=>{
  const started=[],done={},collectors={};
  for(const name of ['quote','bars_300','bars_3600','bars_86400','world']){
    collectors[name]=()=>{started.push(name);return new Promise((resolve,reject)=>{done[name]={resolve,reject}})};
  }
  const task=adquirirEnParalelo(collectors,{now:()=>now});
  assert.deepEqual(started,['quote','bars_300','bars_3600','bars_86400','world']);
  done.quote.resolve(quote());
  done.bars_300.resolve(bars(300,200));
  done.bars_3600.reject(Error('HTTP 503'));
  done.bars_86400.resolve(bars(86400,700));
  done.world.resolve(world());
  const r=await task;
  assert.equal(r.collection.complete,false);
  assert.equal(r.collection.lanes.bars_3600.status,'error');
  assert.equal(r.horizons.find(x=>x.minutes===720).price_candidate,null);
  assert.equal(r.context.usable,3);
  assert.equal(r.horizons.length,14);
});
test('sin cotización auténtica no se emite pronóstico',async()=>{
  const collectors={quote:async()=>{throw Error('sin red')},bars_300:async()=>[],bars_3600:async()=>[],
    bars_86400:async()=>[],world:async()=>null};
  await assert.rejects(()=>adquirirEnParalelo(collectors,{now:()=>now}),/Cotización no disponible/);
});
test('ventanas de cada resolución respetan las 300 barras por petición',()=>{
  for(const g of [300,3600,86400]){
    const windows=ventanas({granularity:g,asOf:cut});
    assert.ok(windows.length>0);
    assert.ok(windows.every(w=>(w.end-w.start)/1000/g<=300));
    assert.ok(windows.every((w,i)=>!i||windows[i-1].end===w.start));
  }
});
test('vela duplicada contradictoria es rechazada',()=>{
  const x=bars(300,60);x.push([...x[0].slice(0,5),x[0][5]+1]);
  assert.throws(()=>prepararSerie(x,{granularity:300,cutoff:cut}),/contradictorias/);
});
