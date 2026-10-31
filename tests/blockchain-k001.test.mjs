import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {K001_SCHEMA,K001_URLS,K001_RULES,K001_LIMITS} from '../universo/cripto/catalogo-k001.mjs';
import {readPublic} from '../universo/cripto/red-publica.mjs';
import {parseBitcoinBlocks,observeBitcoin} from '../universo/cripto/bitcoin-publico.mjs';
import {rpcPayload,parseEthereumFinalized,observeEthereum} from '../universo/cripto/ethereum-publico.mjs';
import {parseChainTvl,parseStablecoinSupply,observeDefiLlama} from '../universo/cripto/defi-publico.mjs';
import {reconcileBridgePairs} from '../universo/cripto/puentes.mjs';
import {observeBlockchainDeFi} from '../universo/cripto/global-k001.mjs';
import {universeSnapshot} from '../universo/estados.mjs';

const NOW='2026-10-31T08:00:00.000Z',now=()=>NOW,ms=Date.parse(NOW);
const hash=n=>n.toString(16).padStart(64,'0');
const btcBlocks=Array.from({length:8},(_,i)=>({
  id:hash(i+1),height:930000-i,timestamp:Math.floor(ms/1000)-i*600-90,
  previousblockhash:hash(i+2),tx_count:2000-i*10,
  size:1700000-i*100,weight:3990000-i*1000,difficulty:12345678901234
}));
const ethBlock={number:'0x19abcde',hash:'0x'+hash(22),parentHash:'0x'+hash(21),
  timestamp:'0x'+(Math.floor(ms/1000)-20*60).toString(16),
  gasUsed:'0x1c9c380',gasLimit:'0x3b9aca0',
  transactions:['0x'+hash(44),'0x'+hash(45)],baseFeePerGas:'0x3b9aca00'};
const ethResponses={
  chainResponse:{jsonrpc:'2.0',id:1,result:'0x1'},
  blockResponse:{jsonrpc:'2.0',id:2,result:ethBlock}
};
const tvl=[{name:'Ethereum',tvl:65000000000,chainId:1},
  {name:'Arbitrum',tvl:4100000000,chainId:42161},
  {name:'Base',tvl:4500000000,chainId:8453},
  {name:'Solana',tvl:12500000000,chainId:null}];
const stables={peggedAssets:[
  {id:'1',name:'Tether',symbol:'USDT',pegType:'peggedUSD',
    circulating:{peggedUSD:185000000000}},
  {id:'2',name:'USD Coin',symbol:'USDC',pegType:'peggedUSD',
    circulating:{peggedUSD:73000000000}},
  {id:'999',name:'Wrapped Tether',symbol:'USDT',pegType:'peggedUSD',
    circulating:{peggedUSD:50000000}}
]};
const json=x=>new Response(JSON.stringify(x),{status:200,
  headers:{'Content-Type':'application/json'}});
