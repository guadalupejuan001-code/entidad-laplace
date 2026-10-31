/* U003 — dominios económicos/físicos adicionales.
 * U002 permanece como base estable de 369 estados; U003 agrega capas con
 * procedencia y disponibilidad separadas. Fuentes con credenciales se marcan
 * opcionales y nunca se falsifican como observadas.
 */
export const REGIONAL_MARKET_SYMBOLS=Object.freeze([
  '^N225','^HSI','000001.SS','^STOXX50E','^FTSE','^GDAXI','^FCHI','^IBEX',
  '^BSESN','^BVSP','^MXX','^AXJO','^KS11','^TWII','^STI','^GSPTSE'
]);
export const COMMODITY_FUTURES=Object.freeze([
  'GC=F','SI=F','CL=F','NG=F','HG=F','ZC=F','ZW=F','ZS=F','KC=F','SB=F'
]);
export const POLICY_AREAS=Object.freeze([
  'US','GB','XM','JP','CN','IN','BR','MX','CA','AU','KR','CH','SE','NO','NZ','ZA','TR','ID'
]);
export const BLS_SERIES=Object.freeze({
  CES0000000001:{name:'us_total_nonfarm_payrolls',unit:'thousand_persons'},
  LNS14000000:{name:'us_unemployment_rate',unit:'pct'},
  LNS11300000:{name:'us_labor_force_participation',unit:'pct'}
});
export const FRED_PUBLIC_SERIES=Object.freeze({
  ICSA:{name:'us_initial_unemployment_claims',unit:'persons'},
  CCSA:{name:'us_continued_unemployment_claims',unit:'persons'},
  DFF:{name:'us_effective_federal_funds_rate',unit:'pct'}
});
export const NEWS_TOPICS=Object.freeze([
  {id:'conflict',query:'(war OR conflict OR military OR attack)',gkg:'ARMEDCONFLICT'},
  {id:'protest',query:'(protest OR strike OR demonstration)',gkg:'PROTEST'},
  {id:'trade',query:'(trade OR tariff OR export OR import)',gkg:'TRADE'},
  {id:'energy',query:'(oil OR gas OR electricity OR energy)',gkg:'ENERGY'},
  {id:'shipping',query:'(shipping OR port OR vessel OR maritime)',gkg:'MARITIME'},
  {id:'cyber',query:'(cyberattack OR ransomware OR outage)',gkg:'CYBER_ATTACK'},
  {id:'disaster',query:'(earthquake OR flood OR wildfire OR hurricane)',gkg:'NATURAL_DISASTER'}
]);
export const PORTWATCH_FIELDS=Object.freeze([
  ['portcalls','global_port_calls','count'],
  ['portcalls_cargo','global_cargo_port_calls','count'],
  ['portcalls_tanker','global_tanker_port_calls','count'],
  ['import','global_port_import_estimate','metric_tons'],
  ['export','global_port_export_estimate','metric_tons']
]);
export const NESO_FIELDS=Object.freeze([
  ['ND','gb_national_demand','MW'],['TSD','gb_transmission_system_demand','MW'],
  ['EMBEDDED_WIND_GENERATION','gb_embedded_wind_generation','MW'],
  ['EMBEDDED_SOLAR_GENERATION','gb_embedded_solar_generation','MW'],
  ['IFA_FLOW','gb_ifa_flow','MW'],['BRITNED_FLOW','gb_britned_flow','MW'],
  ['NEMO_FLOW','gb_nemo_flow','MW'],['NSL_FLOW','gb_north_sea_link_flow','MW'],
  ['ELECLINK_FLOW','gb_eleclink_flow','MW'],['VIKING_FLOW','gb_viking_flow','MW']
]);
export const OPEN_SKY_REGIONS=Object.freeze([
  ['north_america',15,75,-170,-50],['south_america',-60,15,-90,-30],
  ['europe',35,72,-15,45],['africa',-40,35,-20,55],
  ['asia',5,75,45,150],['oceania',-50,5,100,180]
]);

export const EXACT_VINTAGE_SERIES=Object.freeze({
  GDP:{name:'us_gdp',unit:'billions_usd'},
  CPIAUCSL:{name:'us_cpi_all_urban',unit:'index'},
  UNRATE:{name:'us_unemployment_rate_vintage',unit:'pct'},
  PAYEMS:{name:'us_payrolls_vintage',unit:'thousand_persons'},
  RSAFS:{name:'us_retail_sales_vintage',unit:'millions_usd'},
  INDPRO:{name:'us_industrial_production_vintage',unit:'index'}
});
