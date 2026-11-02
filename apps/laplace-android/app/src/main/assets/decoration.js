(function(){
'use strict';
const video=document.getElementById('portalVideo'),button=document.getElementById('motionToggle');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let page='panel',paused=false;
try{paused=localStorage.getItem('laplace-motion-paused')==='yes'}catch(error){}
async function update(){
  const stop=paused||reduced.matches||document.hidden||page!=='panel';
  button.setAttribute('aria-pressed',String(stop));
  button.setAttribute('aria-label',stop?'Reproducir animación decorativa':'Pausar animación decorativa');
  button.textContent=stop?'▷':'Ⅱ';
  if(stop){video.pause();return}
  if(!video.querySelector('source').src){
    video.querySelector('source').src=video.querySelector('source').dataset.src;video.load();
  }
  try{await video.play()}catch(error){button.textContent='▷';button.setAttribute('aria-label','Reproducir animación decorativa')}
}
button.addEventListener('click',()=>{
  if(reduced.matches)return;
  paused=!video.paused;try{localStorage.setItem('laplace-motion-paused',paused?'yes':'no')}catch(error){}
  update();
});
reduced.addEventListener('change',update);
document.addEventListener('visibilitychange',update);
window.LaplaceDecoration={setPage(next){page=next;update()}};
button.disabled=reduced.matches;
reduced.addEventListener('change',()=>{button.disabled=reduced.matches});
update();
})();
