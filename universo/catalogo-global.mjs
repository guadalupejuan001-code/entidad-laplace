/* U002 — catálogo inicial de cobertura mundial.
 * No significa "universo completo": define una malla amplia y extensible de
 * señales observables, con fuentes públicas y procedencia explícita.
 */
export const MARKET_SYMBOLS=Object.freeze([
  // Índices / regiones
  'SPY','QQQ','DIA','IWM','^VIX','EEM','VWO','EWJ','EWU','EWG','EWZ','FXI','INDA','EWA','EWC',
  // Divisas principales frente a USD / cruces líquidos
  'EURUSD=X','GBPUSD=X','JPY=X','AUDUSD=X','CAD=X','CHF=X','DX-Y.NYB',
  // Renta fija / crédito
  'TLT','IEF','SHY','HYG','LQD',
  // Materias primas / energía
  'GLD','SLV','USO','UNG',
  // Empresas de gran capitalización
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','JPM','XOM'
]);
export const CRYPTO_PRODUCTS=Object.freeze(['BTC-USD','ETH-USD','SOL-USD','XRP-USD','ADA-USD']);
export const MACRO_ECONOMIES=Object.freeze(['WLD','USA','CHN','JPN','DEU','IND','BRA','GBR']);
export const MACRO_INDICATORS=Object.freeze({
  'NY.GDP.MKTP.KD.ZG':{name:'gdp_growth',unit:'pct'},
  'FP.CPI.TOTL.ZG':{name:'inflation_cpi',unit:'pct'},
  'SL.UEM.TOTL.ZS':{name:'unemployment',unit:'pct'},
  'BN.CAB.XOKA.GD.ZS':{name:'current_account_gdp',unit:'pct'}
});
const LATS=Object.freeze([-60,-30,0,30,60]);
const LONS=Object.freeze([-150,-105,-60,-15,30,75,120,165]);
export const WEATHER_GRID=Object.freeze(LATS.flatMap(lat=>LONS.map(lon=>Object.freeze({
  id:'lat_'+(lat<0?'m':'p')+Math.abs(lat)+'_lon_'+(lon<0?'m':'p')+Math.abs(lon),lat,lon
}))));
export const WEATHER_VARIABLES=Object.freeze([
  {api:'temperature_2m',name:'temperature_2m',unit:'degC'},
  {api:'surface_pressure',name:'surface_pressure',unit:'hPa'},
  {api:'wind_speed_10m',name:'wind_speed_10m',unit:'kmh'},
  {api:'precipitation',name:'precipitation',unit:'mm'}
]);
export const EXPECTED_SIGNAL_BUDGET=Object.freeze({
  markets:MARKET_SYMBOLS.length*4,
  crypto:CRYPTO_PRODUCTS.length,
  macro:MACRO_ECONOMIES.length*Object.keys(MACRO_INDICATORS).length,
  weather:WEATHER_GRID.length*WEATHER_VARIABLES.length,
  seismic:11,
  geomagnetic:1
});
