(function(){
'use strict';
const video=document.getElementById('portalVideo'),button=document.getElementById('motionToggle');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const root=document.documentElement,seal=document.getElementById('instrumentSeal'),mode=document.getElementById('instrumentMode');
let page='panel',paused=false,videoVisible=!('IntersectionObserver' in window),activity='idle',glintFrame=0;
let nativeActivity={},worldBusy=false;
try{paused=localStorage.getItem('laplace-motion-paused')==='yes'}catch(error){}
async function update(){
  const stop=paused||reduced.matches||document.hidden;
  root.dataset.motion=stop?'paused':'active';
  button.setAttribute('aria-pressed',String(stop));
  button.setAttribute('aria-label',stop?'Reproducir animación decorativa':'Pausar animación decorativa');
  if(window.LaplaceIcons)window.LaplaceIcons.set(button,stop?'play':'pause');else button.textContent=stop?'▷':'Ⅱ';
  button.disabled=reduced.matches;
  if(stop){seal.style.removeProperty('--glint-x');seal.style.removeProperty('--glint-y');}
  if(stop||!videoVisible||page!=='panel'){video.pause();return}
  if(!video.querySelector('source').src){
    video.querySelector('source').src=video.querySelector('source').dataset.src;video.load();
  }
  try{await video.play()}catch(error){/* El ojo sigue activo si el video no está disponible. */}
}
button.addEventListener('click',()=>{
  if(reduced.matches)return;
  paused=!paused;try{localStorage.setItem('laplace-motion-paused',paused?'yes':'no')}catch(error){}
  update();
});
reduced.addEventListener('change',update);
document.addEventListener('visibilitychange',update);
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
 videoVisible=entries[0].isIntersecting;update();
},{threshold:0}).observe(video);
// La aguja indica actividad real del núcleo, nunca una probabilidad o cotización.
function renderActivity(){
 const d=nativeActivity;
 activity=d.busy?'calculating':d.syncing?'checking':d.importing?'restoring':d.exporting?'saving':worldBusy?'world':'idle';
 root.dataset.instrument=activity;
 mode.textContent={calculating:'CALCULANDO',checking:'COMPROBANDO',restoring:'RESTAURANDO',saving:'GUARDANDO',world:'PROCESANDO ARCHIVO',idle:'MOTOR EN REPOSO'}[activity];
}
window.addEventListener('laplace:instrument',event=>{nativeActivity=event.detail??{};renderActivity()});
window.addEventListener('laplace:ef004',()=>{worldBusy=window.LaplaceEF004Mobile?.state().busy===true;renderActivity()});
// Un reflejo sigue el dedo o puntero; no hay bucle de renderizado ni sondeo.
seal.addEventListener('pointermove',event=>{
 if(root.dataset.motion!=='active'||glintFrame)return;
 const rect=seal.getBoundingClientRect(),x=event.clientX,y=event.clientY;
 glintFrame=requestAnimationFrame(()=>{glintFrame=0;if(root.dataset.motion!=='active')return;
  seal.style.setProperty('--glint-x',Math.max(-3,Math.min(3,(x-rect.left-rect.width/2)*.06))+'px');
  seal.style.setProperty('--glint-y',Math.max(-2,Math.min(2,(y-rect.top-rect.height/2)*.04))+'px');
 });
},{passive:true});
seal.addEventListener('pointerleave',()=>{seal.style.removeProperty('--glint-x');seal.style.removeProperty('--glint-y');});
window.LaplaceDecoration={setPage(next){page=next;update()},state:()=>({page,paused,
 motion:root.dataset.motion,activity,reducedMotion:reduced.matches,videoVisible})};
root.dataset.instrument='idle';
update();
})();
