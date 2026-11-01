/* Inventario canónico de 20 capacidades: compartido por Node y WebView Android.
 * Un fichero existente, una captura y una predicción comprobada son cosas distintas.
 * No ejecuta colectores ni finge que una serie histórica cambia el precio.
 * Sin dependencias Node: el empaquetador incluye exactamente este código.
 */
export const CAPABILITY_SCHEMA='laplace-capability-observability-v1';
export const CAPABILITY_CATALOG=Object.freeze([
  {id:'01',key:'XN01',title:'Dirección BTC 5m XI/Ether',source:'apps/laplace-android/app/src/main/assets/xn01-native.xi'},
  {id:'02',key:'XN01_RAW',title:'Máscara, prior, P(subida), soporte y registros XI',source:'apps/laplace-android/app/src/main/cpp/native_xn01_jni.cpp'},
  {id:'03',key:'EQUITIES',title:'Dirección SPY/AAPL/NVDA',source:'integraciones/reverse-pc/reverse-os-android/app/src/main/java/com/reversepc/os/LaplaceActivity.java'},
  {id:'04',key:'X002',title:'Entrenamiento/calibración temporal',source:'experimentos/entrenamiento-x002.mjs'},
  {id:'05',key:'XG01',title:'Ablación local/global A/B con holdout',source:'experimentos/u002-predictive-xg01.mjs'},
  {id:'06',key:'CAUSAL',title:'Trayectoria observacional BTC/eventos',source:'bitcoin/causal.mjs'},
  {id:'07',key:'M001_DIARY',title:'Pronóstico M001 y diario prospectivo',source:'seguimiento/diario.mjs'},
  {id:'08',key:'U002_XI',title:'Estados U002 y roundtrip XI',source:'integraciones/reverse-pc/reverse-os-android/app/src/main/assets/laplace/u002-native.xi'},
  {id:'09',key:'WORLD',title:'U003/U004 observación mundial',source:'universo/global-u003.mjs'},
  {id:'10',key:'ORDER_FLOW',title:'Libro de órdenes/operaciones',source:'integraciones/reverse-pc/reverse-os-android/app/src/main/assets/laplace/app.mjs'},
  {id:'11',key:'NOAA_EUR',title:'BTC/EUR, NOAA y contexto externo',source:'universo/global-u003.mjs'},
  {id:'12',key:'C001',title:'ETF SEC N-PORT: flujos auténticos',source:'universo/fondos/global.mjs'},
  {id:'13',key:'O001',title:'FINRA corto, ATS y Non-ATS',source:'universo/otc/finra-query.mjs'},
  {id:'14',key:'D001_D002',title:'Derivados, funding, swaps OTC',source:'universo/derivados/global.mjs'},
  {id:'15',key:'B001',title:'Banca internacional BIS',source:'universo/banca/bis-sdmx.mjs'},
  {id:'16',key:'K001',title:'Blockchain y DeFi público',source:'universo/cripto/global-k001.mjs'},
  {id:'17',key:'EF001_EF005',title:'Archivo bitemporal persistente/escala',source:'estado-financiero/repositorio.mjs'},
  {id:'18',key:'EF003',title:'Leyes y escenarios de transición',source:'estado-financiero/ejecucion.mjs'},
  {id:'19',key:'EF004',title:'Aprendizaje conjunto multivariante',source:'demonio/finanzas-ef004.mjs'},
  {id:'20',key:'RAW_V001',title:'F001 crudo, trazas, ablación y evidencia V001',source:'prediccion/fusion-temporal.mjs'}
].map(x=>Object.freeze(x)));
const numeric=x=>typeof x==='number'&&Number.isFinite(x);
function groupsOf(world){
  const groups=world?.groups??world?.coverage?.groups??[];
  return new Map((Array.isArray(groups)?groups:[]).filter(x=>x&&typeof x.group==='string')
    .map(x=>[x.group,x]));
}
function hasGroup(map,id){
  const x=map.get(id);const n=Number(x?.signals??0);
  return numeric(n)&&n>0&&(!x?.status||/observ|partial|captur/i.test(x.status));
}
function formatGroup(map,id){
  const x=map.get(id);
  if(!x)return {state:'not_observed',reason:'No consta este grupo en el archivo integrado'};
  const n=Number(x.signals??0);
  if(!numeric(n)||n<=0)return {state:'not_observed',reason:String(x.status??'Sin señales')};
  if(!hasGroup(map,id))return {state:'partial',reason:'Señales declaradas, estado de fuente no confirmado'};
  return {state:'observed_archive',reason:n+' señales en captura pública fechada, no necesariamente utilizables para precio'};
}
function base(key,g,world,flags,model,archives){
  const partial=(reason)=>({state:'partial',reason});
  const missing=(reason)=>({state:'not_executed',reason});
  const observed=(reason)=>({state:'observed_archive',reason});
  switch(key){
    case 'XN01':return flags.xn01?{state:'executed',reason:'Ejecutor XI/Ether nativo respondió en este dispositivo'}:
      missing('El ejecutor nativo existe, pero no se ha ejecutado en esta sesión');
    case 'XN01_RAW':return flags.xn01?{state:'executed',reason:'Registros nativos disponibles en el resultado crudo XI'}:
      missing('Sin salida de registros nativos en la sesión');
    case 'EQUITIES':return missing('Ruta bursátil no conectada a una fuente bursátil 5m verificable en la APK');
    case 'X002':return missing('Calibración/holdout del servidor, no entrenados en la APK');
    case 'XG01':return missing('Experimento A/B recuperado en repositorio, no ejecutado en la APK');
    case 'CAUSAL':return missing('Análisis observacional disponible en repositorio, sin causalidad probada');
    case 'M001_DIARY':return flags.m001Diary>0?partial(flags.m001Diary+
      ' entradas locales; archivo prospectivo M001 del servidor no sincronizado'):
      missing('Diario M001 servidor sin sincronizar; la bitácora local está vacía');
    case 'U002_XI':return missing('Estados archivados no equivalen a un roundtrip XI nativo ejecutado');
    case 'WORLD':{
      const states=world?.states_count??world?.states?.length??
        world?.universal_state?.states?.length??0;
      return states>0?
        observed('Captura pública fechada: '+states+' estados; sin impacto predictivo acreditado'):
        missing('Sin captura EF002 verificable incluida');
    }
    case 'ORDER_FLOW':return missing('La APK recibe ticker de operaciones, no L2/L3 ni flujo de órdenes validado');
    case 'NOAA_EUR':return missing('Observaciones externas no conectadas a un predictor verificable en Android');
    case 'C001':return formatGroup(g,'etf_fund_flows_c001');
    case 'O001':{
      const x=world?.source_summary??[];
      const found=Array.isArray(x)&&x.some(s=>/finra|ats|off.exchange|otc/i.test(String(s.group))&&
        Number(s.signal_count??0)>0);
      return found?observed('Fuentes FINRA parciales en archivo, sin inferir flujo total'):
        missing('FINRA ATS/Non-ATS y corto sin serie acreditada en esta APK');
    }
    case 'D001_D002':{
      const one=formatGroup(g,'derivatives_d001'),two=formatGroup(g,'swaps_otc_d002');
      return one.state==='observed_archive'&&two.state==='observed_archive'?
        observed('Derivados y swaps observados por separado; no son una posición global completa'):
        partial('D001: '+one.state+'; D002: '+two.state+'; faltantes no son cero');
    }
    case 'B001':return formatGroup(g,'bis_banking_b001');
    case 'K001':return formatGroup(g,'blockchain_defi_k001');
    case 'EF001_EF005':return archives>0?
      partial(archives+' manifiestos EF002 indexados; el datastore EF001/EF005 completo permanece fuera del dispositivo'):
      missing('Sin archivo bitemporal duradero dentro del dispositivo');
    case 'EF003':return missing('Leyes condicionales requieren EF001 y escenario explícito; no se ejecutan sobre precio spot');
    case 'EF004':return model?.status==='experimental_model_frozen'?
      partial('Pronóstico congelado del servidor; falta evaluación futura verificable'):
      model?.status==='abstained'?{state:'abstained',reason:String(model.reason??'Abstención')+
        ' · '+Number(model.contiguous_captures??0)+' capturas continuas'}:
      missing('Sin reporte EF004 verificable asociado a la captura');
    case 'RAW_V001':return flags.f001?
      partial('F001 original calculado y trazas binary64 disponibles; ablación V001 completa no ejecutada en la APK'):
      missing('Calcular F001 para ver salidas crudas; V001 queda en el laboratorio servidor');
    default:return missing('Sin conexión en este ejecutor');
  }
}
export function resumirCapacidades({world=null,executed={},ef004=null,asOf=null}={}){
  const g=groupsOf(world);
  const archives=Number(world?.archive_manifests_count??world?.history?.length??0);
  const model=ef004??world?.ef004_report??null;
  const flags={xn01:executed.xn01===true,f001:executed.f001===true,
    m001Diary:Number.isSafeInteger(executed.m001Diary)&&executed.m001Diary>=0?
      executed.m001Diary:0};
  const items=CAPABILITY_CATALOG.map(x=>Object.freeze({...x,...base(x.key,g,world,flags,model,
    Number.isSafeInteger(archives)&&archives>0?archives:0)}));
  const counts={executed:0,observed_archive:0,partial:0,abstained:0,
    not_executed:0,not_observed:0};
  for(const x of items)counts[x.state]++;
  return {schema:CAPABILITY_SCHEMA,as_of:asOf??null,
    archive_at:world?.captured_at??world?.at??null,
    capture_sha256:world?.capture_sha256??null,
    ef004_report_at:model?.as_of??null,
    items,counts,complete_in_apk:items.every(x=>x.state==='executed'),
    world_affects_central_price:false,validated_predictive_gain:false,
    automatic_trading:false};
}
