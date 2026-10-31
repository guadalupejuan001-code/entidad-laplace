# D001 — Derivados públicos: perpetuos, funding, interés abierto y opciones

Estado: código experimental de investigación, NO un predictor de liquidaciones,
NO un sistema de trading, y NO un inventario del mercado mundial. El motor F001
no utiliza aún estas señales para modificar su precio candidato. Se conserva
U003, U004, O001-A y O001-B.

## Submódulos implementados

| Componente | Fuente pública | Medidas | Contrato y unidades |
| --- | --- | --- | --- |
| D001-A1 | Binance USDⓈ-M futures REST | markPrice, indexPrice, mark/index basis, lastFundingRate, openInterest, último funding histórico | BTCUSDT / ETHUSDT, USDT; OI en BTC/ETH; funding ratio |
| D001-A2 | Hyperliquid Info API metaAndAssetCtxs | markPx, oraclePx, hourly funding, OI y volumen nocional diario | BTC / ETH en mercado de perpetuos USDC; OI en moneda base |
| D001-A3 | Deribit v2 API public/get_instruments + public/get_book_summary_by_currency | open_interest, mark_iv y volume_usd de opciones activas | BTC y ETH, contrato individual: strike, put/call, fecha de vencimiento, unidad base |

Los proveedores se consultan concurrentemente y se preservan errores parciales
por fuente. No se intenta acceder a balances de usuarios, cuentas privadas,
órdenes confidenciales ni carteras de contrapartes.

## Contratos y datos temporales

- Binance: se separa la tasa de funding mostrada en premiumIndex de la
  última tasa **históricamente asentada** de fundingRate. El primer valor
  no acredita un pago efectuado. Las consultas openInterest y premiumIndex
  llevan timestamp de origen; se rechazan valores futuros o con más de 5 minutos
  de antigüedad, y funding histórico de más de 14 días.
- Hyperliquid: el contexto devuelto es una lectura pública sin timestamp
  individual de cada observación. Se registra **primera recepción local** en
  lugar de inventar una hora de ejecución de mercado. El orden del array de
  contextos debe coincidir exactamente con universo de instrumentos.
- Deribit: se cruza cada instrument_name del resumen con metadata real.
  Se descartan instrumentos expirados. El OI de opciones se expresa en
  moneda base (BTC/ETH), no en USD ni como número de cuentas. IV se almacena
  con la unidad pct tal como la reporta Deribit. Se archivan strike,
  call/put, vencimiento y tamaño de contrato.
- Para limitar carga y evitar afirmaciones de cobertura global se seleccionan
  **24 opciones por activo** ordenadas por vencimiento cercano y strike.
  Esto representa una *muestra sesgada*, no la superficie completa, ni
  volatilidad agregada ni exposición gamma.
- No se suma OI entre Binance, Hyperliquid o Deribit: divergen mercados,
  unidades, multiplicadores y métodos. No se suma funding por periodos de
  diferente duración. No se estima flujo neto de capital a partir de OI.
- Cada dato conserva URL pública, timestamp conocido, unidad y hash de origen.
  Se rechazan URLs distintas a los hosts permitidos y respuestas excesivas.
  Una fuente bloqueada, geográficamente restringida o errónea queda unavailable
  y **no genera ceros ficticios**.

## Límite de las liquidaciones

D001 aún **NO ingiere liquidaciones con calidad verificada**, ni inventa
posiciones liquidadas a partir de los cambios de open interest o funding.
Algunos feeds de liquidaciones son streams parciales o agregados y pueden
no representar todos los cierres forzados. Antes de integrar liquidaciones
se necesitarán feed específico documentado, secuencias, timestamps y prueba
de cobertura/limitaciones. La métrica liquidation_feed_connected=false se
reporta expresamente.

## Uso local

En la rama D001, Node 20+:

    npm run test:derivados
    npm run derivados:d001 -- --out=registros/derivados/primera-captura.json
    npm run derivados:d001 -- --out=registros/derivados/hyper.json --groups=hyperliquid

La ruta de salida debe ser nueva: no se sobreescribe el archivo. Para incluir
D001 en la captura U003 del servidor (opcional):

    LAPLACE_D001_ENABLED=true node tools/laplace.mjs universo-global-u003

Sin esta variable, U003 no consulta derivados. Cuando existe U003 captura,
D001 agrega únicamente estados numéricos, fuentes, fallos y metadatos de
contratos. No cambia F001 ni M001, no ejecuta trading y no modifica XI/Ether.

## Validación CI

Las pruebas offline cubren:
- integridad de schema, unidad, venue, vencimiento, strike y call/put;
- timestamp no futuro y rechazo de cotización caducada;
- rechazo de respuesta inválida, URL ajena y cuerpo grande;
- disparo concurrente sin mezclar open interest de distintas bolsas;
- falla parcial explícita y ausencia de identidades privadas;
- no activación predictiva ni de trading; pruebas regresivas de O001/F001/U003.

Smoke público de CI (31 de octubre de 2026):
- Binance: HTTP 451 para seis endpoints desde ese runner de GitHub. No se
  intentó eludir restricciones ni fabricar datos.
- Hyperliquid: 10 señales observadas.
- Deribit: 144 señales obtenidas de opciones de BTC/ETH.
- Total: 154 señales, 5 fuentes exitosas y 6 no disponibles.
- No es una prueba de rendimiento temporal, rentabilidad o exactitud
  futura del motor F001.

Referencias técnicas:
- Binance API USD-M: https://developers.binance.com/en/docs/catalog
- Hyperliquid Info: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals
- Deribit options metadata:
  https://docs.deribit.com/api-reference/market-data/public-get_instruments
- Deribit book summary:
  https://docs.deribit.com/api-reference/market-data/public-get_book_summary_by_currency

## Siguiente etapa en la secuencia existente

D002 trata swaps OTC y reportes públicos de repositorios SDR; C001 aborda
flujos de ETF, B001 banca y crédito, K001 on-chain/DeFi y por último
**V001: validación predictiva final**. El trabajo no se desvía a interfaz
móvil ni trading automático sin necesidad del plan.
