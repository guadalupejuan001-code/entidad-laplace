/* Piezas vectoriales originales: grabado sobre medallones de cobre. */
(function(root){
'use strict';
const ns='http://www.w3.org/2000/svg';
const paths={
 observe:'<path d="M12 2.7 20.5 18H3.5Z"/><path d="M6.8 12.4Q12 7.4 17.2 12.4Q12 17.1 6.8 12.4Z"/><path d="M12 9.5v5.6M12 1v1M22 20l-1.6-.8M2 20l1.6-.8"/>',
 horizon:'<circle cx="12" cy="12" r="8.3"/><path d="M12 1.5v3.1M12 19.4v3.1M1.5 12h3.1M19.4 12h3.1M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6M12 6.8v5.4l4.1 2.2"/><circle cx="12" cy="12" r="1"/>',
 ledger:'<path d="M5.4 3.2h13.1v17.5H5.4Q3 20.7 3 18.4V5.5Q3 3.2 5.4 3.2ZM6.5 3.5v17M18.5 6h2v12h-2M10 7h5M10 11h5M10 15h3"/><path d="M4.4 7v.1M4.4 11v.1M4.4 15v.1"/>',
 exchange:'<path d="M3.3 8.2h16.8L16.8 5M20.7 15.8H3.9L7.2 19M5.4 12h13.2"/><path d="M3.3 8.2 6.6 11.5M20.7 15.8l-3.3-3.3"/>',
 world:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4.3" ry="9"/><path d="M3.6 8.5h16.8M3.6 15.5h16.8M3 12h18"/>',
 refresh:'<path d="M20 9a8 8 0 0 0-13.7-3L3.7 8.5M4 15a8 8 0 0 0 13.7 3l2.6-2.5M3.7 3.8v4.7h4.7M20.3 20.2v-4.7h-4.7"/>',
 check:'<circle cx="12" cy="12" r="8.6"/><path d="m7.1 12 3.2 3.1 6.7-6.6M12 1v1M12 22v1M1 12h1M22 12h1"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 6v6l3.8 2.2M9 1.5h6M12 1.5v2M5 5l-1-1M19 5l1-1"/>',
 source:'<path d="M5 4.5h14v15H5zM5 8h14M9 11.5h6M9 15h6M2 8h3M19 8h3M2 16h3M19 16h3"/><circle cx="16.5" cy="6.2" r=".5"/>',
 archive:'<path d="M3.5 7h17v14h-17zM2.5 3h19v4h-19zM9 11h6M8 16h8"/><path d="M7 3v4M17 3v4"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
 star:'<path d="m12 2.7 2.9 6 6.6 1-4.8 4.6 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6L2.5 9.7l6.6-1Z"/>',
 play:'<path d="m8.5 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',
 up:'<path d="M12 20V4m-6 6 6-6 6 6M5 21h14"/>',down:'<path d="M12 4v16m-6-6 6 6 6-6M5 3h14"/>',
 warning:'<path d="m12 3 10 17H2ZM12 8v5M12 16v.5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const bank=document.createElementNS(ns,'svg');bank.setAttribute('aria-hidden','true');bank.classList.add('instrument-symbols');
bank.innerHTML='<defs>'+Object.entries(paths).map(([name,path])=>'<symbol id="laplace-icon-'+name+'" viewBox="0 0 24 24">'+path+'</symbol>').join('')+'</defs>';
document.body.prepend(bank);
function create(name){
 if(!paths[name])name='observe';const svg=document.createElementNS(ns,'svg');
 svg.classList.add('instrument-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 for(const cls of ['engrave-shadow','engrave-line']){const use=document.createElementNS(ns,'use');
  use.setAttribute('href','#laplace-icon-'+name);use.classList.add(cls);svg.append(use)}return svg;
}
function set(node,name){node.replaceChildren(create(name))}
root.LaplaceIcons={create,set};
for(const el of document.querySelectorAll('[data-icon]'))set(el,el.dataset.icon);
const favorite=document.getElementById('favoriteToggle');if(favorite)set(favorite,'star');
set(document.getElementById('motionToggle'),document.getElementById('motionToggle').getAttribute('aria-pressed')==='true'?'play':'pause');
})(window);
