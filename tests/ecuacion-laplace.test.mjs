import test from 'node:test';
import assert from 'node:assert/strict';
import {resolverEcuacionDeLaplace, laplacianoDiscreto} from '../ecuacion/laplace-pde.mjs';

function edges(n, m, fn) {
  return Array.from({length: m}, (_, j) => Array.from({length: n}, (_, i) =>
    i === 0 || j === 0 || i === n - 1 || j === m - 1 ? fn(i, j) : null));
}
const opts = {tolerance: 1e-9, maxIterations: 30000};

test('solucion exacta afin: d2u/dx2+d2u/dy2 = 0', () => {
  const width = 17, height = 13;
  const input = edges(width, height, (x,y)=> 3*x - 2*y + 7);
  const original = JSON.stringify(input);
  const r = resolverEcuacionDeLaplace({grid: input, ...opts});
  assert.equal(r.converged, true);
  assert.ok(r.max_residual <= opts.tolerance);
  assert.equal(JSON.stringify(input), original, 'No mutar la entrada');
  for(let y=0;y<height;y++) for(let x=0;x<width;x++)
    assert.ok(Math.abs(r.solution[y][x] - (3*x-2*y+7))<1e-6);
  assert.equal(r.forecasts_future,false);
  assert.equal(r.automatic_trading,false);
  assert.equal(r.maximum_principle_holds,true);
});

test('solucion armonica cuadratica en malla anisotropica', () => {
  const dx = .25, dy = .5;
  const fn = (x,y) => (x*dx)**2 - (y*dy)**2;
  const r = resolverEcuacionDeLaplace({grid:edges(19, 13,fn), dx,dy,...opts});
  assert.ok(r.converged);
  for(let y=0;y<13;y++)for(let x=0;x<19;x++)
    assert.ok(Math.abs(r.solution[y][x]-fn(x,y))<1e-6,'celda '+x+','+y);
  assert.ok(Math.abs(laplacianoDiscreto(r.solution, 8, 6,{dx,dy}))<1e-8);
});

test('puntos observados dentro de la malla permanecen fijos',()=>{
  const grid = edges(9,9,()=>0);
  grid[4][4] = 8;
  const r = resolverEcuacionDeLaplace({grid,...opts});
  assert.ok(r.converged);
  assert.equal(r.solution[4][4],8);
  assert.ok(r.solution[4][3]>0 && r.solution[4][3]<8);
  assert.ok(r.maximum_principle_holds);
  assert.equal(r.fixed_points,33);
});

test('una malla completamente observada no requiere iteraciones',()=>{
  const r=resolverEcuacionDeLaplace({grid: Array.from({length:3},()=>[2,2,2])});
  assert.equal(r.iterations,0);
  assert.equal(r.solved_points,0);
  assert.equal(r.max_residual,0);
  assert.equal(r.converged,true);
});

test('no se declara convergencia cuando falta iterar',()=>{
  const r = resolverEcuacionDeLaplace({grid:edges(21,21,(x,y)=>x===0 ? 100 : 0),
    maxIterations:1,tolerance:1e-12});
  assert.equal(r.iterations,1);
  assert.equal(r.converged,false);
  assert.ok(r.max_residual>r.tolerance);
});

test('rechaza fronteras incompletas, valores falsos y parámetros invalidos',()=>{
  const grid=edges(5,5,()=>0);
  grid[0][2]=null;
  assert.throws(()=>resolverEcuacionDeLaplace({grid}),/frontera/);
  const nonFinite=edges(5,5,()=>0);
  nonFinite[2][2]=NaN;
  assert.throws(()=>resolverEcuacionDeLaplace({grid:nonFinite}),/finitos/);
  const valid=edges(5,5,()=>0);
  assert.throws(()=>resolverEcuacionDeLaplace({grid:valid,omega:2}),/SOR/);
  assert.throws(()=>resolverEcuacionDeLaplace({grid:valid,dx:0}),/positivos/);
  assert.throws(()=>resolverEcuacionDeLaplace({grid:valid,maxIterations:0}),/entero/);
  assert.throws(()=>resolverEcuacionDeLaplace({grid:[[1,2,3],[1,2],[1,2,3]]}),/rectangular/);
});
