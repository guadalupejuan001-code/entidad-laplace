/* C001: fixed, verified SEC fund-identity pilot. Form N-PORT is not a
 * universal ETF flow feed. IBIT uses 10-Q/10-K and is NOT queried via N-PORT.
 */
export const NPORT_FUNDS=Object.freeze([
  Object.freeze({id:'SPY',cik:'0000884394',series_id:null,
    label:'SPDR S&P 500 ETF Trust',scope:'single-series-registrant',currency:'USD'}),
  Object.freeze({id:'SPYM',cik:'0001064642',series_id:'S000006983',
    label:'SPDR Portfolio S&P 500 ETF',scope:'registered-series',currency:'USD'})
]);
export const TRUSTS_NOT_COVERED_BY_NPORT=Object.freeze(['IBIT']);
export const C001_SCHEMA='laplace-etf-sec-nport-c001-v1';
export const C001_SOURCE='sec-edgar-public-nport-p';
export const C001_LIMITS=Object.freeze({maxFunds:2,maxXmlBytes:4_000_000,
  maxSubmissionsBytes:4_000_000,maxIndexBytes:256_000,maxRecentFilings:3000});
