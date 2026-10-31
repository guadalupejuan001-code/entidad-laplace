# B001 — Banca internacional (BIS LBS/CBS)

**Estado**: piloto cuantitativo de cuatro series públicas del Banco de Pagos
Internacionales (BIS). El código está en una rama de Entidad Laplace.
**Verificación efectiva en GitHub Actions** (31-oct-2026):
[workflow B001](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41175476309)
completó **99 pruebas Node** (18 B001 + 81 regresiones), todas aprobadas,
y ejecutó captura pública BIS: **32 señales trimestrales, 8 por serie,
4 fuentes observadas, 0 ausentes, último trimestre 2026-Q2**, con salida sellada. Esta prueba
sí valida la conectividad pública de este lote, pero no la precisión predictiva
ni la cobertura total bancaria mundial. Las corridas antiguas fallidas de GitHub
Actions quedan documentadas en [incidencia #6](https://github.com/guadalupejuan001-code/entidad-laplace/issues/6).

## ¿Qué añadimos?

Las estadísticas BIS son **trimestrales**, no flujos en tiempo real ni
transacciones de cuentas privadas. El portal publica LBS y CBS desde
metodologías distintas:

- **LBS (locational banking statistics):** posición de bancos según
  ubicación de su oficina que registra la operación; no consolida
  operaciones intragrupo.
- **CBS (consolidated banking statistics):** posiciones de grupos
  bancarios según la nacionalidad de su matriz; elimina posiciones intragrupo.
- Estas medidas contienen poblaciones solapadas **y jamás se suman entre
  sí** para calcular un ficticio total mundial.
- El BIS también publica en LBS variaciones ajustadas de tipo de cambio
  y rupturas (aproximación a flujos). **B001 solo consulta series stock**
  `L_MEASURE=S`; no resta dos stocks para afirmar un flujo genuino.

### Cuatro series piloto

| Serie | Dataflow BIS | Clave fija | Semántica |
| --- | --- | --- | --- |
| LBS_US_RESIDENCE_CROSS_BORDER_CLAIMS | WS_LBS_D_PUB | `Q.S.C.A.TO1.A.5J.A.US.A.5J.N` | Posiciones transfronterizas registradas en oficinas estadounidenses |
| LBS_US_NONBANK_FINANCIAL_USD | WS_LBS_D_PUB | `Q.S.C.G.USD.A.5J.A.5A.F.US.N` | Posiciones USD transfronterizas de bancos reportantes frente a instituciones financieras no bancarias estadounidenses |
| CBS_ALL_REPORTERS_TOTAL_CLAIMS | WS_CBS_PUB | `Q.S.5A.4R.F.C.A.A.TO1.A.5J` | Exposición consolidada a todos los países bajo base de contraparte inmediata |
| CBS_US_BORROWER_INTERNATIONAL_CLAIMS | WS_CBS_PUB | `Q.S.5A.4R.F.I.A.A.TO1.A.US` | Exposición internacional consolidada frente a residentes estadounidenses |

Las claves anteriores proceden de las páginas de serie del BIS, no de
suposiciones sobre abreviaturas. Las cuatro observaciones están en **millones
de USD**, con `UNIT_MEASURE=USD` y `UNIT_MULT=6`. No convertir ni
sumar cifras con otras unidades sin verificar esa metadata.

Series oficiales:
- [LBS oficinas estadounidenses](https://data.bis.org/topics/CBS/BIS%2CWS_LBS_D_PUB%2C1.0/Q.S.C.A.TO1.A.5J.A.US.A.5J.N).
- [LBS USD hacia sector financiero no bancario de EE. UU.](https://data.bis.org/topics/LBS/BIS%2CWS_LBS_D_PUB%2C1.0/Q.S.C.G.USD.A.5J.A.5A.F.US.N).
- [CBS total consolidado](https://data.bis.org/topics/CBS/BIS%2CWS_CBS_PUB%2C1.0/Q.S.5A.4R.F.C.A.A.TO1.A.5J).
- [CBS reclamos internacionales a EE. UU.](https://data.bis.org/topics/CBS/BIS%2CWS_CBS_PUB%2C1.0/Q.S.5A.4R.F.I.A.A.TO1.A.US).

Fuentes metodológicas: https://data.bis.org/topics/LBS y
https://data.bis.org/topics/CBS.

## Captura y restricciones

`universo/banca/bis-sdmx.mjs` solicita un CSV de ocho trimestres como
máximo para cada serie, usando el contrato REST v2 del BIS con la clave
fijada en el catálogo.

Se exige:
- dimensiones SDMX del flujo correcto; frecuencia `Q`,
  medida `S`, reporting-country, counterparty-country y código de moneda
  exactamente iguales a la clave;
- `TIME_PERIOD` trimestre válido, cero filas duplicadas, stock no negativo,
  `UNIT_MULT=6` y `UNIT_MEASURE=USD`;
- un límite por fuente de 2 MiB y 64 filas y límite de tiempo;
- valores ausentes y estados **OBS_CONF=N/C restringidos** excluidos, nunca
  sustituidos por cero; solo se publican `OBS_CONF=F` (libres).
  `OBS_STATUS=B` indica ruptura metodológica: se conserva el stock público
  con `structural_break=true` y, si está disponible, el valor pre-break;
  nunca se calcula un flujo entre periodos de metodologías diferentes;
- observación con `observed_at` correspondiente al **final de trimestre**,
  pero `known_at` correspondiente al **momento de descarga por Laplace**;
- SHA-256, ID de serie, unidad, país, sector/clave, descripción, fuente, estado
  estimado o observado y errores por fuente.

La disponibilidad histórica exacta no se certifica retroactivamente. Un
archivo descargado en 2026 no significa que cada valor revisado estuviera
disponible en ese formato a los predictores de 2025.

No hay acceso a saldos privados, información identificable de clientes,
operaciones bilaterales protegidas ni un índice total de liquidez mundial.

**Aviso de interfaz**: el API de BIS puede responder error, limitación o un
formato diferente al contratado. El parser entonces se abstiene, preserva
el error y evita inventar estados. Aún se requiere una descarga real
verificada para promover el conector a producción.

## Cómo ejecutarlo

```bash
npm ci
npm run test:banca
npm run banca:b001 -- --out=registros/banca/bis-piloto.json
```

Solo una parte de las series:

```bash
npm run banca:b001 -- --ids=LBS_US_RESIDENCE_CROSS_BORDER_CLAIMS,CBS_ALL_REPORTERS_TOTAL_CLAIMS --out=registros/banca/seleccion.json
```

Integración opcional en el U003 de Entidad Laplace:

```bash
LAPLACE_B001_ENABLED=true node tools/laplace.mjs universo-global-u003
```

El motor de precio F001, la memoria Ether/XI y las fuentes anteriores se
mantienen sin cambios. `prediction_inputs_enabled=false` y
`automatic_trading=false`. La salida se escribe solo si al menos una
fuente produjo registros públicos validados y no se sobreescriben rutas.

## Tests y pendientes antes de cerrar B001

- 18 casos de contrato cubren CSV SDMX, clave exacta, unidad, trimestre,
  timestamp de conocimiento, confidencialidad, fuentes incompletas,
  consulta concurrente y prohibición de sumar LBS y CBS.
- **Superada**: `npm run test:banca` real, 18/18. También se ejecutaron
  81 tests de regresión de fondos, swaps, derivados, FINRA, F001 y U003:
  **99/99 sin fallos** en [Actions](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41175476309).
- **Superada**: captura pública BIS del piloto con cuatro fuentes y 32 estados,
  último trimestre 2026-Q2, sin observaciones censuradas promovidas.
  Sigue pendiente ampliar cobertura, conservar historial y validar releases
  históricos originales y modelos predictivos.
- Los runs antiguos de Actions aún requieren revisión de la incidencia #6;
  el run nuevo prueba que el runner ya inició tareas y ejecutó Node en esta rama.
- Extender el catálogo más allá de cuatro series, conectar flujos LBS
  ajustados verificados y hacer revisiones BIS punto-en-tiempo.
- Revisar licencias y términos del BIS antes de redistribuir estadísticas
  o utilizarlas comercialmente. Atribuir al Banco de Pagos Internacionales.

## Hacia el final del plan

Después de B001 sigue **K001** (blockchain/DeFi) y luego **V001**
(**último ciclo**) de evaluación de cobertura, fuga temporal y
precisión fuera de muestra. No se declara completada la validación global
mientras D002/C001/B001 sigan pendientes de fuentes reales y CI.
