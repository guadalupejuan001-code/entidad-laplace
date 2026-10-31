/* M001 — investigación prospectiva multihorizonte. NO activa R015 ni trading.
 * Cada horizonte busca resultados históricos de esa misma duración.
 * Se publica el candidato aunque no mejore a persistencia; datos ausentes no
 * se reemplazan por una predicción inventada. Matemática del anfitrión JS. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {huellaContenido} from '../universo/integridad.mjs';
export const MODELO='laplace-candidato-multihorizonte-m001';
export const HORIZONTES=Object.freeze([15,30,60,240,1440]);
export const PARAMETROS=Object.freeze({paso_segundos:300,historia_barras:6,
  escalas:[0.007,0.004,0.004,0.006,1.5],analogos_maximos:18,
  tolerancia_precio_pb:10,politica:'publicar_candidato_sin_filtro_de_rentabilidad'});
export const CODIGO_SHA256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const debe=(c,m)=>{if(!c)throw Error(m)};
const media=a=>a.reduce((s,x)=>s+x,0)/a.length;
const iso=n=>new Date(n).toISOString();
export function validarHorizontes(raw=HORIZONTES){
  debe(Array.isArray(raw)&&raw.length>0&&raw.length<=16,'Se requieren de 1 a 16 horizontes');
  debe(raw.every(x=>Number.isSafeInteger(x)&&x>=5&&x%5===0),'Horizontes: minutos positivos múltiplos de cinco');
  debe(new Set(raw).size===raw.length,'Horizontes duplicados');
  return [...raw].sort((a,b)=>a-b);
}
export function validarVelas(raw,{corte,segundos=300,maximo=10000}={}){
  debe(Number.isFinite(Date.parse(corte)),'Corte temporal inválido');
  debe(Array.isArray(raw)&&raw.length<=maximo,'Cantidad de velas fuera de presupuesto');
  const map=new Map();
  for(const r of raw){
    debe(Array.isArray(r)&&r.length===6&&r.every(Number.isFinite),'Vela OHLCV inválida');
    const [t,l,h,o,c,v]=r;
    debe(Number.isSafeInteger(t)&&t>=0&&t%segundos===0&&l>0&&h>=l&&
      o>=l&&o<=h&&c>=l&&c<=h&&v>=0,'OHLCV o intervalo incoherente');
    if((t+segundos)*1000>Date.parse(corte))continue;
    if(map.has(t))debe(JSON.stringify(map.get(t))===JSON.stringify(r),'Duplicado contradictorio');
    map.set(t,r);
  }
  return [...map.values()].sort((a,b)=>a[0]-b[0]);
}
function rasgo(b,i,continuo){
  if(i<6||continuo[i]-continuo[i-6]!==0)return null;
  const retornos=[];
  for(let j=i-5;j<=i;j++)retornos.push(Math.log(b[j][4]/b[j-1][4]));
  const vol=media(b.slice(i-5,i+1).map(r=>r[5]));
  return [Math.log(b[i][4]/b[i-3][4]),Math.log(b[i][4]/b[i-1][4]),
    Math.sqrt(media(retornos.map(x=>x*x))),media(b.slice(i-2,i+1).map(r=>(r[2]-r[1])/r[4])),
    vol>0?b[i][5]/vol:1];
}
export function emitirPronosticos(raw,cotizacion,{emitidoEn,horizontes=HORIZONTES,revision='local'}={}){
  const hs=validarHorizontes(horizontes),t=Date.parse(cotizacion?.observed_at),ahora=Date.parse(emitidoEn);
  const p=Number(cotizacion?.value),known=Date.parse(cotizacion?.known_at);
  debe(cotizacion?.asset==='BTC-USD'&&Number.isFinite(p)&&p>0,'Falta cotización BTC-USD');
  debe(Number.isFinite(t)&&Number.isFinite(ahora)&&known>=t&&known<=ahora&&ahora-t>=0&&ahora-t<=180000,
    'Cotización antigua, futura o conocida después de emitir');
  const bars=validarVelas(raw,{corte:cotizacion.observed_at});
  const gaps=bars.map((b,i)=>i>0&&b[0]!==bars[i-1][0]+300?1:0);
  for(let i=1;i<gaps.length;i++)gaps[i]+=gaps[i-1];
  const features=bars.map((_,i)=>rasgo(bars,i,gaps)),n=bars.length-1;
  const reciente=n>=0&&t-(bars[n][0]+300)*1000<=600000;
  const actual=reciente?features[n]:null;
  const huellaEntradas=huellaContenido({cotizacion,barras:bars});
  return hs.map(h=>{
    const dur=h/5,objetivo=t+h*60000;
    debe(Number.isFinite(objetivo)&&objetivo<=8640000000000000&&objetivo>ahora,'Fecha objetivo fuera de rango');
    const candidatos=[];
    if(actual)for(let i=6;i+dur<n;i++){
      if(!features[i]||gaps[i+dur]!==gaps[i])continue;
      const d=Math.sqrt(media(actual.map((x,k)=>((x-features[i][k])/PARAMETROS.escalas[k])**2)));
      candidatos.push({i,d,r:Math.log(bars[i+dur][4]/bars[i][4])});
    }
    candidatos.sort((a,b)=>a.d-b.d||a.i-b.i);
    const elegidos=[];
    for(const x of candidatos){
      if(elegidos.every(y=>Math.abs(y.i-x.i)>=dur))elegidos.push(x);
      if(elegidos.length===PARAMETROS.analogos_maximos)break;
    }
    const suma=elegidos.reduce((s,x)=>s+1/(1+x.d),0);
    const r=suma?elegidos.reduce((s,x)=>s+x.r/(1+x.d),0)/suma:null;
    const candidato=r===null?null:p*Math.exp(r);
    debe(candidato===null||(Number.isFinite(candidato)&&candidato>0),'Resultado numérico fuera de rango');
    const inicioMinuto=Math.floor(objetivo/60000)*60000;
    const body={schema:'laplace-pronostico-m001',modelo:MODELO,codigo_sha256:CODIGO_SHA256,revision,
      emitido_en:iso(ahora),cotizacion_en:iso(t),conocido_en:iso(known),objetivo_en:iso(objetivo),
      horizonte_minutos:h,precio_inicial:p,precio_predicho:candidato,referencia_persistencia:p,
      estado_modelo:!elegidos.length?'sin_patrones':elegidos.length<8?'experimental_poco_soporte':'experimental',
      retorno_logaritmico:r,analogos:elegidos.length,parametros:PARAMETROS,
      criterio:{tolerancia_precio_pb:10,direccion:'signo_del_cambio_sin_neutralidad_inventada',
        referencia:'cierre_de_la_vela_del_minuto_objetivo',inicio_vela:iso(inicioMinuto),fin_vela:iso(inicioMinuto+60000),
        precio_al_segundo_exacto:false},
      huella_entradas:huellaEntradas,desfase_cotizacion_cierre_segundos:n>=0?(t-(bars[n][0]+300)*1000)/1000:null,
      ultimos_resultados_conocidos:elegidos.map(x=>({inicio:iso((bars[x.i][0]+300)*1000),
        fin:iso((bars[x.i+dur][0]+300)*1000),distancia:x.d,retorno_log:x.r})),
      advertencia:'Candidato sin validar, no predice causas universales. R015 no activado. Sin órdenes.'};
    return {...body,id:huellaContenido(body)};
  });
}
export function verificarPronostico(p){
  const {id,...body}=p??{};
  debe(body.schema==='laplace-pronostico-m001'&&id===huellaContenido(body),'Pronóstico modificado');
  debe(Date.parse(body.emitido_en)<Date.parse(body.objetivo_en),'Pronóstico no prospectivo');
  return true;
}
export function evaluarPronostico(p,row,{consultadoEn,fuente}={}){
  verificarPronostico(p);
  debe(p.precio_predicho!==null,'No hay candidato para evaluar');
  const fin=Date.parse(p.criterio.fin_vela),consulta=Date.parse(consultadoEn);
  debe(Number.isFinite(consulta)&&consulta>=fin,'El resultado aún no estaba disponible');
  const validas=validarVelas([row],{corte:consultadoEn,segundos:60,maximo:1});
  debe(validas.length===1&&row[0]*1000===Date.parse(p.criterio.inicio_vela),'Vela de otro objetivo');
  const real=row[4],error=Math.abs(p.precio_predicho-real),base=Math.abs(p.precio_inicial-real);
  const errorPb=error/real*1e4;
  const direction=x=>x>0?'subida':x<0?'bajada':'sin_cambio';
  return {schema:'laplace-resultado-m001',pronostico_id:p.id,consultado_en:iso(consulta),
    precio_observado:real,vela_completa:row,fuente,
    referencia:p.criterio.referencia,precio_al_segundo_exacto:false,
    ventana_inicio:p.criterio.inicio_vela,ventana_fin:p.criterio.fin_vela,
    retraso_cierre_sobre_objetivo_segundos:(fin-Date.parse(p.objetivo_en))/1000,
    error_absoluto_usd:error,error_porcentual:100*error/real,error_referencia_usd:base,
    acierto_precio:errorPb<=p.criterio.tolerancia_precio_pb,tolerancia_precio_pb:p.criterio.tolerancia_precio_pb,
    direccion_predicha:direction(p.precio_predicho-p.precio_inicial),direccion_observada:direction(real-p.precio_inicial),
    acierto_direccion:direction(p.precio_predicho-p.precio_inicial)===direction(real-p.precio_inicial),
    mejora_referencia:error<base,empata_referencia:error===base};
}
