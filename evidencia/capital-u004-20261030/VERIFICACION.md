# Inicio real del proyecto U004 — 30 de octubre de 2026

La primera fase obtuvo **121 estados en tres bloques**, con seis fuentes HTTP
observadas y cero fallos en la captura completa de las 17:41:42 UTC:

- COT: 112 estados en siete mercados, con posiciones largas/cortas/netas por
  categoría y open interest semanal. Referencia disponible: 20 de octubre.
- Curva Treasury: cinco estados (2Y, 10Y, 3M y dos spreads). Fecha común: 28 de
  octubre; frecuencia diaria, no cotizaciones instantáneas.
- Liquidez de EE. UU.: cuatro estados (Fed, TGA, ON RRP y proxy derivado).
  Referencia común: 28 de octubre; unidades normalizadas a dólares.

`entradas/` conserva las respuestas originales como gzip/base64. Sus SHA-256
coinciden con las fuentes de `captura.json`. `reproduccion.json` confirma que
volver a procesar esas seis respuestas reproduce exactamente los 121 estados.
La captura parcial inicial tuvo 73 estados por un HTTP 503 en CFTC-TFF. El diario
los conservó y después añadió los 48 estados de TFF: los cortes temporales
devuelven 0, 73 y 121 estados, respectivamente, sin inventar datos anteriores.

La primera consulta mundial también encontró el fallo intermitente de TFF.
Se acotó la consulta y se dio a COT un presupuesto de tiempo independiente.
La segunda consulta mundial incorporó los **121 estados de U004**, con sus seis
fuentes disponibles. El total mundial fue **679 estados en 20 dominios**; PortWatch
y los siete temas de GDELT fallaron en esa captura y permanecen marcados como
ausentes. El total varía con la disponibilidad: no se rellena hasta un contador.

Validación:
- 72 pruebas de fuentes/diario/transporte con el runtime original, todas
  aprobadas y sin omisiones.
- Batería general: 247 pruebas; 183 aprobadas, cero fallidas y 64 omitidas por
  componentes nativos no configurados en esa ejecución.
- XI/Ether reprodujo exactamente los 121 estados de capital / 3.888 bytes.
- XI/Ether reprodujo también la captura mundial completa; véase `xi-mundial.json`.
- Runtime original fijado en `3d29556eff4d1079c791abab38e203fc209f1722`, sin
  modificaciones.

La recopilación de U004 se incorpora al recolector mundial y al diario macro.
No se activó su uso predictivo ni se demostró mejora de precisión o aceleración
masiva. El proxy de EE. UU. no se presenta como índice de liquidez mundial.
El estado de las once necesidades y la siguiente fase están en
`docs/CAPITAL_U004.md`.
