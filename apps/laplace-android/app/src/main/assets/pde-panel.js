/* Android: controles interactivos para el nucleo de Laplace autentico.
 * Campo estacionario y grafo ponderado. No usa precios ni inventa relaciones.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const MathPDE=window.LaplacePDE;
if(!MathPDE)throw Error('No se empaquetó el solucionador Laplace PDE.');
const allowedSizes=new Set([11,21,31,41]);
let field=null;
function readNumber(id){
  const input=$(id),raw=input.value.trim(),value=Number(raw);
  if(!raw||!Number.isFinite(value)||Math.abs(value)>1e9)
    throw Error('Introduce un número válido en '+id+' (máximo absoluto: 1.000 millones).');
  return value;
}
function fmt(value,digits=6){
  if(!Number.isFinite(value))return '—';
  return value.toLocaleString('es-MX',{maximumFractionDigits:digits});
}
function setMessage(id,msg,kind){
  const p=$(id);p.textContent=msg;p.dataset.state=kind;
}
function gridFor(mode,n){
  const values=mode==='custom'?{
    left:readNumber('pdeLeft'),right:readNumber('pdeRight'),
    top:readNumber('pdeTop'),bottom:readNumber('pdeBottom')
  }:null;
  const at=(x,y)=>{
    const u=x/(n-1),v=y/(n-1);
    if(mode==='linear')return 100*u;
    if(mode==='quadratic')return 100*(u*u-v*v);
    const fixed=[];
    if(x===0)fixed.push(values.left);
    if(x===n-1)fixed.push(values.right);
    if(y===0)fixed.push(values.top);
    if(y===n-1)fixed.push(values.bottom);
    return fixed.reduce((a,b)=>a+b,0)/fixed.length;
  };
  return Array.from({length:n},(_,y)=>
    Array.from({length:n},(_,x)=>
      x===0||y===0||x===n-1||y===n-1?at(x,y):null));
}
function paintHeatmap(result){
  const canvas=$('pdeCanvas'),ctx=canvas.getContext('2d');
  if(!ctx)return;
  const n=result.dimensions.width,rect=canvas.getBoundingClientRect();
  const w=Math.max(260,Math.min(720,Math.round(rect.width||350))),h=300;
  const ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  ctx.scale(ratio,ratio);
  const a=result.solution.flat(),min=Math.min(...a),max=Math.max(...a);
  const step=(max-min)||1,cellW=w/n,cellH=h/n;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const t=Math.max(0,Math.min(1,(result.solution[y][x]-min)/step));
    const hue=226-178*t;
    ctx.fillStyle='hsl('+hue.toFixed(1)+' 83% '+(25+32*t).toFixed(1)+'%)';
    ctx.fillRect(x*cellW,y*cellH,cellW+.6,cellH+.6);
  }
  ctx.strokeStyle='rgba(242,250,255,.42)';ctx.lineWidth=1;
  ctx.strokeRect(.5,.5,w-1,h-1);
  $('pdeMin').textContent='Mín: '+fmt(min,4);
  $('pdeMax').textContent='Máx: '+fmt(max,4);
}
function runField(){
  try{
    const n=Number($('pdeSize').value),mode=$('pdePreset').value;
    if(!allowedSizes.has(n)||!['custom','linear','quadratic'].includes(mode))
      throw Error('Tamaño de malla o ejemplo no permitido.');
    const input=gridFor(mode,n);
    // Coordenadas normalizadas en el cuadrado [0,1]×[0,1].
    const result=MathPDE.resolverEcuacionDeLaplace({
      grid:input,dx:1/(n-1),dy:1/(n-1),omega:1.7,
      tolerance:1e-6,maxIterations:20000
    });
    field=result;
    $('pdeIterations').textContent=fmt(result.iterations,0);
    $('pdeResidual').textContent=result.max_residual.toExponential(2);
    $('pdePoints').textContent=fmt(result.solved_points,0);
    $('pdeConverged').textContent=result.converged?'SÍ':'NO';
    paintHeatmap(result);
    if(!result.converged)
      setMessage('pdeStatus','No convergió dentro del presupuesto; no se presenta como solución válida.','error');
    else setMessage('pdeStatus','Campo resuelto: '+n+' × '+n+'; '+result.iterations+
      ' iteraciones; residuo '+result.max_residual.toExponential(2)+
      '. Resultado estacionario, no precio futuro.','success');
    return result;
  }catch(error){
    field=null;
    setMessage('pdeStatus','Error: '+error.message,'error');
    $('pdeConverged').textContent='ERROR';
    return null;
  }
}
function runGraph(){
  try{
    const left=readNumber('graphA'),right=readNumber('graphB'),
      wa=readNumber('graphWA'),wb=readNumber('graphWB');
    if(wa<=0||wb<=0||wa+wb>1e10)
      throw Error('Los pesos del grafo deben ser positivos y finitos.');
    const result=MathPDE.resolverLaplaceGrafo({
      nodes:[{id:'A',value:left},{id:'X',value:null},{id:'B',value:right}],
      edges:[{from:'A',to:'X',weight:wa},{from:'X',to:'B',weight:wb}],
      tolerance:1e-10,maxIterations:20000
    });
    if(!result.converged)throw Error('El grafo no convergió.');
    $('graphValue').textContent=fmt(result.nodes[1].value,6);
    setMessage('graphStatus','Lφ = 0 · convergió en '+result.iterations+
      ' iteraciones. Residuo normalizado: '+result.max_residual.toExponential(2)+
      '. No es una predicción.','success');
    return result;
  }catch(error){
    $('graphValue').textContent='—';
    setMessage('graphStatus','Error: '+error.message,'error');return null;
  }
}
$('pdePreset').addEventListener('change',()=>{
  $('pdeFields').hidden=$('pdePreset').value!=='custom';
});
$('pdeSolve').addEventListener('click',runField);
$('graphSolve').addEventListener('click',runGraph);
for(const button of document.querySelectorAll('[data-tab]'))
  if(button.dataset.tab==='equation')
    button.addEventListener('click',()=>setTimeout(()=>{if(field)paintHeatmap(field)},50));
window.addEventListener('resize',()=>{if(field&&!$('equation').hidden)paintHeatmap(field)});
window.LaplacePDEMobile={runField,runGraph};
runField();runGraph();
})();
