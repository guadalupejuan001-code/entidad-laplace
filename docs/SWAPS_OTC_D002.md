# D002 — Swaps OTC (CFTC agregados + contrato SDR público)

Estado: primera implementación verificada mediante casos deterministas. Se
conserva todo lo migrado a Entidad Laplace. La validación completa de GitHub
Actions del repositorio privado **no está acreditada**; el flujo de continuidad
anterior falló antes de ejecutar sus pasos y no entregó logs de Node.

## 1. Fuentes y semántica

El observador `universo/swaps/cftc-semanal.mjs` utiliza exclusivamente las
siguientes **páginas oficiales públicas** del CFTC Weekly Swaps Report:

| Fuente | URL fija | Datos |
| --- | --- | --- |
| Gross Notional by Cleared Status | `L1GrossExpCS.html` | Stock semanal de nocional bruto pendiente, en millones USD |
| Transaction Dollar Volume by Cleared Status | `L1TransDollarVolCS.html` | Volumen nocional de transacciones de la semana, millones USD |
| Transaction Ticket Volume by Cleared Status | `L1ActVolCS.html` | Cantidad de operaciones nuevas reportadas |

Base común: `https://www.cftc.gov/MarketReports/SwapsReports/`.

**No sumar las tres métricas.** La primera es stock, la segunda flujo y
la tercera número de operaciones. Las tablas son por cleared status
(single-count). **No mezclar las tablas por tipo de participante**, pues sus
totales pueden duplicar los valores de la tabla de status al atribuir ambos
lados del swap.

Cada tabla devuelve hasta cinco semanas, desglosadas en `interest_rate`,
`credit`, `fx` y sus estados `total`, `cleared` y `uncleared`.
Se añade un total global una sola vez por semana: **50 observaciones por
reporte, 150 por captura completa de los tres**. No representa
derivados OTC mundiales; quedan fuera muchos activos, jurisdicciones,
productos, transacciones intradía y datos protegidos.

El parser comprueba:
- origen HTTPS fijo, tamaño de respuesta y formato HTML esperado;
- título fechado, cinco semanas ordenadas, cierre de siete días;
- 10 filas exactamente en cada tabla: 3 clases x 3 clearing + TOTAL;
- sumas `cleared+uncleared=total` por activo y suma global,
  tolerando pequeñas diferencias de redondeo de millones USD;
- ninguna fecha posterior al corte, ningún valor no numérico/oculto
  convertido en cero;
- si páginas distintas corresponden a semanas distintas, se abstiene
  de formar una captura conjunta inconsistente.

La fuente pública no entrega la hora exacta histórica de publicación de
cada cifra en la página. Por eso `known_at` es **momento de captura por
Laplace**, no la fecha de referencia. No retrofechar un informe descargado
hoy para producir un backtest supuestamente conocido en el pasado.

Fuente primaria: https://www.cftc.gov/MarketReports/SwapsReports/index.htm
y archivo: https://www.cftc.gov/MarketReports/SwapsReports/Archive/index.htm.
La CFTC publica normalmente los lunes, con desfase desde el viernes de
referencia; la propia página puede quedar temporalmente rezagada.

## 2. SDR Part 43 (solo contrato, NO feed conectado)

`universo/swaps/sdr-publico.mjs` implementa un contrato de entrada de
datos transaccionales **ya públicamente diseminados**. Es una
normalización interna para futuras copias autorizadas, no una afirmación
de acceso a todos los repositorios de swaps.

- Entrada estrictamente permitida: ID de transacción pública, tiempos de
  ejecución/diseminación/captura, clase, acción `new/correct/cancel`,
  revisión, estado de clearing, nocional público redondeado/capado/oculto,
  moneda y precio público.
- Se rechazan campos desconocidos (contrapartes, cuentas, clientes), URLs
  privadas o con query y diseminación posterior al tiempo de captura.
- Identificador público sustituido por un hash determinista interno.
- Cuando el notional está protegido se **abstiene**, no se inventa la
  cantidad exacta ni se intenta inferir su contraparte.
- Las correcciones y cancelaciones no se suman como nuevas operaciones:
  se mantienen pendientes de reconciliación o como tombstones.
- **No hay adaptador de red vivo** a DTCC/CME/ICE en este ciclo. Se
  necesitan verificar el formato real del proveedor, licencia,
  restricciones de uso y continuidad antes de conectarlo.

CME ofrece repositorio público con descarga de swaps y avisos de retraso
regulatorio:
https://www.cmegroup.com/market-data/repository/data.html.

La regulación 17 CFR 43.4 protege la identidad de contrapartes y exige
redondeos/topes de nocionales. El contrato respeta estas limitaciones;
no trata montos publicados como importes internos exactos.

## 3. Ejecución en Entidad Laplace

```bash
npm ci
npm run test:swaps
npm run swaps:d002 -- --out=registros/swaps/primer-corte.json
# Ingesta experimental en el recolector U003
LAPLACE_D002_ENABLED=true node tools/laplace.mjs universo-global-u003
```

El comando solo lee páginas públicas CFTC. No ejecuta órdenes.
No sobrescribe un archivo existente; si falla la fuente no guarda una
captura vacía como si fuese completa. Los fallos parciales se informan.

## 4. Validación y límites

La implementación tiene pruebas de sumas y coherencia, duración de
semanas, falta de publicación, cero no inventado, consultas concurrentes,
fechas y anonimización SDR. Las pruebas utilizan valores de ejemplo
basados en las tablas públicas de referencia de septiembre/octubre de
2026; no equivalen a un feed de producción funcionando continuamente.

La primera verificación del parser en ejecución aislada ha sido positiva.
Queda pendiente ejecutar el paquete completo de Node/GitHub Actions
en el repositorio nuevo y obtener una captura en vivo validada. Si las
páginas CFTC cambian de estructura, el parser se abstiene en lugar de
emitir estimaciones no verificadas.

D002 no modifica el predictor F001, la IA ni el núcleo XI/Ether. La
integración en U003 exige la opción `LAPLACE_D002_ENABLED=true`.

## 5. Secuencia restante

Después de D002 siguen C001 (ETF/flujos), B001 (crédito y banca
internacional), K001 (blockchain/DeFi). **V001 es el último ciclo**:
validación de modelos y fuentes contra periodos reservados, sin ventaja
financiera atribuida antes de medirla.
