# U003 — mundo económico, logístico y de información

U003 amplía la captura U002/369 sin sustituirla. El principio es: añadir
**dominios**, no números arbitrarios.

## Capas nuevas

### Mercados regionales y futuros
- Benchmarks de Japón, Hong Kong, China, Europa, Reino Unido, Alemania, Francia,
  España, India, Brasil, México, Australia, Corea, Taiwán, Singapur y Canadá.
- Series continuas de futuros de oro, plata, WTI, gas natural, cobre, maíz,
  trigo, soja, café y azúcar, distribuidas por un tercero. Sus metadatos indican
  `continuous_front_month`, vencimiento desconocido y ajuste de roll desconocido.
- Cada serie aporta cierre, retorno 5 min, retorno 30 min y volumen relativo.

Estos benchmarks siguen usando el adaptador público de mercado de B001. No se
presentan como feed directo/licenciado de cada bolsa.

### Bolsas directas
- JPX/J-Quants V2: adaptador directo implementado; solo se activa cuando existe
  `JQUANTS_API_KEY`.
- TWSE: agregado diario oficial con TAIEX, volumen, importe y operaciones;
  calendario de Taiwán convertido y sesiones sin cerrar excluidas.
- B3: muestra pública oficial de acciones con mayores movimientos. Es una
  selección con sesgo de cobertura, no todo el mercado ni un feed contratado.
- MOEX: índice IMOEX diario oficial; es una bolsa europea concreta (Rusia),
  no cobertura completa de las bolsas de Europa.
- El feed completo de B3 y Deutsche Börse sigue `requires_license`.

### Bancos centrales
- BIS WS_CBPOL: tasas de política de múltiples bancos centrales. U003 conserva
  el período de referencia y el momento en que LAPLACE conoció la observación.
- Lecturas directas adicionales: Bank of Canada V39079 (objetivo overnight),
  Banco Central do Brasil SGS 432 (meta Selic) y BCE FM.D.U2.EUR.4F.KR.DFR.LEV
  (facilidad de depósito). Se conserva su identidad; no se confunden con tasas
  efectivas de mercado ni se completa una cifra ausente con cero.

### Contratos de commodities con vencimiento
- MOEX ISS aporta contratos identificados individualmente con `contract_id`,
  `asset_code`, `last_trade_date` y precio `last`; los vencidos y cotizaciones
  futuras se excluyen. Los metadatos se conservan en `contract_metadata`.
- Los precios usan `native_quote` hasta verificar su unidad y moneda. No se
  comparan con USD ni se presentan como liquidación oficial (`settlement`).
- Esta conexión no equivale a disponer de CME/ICE o de todos sus contratos.

### Empleo
- BLS Public Data API: nóminas no agrícolas, desempleo y participación laboral.
- FRED público: solicitudes iniciales y continuadas de desempleo y fed funds.
  En particular, las solicitudes semanales dan una señal de mayor frecuencia
  que los indicadores laborales mensuales.

### Releases macro con vintages exactos
- Con `FRED_API_KEY`, U003 consulta FRED/ALFRED con `output_type=4` para conservar
  el valor y el **día del vintage inicial** de GDP, CPI, desempleo, payrolls,
  ventas minoristas y producción industrial. Esa información se conserva en
  `macro_vintages`, separada de la recepción real `known_at`.
- ALFRED no acredita una hora de publicación intradía. `publication_at=null`,
  `publication_precision=day` y `historical_intraday_eligible=false` expresan
  esa limitación. No se convierte el día del vintage en medianoche histórica.
- La clave de FRED solo viaja en la solicitud; no se conserva en URLs de
  observaciones, metadatos ni exportaciones.
- Sin clave, la fuente queda `requires_credentials`; no se inventa el vintage.

### Electricidad
- NESO Open Data: demanda nacional/transmisión de Gran Bretaña, generación
  embebida e interconectores. Se usa solo la última observación marcada como
  actual.

### Transporte marítimo
- IMF PortWatch / UN Global Platform: suma mundial de llamadas a puerto,
  llamadas cargo/tanker y estimaciones de importación/exportación. Es AIS
  agregado; no es aduana ni movimiento exacto de mercancía.

### Transporte aéreo
- OpenSky: adaptador OAuth2 implementado, pero **no se consulta sin
  autorización**. Se activa con `OPENSKY_CLIENT_ID` y
  `OPENSKY_CLIENT_SECRET`. Solo se conservan agregados regionales y no
  identificadores de aeronaves.

### Noticias geolocalizadas
- GDELT GEO 2.0: conteos y distribución hemisférica de ubicaciones asociadas a
  conflicto, protesta, comercio, energía, shipping, ciber y desastres.
