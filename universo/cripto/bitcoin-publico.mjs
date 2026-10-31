/* Bitcoin Esplora /blocks: six-confirmation heuristic, not finality proof.
 * Never downloads raw transactions, addresses or UTXOs from this source.
 */
import {K001_URLS,K001_LIMITS} from './catalogo-k001.mjs';
import {exactNumber,k001Observation,k001Time,readPublic,source} from './red-publica.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m)};
const HEX=/^[0-9a-f]{64}$/;
export function parseBitcoinBlocks(data,{knownAt,url=K001_URLS.bitcoin}={}){
  need(url===K001_URLS.bitcoin,'Bitcoin fuente ajena');
  const at=k001Time(knownAt);
  need(Array.isArray(data)&&data.length>=6&&data.length<=10,'Bitcoin seis bloques contiguos requeridos');
  const ids=new Set();
  for(let i=0;i<data.length;i++){
    const b=data[i];
    need(b&&typeof b==='object'&&HEX.test(b.id),'Bitcoin block hash inválido');
    need(!ids.has(b.id),'Bitcoin block duplicado');
    ids.add(b.id);
    need(Number.isSafeInteger(b.height)&&b.height>0,'Bitcoin altura inválida');
    need(Number.isSafeInteger(b.timestamp)&&b.timestamp>0,'Bitcoin timestamp inválido');
    if(i>0){
      need(data[i-1].height===b.height+1,'Bitcoin bloques no contiguos');
      if(typeof data[i-1].previousblockhash==='string')
        need(data[i-1].previousblockhash===b.id,'Bitcoin hashes de parent inconsistentes');
    }
  }
  const b=data[5],ts=k001Time(new Date(b.timestamp*1000).toISOString());
  need(ts<=at,'Bitcoin bloque fechado en futuro');
  need(Date.parse(at)-Date.parse(ts)<=7*86400000,'Bitcoin fuente demasiado retrasada');
  need(Date.parse(at)-data[0].timestamp*1000<=4*3600000,
    'Bitcoin tip demasiado retrasado');
  const num=[
    ['confirmed_block_height',b.height,'count'],
    ['confirmed_block_tx_count',exactNumber(b.tx_count,'tx_count',{max:200000}),'count'],
    ['confirmed_block_size_bytes',exactNumber(b.size,'size',{max:50000000}),'bytes'],
    ['confirmed_block_weight_wu',exactNumber(b.weight,'weight',{max:200000000}),'wu']
  ];
  if(b.difficulty!==undefined&&b.difficulty!==null)
    num.push(['confirmed_block_difficulty',exactNumber(b.difficulty,'difficulty',{max:1e20}),'ratio']);
  const observations=num.map(([metric,value,unit])=>k001Observation({
    id:'k001-bitcoin-'+metric+'-'+b.height,domain:'blockchain_bitcoin_publica',
    metric:'BTC_'+metric,value,unit,observedAt:ts,knownAt:at,url}));
  return {observations,
    metadata:{chain:'bitcoin',block_height:b.height,block_hash:b.id,
      observed_at:ts,known_at:at,confirmations_at_capture:6,
      status:'six_confirmations_not_absolute_finality',tip_height:data[0].height,
      individual_transactions_collected:false,utxos_collected:false,
      identities_collected:false,reorg_possible:true}};
}
export async function observeBitcoin({fetchImpl=fetch,now=()=>new Date().toISOString(),
  timeoutMs=K001_LIMITS.timeoutMs}={}){
  const url=K001_URLS.bitcoin;
  try{
    const response=await readPublic(url,{fetchImpl,timeoutMs,maxBytes:K001_LIMITS.bitcoinBytes});
    const data=parseBitcoinBlocks(response.data,{knownAt:now(),url});
    return {group:'bitcoin_consensus',...data,sources:[source({
      name:'Blockstream-Esplora-bitcoin-blocks',url,knownAt:data.metadata.known_at,
      sha:response.sha256,signals:data.observations.length,
      details:{confirmations:6,block_height:data.metadata.block_height,has_private_data:false}
    })]};
  }catch(error){
    return {group:'bitcoin_consensus',observations:[],metadata:null,sources:[source({
      name:'Blockstream-Esplora-bitcoin-blocks',url,status:'unavailable',
      knownAt:now(),error})]};
  }
}
