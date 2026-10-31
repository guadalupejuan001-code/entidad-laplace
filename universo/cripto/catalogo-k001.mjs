/* K001 — public blockchain and DeFi observations; no private keys/accounts. */
export const K001_SCHEMA='laplace-blockchain-defi-k001-v1';
export const K001_URLS=Object.freeze({
  bitcoin:'https://blockstream.info/api/blocks',
  ethereum:'https://ethereum-rpc.publicnode.com',
  chainTvl:'https://api.llama.fi/v2/chains',
  stablecoins:'https://stablecoins.llama.fi/stablecoins?includePrices=true'
});
export const K001_TVL_CHAINS=Object.freeze(['Ethereum','Arbitrum','Base']);
export const K001_STABLECOINS=Object.freeze([
  Object.freeze({name:'Tether',symbol:'USDT',pegType:'peggedUSD'}),
  Object.freeze({name:'USD Coin',symbol:'USDC',pegType:'peggedUSD'})
]);
export const K001_LIMITS=Object.freeze({timeoutMs:14000,
  bitcoinBytes:200000,ethereumBytes:1200000,
  tvlBytes:1000000,stablecoinsBytes:4000000,maxSignals:40});
export const K001_RULES=Object.freeze({
  private_wallet_identity_inferred:false,
  hidden_transactions_decrypted:false,
  defi_tvl_is_net_capital_inflow:false,
  stablecoin_circulating_difference_is_verified_mint_burn:false,
  bridge_cross_chain_double_count_allowed:false,
  cross_chain_tvl_summable:false,
  data_source_aggregator_is_consensus_node:false,
  automatic_trading:false,prediction_inputs_enabled:false
});
