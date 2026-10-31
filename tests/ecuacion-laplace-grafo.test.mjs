import test from 'node:test';
import assert from 'node:assert/strict';
import {resolverLaplaceGrafo} from '../ecuacion/laplace-grafo.mjs';

const chain=(values,weights)=>({nodes:values.map((v,i)=>({id:String(i),value:v})),
  edges:weights.map((w,i)=>({from:String(i),to:String(i+1),weight:w}))});

test('cadena con extremos observados: solucion armonica exacta',()=>{
  const r=resolverLaplaceGrafo({...chain([0,null,null,null,1],[1,1,1,1])});
  assert.equal(r.converged,true);
  for(let i=0;i<5;i++)assert.ok(Math.abs(r.nodes[i].value-i/4)<1e-7);
  assert.equal(r.forecasts_future,false);
});

test('promedio ponderado de vecinos conocidos',()=>{
  const r=resolverLaplaceGrafo({nodes:[{id:'A',value:10},{id:'B',value:0},
    {id:'?',value:null}],edges:[{from:'?',to:'A',weight:3},{from:'?',to:'B',weight:1}]});
  assert.equal(r.converged,true);
  assert.ok(Math.abs(r.nodes[2].value-7.5)<1e-7);
});

test('rechazar nodos sin ancla y relaciones invalidas',()=>{
  assert.throws(()=>resolverLaplaceGrafo(chain([null,null],[1])),/sin frontera/);
  assert.throws(()=>resolverLaplaceGrafo({nodes:[{id:'A',value:1},{id:'B',value:null}],edges:[]}),/sin frontera/);
  assert.throws(()=>resolverLaplaceGrafo({nodes:[{id:'A',value:1},{id:'B',value:null}],edges:[{from:'A',to:'B',weight:-2}]}),/Peso/);
  assert.throws(()=>resolverLaplaceGrafo({nodes:[{id:'A',value:1},{id:'A',value:null}],edges:[]}),/duplicado/);
});

test('la falta de convergencia se reconoce explícitamente',()=>{
  const r=resolverLaplaceGrafo({...chain([0,null,null,null,1],[1,1,1,1]),
    maxIterations:1,tolerance:1e-14});
  assert.equal(r.converged,false);
});
