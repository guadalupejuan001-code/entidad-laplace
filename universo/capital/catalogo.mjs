/* U004 — inicio del proyecto de capital y liquidez. Estado de implementación,
 * no promesa de disponibilidad ni de mejora del predictor. */
export const CAPITAL_SCHEMA='laplace-capital-u004-v1';
export const PROJECT_MODULES=Object.freeze([
  {id:'order_l3',status:'pending',need:'órdenes individuales y eventos secuenciados; L2 existente es parcial'},
  {id:'cot',status:'implemented',need:'posiciones CFTC Futures Only, semanales, por categoría y contrato'},
  {id:'etf_flows',status:'pending',need:'creaciones/redenciones o estimaciones identificadas con NAV y acciones'},
  {id:'macro_releases',status:'partial_u003',need:'calendario, hora de publicación y valor inicial verificables'},
  {id:'treasury_curve',status:'implemented_daily',need:'DGS2, DGS10 y DGS3MO en una fecha común'},
  {id:'global_liquidity',status:'partial_us_only',need:'balances y divisas de varios bancos centrales; U004 inicia con Fed/TGA/ON RRP'},
  {id:'onchain_exchange_flows',status:'pending',need:'transferencias y etiquetas verificables de direcciones'},
  {id:'dormancy_hodl',status:'pending',need:'edades y gasto de UTXO; no inferirlas desde precios'},
  {id:'perpetual_funding_oi',status:'pending',need:'funding y open interest de contratos perpetuos identificados'},
  {id:'news_transcripts',status:'partial_u003',need:'transcripciones completas y recepción fechada; RSS no equivale a terminal'},
  {id:'supply_chain',status:'partial_u003',need:'inventarios y proveedores; ya existen puertos y electricidad'}
]);
export const COT_DATASETS=Object.freeze({
  disaggregated:{id:'72hh-3qpy',name:'Disaggregated - Futures Only',
    markets:['088691','067651','085692','002602'],
    categories:[
      ['producers','prod_merc_positions_long','prod_merc_positions_short'],
      ['swap_dealers','swap_positions_long_all','swap__positions_short_all'],
      ['managed_money','m_money_positions_long_all','m_money_positions_short_all'],
      ['other_reportables','other_rept_positions_long','other_rept_positions_short'],
      ['nonreportables','nonrept_positions_long_all','nonrept_positions_short_all']
    ]},
  financial:{id:'gpe5-46if',name:'Traders in Financial Futures - Futures Only',
    markets:['133741','099741','043602'],
    categories:[
      ['dealers','dealer_positions_long_all','dealer_positions_short_all'],
      ['asset_managers','asset_mgr_positions_long','asset_mgr_positions_short'],
      ['leveraged_funds','lev_money_positions_long','lev_money_positions_short'],
      ['other_reportables','other_rept_positions_long','other_rept_positions_short'],
      ['nonreportables','nonrept_positions_long_all','nonrept_positions_short_all']
    ]}
});
export const YIELD_SERIES=Object.freeze(['DGS2','DGS10','DGS3MO']);
export const LIQUIDITY_SERIES=Object.freeze({
  WALCL:{name:'US_fed_total_assets',factor_usd:1000000,frequency:'weekly_wednesday_level'},
  WDTGAL:{name:'US_treasury_general_account',factor_usd:1000000,frequency:'weekly_wednesday_level'},
  RRPONTSYD:{name:'US_overnight_reverse_repo',factor_usd:1000000000,frequency:'daily'}
});
