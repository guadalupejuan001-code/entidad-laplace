# U004 — proyecto de capital, posicionamiento y liquidez

Objetivo: ampliar las fuentes de Laplace para investigar flujos financieros y
su relación temporal con precios. La primera fase instala tres bloques de
recopilación en paralelo. Esto no acredita una mejora del predictor.

## Primera fase implementada

| Bloque | Fuente | Variables | Frecuencia y alcance |
| --- | --- | --- | --- |
| Posicionamiento COT | CFTC Disaggregated Futures Only / TFF Futures Only | Open interest semanal; posiciones largas, cortas y netas por categoría y mercado | Semanal, fecha de referencia distinta de recepción |
| Curva Treasury | FRED DGS2, DGS10, DGS3MO | Tres rendimientos; 10Y−2Y y 10Y−3M en puntos básicos | Diario; tres valores de la misma fecha |
| Componentes de liquidez de EE. UU. | FRED WALCL, WDTGAL, RRPONTSYD | Balance Fed, TGA, repos inversos y proxy derivado | Alineación en la misma fecha de referencia |

El catálogo inicial COT cubre oro, WTI, cobre, maíz, Bitcoin CME, euro FX y
Treasury de diez años. Son siete mercados y dos clasificaciones: managed money
en Disaggregated y leveraged funds/asset managers en TFF permanecen distintos.
Los contratos no se suman entre mercados como si tuvieran el mismo nominal.
Open interest COT es semanal; no equivale a OI de perpetuos en tiempo real.

El proxy exploratorio en dólares es:

`WALCL × 1.000.000 − WDTGAL × 1.000.000 − RRPONTSYD × 1.000.000.000`.

WDTGAL es TGA de nivel del miércoles; WTREGEN es un promedio semanal y no se
sustituye silenciosamente. Se normalizan millones y miles de millones antes de
restar, con enteros exactos. Se exige una fecha común; si falta un componente se
conservan los disponibles y el proxy queda ausente. **No es un índice mundial**:
faltan otros bancos centrales, sus divisas y una definición consolidada.

## Contrato y operación

- Cada estado conserva fuente HTTPS, período y recepción real. No se inventa la
  hora histórica de publicación ni se sustituyen ausencias por cero.
- Las respuestas originales pueden archivarse por SHA-256, comprimidas como
  gzip/base64. Los reportes contradictorios y CSV incompletos se rechazan.
- Dos respuestas transitorias como máximo por petición; errores de acceso
  permanentes no se reintentan.
- Las consultas COT se acotan a 90 días / 60 filas y disponen de un presupuesto
  separado de 45 segundos por intento. Así el límite corto de otros feeds no
  obliga a tratar un reporte semanal como una cotización instantánea.
- `observeCapital` ejecuta tres grupos de recopilación en paralelo y conserva
  errores por fuente. No es un motor de predicción masiva validado.
- El recolector global U003 incorpora U004 y el diario macro conserva sus
  revisiones. El transporte utiliza el contrato XI/Ether existente.

```bash
npm run capital -- registros/capital-u004
npm run test:capital
node tools/laplace.mjs verificar-universo-global registros/capital-u004/captura.json BIN_XI
```

## Estado de las once necesidades

| Necesidad | Estado tras esta fase |
| --- | --- |
| L3 y eventos por orden | Pendiente; L2 existente es parcial |
| COT | Implementado para siete mercados |
| Flujos netos ETF | Pendiente; cotizaciones no equivalen a creaciones/redenciones |
| Releases macro inmediatos | Parcial en U003; faltan calendario y horas verificadas |
| Curva de rendimientos | Implementada en frecuencia diaria |
| Liquidez global | Parcial: componentes y proxy de EE. UU. |
| Flujos on-chain de exchanges | Pendiente, incluidas etiquetas verificables |
| Dormancy / HODL Waves | Pendiente |
| Funding / OI de perpetuos | Pendiente |
| Noticias y transcripciones | Parcial en U003; faltan transcripciones completas |
| Cadenas de suministro | Parcial: puertos/energía; faltan inventarios y proveedores |

Siguiente fase: L3 con secuencias y reconciliación; financiación/OI de contratos
perpetuos identificados; flujos ETF con procedencia y método explícito. Después,
on-chain, otras monedas/bancos centrales y evaluación predictiva temporal.

## Referencias primarias

- [CFTC Disaggregated — metadatos](https://publicreporting.cftc.gov/api/views/72hh-3qpy.json)
- [CFTC TFF — metadatos](https://publicreporting.cftc.gov/api/views/gpe5-46if.json)
- [FRED DGS2](https://fred.stlouisfed.org/series/DGS2), [DGS10](https://fred.stlouisfed.org/series/DGS10), [DGS3MO](https://fred.stlouisfed.org/series/DGS3MO)
- [WALCL](https://fred.stlouisfed.org/series/WALCL), [WDTGAL](https://fred.stlouisfed.org/series/WDTGAL), [RRPONTSYD](https://fred.stlouisfed.org/series/RRPONTSYD)
