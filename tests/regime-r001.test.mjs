import test from 'node:test';import assert from 'node:assert/strict';
import {detectRegimes} from '../experimentos/regime-r001.mjs';
const rows=Array.from({length:500},(_,i)=>[1700000000+i*300,99,101,100,100+Math.sin(i/7),50]);
test('estados calculados solo con pasado',()=>{
 const a=detectRegimes(rows),b=detectRegimes(rows.map((r,i)=>i<450?r:[r[0],99,201,100,150,50]));
 assert.deepEqual(a.states.filter(x=>x.at<rows[450][0]),b.states.filter(x=>x.at<rows[450][0]));
 assert.equal(a.production_activation_allowed,false);
 assert.equal(a.automatic_trading,false);
});
test('historia insuficiente implica abstención',()=>assert.throws(()=>detectRegimes(rows.slice(0,20)),/insuficiente/));
