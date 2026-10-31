/* O001-B: FINRA OAuth2 Query API, lectura autorizada y acotada.
 * El archivo no contiene credenciales, cuentas privadas ni negociación.
 * No se simula acceso a la producción cuando falta la credencial pública.
 */
import {createHash} from 'node:crypto';

export const FINRA_API='https://api.finra.org';
export const FINRA_TOKEN='https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials';
export const FINRA_DATASETS=Object.freeze(['weeklySummary','blocksSummary','otcBlocksSummary']);
const MAX_BYTES=2_000_000;
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
export const hash=x=>createHash('sha256').update(x).digest('hex');

export function authConfigured({clientId=process.env.FINRA_API_CLIENT_ID,
  clientSecret=process.env.FINRA_API_CLIENT_SECRET}={}){
  return typeof clientId==='string'&&clientId.length>0&&
    typeof clientSecret==='string'&&clientSecret.length>0;
}
async function bounded(response,maxBytes=MAX_BYTES){
  need(response?.ok,'FINRA HTTP '+(response?.status??'sin_respuesta'));
  const length=Number(response.headers?.get?.('content-length')??0);
  need(!length||length<=maxBytes,'FINRA tamaño de respuesta excedido');
  const reader=response.body?.getReader?.();
  if(!reader){const str=await response.text();need(Buffer.byteLength(str)<=maxBytes,'FINRA cuerpo excesivo');return str}
  const blocks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;need(total<=maxBytes,'FINRA cuerpo excesivo');
      blocks.push(Buffer.from(value));
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  return Buffer.concat(blocks).toString('utf8');
}
export function validateQuery({dataset,limit=300,offset=0,compareFilters=[]}){
  need(FINRA_DATASETS.includes(dataset),'FINRA dataset no autorizado');
  need(Number.isInteger(limit)&&limit>=1&&limit<=1000,'FINRA límite excedido');
  need(Number.isInteger(offset)&&offset>=0&&offset<=500000,'FINRA offset inválido');
  need(Array.isArray(compareFilters)&&compareFilters.length>=1&&compareFilters.length<=6,
    'FINRA requiere filtros acotados');
  const fields=['weekStartDate','monthStartDate','tierIdentifier','summaryTypeCode',
    'issueSymbolIdentifier'];
  need(compareFilters.every(x=>x&&x.compareType==='EQUAL'&&fields.includes(x.fieldName)&&
    typeof x.fieldValue==='string'&&x.fieldValue.length>0&&x.fieldValue.length<=30),
    'FINRA filtros inválidos');
  const key=dataset==='weeklySummary'?'weekStartDate':'monthStartDate';
  need(compareFilters.some(x=>x.fieldName===key),'FINRA: falta partición temporal');
  if(dataset==='weeklySummary')need(compareFilters.some(x=>x.fieldName==='tierIdentifier')&&
    compareFilters.some(x=>x.fieldName==='summaryTypeCode')&&
    compareFilters.some(x=>x.fieldName==='issueSymbolIdentifier'),
    'FINRA semanal requiere semana, tier, resumen y símbolo');
  return {limit,offset,compareFilters};
}
export function createFinraClient({clientId=process.env.FINRA_API_CLIENT_ID,
  clientSecret=process.env.FINRA_API_CLIENT_SECRET,fetchImpl=fetch,
  now=()=>new Date().toISOString(),timeoutMs=15000}={}){
  const enabled=authConfigured({clientId,clientSecret});
  let accessToken=null,expiresAt=0,pendingToken=null;
  async function token(){
    need(enabled,'FINRA: requiere credenciales públicas válidas');
    if(accessToken&&Date.parse(now())+120000<expiresAt)return accessToken;
    if(pendingToken)return pendingToken; // OAuth single-flight para consultas concurrentes.
    pendingToken=(async()=>{
      const basic=Buffer.from(clientId+':'+clientSecret,'utf8').toString('base64');
      const response=await fetchImpl(FINRA_TOKEN,{
        method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
        headers:{Authorization:'Basic '+basic,Accept:'application/json'}
      });
      const raw=await bounded(response,65536),body=JSON.parse(raw);
      need(typeof body.access_token==='string'&&body.access_token.length>=10&&
        Number.isFinite(Number(body.expires_in))&&Number(body.expires_in)>0,
        'FINRA: respuesta OAuth inválida');
      accessToken=body.access_token;
      expiresAt=Date.parse(now())+Math.min(3600,Number(body.expires_in))*1000;
      return accessToken;
    })();
    try{return await pendingToken}finally{pendingToken=null}
  }
  async function request({dataset,limit=300,offset=0,compareFilters=[]}){
    const params=validateQuery({dataset,limit,offset,compareFilters});
    const bearer=await token();
    const url=FINRA_API+'/data/group/otcMarket/name/'+dataset;
    const response=await fetchImpl(url,{
      method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
      headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',
        Accept:'application/json','Data-Version':'1'},
      body:JSON.stringify(params)
    });
    const text=await bounded(response,MAX_BYTES),result=JSON.parse(text);
    need(Array.isArray(result)&&result.length<=limit,'FINRA: filas incompletas o no JSON');
    return {rows:result,source_url:url,received_at:now(),response_sha256:hash(text)};
  }
  return {enabled,request}; // No devuelve ni imprime las claves/tokens.
}
export async function readFinraPages(client,{dataset,compareFilters,pageSize=300,maxPages=4}={}){
  need(client?.enabled===true,'FINRA: requiere credenciales públicas válidas');
  need(Number.isInteger(pageSize)&&pageSize>=1&&pageSize<=1000,'FINRA: pageSize inválido');
  need(Number.isInteger(maxPages)&&maxPages>=1&&maxPages<=10,'FINRA: maxPages inválido');
  const all=[],receipts=[];let complete=false;
  for(let page=0;page<maxPages;page++){
    const offset=page*pageSize;
    const result=await client.request({dataset,compareFilters,offset,limit:pageSize});
    all.push(...result.rows);
    receipts.push({offset,count:result.rows.length,received_at:result.received_at,
      response_sha256:result.response_sha256,source_url:result.source_url});
    if(result.rows.length<pageSize){complete=true;break}
  }
  // No promover un fragmento de un reporte como si fuera el total.
  return {rows:complete?all:[],complete,receipts,
    fetched_rows:all.length,reason:complete?null:'pagination_limit_reached',
    source_url:FINRA_API+'/data/group/otcMarket/name/'+dataset};
}
