/* Ethereum public JSON-RPC: eth_chainId and finalized block summary ONLY.
 * No eth_getLogs, account lookups, wallet addresses or tx-data persistence.
 */
import {K001_URLS,K001_LIMITS} from './catalogo-k001.mjs';
import {k001Observation,k001Time,readPublic,source} from './red-publica.mjs';
const need=(ok,msg)=>{if(!ok)throw Error(msg)};
const HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i, HASH=/^0x[0-9a-f]{64}$/i;
export function rpcPayload(method,id){
  need(method==='eth_chainId'||method==='eth_getBlockByNumber','Ethereum metodo no admitido');
  need(id===1||id===2,'Ethereum id RPC no admitido');
  return JSON.stringify({jsonrpc:'2.0',method,
    params:method==='eth_chainId'?[]:['finalized',false],id});
}
function hex(x,key,{max=Number.MAX_SAFE_INTEGER}={}){
  need(typeof x==='string'&&HEX.test(x),key+' hex inválido');
  const n=BigInt(x);need(n>=0n&&n<=BigInt(max),key+' fuera de rango');
  return Number(n);
}
function validated(r,id){
  need(r&&typeof r==='object'&&!Array.isArray(r)&&r.id===id&&r.jsonrpc==='2.0'&&
    r.error==null&&r.result!=null,'Ethereum RPC respuesta no válida');
  return r.result;
}
export function parseEthereumFinalized({chainResponse,blockResponse},
  {knownAt,url=K001_URLS.ethereum}={}){
  need(url===K001_URLS.ethereum,'Ethereum endpoint no autorizado');
  const chain=validated(chainResponse,1);
  need(chain==='0x1','Ethereum chainId distinto de mainnet');
  const block=validated(blockResponse,2);
  need(block&&typeof block==='object'&&!Array.isArray(block)&&
    HASH.test(block.hash)&&HASH.test(block.parentHash),'Ethereum bloque finalized sin hash válido');
  const at=k001Time(knownAt),timestamp=hex(block.timestamp,'timestamp',{max:1e12}),
    observed=k001Time(new Date(timestamp*1000).toISOString());
  need(observed<=at,'Ethereum bloque con fecha futura');
  need(Date.parse(at)-Date.parse(observed)<=3*3600000,
    'Ethereum bloque finalizado demasiado antiguo');
  const height=hex(block.number,'block number',{max:1e12});
  const gasUsed=hex(block.gasUsed,'gasUsed',{max:1e12}),
    gasLimit=hex(block.gasLimit,'gasLimit',{max:1e12});
  need(gasLimit>0&&gasUsed<=gasLimit,'Ethereum gas usado excede límite');
  need(Array.isArray(block.transactions)&&block.transactions.length<=10000&&
    block.transactions.every(x=>typeof x==='string'&&HASH.test(x)),
    'Ethereum transacciones deben ser hashes públicos sin objetos de personas');
  const data=[
    ['finalized_block_height',height,'count'],
    ['finalized_block_gas_used',gasUsed,'gas'],
    ['finalized_block_gas_limit',gasLimit,'gas'],
    ['finalized_block_gas_utilization',gasUsed/gasLimit,'ratio'],
    ['finalized_block_tx_count',block.transactions.length,'count']
  ];
  if(block.baseFeePerGas!=null){
    const wei=hex(block.baseFeePerGas,'baseFeePerGas',{max:1e18});
    data.push(['finalized_base_fee_gwei',wei/1e9,'gwei']);
  }
  return {observations:data.map(([metric,value,unit])=>k001Observation({
    id:'k001-ethereum-'+metric+'-'+height,domain:'blockchain_ethereum_publica',
    metric:'ETH_'+metric,value,unit,observedAt:observed,knownAt:at,url})),
    metadata:{chain:'ethereum',chain_id:1,finalized_block_number:height,
      finalized_block_hash:block.hash,observed_at:observed,known_at:at,
      finality_basis:'rpc_finalized_tag_not_independent_consensus_verification',
      transaction_ids_retained:false,transaction_payloads_retained:false,
      account_balances_collected:false,identities_collected:false}};
}
export async function observeEthereum({fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=K001_LIMITS.timeoutMs}={}){
  const url=K001_URLS.ethereum,requests=[
    rpcPayload('eth_chainId',1),rpcPayload('eth_getBlockByNumber',2)];
  const result=await Promise.allSettled(requests.map(body=>readPublic(url,{
    method:'POST',body,fetchImpl,timeoutMs,maxBytes:K001_LIMITS.ethereumBytes})));
  try{
    need(result.every(x=>x.status==='fulfilled'),'Ethereum JSON-RPC incompleto');
    const chainResponse=result[0].value.data,blockResponse=result[1].value.data;
    const parsed=parseEthereumFinalized({chainResponse,blockResponse},{knownAt:now(),url});
    return {group:'ethereum_finalized',...parsed,sources:[source({
      name:'Ethereum-PublicNode-finalized',url,knownAt:parsed.metadata.known_at,
      sha:result[1].value.sha256,signals:parsed.observations.length,
      details:{finalized_block_number:parsed.metadata.finalized_block_number,
        chain_id:1,raw_account_data:false,tx_hashes_stored:false}
    })]};
  }catch(error){
    return {group:'ethereum_finalized',observations:[],metadata:null,sources:[source({
      name:'Ethereum-PublicNode-finalized',url,status:'unavailable',knownAt:now(),
      error:result.find(x=>x.status==='rejected')?.reason??error})]};
  }
}