- Los conteos representan geografía de cobertura/noticias, no hechos causales.
- GDACS aporta una segunda fuente primaria de alertas de desastres naturales.
  `geolocated_alerts` conserva coordenadas, país, nivel, URL y fechas del evento,
  publicación, modificación y recepción. Se deduplican episodios del mismo evento;
  se excluyen alertas inactivas, futuras o sin coordenadas válidas.
- GDACS no completa conflicto/comercio ni los otros temas de GDELT.
  `geo_news_coverage` conserva qué temas respondieron y cuáles siguen ausentes.
  Un feed vacío no genera proporciones hemisféricas ficticias.

## Vintages y tiempo conocido

Para las series ALFRED configuradas, U003 conserva el día del vintage inicial.
Sigue pendiente la historia completa de revisiones y su hora de publicación
verificada. Cada captura registra:
- `observed_at`: período/instante del fenómeno;
- `known_at`: instante en que LAPLACE recibió la observación.

El registro programado podrá conservar sucesivas capturas como vintages
punto-en-tiempo. Para una fuente que no expone timestamp de publicación, esto
produce un **primer-visto por LAPLACE**, no una publicación histórica exacta.

### Diario de revisiones macro

`universo/vintages-macro.mjs` conserva las observaciones macro de cada captura
sellada. Un cambio de valor produce una entrada nueva con su captura de origen
y hash encadenado; valores repetidos se deduplican y una reversión posterior se
registra como otra revisión. Cambiar de período de referencia no se cuenta como
revisar el período anterior. La recepción y el día de vintage del proveedor se
mantienen separados.

`macroAsOf` solo devuelve versiones incluidas en capturas anteriores al corte.
No transforma valores descargados hoy en conocimiento histórico. Los archivos
truncados, alterados o bloqueados por otro escritor no se sobrescriben. El
presupuesto de 32 MiB / 65.536 entradas exige archivar conservando datos cuando
se alcanza; no se eliminan revisiones silenciosamente.

```bash
node tools/vintages-macro.mjs CAPTURA_U003.json registros/macro CORTE_UTC
```

El ciclo U003 recupera el diario de `laplace-registro`, añade versiones nuevas
y vuelve a conservarlo. El historial prospectivo funciona con las fuentes
públicas ya consultadas; reconstruir todas las revisiones anteriores y su hora
oficial de publicación sigue requiriendo evidencia del proveedor.

## XI / Ether

El snapshot U003 usa el mismo contrato universal y la misma codificación
compacta de U002. El límite sigue siendo 4096 estados por snapshot. La prueba
de integración materializa la captura completa en Inverse Ether Memory y exige
round-trip exacto antes de aprobar.

U003 no activa estas señales en M001/XN01. Primero se debe construir historia
punto-en-tiempo y demostrar mejora fuera de muestra.

## Captura primaria con respuestas originales

```bash
node tools/fuentes-oficiales.mjs registros/fuentes-oficiales
```

Este comando realiza una consulta manual a las siete fuentes primarias nuevas,
conserva sus respuestas originales por SHA-256 y guarda un snapshot fechado
inmutable, su resumen y los metadatos de contratos. Registra cada fallo sin
inventar señales. Esas respuestas permiten reproducir los parsers y auditar
revisiones futuras. No configura una tarea periódica.

Referencias primarias:
- [Bank of Canada Valet](https://www.bankofcanada.ca/valet/docs)
- [BCB SGS 432](https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json)
- [ECB SDMX](https://data.ecb.europa.eu/help/api/overview)
- [TWSE OpenAPI](https://openapi.twse.com.tw/)
- [B3 cotizaciones públicas](https://cotacao.b3.com.br/)
- [MOEX ISS](https://iss.moex.com/iss/reference/)
- [FRED: períodos de tiempo real](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html)
- [GDACS RSS](https://www.gdacs.org/xml/rss.xml)

## Pendientes que esta revisión no cierra

- Más bolsas directas de Asia/Europa/LatAm y sus feeds completos.
- Tasas directas de más bancos centrales; BIS mensual sigue siendo agregado.
- Unidades de cotización, calendarios, roll y liquidación de más futuros, CME/ICE.
- Credenciales para JPX, ALFRED y OpenSky en una prueba real.
- Todos los vintages/revisiones macro con hora exacta de publicación.
- Ampliar electricidad, transporte y noticias por región y validar cobertura.
- Integración de esta expansión en el panel empaquetado de REVERSE y APK.

## Registro prospectivo

`universo/registro-u003.mjs` y el workflow
`universo-u003-registro.yml` producen una captura horaria. Cuando se publica en
la rama `laplace-registro`, cada commit conserva el snapshot punto-en-tiempo.
Esto permite después entrenar y probar señales U003 sin reconstruir el pasado
con datos revisados.

Secrets opcionales soportados:
- `FRED_API_KEY`: valores de publicación inicial y días de vintage ALFRED.
- `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`: tráfico aéreo.
- `JQUANTS_API_KEY`: JPX directo.
