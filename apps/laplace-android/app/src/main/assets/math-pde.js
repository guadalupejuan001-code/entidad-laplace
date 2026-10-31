/* FUENTE AUTÉNTICA: /ecuacion/laplace-pde.mjs y /ecuacion/laplace-grafo.mjs.
 * Copia sin export ESM, empaquetada para WebView sin red. No modifica fórmulas. */
(function(root){
'use strict';
const PDE=(function(){
/**
 * Ecuacion de Laplace, estacionaria: d2(phi)/dx2 + d2(phi)/dy2 = 0.
 * Dirichlet: los numeros de la malla son observaciones fijas;
 * null significa celda interior desconocida. SIN prediccion temporal.
 * Metodo numerico: diferencias finitas de orden 2 + SOR.
 */
const LAPLACE_PDE_VERSION = 'laplace-pde-dirichlet-v1';

const assert = (cond, message) => { if (!cond) throw new Error(message); };
const finite = n => typeof n === 'number' && Number.isFinite(n);

function validateGrid(grid) {
  assert(Array.isArray(grid) && grid.length >= 3, 'La malla necesita al menos 3 filas');
  const height = grid.length;
  const width = grid[0]?.length;
  assert(Number.isSafeInteger(width) && width >= 3, 'La malla necesita al menos 3 columnas');
  let fixed = 0, unknown = 0, min = Infinity, max = -Infinity, sum = 0;
  for (let y = 0; y < height; y++) {
    assert(Array.isArray(grid[y]) && grid[y].length === width, 'Malla no rectangular');
    for (let x = 0; x < width; x++) {
      const value = grid[y][x];
      assert(value === null || finite(value), 'Solo se admiten numeros finitos o null');
      const boundary = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      assert(!boundary || finite(value), 'Falta una condicion de frontera Dirichlet');
      if (value === null) unknown++;
      else {
        fixed++;
        min = Math.min(min, value); max = Math.max(max, value);
        sum += value;
      }
    }
  }
  assert(finite(sum), 'La suma de valores fijos excede la precision numerica');
  return {width, height, fixed, unknown, min, max, mean: sum / fixed};
}

function laplacianoDiscreto(grid, x, y, {dx = 1, dy = 1} = {}) {
  assert(finite(dx) && dx > 0 && finite(dy) && dy > 0, 'dx y dy deben ser positivos');
  assert(Array.isArray(grid) && Number.isSafeInteger(x) && Number.isSafeInteger(y) &&
    y >= 1 && y < grid.length - 1 && x >= 1 && x < grid[0].length - 1,
  'El laplaciano requiere una celda interior');
  const a = grid[y][x - 1], b = grid[y][x + 1];
  const c = grid[y - 1][x], d = grid[y + 1][x], center = grid[y][x];
  assert([a, b, c, d, center].every(finite), 'El vecindario debe ser numerico');
  return (a - 2 * center + b) / (dx * dx) + (c - 2 * center + d) / (dy * dy);
}

function resolverEcuacionDeLaplace({
  grid, dx = 1, dy = 1, tolerance = 1e-8, omega = 1.65,
  maxIterations = 30000
} = {}) {
  const {width, height, fixed, unknown, min, max, mean} = validateGrid(grid);
  assert(finite(dx) && dx > 0 && finite(dy) && dy > 0, 'dx y dy deben ser positivos');
  assert(finite(tolerance) && tolerance > 0, 'Tolerancia positiva requerida');
  assert(finite(omega) && omega > 0 && omega < 2, 'SOR requiere 0 < omega < 2');
  assert(Number.isSafeInteger(maxIterations) && maxIterations >= 1,
    'maxIterations debe ser entero positivo');
  const wx = 1 / (dx * dx), wy = 1 / (dy * dy);
  assert(finite(wx) && finite(wy) && finite(wx + wy) && wx + wy > 0,
    'Pasos espaciales fuera del rango numerico');

  // No alteramos la malla del usuario. Cada celda fija (incluidas las
  // observaciones interiores) permanece inmutable durante la solucion.
  const solution = grid.map(row => row.map(v => v === null ? mean : v));
  const fixedMask = grid.map(row => row.map(v => v !== null));
  let maxResidual = 0, maxUpdate = 0, iterations = 0;
  const residual = () => {
    let greatest = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (fixedMask[y][x]) continue;
        greatest = Math.max(greatest, Math.abs(laplacianoDiscreto(solution, x, y, {dx, dy})));
      }
    }
    return greatest;
  };
  if (unknown) {
    for (let iter = 1; iter <= maxIterations; iter++) {
      iterations = iter; maxUpdate = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (fixedMask[y][x]) continue;
          const old = solution[y][x];
          const average = (wx * (solution[y][x - 1] + solution[y][x + 1]) +
            wy * (solution[y - 1][x] + solution[y + 1][x])) / (2 * (wx + wy));
          const next = old + omega * (average - old);
          assert(finite(next), 'El campo diverge fuera del rango de numeros finitos');
          solution[y][x] = next;
          maxUpdate = Math.max(maxUpdate, Math.abs(next - old));
        }
      }
      maxResidual = residual();
      if (maxResidual <= tolerance) break;
    }
  }
  const converged = maxResidual <= tolerance;
  const maxPrincipleHolds = solution.every(row => row.every(v =>
    v >= min - Math.max(1e-9, tolerance) && v <= max + Math.max(1e-9, tolerance)));
  return {
    schema: LAPLACE_PDE_VERSION,
    equation: 'd2(phi)/dx2 + d2(phi)/dy2 = 0',
    boundary_condition: 'Dirichlet (fixed observed cells)',
    method: 'finite_difference_SOR',
    dimensions: {width, height, dx, dy},
    fixed_points: fixed, solved_points: unknown,
    iterations, converged, max_residual: maxResidual,
    last_max_update: maxUpdate, tolerance, omega,
    maximum_principle_holds: maxPrincipleHolds,
    solution,
    forecasts_future: false,
    production_activation_allowed: false,
    automatic_trading: false
  };
}

