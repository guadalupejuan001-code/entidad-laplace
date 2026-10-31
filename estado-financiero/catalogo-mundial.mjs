/* EF001: mapa de alcance deseado. NO es un listado de fuentes conectadas.
 * Cada dominio tiene politica de observacion, unidad y doble conteo.
 */
export const DOMAIN_CATALOG_VERSION='laplace-financial-world-domains-ef001-v1';
const d=(id,sector,modules,availability,semantic,notes)=>({
  domain_id:id,sector,modules,availability,semantic,notes,
  contract_version:DOMAIN_CATALOG_VERSION,connected_by_catalog:false
});
export const WORLD_DOMAIN_CATALOG=Object.freeze([
  d('mercados_precios','mercados',['I001','U002','U003'],'public','price','L1 ultimo precio y hora de recepcion, no libro completo'),
  d('mercados_acciones','mercados',['U002','U003'],'mixed','price_stock','Acciones y capitalizacion no son flujos'),
  d('mercados_renta_fija','mercados',['U003','U004'],'mixed','yield_price_stock','Tipos, precios, maturidades, credito y moneda'),
  d('mercados_divisas','mercados',['U002','U004'],'public','rate','Diferenciar par, sentido, fixing y fecha'),
  d('mercados_materias_primas','mercados',['U002','U003'],'mixed','price_future','Spot, futuro y vencimiento no son equivalentes'),
  d('mercados_L1_L2','microestructura',['U001','I001'],'mixed','orderbook','Snapshots y secuencias, no garantizan todos los trades'),
  d('mercados_L3_ordenes','microestructura',['I001'],'licensed','order_event','L3 requiere feed y permisos concretos, no inferir intencion'),
  d('mercados_operaciones','microestructura',['I001','U001'],'mixed','trade','Distinguir ejecutado, cancelado y orden pendiente'),
  d('mercados_fuera_bolsa','microestructura',['O001'],'mixed','reported_trade','FINRA ATS/Non-ATS, fechas de divulgacion y volumen separado'),
  d('derivados_futuros_perpetuos','derivados',['D001'],'mixed','open_interest_funding','OI stock no es flujo neto ni cuenta clientes'),
  d('derivados_opciones','derivados',['D001'],'mixed','option_contract','Gamma, IV, tenor, strikes y multiplicadores'),
  d('derivados_swaps_otc','derivados',['D002'],'mixed','notional_stock_transaction','CFTC semanal no equivale a transacciones SDR'),
  d('derivados_liquidaciones','derivados',['D001'],'licensed','liquidation','Solo feed completo demostrable, no inferir desde cambio en OI'),
  d('fondos_etf','capital',['C001'],'mixed','fund_flow','NAV, shares, creaciones, rescates, N-PORT y trusts distintos'),
  d('banca_locacional_BIS','banca',['B001'],'public','cross_border_stock','LBS oficinas y exposiciones transfronterizas'),
  d('banca_consolidada_BIS','banca',['B001'],'public','consolidated_stock','CBS y LBS solapan poblaciones, no sumar'),
  d('banca_mayorista','banca',['B001','U004'],'mixed','liquidity_stock','Moneda, pasivos, colateral y vencimientos'),
  d('bancos_centrales','banca',['U003','U004'],'public','policy_stock_flow','Tipos, balance, intervenciones y publicaciones'),
  d('deuda_soberana','deuda',['U003','U004'],'mixed','yield_debt_stock','Curva de rendimientos y emisiones, moneda y jurisdiccion'),
  d('deuda_privada','deuda',['U004'],'mixed','credit_stock','Primas, impagos y credito comercial'),
  d('credito_privado_no_bancario','sistema_no_bancario',['P001','B001'],'restricted','credit_exposure','Cobertura regulatoria incompleta, sin atribuir posiciones privadas'),
  d('fondos_seguros_pensiones','sistema_no_bancario',['P001','C001'],'mixed','asset_stock','Consolidaciones y ventanas de publicacion heterogeneas'),
  d('repos_mercado_monetario','liquidez',['U004','B001'],'mixed','repo_stock_flow','Colateral y liquidez no deben duplicarse'),
  d('pagos_liquidacion_clearing','infraestructura',['I001'],'restricted','settlement_event','Sin inferir sistemas privados de pagos'),
  d('infraestructura_institucional','instituciones',['P001'],'mixed','entity_relationship','CIK, 13F, EX-21, fechas y afirmaciones de fuente'),
  d('exposiciones_contrapartes','instituciones',['P001','B001','D002'],'restricted','network_exposure','Distinguir deuda, tenencia, control y garantia'),
  d('tesoreria_corporativa','instituciones',['P001','C001'],'mixed','cash_flow','Balance corporativo no equivale a transacciones'),
  d('bitcoin_cadena','cripto',['K001','I001'],'public','block_event','Bloques no indican volumen USD ni identidad real'),
  d('ethereum_cadena','cripto',['K001','I001'],'public','block_event','Logs, gas, finality y reorganizaciones'),
  d('defi_tvl_pools','cripto',['K001'],'public','tvl_stock','TVL incluye doble conteo potencial, no es flujo neto'),
  d('stablecoins','cripto',['K001'],'public','supply_stock','Supply no verifica cada mint/burn o posicion de usuario'),
  d('puentes_cadenas','cripto',['K001'],'mixed','bridge_message','Reconciliar ambas patas, no sumar cada red como capital nuevo'),
  d('intercambios_cripto_custodios','cripto',['K001','D001'],'restricted','custody_flow','Etiquetas y movimientos necesitan evidencia independiente'),
  d('flujos_privados_anonimos','limites',['K001','D002'],'restricted','unknown','La proteccion de privacidad es un limite, no dato latente recuperado'),
  d('macro_inflacion_empleo','economia_real',['U003','U004'],'public','macro_vintage','Primera fecha disponible, revisiones, inflacion y NFP'),
  d('macro_actividad_productividad','economia_real',['U003'],'public','macro_vintage','Crecimiento, PIB, consumo e industria, con retardo'),
  d('energia_electricidad','economia_real',['U003'],'public','physical_flow','Demanda y produccion energetica con unidades propias'),
  d('logistica_mar_aire','economia_real',['U003'],'mixed','transport_flow','Puertos, trafico y comercio no implican ventas realizadas'),
  d('meteorologia_desastres','causas_externas',['U002','U003'],'public','physical_event','Observables fisicos no se vuelven causalidad economica automatica'),
  d('geopolitica_notas_publicas','causas_externas',['U003','I001'],'mixed','reported_event','Narrativa, desinformacion y procedencia no equivalen a hechos probados'),
  d('registro_bitemporal','metasistema',['I001','U003'],'implemented','provenance','Diferenciar ocurrencia, publicacion, recepcion y revisiones'),
  d('red_estados_y_relaciones','metasistema',['P001','EF001'],'implemented','graph','Relacion observada, precedente e hipotesis son tipos diferentes'),
  d('leyes_y_modelos_aprendidos','metasistema',['E001','X002','EF001'],'implemented','model','Reglas versionadas XI/Ether con procedencia y limites'),
  d('estado_disperso_excepciones','metasistema',['P005','EF001'],'implemented','sparse_state','Regla, deltas y coordenadas enormes sin estado denso'),
  d('escenarios_contrafactuales','metasistema',['E004','E005','EF001'],'implemented','simulation','Futuro simulado separado del pasado observado'),
  d('prediccion_temporal','metasistema',['M001','F001','EF001'],'experimental','forecast','Horizontes, probabilidad, sellos y abstencion'),
  d('evaluacion_predictiva','metasistema',['V001','EF001'],'experimental','evaluation','Baseline, reservados, validacion as-of, no trading'),
  d('cobertura_faltantes_licencias','metasistema',['V001','EF001'],'implemented','coverage','Desconocido nunca se convierte en cero')
]);
export async function sembrarCatalogo(db){
  const rows=WORLD_DOMAIN_CATALOG.map(x=>({
    domain_id:x.domain_id,sector:x.sector,availability:x.availability,
    semantic:x.semantic,modules:x.modules,notes:x.notes,
    contract_version:x.contract_version
  }));
  const sql='INSERT INTO laplace_fin_domain_catalog '+
    '(domain_id,sector,availability,semantic,modules,notes,contract_version) '+
    'SELECT j.domain_id,j.sector,j.availability,j.semantic,j.modules,j.notes,j.contract_version '+
    'FROM jsonb_to_recordset($1::jsonb) AS j(domain_id text,sector text,'+
    'availability text,semantic text,modules jsonb,notes text,contract_version text) '+
    'ON CONFLICT(domain_id) DO NOTHING';
  await db.query(sql,[JSON.stringify(rows)]);
  return {cataloged:rows.length,measurement_or_connection_certified:false};
}
export async function consultarCatalogo(db){
  const rows=(await db.query('SELECT * FROM laplace_fin_domain_catalog ORDER BY sector,domain_id')).rows;
  return {schema:DOMAIN_CATALOG_VERSION,desired_domains:rows.length,
    domains:rows,full_world_captured:false,
    note:'Catalogo de contratos: no equivale a conexion, cobertura o conocimiento privado'};
}
