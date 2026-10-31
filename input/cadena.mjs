import {request,sourceHeaders,websocket,delay} from './red.mjs';
import {exactJSON,need,safeInteger,units,sha,rawRecord,MAX_BODY} from './contrato.mjs';

export function filterTransfers(transfers,{minimum_raw={},labels=[],known_at=new Date().toISOString(),event_time=known_at}={}){
  const registry=new Map(labels.filter(x=>x.known_at<=known_at&&(!x.valid_from||x.valid_from<=event_time)&&(!x.valid_until||event_time<x.valid_until))
    .map(x=>[x.asset+'|'+x.address,x]));
  const selected=[],net=new Map();
  for(const t of transfers){
    const amount=BigInt(t.amount_raw),minimum=BigInt(minimum_raw[t.asset]??'0');
    const from=registry.get(t.asset+'|'+t.from),to=registry.get(t.asset+'|'+t.to);
    const internal=Boolean(from&&to&&from.platform===to.platform);
    if(amount>=minimum)selected.push({...t,from_label:from??null,to_label:to??null,internal,
      attribution_verified:false,price_effect:null});
    // Unknown origins (including Bitcoin change) do not become verified inflows.
    if(internal||!t.from||!from||!to)continue;
    if(from.kind==='exchange'&&to.kind!=='exchange')net.set(t.asset,(net.get(t.asset)??0n)-amount);
    if(to.kind==='exchange'&&from.kind!=='exchange')net.set(t.asset,(net.get(t.asset)??0n)+amount);
  }
  return {transfers:selected,netflows:[...net].map(([asset,value])=>({asset,amount_raw:value.toString(),basis:'versioned_public_labels',verified_identity:false})),
    exchange_transfer_is_sale:false};
}
export class RPC{
  constructor(source,{requestImpl=request}={}){this.source=source;this.requestImpl=requestImpl;this.id=0}
  async call(method,params=[]){
    const id=String(++this.id),res=await this.requestImpl(this.source.rpc_url??this.source.url,{method:'POST',headers:{'Content-Type':'application/json',...sourceHeaders(this.source)},
      body:JSON.stringify({jsonrpc:'2.0',id,method,params}),maxBytes:32*1024*1024,timeoutMs:30000});
    const p=exactJSON(res.bytes.toString());need(p.id===id,'RPC response ID mismatch');need(!p.error,'RPC returned '+String(p.error?.code??'error'));
    return {result:p.result,response_sha256:sha(res.bytes)};
  }
}
const hexHeight=n=>'0x'+n.toString(16);
const parseHex=x=>{need(typeof x==='string'&&/^0x[0-9a-f]+$/i.test(x),'invalid hex integer');const n=Number(BigInt(x));need(Number.isSafeInteger(n),'block height exceeds range');return n};
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const addressTopic=t=>'0x'+t.slice(-40).toLowerCase();
export class ChainConnector{
  constructor(source,journal,{rpc=new RPC(source)}={}){this.source=source;this.journal=journal;this.rpc=rpc;this.key='chain_'+sha(source.id).slice(0,24)}
  async open(){
    const cp=await this.journal.cursor(this.key);this.state=cp.cursor??{headers:[],generation:0,next_height:this.source.from_height};
    need(Number.isSafeInteger(this.state.next_height)&&this.state.next_height>=0,'set an explicit chain from_height');
    // Recover the crash window between fsynced block admission and checkpoint.
    for(const record of this.journal.records(Math.max(cp.seq,this.journal.archivedThrough)))if(record.raw?.source_id===this.source.id&&record.raw.metadata?.chain_cursor)this.state=record.raw.metadata.chain_cursor;
    return this;
  }
  async height(){const r=await this.rpc.call(this.source.network==='bitcoin'?'getblockcount':'eth_blockNumber');return this.source.network==='bitcoin'?safeInteger(r.result):parseHex(r.result)}
  async hashAt(height){
    if(this.source.network==='bitcoin')return (await this.rpc.call('getblockhash',[height])).result;
    const b=(await this.rpc.call('eth_getBlockByNumber',[hexHeight(height),false])).result;need(b,'block missing');return b.hash;
  }
  async blockAt(height){
    if(this.source.network==='bitcoin'){
      const hash=await this.hashAt(height),r=await this.rpc.call('getblock',[hash,2]),b=r.result,transfers=[];
      need(b.hash===hash&&safeInteger(b.height)===height,'Bitcoin block mismatch');
      for(const tx of b.tx??[])for(const v of tx.vout??[]){
        const to=v.scriptPubKey?.address;if(!to)continue;
        transfers.push({id:tx.txid+':'+v.n,asset:'BTC',from:null,to,amount_raw:units(v.value,8).toString(),
          scale:8,classification:'output_not_net_payment',tx_hash:tx.txid});
      }
      return {height,hash,parent_hash:b.previousblockhash??'0'.repeat(64),time:new Date(safeInteger(b.time)*1000).toISOString(),transfers,
        rpc_response_sha256:r.response_sha256,coverage:'addressed_outputs_only_change_and_internal_origins_unresolved'};
    }
    const r=await this.rpc.call('eth_getBlockByNumber',[hexHeight(height),true]),b=r.result;need(b&&parseHex(b.number)===height,'Ethereum block missing/mismatch');
    const transfers=[];
    for(const tx of b.transactions??[])if(tx.to&&BigInt(tx.value)>0n)transfers.push({id:tx.hash+':native',asset:'ETH',from:tx.from.toLowerCase(),to:tx.to.toLowerCase(),
      amount_raw:BigInt(tx.value).toString(),scale:18,classification:'direct_native_transfer',tx_hash:tx.hash});
    const tokens=this.source.tokens??[];let logs_hash=null;
    if(tokens.length){
      const logs=await this.rpc.call('eth_getLogs',[{blockHash:b.hash,address:tokens.map(t=>t.address),topics:[TRANSFER]}]);logs_hash=logs.response_sha256;
      for(const log of logs.result){
        need(log.blockHash===b.hash,'log from another block');
        // ERC721 may share the event signature; do not interpret it as fungible volume.
        if(log.removed||log.topics?.length!==3||!/^0x[0-9a-f]{64}$/i.test(log.data))continue;
        const token=tokens.find(t=>t.address.toLowerCase()===log.address.toLowerCase());need(token,'unconfigured token');
        transfers.push({id:log.transactionHash+':'+log.logIndex,asset:token.asset,from:addressTopic(log.topics[1]),to:addressTopic(log.topics[2]),
          amount_raw:BigInt(log.data).toString(),scale:token.decimals??null,classification:'erc20_log',tx_hash:log.transactionHash,log_index:log.logIndex});
      }
    }
    return {height,hash:b.hash,parent_hash:b.parentHash,time:new Date(parseHex(b.timestamp)*1000).toISOString(),transfers,
      rpc_response_sha256:r.response_sha256,logs_response_sha256:logs_hash,coverage:'direct_native_and_configured_erc20_logs_no_internal_traces'};
  }
  async transition(operation,block,next){
    const received_at=new Date().toISOString(),flow=operation==='connect'?filterTransfers(block.transfers??[],{...this.source,known_at:received_at,event_time:block.time??received_at}):{transfers:[],netflows:[]};
    next.generation=this.state.generation+1;
    const body={network:this.source.network,operation,...block,...flow,capture_kind:'rpc_projection',
      finality_basis:this.source.network==='bitcoin'?'confirmation_depth_probabilistic':'rpc_finalized_tag',generation:next.generation};
    if(Buffer.byteLength(JSON.stringify(body))>MAX_BODY){
      need(operation==='connect','oversized chain control record');
      const chunks=[];
      for(let at=0;at<flow.transfers.length;at+=250){
        const native_id=this.source.network+':'+next.generation+':part:'+chunks.length+':'+block.hash;
        const part={...body,operation:'connect_part',transfers:flow.transfers.slice(at,at+250),netflows:[],part_index:chunks.length};
        const raw=rawRecord({...this.source,adapter:'chain_part'},JSON.stringify(part),{received_at,native_id,source_sequence:String(next.generation)});
        await this.journal.append({raw});chunks.push(native_id);
      }
      body.transfers=[];body.transfer_chunks=chunks;body.selected_transfer_count=flow.transfers.length;
      // Canonical projection advances only after all preceding chunks are durable.
    }
    const raw=rawRecord({...this.source,adapter:'chain_block'},JSON.stringify(body),{received_at,native_id:this.source.network+':'+next.generation+':'+operation+':'+block.hash,
      source_sequence:String(next.generation),metadata:{chain_cursor:next}});
    const admitted=await this.journal.append({raw});this.state=next;await this.journal.checkpoint(this.key,{seq:admitted.seq,cursor:next});return admitted;
  }
  async poll(){
    need(!this.state.requires_resync,'chain isolated; explicit ancestor resynchronization required');
    const latest=await this.height(),maxReorg=this.source.max_reorg??32;need(Number.isInteger(maxReorg)&&maxReorg>=2&&maxReorg<=64,'reorg window must be 2..64');let retractions=0;
    while(this.state.headers.length){
      const tip=this.state.headers.at(-1);if(tip.height<=latest&&await this.hashAt(tip.height)===tip.hash)break;
      need(!(tip.finalized&&this.source.network!=='bitcoin'),'finalized chain conflict; isolate and inspect node');
      need(++retractions<=maxReorg,'reorganization exceeds recovery window');
      await this.transition('disconnect',tip,{...this.state,headers:this.state.headers.slice(0,-1),next_height:tip.height});
    }
    if(!this.state.headers.length&&retractions){
      this.state.requires_resync=true;await this.journal.checkpoint(this.key,{seq:this.journal.durableSeq,cursor:this.state});
      throw Error('reorganization crossed retained ancestor; explicit resynchronization required');
    }
    let count=0;
    for(let h=this.state.next_height;h<=latest&&count<(this.source.max_blocks_per_poll??8);h++,count++){
      const b=await this.blockAt(h),tip=this.state.headers.at(-1);need(!tip||b.parent_hash===tip.hash,'parent mismatch; retry canonical reconciliation');
      const header={height:b.height,hash:b.hash,parent_hash:b.parent_hash,time:b.time,finalized:false};
      await this.transition('connect',b,{...this.state,next_height:h+1,headers:[...this.state.headers,header].slice(-maxReorg)});
    }
    let finalized;
    if(this.source.network==='bitcoin')finalized=latest-(this.source.confirmations??6)+1;
    else{const b=(await this.rpc.call('eth_getBlockByNumber',['finalized',false])).result;need(b,'finalized tag unavailable');finalized=parseHex(b.number)}
    for(const header of this.state.headers.filter(h=>!h.finalized&&h.height<=finalized)){
      await this.transition('finalize',header,{...this.state,headers:this.state.headers.map(h=>h.hash===header.hash?{...h,finalized:true}:h)});
    }
    return {connected:count,retracted:retractions,tip:this.state.headers.at(-1)?.height??null};
  }
  async listen({signal}={}){
    if(this.source.network==='bitcoin'){
      const info=(await this.rpc.call('getblockchaininfo')).result;need(info.chain===(this.source.chain??'main'),'Bitcoin network identity mismatch');
    }else{
      need(this.source.network==='ethereum','unsupported blockchain network');
      const chain=(await this.rpc.call('eth_chainId')).result;need(BigInt(chain)===BigInt(this.source.chain_id??'1'),'Ethereum chain ID mismatch');
    }
    // Subscription is a wakeup hint. RPC/canonical checkpoints remain recovery authority.
    if(!this.source.ws_url){while(!signal?.aborted){await this.poll();await delay(this.source.interval_ms??5000,signal)}return}
    await this.poll();await new Promise((resolve,reject)=>{
      const ws=websocket(this.source.ws_url);let busy=false,pending=false,last=Date.now();
      const tick=async()=>{if(busy){pending=true;return}busy=true;try{do{pending=false;await this.poll()}while(pending&&!signal?.aborted)}catch(e){ws.terminate();reject(e)}finally{busy=false}};
      const timer=setInterval(()=>{if(Date.now()-last>60000){ws.terminate();return}void tick()},this.source.interval_ms??5000);
      const abort=()=>ws.terminate();signal?.addEventListener('abort',abort,{once:true});
      ws.on('open',()=>ws.send(JSON.stringify({jsonrpc:'2.0',id:'heads',method:'eth_subscribe',params:['newHeads']})));
      ws.on('message',body=>{last=Date.now();let p;try{p=exactJSON(body.toString())}catch{ws.terminate();return}if(p.error){ws.terminate();return}if(p.method==='eth_subscription')void tick()});
      ws.on('error',reject);ws.on('close',()=>{clearInterval(timer);signal?.removeEventListener('abort',abort);signal?.aborted?resolve():reject(Error('chain WebSocket disconnected; RPC backfill required'))});
    });
  }
}
