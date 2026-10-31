/**
 * Ecuacion de Laplace, estacionaria: d2(phi)/dx2 + d2(phi)/dy2 = 0.
 * Dirichlet: los numeros de la malla son observaciones fijas;
 * null significa celda interior desconocida. SIN prediccion temporal.
 * Metodo numerico: diferencias finitas de orden 2 + SOR.
 */
export const LAPLACE_PDE_VERSION = 'laplace-pde-dirichlet-v1';

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

export function laplacianoDiscreto(grid, x, y, {dx = 1, dy = 1} = {}) {
  assert(finite(dx) && dx > 0 && finite(dy) && dy > 0, 'dx y dy deben ser positivos');
  assert(Array.isArray(grid) && Number.isSafeInteger(x) && Number.isSafeInteger(y) &&
    y >= 1 && y < grid.length - 1 && x >= 1 && x < grid[0].length - 1,
  'El laplaciano requiere una celda interior');
  const a = grid[y][x - 1], b = grid[y][x + 1];
  const c = grid[y - 1][x], d = grid[y + 1][x], center = grid[y][x];
  assert([a, b, c, d, center].every(finite), 'El vecindario debe ser numerico');
  return (a - 2 * center + b) / (dx * dx) + (c - 2 * center + d) / (dy * dy);
}

export function resolverEcuacionDeLaplace({
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
