'use strict';
/* Geometría pura compartida con las pruebas. El tiempo horizontal es lineal:
 * ningún índice de matriz sustituye a la fecha real de una observación. */
(function(raiz){
  function calcular(serie,instrumento,{ancho=800,alto=285,maxPuntos=72}={}){
    const cotizacion=Date.parse(instrumento?.observed_at),objetivo=Date.parse(instrumento?.target_at);
    const precio=instrumento?.observed_price_usd,estimado=instrumento?.projected_price_usd;
    const tieneEstimado=Number.isFinite(estimado)&&estimado>0;
    if(!Number.isFinite(cotizacion)||!Number.isFinite(objetivo)||objetivo<=cotizacion||
      !Number.isFinite(precio)||precio<=0)return null;
    const mapa=new Map();
    for(const p of serie??[]){
      const tiempo=Date.parse(p.fecha);
      if(Number.isFinite(tiempo)&&tiempo<=cotizacion&&Number.isFinite(p.precio)&&p.precio>0)
        mapa.set(tiempo,{tiempo,precio:p.precio});
    }
    const cierres=[...mapa.values()].sort((a,b)=>a.tiempo-b.tiempo).slice(-maxPuntos);
    // Una cotización tiene su propio instante: NO es el último cierre de vela.
    const observados=[...cierres.filter(p=>p.tiempo<cotizacion),{tiempo:cotizacion,precio}];
    const rango=instrumento.scenario_interval_usd;
    const intervalo=Array.isArray(rango)&&rango.length===2&&
      rango.every(x=>Number.isFinite(x)&&x>0)&&rango[0]<=rango[1]?rango:null;
    const valores=[...observados.map(p=>p.precio),...(tieneEstimado?[estimado]:[]),...(intervalo??[])];
    const inferior=Math.min(...valores),superior=Math.max(...valores);
    const margen=Math.max((superior-inferior)*.15,precio*.0003);
    const min=inferior-margen,max=superior+margen;
    const inicio=Math.min(observados[0].tiempo,cotizacion-900000);
    const izquierda=ancho<550?67:82,derecha=ancho-18,arriba=32,abajo=alto-48;
    const x=t=>izquierda+(t-inicio)/(objetivo-inicio)*(derecha-izquierda);
    const y=v=>abajo-(v-min)/(max-min)*(abajo-arriba);
    return {ancho,alto,inicio,cotizacion,objetivo,min,max,izquierda,derecha,arriba,abajo,
      puntos:observados.map(p=>({...p,x:x(p.tiempo),y:y(p.precio)})),
      ancla:{x:x(cotizacion),y:y(precio),precio,tiempo:cotizacion},
      fin:tieneEstimado?{x:x(objetivo),y:y(estimado),precio:estimado,tiempo:objetivo}:null,
      intervalo:intervalo?{alto:y(intervalo[1]),bajo:y(intervalo[0])}:null,
      rejilla:Array.from({length:4},(_,i)=>{const valor=max-(max-min)*i/3;return {valor,y:y(valor)}}),
      marcas:[inicio,(inicio+objetivo)/2,objetivo].map(t=>({tiempo:t,x:x(t)})),
      cierres_visibles:cierres.length};
  }
  raiz.LaplaceGrafica=Object.freeze({calcular});
})(globalThis);