return {LAPLACE_PDE_VERSION,laplacianoDiscreto,resolverEcuacionDeLaplace};
})();
const GRAFO=(function(){
/**
 * Laplaciano de grafo: (L phi)_i = sum_j w_ij (phi_i - phi_j) = 0
 * para vertices desconocidos. Aristas explícitas, simétricas y positivas.
 * El grafo no se infiere de datos: lo debe proporcionar el investigador.
 */
const LAPLACE_GRAFO_VERSION = 'laplace-grafo-dirichlet-v1';
const need = (ok, message) => { if (!ok) throw new Error(message); };
const finite = x => typeof x === 'number' && Number.isFinite(x);

function resolverLaplaceGrafo({nodes, edges, tolerance=1e-9,
  omega=1.2, maxIterations=30000}={}) {
  need(Array.isArray(nodes) && nodes.length >= 2, 'Se necesitan dos o mas nodos');
  need(Array.isArray(edges), 'Se requieren aristas explicitas');
  need(finite(tolerance) && tolerance>0, 'Tolerancia positiva requerida');
  need(finite(omega) && omega>0 && omega<2, 'SOR requiere 0 < omega < 2');
  need(Number.isSafeInteger(maxIterations)&&maxIterations>=1,
    'maxIterations debe ser entero positivo');
  const ids = new Map(), values=[], pinned=[];
  for(const node of nodes){
    need(node && typeof node.id==='string' && node.id.length>0,
      'ID de nodo invalido');
    need(!ids.has(node.id), 'ID de nodo duplicado');
    need(node.value===null || finite(node.value), 'Valor debe ser numero o null');
    ids.set(node.id,values.length);
    values.push(node.value);pinned.push(node.value!==null);
  }
  const adj = Array.from({length:nodes.length},()=>[]);
  const seenEdges = new Set();
  for(const edge of edges){
    const a=ids.get(edge?.from), b=ids.get(edge?.to);
    need(a!==undefined&&b!==undefined&&a!==b, 'Arista con nodos invalidos');
    need(finite(edge.weight)&&edge.weight>0, 'Peso positivo requerido');
    const key=[Math.min(a,b),Math.max(a,b)].join(':');
    need(!seenEdges.has(key), 'Arista duplicada');
    seenEdges.add(key);
    adj[a].push([b,edge.weight]);adj[b].push([a,edge.weight]);
  }
  // Evita inventar valores en componentes sin ninguna condicion de frontera.
  const visited=new Set();
  for(let root=0;root<nodes.length;root++){
    if(visited.has(root))continue;
    const queue=[root],component=[]; visited.add(root);
    for(const i of queue){
      component.push(i);
      for(const [j] of adj[i]) if(!visited.has(j)){
        visited.add(j);queue.push(j);
      }
    }
    const anchors=component.filter(i=>pinned[i]);
    if(component.some(i=>!pinned[i])){
      need(anchors.length>0,'Componente sin frontera observada: abstenerse');
      const initial=anchors.reduce((s,i)=>s+values[i],0)/anchors.length;
      need(finite(initial),'Valor inicial fuera de rango');
      for(const i of component)if(!pinned[i])values[i]=initial;
    }
  }
  const weights=adj.map(row=>row.reduce((s,[,w])=>s+w,0));
  need(weights.every(finite),'Suma de pesos fuera de rango');
  const residual=()=>{
    let max=0;
    for(let i=0;i<nodes.length;i++)if(!pinned[i]){
      let sum=0;
      for(const [j,w] of adj[i])sum+=w*(values[j]-values[i]);
      max=Math.max(max,Math.abs(sum/weights[i]));
    }
    return max;
  };
  let iterations=0,maxResidual=0;
  if(pinned.some(v=>!v)){
    for(let k=1;k<=maxIterations;k++){
      iterations=k;
      for(let i=0;i<nodes.length;i++)if(!pinned[i]){
        let num=0;
        for(const [j,w] of adj[i])num+=w*values[j];
        const next=values[i]+omega*(num/weights[i]-values[i]);
        need(finite(next),'Divergencia numerica');
        values[i]=next;
      }
      maxResidual=residual();
      if(maxResidual<=tolerance)break;
    }
  }
  return {schema:LAPLACE_GRAFO_VERSION,
    equation:'sum_j w_ij (phi_i - phi_j) = 0',
    method:'weighted_graph_laplacian_SOR',
    nodes:nodes.map((v,i)=>({id:v.id,value:values[i],observed:pinned[i]})),
    edges_count:edges.length,iterations,converged:maxResidual<=tolerance,
    max_residual:maxResidual,tolerance,omega,
    assumed_verified_relationships:false,
    forecasts_future:false,production_activation_allowed:false,automatic_trading:false};
}

return {LAPLACE_GRAFO_VERSION,resolverLaplaceGrafo};
})();
root.LaplacePDE=Object.freeze({...PDE,...GRAFO});
})(typeof window!=='undefined'?window:globalThis);
