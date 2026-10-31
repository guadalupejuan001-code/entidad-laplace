#!/usr/bin/env node
/** CLI PDE: resuelve un campo armonico; no hace forecasting. */
import {readFileSync} from 'node:fs';
import {resolverEcuacionDeLaplace} from '../ecuacion/laplace-pde.mjs';
import {resolverLaplaceGrafo} from '../ecuacion/laplace-grafo.mjs';
const [command, file] = process.argv.slice(2);
const usage = 'Uso: node tools/ecuacion-laplace.mjs demo | resolver MALLA.json | demo-grafo | resolver-grafo GRAFO.json\n';
try {
  let args;
  if (command === 'demo' && !file) {
    const N = 11;
    args = {grid: Array.from({length: N}, (_, y) =>
      Array.from({length: N}, (_, x) =>
        x === 0 || y === 0 || x === N - 1 || y === N - 1
          ? (x / (N - 1)) ** 2 - (y / (N - 1)) ** 2 : null)),
      dx: 1 / (N - 1), dy: 1 / (N - 1), tolerance: 1e-9};
  } else if (command === 'demo-grafo' && !file) {
    args = {nodes:[{id:'A',value:0},{id:'B',value:null},{id:'C',value:1}],
      edges:[{from:'A',to:'B',weight:1},{from:'B',to:'C',weight:1}]};
  } else if ((command === 'resolver' || command === 'resolver-grafo') && file && process.argv.length === 4) {
    args = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
  if (args) {
    const result = command.endsWith('grafo') ? resolverLaplaceGrafo(args) : resolverEcuacionDeLaplace(args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.converged) process.exitCode = 3;
  }
} catch (error) {
  console.error('Laplace PDE: ' + error.message);
  process.exitCode = 1;
}
