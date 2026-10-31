# Laplace — Cobertura financiera mundial: programa incremental

Estado de referencia: 31 de octubre de 2026. Una fuente o adaptador no equivale
a que los datos estén disponibles, completos ni que mejoren una predicción.

## Orden de trabajo y contratos

| Ciclo | Prioridad | Entregable acotado | Condición de cierre |
| --- | --- | --- | --- |
| O001-A | P0 | FINRA volumen diario Reg SHO CNMS y FORF, entrada por sesión explícita | Fecha/centro/símbolo validado, tráiler consistente, pruebas anti-futuro, hash y falla sin ceros |
| O001-B | P0 | FINRA ATS / Non-ATS weekly y bloques (con permisos de API) | Verificar acceso, retraso oficial, identidad de firma, no confundir bloque con orden oculta |
| D001-A | P0 | Futuros y perpetuos: funding, open interest, liquidación y base por contrato | Mercado, moneda, unidad, timestamp y contratos distinguidos; reconciliación con fuente primaria |
| D001-B | P0 | Opciones y derivados OTC/SDR públicos | Contratos, tenores, tipos de swap, retrasos de publicación, licencias y redacciones explícitos |
| C001-A | P0 | ETF: participaciones, NAV, creaciones/redenciones y flujos | No inferir flujo neto desde movimiento del precio; reconcilia revisiones |
| B001 | P1 | BIS LBS/CBS y otras estadísticas monetarias mundiales | Cobertura geográfica, sectorial, monedas y vintage con periodo correcto |
| K001 | P1 | Bitcoin/Ethereum públicos, DEX, stablecoins y flujos etiquetados verificables | Nunca inferir identidad de titulares o movimientos blindados sin evidencia |
| I001 | P1 | Integrar fuentes al diario duradero con licencia, cadencia y faltantes | Entrega idempotente, auditoría, rate limits y eventos sin falsa disponibilidad |
| V001 | P0 transversal | Matriz de cobertura y validación predictiva por cortes | Test reservado comparado con baseline, sin fuga temporal y abstención de señales ausentes |

Las fases son independientes y pueden tener PR separadas. O001-A es el único
adaptador nuevo que se implementa en este ciclo; el resto queda planificado.
No se fusiona automáticamente main ni se activa trading.

## O001-A: datos públicos de ventas en corto FINRA

Fuente primaria: https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data

Archivo CNMS consolidado para acciones cotizadas que se ejecutaron fuera de bolsa:
https://cdn.finra.org/equity/regsho/daily/CNMSshvolYYYYMMDD.txt

Archivo FORF para valores OTC no cotizados:
https://cdn.finra.org/equity/regsho/daily/FORFshvolYYYYMMDD.txt

FINRA documenta la cabecera y el tráiler en
https://www.finra.org/sites/default/files/2021-07/DailyShortSaleVolumeFileLayout.pdf.

O001 conserva por símbolo elegido: volumen short, volumen short exempt
(subconjunto, nunca se suma dos veces), volumen total reportado y cociente
short/total. Preserva precisión decimal en la validación previa a la salida.
El parser rechaza archivos truncados, fechas incoherentes, símbolos duplicados,
centros imposibles y recuento incorrecto, y limita bytes y filas.

El dato **no** es short interest, participación institucional neta, libro de
órdenes, órdenes dark-pool sin ejecutar ni identificaciones de clientes.
Un ratio elevado no equivale a voluntad bajista. FINRA publica además
ATS/Non-ATS de frecuencia semanal; O001-A todavía no lo ingiere.

Una respuesta HTTP 403/404 para feriados, sesiones aún no publicadas o límites
de acceso marca la fuente como NO DISPONIBLE. No representa cero transacciones.

## Datos temporales y capturas

- La fecha del hecho es el día de sesión, sin precisión intradía.
- La fecha conocida por Laplace es el instante real de recepción.
- La publicación histórica exacta no se afirma ni se retrofecha.
- Los datos quedan fuera de entrenamiento predictivo hasta comprobar
  vintages, cobertura, licencias, retraso y mejora fuera de muestra.
- El adaptador crea hasta cuatro estados numéricos por símbolo seguido
  en cada universo y limita a 64 símbolos predeclarados por lote.
- Se conservan las cantidades/filas agregadas y el SHA-256 de la respuesta;
  no se redistribuye aquí el archivo original.
- CNMS y FORF se mantienen separados; no se agregan CNMS y TRF individuales.

## Ejecutar

Con Node >=20 desde el repositorio:

    npm run test:finra
    npm run finra:o001 -- 20261030 registros/nuevo-o001.json

Opcional:

    npm run finra:o001 -- 20261030 registros/aapl-spy.json --symbols=AAPL,SPY

Para solicitar el día de sesión explícito con U003 (solo servidor):

    LAPLACE_FINRA_TRADE_DATE=20261030 node tools/laplace.mjs universo-global-u003

No se configura una fecha automática por defecto: si falta la fecha,
U003 continúa exactamente como antes y no reporta que consultó FINRA.

## Restricciones legales y de observabilidad

Verificar los términos de FINRA para cada uso, almacenamiento,
redistribución y licencia. El repositorio no incluye credenciales, accesos
privados ni intenta identificar contrapartes protegidas.

El dato agregado es compatible con la investigación de actividad fuera de
bolsa, no prueba participación de una entidad específica. La red de mercado
mundial, sus operaciones OTC privadas y los fondos anónimos no son totalmente
observables, ni se van a reconstruir a partir de suposiciones.
