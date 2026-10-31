/* B001 — pilot of specific officially published BIS LBS/CBS series.
 * LBS: residence/booking office, unconsolidated (may include intra-group).
 * CBS: bank-nationality consolidated, excludes intra-group.
 * These are DIFFERENT populations: never add LBS + CBS.
 *
 * Series keys come from individually documented BIS Data Portal series URLs.
 */
export const B001_SCHEMA='laplace-bis-banking-b001-v1';
export const BIS_ROOT='https://stats.bis.org';
export const BIS_SERIES=Object.freeze([
  Object.freeze({
    id:'LBS_US_RESIDENCE_CROSS_BORDER_CLAIMS',
    dataset:'WS_LBS_D_PUB',kind:'LBS',
    key:'Q.S.C.A.TO1.A.5J.A.US.A.5J.N',
    title:'Cross-border claims of banks located in the US (all counterparties)',
    unit:'USD_million',
    population:'booking_offices_in_US; includes_intragroup',
    measure:'stock',reference:'residence',
    reporting_country:'US',counterparty_country:'5J',
    currency:'TO1',
    portal:'https://data.bis.org/topics/CBS/BIS%2CWS_LBS_D_PUB%2C1.0/Q.S.C.A.TO1.A.5J.A.US.A.5J.N'
  }),
  Object.freeze({
    id:'LBS_US_NONBANK_FINANCIAL_USD',
    dataset:'WS_LBS_D_PUB',kind:'LBS',
    key:'Q.S.C.G.USD.A.5J.A.5A.F.US.N',
    title:'All reporting banks cross-border USD claims on US non-bank financial institutions',
    unit:'USD_million',population:'unconsolidated_bank_offices; includes_intragroup',
    measure:'stock',reference:'residence',
    reporting_country:'5A',counterparty_country:'US',
    currency:'USD',
    portal:'https://data.bis.org/topics/LBS/BIS%2CWS_LBS_D_PUB%2C1.0/Q.S.C.G.USD.A.5J.A.5A.F.US.N'
  }),
  Object.freeze({
    id:'CBS_ALL_REPORTERS_TOTAL_CLAIMS',
    dataset:'WS_CBS_PUB',kind:'CBS',
    key:'Q.S.5A.4R.F.C.A.A.TO1.A.5J',
    title:'Consolidated total claims of banks in all reporting jurisdictions (immediate counterparty)',
    unit:'USD_million',population:'consolidated_banking_groups; intragroup_excluded',
    measure:'stock',reference:'nationality',
    reporting_country:'5A',counterparty_country:'5J',
    currency:'TO1',
    portal:'https://data.bis.org/topics/CBS/BIS%2CWS_CBS_PUB%2C1.0/Q.S.5A.4R.F.C.A.A.TO1.A.5J'
  }),
  Object.freeze({
    id:'CBS_US_BORROWER_INTERNATIONAL_CLAIMS',
    dataset:'WS_CBS_PUB',kind:'CBS',
    key:'Q.S.5A.4R.F.I.A.A.TO1.A.US',
    title:'Consolidated international claims on US residents (immediate counterparty)',
    unit:'USD_million',population:'consolidated_banking_groups; intragroup_excluded',
    measure:'stock',reference:'nationality',
    reporting_country:'5A',counterparty_country:'US',
    currency:'TO1',
    portal:'https://data.bis.org/topics/CBS/BIS%2CWS_CBS_PUB%2C1.0/Q.S.5A.4R.F.I.A.A.TO1.A.US'
  })
]);
export const BIS_LIMITS=Object.freeze({
  maxSeries:4,maxDownloadBytes:2_000_000,maxRows:64,
  maxColumns:36,maxFieldChars:512,maxHistoryQuarters:8,
  timeoutMs:15000
});
export const BIS_BANKING_RULES=Object.freeze({
  cbs_and_lbs_additive:false,
  stock_change_equals_flow:false,
  intra_group_comparable:false,
  individual_bank_id_available:false,
  point_in_time_historical_release_verified:false,
  automatic_trading:false,prediction_inputs_enabled:false
});
