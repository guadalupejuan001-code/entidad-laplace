/**
 * Laplaciano de grafo: (L phi)_i = sum_j w_ij (phi_i - phi_j) = 0
 * para vertices desconocidos. Aristas explícitas, simétricas y positivas.
 * El grafo no se infiere de datos: lo debe proporcionar el investigador.
 */
export const LAPLACE_GRAFO_VERSION = 'laplace-grafo-dirichlet-v1';
const need = (ok, message) => { if (!ok) throw new Error(message); };
const finite = x => typeof x === 'number' && Number.isFinite(x);

export function resolverLaplaceGrafo({nodes, edges, tolerance=1e-9,
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