test('K001 01: sólo endpoints públicos y políticas de no doble conteo',()=>{
  assert.equal(Object.keys(K001_URLS).length,4);
  assert.equal(K001_RULES.cross_chain_tvl_summable,false);
  assert.equal(K001_RULES.private_wallet_identity_inferred,false);
  assert.equal(K001_RULES.bridge_cross_chain_double_count_allowed,false);
  assert.equal(K001_RULES.automatic_trading,false);
});
test('K001 02: prohibición de endpoints privados y métodos de cuentas',async()=>{
  await assert.rejects(()=>readPublic('https://evil.example/wallet'),/URL no admitida/);
  await assert.rejects(()=>readPublic(K001_URLS.bitcoin,{method:'POST',body:'{}'}),/solo GET/);
  await assert.rejects(()=>readPublic(K001_URLS.ethereum,{method:'POST',body:JSON.stringify({
    jsonrpc:'2.0',method:'eth_getBalance',params:['0x0','latest'],id:1})}),/privado/);
  await assert.rejects(()=>readPublic(K001_URLS.ethereum),/Ethereum solo/);
});
test('K001 03: Bitcoin seis confirmaciones como heurística, no finality garantizada',()=>{
  const x=parseBitcoinBlocks(btcBlocks,{knownAt:NOW});
  assert.equal(x.observations.length,5);
  assert.equal(x.metadata.confirmations_at_capture,6);
  assert.equal(x.metadata.block_height,929995);
  assert.equal(x.metadata.reorg_possible,true);
  assert.equal(x.observations.find(x=>x.variable==='K001_BTC_confirmed_block_tx_count').value,1950);
  assert.equal(x.observations.find(x=>x.variable==='K001_BTC_confirmed_block_size_bytes').unit,'bytes');
  assert.ok(x.observations.every(o=>o.known_at===NOW));
});
test('K001 04: Bitcoin hashes, alturas y fecha tienen que ser coherentes',()=>{
  assert.throws(()=>parseBitcoinBlocks(btcBlocks.slice(0,5),{knownAt:NOW}),/seis/);
  assert.throws(()=>parseBitcoinBlocks(btcBlocks.map((x,i)=>i===3?{...x,height:20}:x),{
    knownAt:NOW}),/contiguos/);
  assert.throws(()=>parseBitcoinBlocks(btcBlocks.map((x,i)=>i===0?{...x,id:'broken'}:x),{
    knownAt:NOW}),/hash/);
  assert.throws(()=>parseBitcoinBlocks(btcBlocks.map((x,i)=>i===0?{...x,previousblockhash:hash(99)}:x),{
    knownAt:NOW}),/parent/);
});
test('K001 05: Bitcoin HTTP fallido no representa cero transacciones',async()=>{
  const r=await observeBitcoin({now,fetchImpl:async()=>new Response('denied',{status:403})});
  assert.equal(r.observations.length,0);
  assert.equal(r.sources[0].status,'unavailable');
  assert.equal(r.sources[0].missing_is_zero,false);
});
test('K001 06: Ethereum finalizado reporta gas y número de transacciones, no IDs personales',()=>{
  const x=parseEthereumFinalized(ethResponses,{knownAt:NOW});
  assert.equal(x.observations.length,6);
  assert.equal(x.observations.find(x=>x.variable==='K001_ETH_finalized_block_tx_count').value,2);
  assert.equal(x.observations.find(x=>x.variable==='K001_ETH_finalized_base_fee_gwei').value,1);
  assert.equal(x.metadata.finality_basis,'rpc_finalized_tag_not_independent_consensus_verification');
  assert.ok(!JSON.stringify(x).includes(hash(44)));
});
test('K001 07: Ethereum rechaza red ajena, respuesta RPC errónea y datos no finalizados',()=>{
  assert.throws(()=>parseEthereumFinalized({...ethResponses,chainResponse:{
    jsonrpc:'2.0',id:1,result:'0x89'}},{knownAt:NOW}),/mainnet/);
  assert.throws(()=>parseEthereumFinalized({...ethResponses,blockResponse:{
    jsonrpc:'2.0',id:2,result:{...ethBlock,transactions:[{from:'0xprivate'}]}}},{
    knownAt:NOW}),/hashes/);
  assert.throws(()=>parseEthereumFinalized({...ethResponses,blockResponse:{
    jsonrpc:'2.0',id:2,error:{code:2,message:'bad'}}},{knownAt:NOW}),/RPC/);
});
test('K001 08: Ethereum consulta sólo eth_chainId y eth_getBlockByNumber finalized',async()=>{
  const seen=[];
  const r=await observeEthereum({now,fetchImpl:async (url,opt)=>{
    assert.equal(url,K001_URLS.ethereum);
    const body=JSON.parse(opt.body);seen.push(body);
    return json(body.method==='eth_chainId'?ethResponses.chainResponse:ethResponses.blockResponse);
  }});
  assert.equal(seen.length,2);
  assert.equal(seen[0].method,'eth_chainId');
  assert.deepEqual(seen[1].params,['finalized',false]);
  assert.equal(r.observations.length,6);
  assert.equal(r.sources[0].status,'observed');
});
test('K001 09: Ethereum respuesta parcial falla sin completar bloques inventados',async()=>{
  const r=await observeEthereum({now,fetchImpl:async (url,opt)=>{
    const request=JSON.parse(opt.body);
    return request.method==='eth_chainId'?json(ethResponses.chainResponse):
      new Response('denied',{status:503});
  }});
  assert.equal(r.observations.length,0);
  assert.equal(r.sources[0].status,'unavailable');
});
test('K001 10: TVL de 3 cadenas en USD, sin sumarlo como flujo de capital',()=>{
  const r=parseChainTvl(tvl,{knownAt:NOW});
  assert.equal(r.observations.length,3);
  assert.equal(r.observations.find(o=>o.variable==='K001_DeFi_Ethereum_tvl_usd').value,65000000000);
  assert.equal(r.metadata.sum_across_chains_is_not_unique_capital,true);
  assert.equal(r.metadata.price_changes_not_net_deposits,true);
});
test('K001 11: falta de una cadena no se sustituye por cero ni inventa totales',()=>{
  const r=parseChainTvl(tvl.filter(x=>x.name!=='Base'),{knownAt:NOW});
  assert.equal(r.observations.length,2);
  assert.deepEqual(r.metadata.chains_missing,['Base']);
  assert.throws(()=>parseChainTvl([...tvl,tvl[0]],{knownAt:NOW}),/duplicada/);
});
test('K001 12: suministro USDT/USDC filtra imitaciones y no implica emisiones netas',()=>{
  const r=parseStablecoinSupply(stables,{knownAt:NOW});
  assert.equal(r.observations.length,2);
  assert.equal(r.observations.find(o=>o.variable==='K001_stablecoin_USDT_circulating_tokens').value,185000000000);
  assert.equal(r.observations.find(o=>o.variable==='K001_stablecoin_USDC_circulating_tokens').unit,'tokens');
  assert.equal(r.metadata.circulating_supply_not_verified_mint_or_burn,true);
  assert.equal(r.metadata.interchain_bridge_supply_not_additional_global_supply,true);
});
test('K001 13: stablecoins no reemplaza ausencias con cero, rechaza duplicados',()=>{
  const r=parseStablecoinSupply({peggedAssets:stables.peggedAssets.filter(x=>x.symbol==='USDT')},
    {knownAt:NOW});
  assert.deepEqual(r.metadata.tokens_missing,['USDC']);
  assert.equal(r.observations.length,1);
  assert.throws(()=>parseStablecoinSupply({peggedAssets:[stables.peggedAssets[0],
    stables.peggedAssets[0]]},{knownAt:NOW}),/duplicate/);
});
test('K001 14: DeFiLlama falla parcialmente sin perder un grupo válido',async()=>{
  const r=await observeDefiLlama({now,fetchImpl:async url=>url===K001_URLS.chainTvl?
    json(tvl):new Response('error',{status:429})});
  assert.equal(r.observations.length,3);
  assert.equal(r.sources[0].status,'observed');
  assert.equal(r.sources[1].status,'unavailable');
});
const event=(overrides={})=>({
  message_id:'bridge-msg-123456',asset:'USDC',chain:'ethereum',decimals:6,
  event:'lock',finality:'provider_finalized',quantity_raw:'1000000',
  observed_at:'2026-10-30T12:00:00.000Z',known_at:NOW,
  source:'https://example.com/public-bridge-logs',...overrides
});
test('K001 15: puente lock+mint se reconoce una sola vez, no crea dinero global',()=>{
  const x=reconcileBridgePairs([event(),event({event:'mint',chain:'base'})],{cutoff:NOW});
  assert.equal(x.matched_messages,1);
  assert.equal(x.paired_leg_count,2);
  assert.equal(x.inferred_capital_creation,0);
  assert.equal(x.paired[0].source_chain,'ethereum');
  assert.equal(x.paired[0].destination_chain,'base');
  assert.equal(x.live_bridge_feed_connected,false);
  assert.equal(x.paired[0].proof_verified_by_k001,false);
});
test('K001 16: bridge sin pareja o cantidad distinta no se promociona a flujo',()=>{
  const x=reconcileBridgePairs([event()],{cutoff:NOW});
  assert.equal(x.paired.length,0);
  assert.equal(x.pending.length,1);
  const y=reconcileBridgePairs([event(),event({event:'mint',chain:'base',quantity_raw:'999999'})],
    {cutoff:NOW});
  assert.equal(y.paired.length,0);
  assert.throws(()=>reconcileBridgePairs([event(),event()],{cutoff:NOW}),/duplicate/);
});
test('K001 17: bridge rechaza direcciones, saldos e información aún no disponible',()=>{
  assert.throws(()=>reconcileBridgePairs([event({address:'0xdead'})],{cutoff:NOW}),/confidential/);
  assert.throws(()=>reconcileBridgePairs([event({known_at:'2026-11-01T00:00:00.000Z'})],
    {cutoff:NOW}),/unknown/);
});
test('K001 18: las cuatro fuentes externas arrancan concurrentemente, sin sumar TVL',async()=>{
  const calls=[];
  const fetchImpl=async(url,opt)=>{
    calls.push({url,method:opt.method,body:opt.body??null});
    if(url===K001_URLS.bitcoin)return json(btcBlocks);
    if(url===K001_URLS.ethereum){
      const req=JSON.parse(opt.body);
      return json(req.method==='eth_chainId'?ethResponses.chainResponse:ethResponses.blockResponse);
    }
    if(url===K001_URLS.chainTvl)return json(tvl);
    if(url===K001_URLS.stablecoins)return json(stables);
    throw Error('Unexpected URL '+url);
  };
  const r=await observeBlockchainDeFi({now,fetchImpl});
  assert.equal(calls.length,5);
  assert.equal(r.schema,K001_SCHEMA);
  assert.equal(r.coverage.groups.length,3);
  assert.equal(r.coverage.observed_sources,4);
  assert.equal(r.coverage.missing_sources,0);
  assert.equal(r.observations.length,16);
  assert.equal(r.rules.cross_chain_tvl_summable,false);
  assert.equal(r.automatic_trading,false);
  assert.equal(r.prediction_inputs_enabled,false);
});
test('K001 19: filtración temporal rechazada antes del conocimiento',async()=>{
  const r=await observeBlockchainDeFi({now,groups:['defi'],
    fetchImpl:async url=>json(url===K001_URLS.chainTvl?tvl:stables)});
  assert.equal(r.observations.length,5);
  assert.equal(universeSnapshot(r.observations,{cutoff:'2026-10-31T07:59:59.000Z'}).known_states,0);
  assert.equal(universeSnapshot(r.observations,{cutoff:NOW}).known_states,5);
});
test('K001 20: U003 consulta K001 sólo cuando se habilita, F001 no recibe datos privados',()=>{
  const s=readFileSync(new URL('../universo/global-u003.mjs',import.meta.url),'utf8');
  assert.match(s,/LAPLACE_K001_ENABLED==='true'/);
  assert.match(s,/if\(includeBlockchainDeFi\)/);
  assert.throws(()=>rpcPayload('eth_getBalance',1),/no admitido/);
});
