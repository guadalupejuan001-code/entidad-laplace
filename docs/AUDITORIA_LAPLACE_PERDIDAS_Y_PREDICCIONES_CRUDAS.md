# Auditoría de pérdidas y predicciones crudas — Laplace, 31-oct-2026

Se compararon tres repositorios: LaPlaceDIG, REVERSE-PC y entidad-laplace,
incluidas ramas experimentales relevantes. Fuera significa ausente o
no ejecutable en la APK Android independiente 3.2, NO borrado de Git.
Son 20 grupos funcionales, no 20 modelos entrenados ni una lista de
todos los componentes imaginables.

| # | Grupo funcional | Fuente de código/evidencia | Estado en Android 3.2 | Qué aportaba |
|---|---|---|---|---|
| 01 | XN01 BTC dirección 5m / confianza interna | REVERSE-PC: x001-native.xi, LaplaceXiCompiler.java | Fuera en 3.2; restauración nativa en rama | X001 54.296875% vs M001 48.828125% en 256 tests; Brier peor que baseline |
| 02 | Máscara XI, P(subida), prior, soporte y registros exactos | XN01 registros r0,r8,r9,r3,r7,r6,r10 | Sin valores originales en 3.2 | Explica soporte de dirección; confianza interna NO tasa de aciertos |
| 03 | Predicción de dirección bursátil SPY/AAPL/NVDA | REVERSE-PC: LaplaceActivity.java y XN01 | Mercados bursátiles no seleccionables en 3.2 | Horizonte cerrado 5m, sin magnitud de precio |
| 04 | X002 entrenamiento y calibración por horizontes | ENTRENAMIENTO_X002.md y laplace_temporal.cpp | No corre en APK | Separa train, validación, calibración, holdout; evalúa Brier |
| 05 | XG01 A/B local-global con pruebas reservadas | LaPlaceDIG rama experiment/u002-predictive-ab-20261030 | Rama experimental no incorporada | Puede comparar valor incremental del mercado global; sin ventaja validada |
| 06 | Trayectoria causal observacional de BTC y eventos | LaPlaceDIG rama feature/laplace-causal-trajectory-20261029 | Rama experimental ausente en APK | Probabilidad condicional histórica; causalidad NO demostrada |
| 07 | Diario prospectivo M001 de servidor y pares verificados | seguimiento/diario.mjs, VALIDACION_V001_FINAL.md | App guarda solo predicciones locales | En 8 resultados, MAE M001 529.55 USD > persistencia 504.96 USD |
| 08 | U002 369 estados y roundtrip real XI | REVERSE-PC: u002-native.xi y LaplaceGlobalCompiler.java | Archivo mundial sin runtime nativo | Prueba integridad de memoria, no mejora precio demostrada |
| 09 | Captura mundial actualizada U003/U004 COT/Treasury/Fed | universo/global-u003.mjs, reportes U004 | Solo snapshot de compilación | Contexto temporal, corte as-of; no ventaja prospectiva verificada |
| 10 | Libro de órdenes y operaciones recientes explícitas | REVERSE-PC app.mjs fuentes book/trades | Ticker en vivo y velas; sin L2 calculado | Potencial orden/flujo bajo validación, no prueba causal |
| 11 | BTC/EUR y NOAA seleccionables | REVERSE-PC app.mjs fuentes euro/noaa | Fuera | Observaciones externas; no sumar unidades incompatibles |
| 12 | ETF C001 SEC NPORT, participaciones NAV y flujos | universo/fondos, ETF_FONDOS_C001.md | Sin flujos SEC verificados en captura APK | Precio SPY o QQQ no equivale a compras/redenciones |
| 13 | O001-A/B FINRA ventas cortas, ATS/Non-ATS | universo/otc, COBERTURA_FINANCIERA_Y_O001.md | No alimenta predictor APK | Diarios parciales; ATS semanales sujetos a acceso |
| 14 | D001 perpetuos, OI, funding y D002 swaps CFTC | universo/derivados, docs VALIDACION_V001_FINAL | No alimenta predictor APK | Capturas parciales, no transacciones privadas completas |
| 15 | B001 banca BIS internacional | docs/VALIDACION_V001_FINAL.md | No alimenta predictor APK | Cuatro series, 32 registros históricos; no flujo intradía |
| 16 | K001 Bitcoin/Ethereum DeFi blockchain | docs/VALIDACION_V001_FINAL.md | No alimenta predictor APK | 16 señales históricas; no descubre titulares privados |
| 17 | EF001/EF005 registro bitemporal y archivo duradero | estado-financiero, EF005 | 2 capturas en APK, no datastore servidor | Necesario para aprendizaje cronológico y comprobar revisiones |
| 18 | E001/EF003 leyes de transición de estados | dinamica/modelo.mjs, estado-financiero/leyes.mjs | No ejecuta la máquina de leyes | Estados reproducibles; transferencia a finanzas sin probar |
| 19 | EF004 evolución multivariante retardada | demonio/finanzas-ef004.mjs, demonio/series.mjs | Se abstiene por historia temporal insuficiente | Modelos entrenables, sin prueba independiente de ventaja |
| 20 | Valores crudos completos, ablación y evidencia V001 | F001, M001, validacion/predicciones-v001.mjs | Mostraba USD redondeado, sin traza completa | Sin precisión y procedencia crudas no se detectan ajustes ocultos |

## Evidencia que no debe distorsionarse

- Experimento real X001/XI Ether: 54.296875% de direcciones correctas en
  256 decisiones de test, frente a 48.828125% M001 y 47.65625% referencia.
  La pérdida Brier nativa 0.2566931865 fue PEOR que 0.2525813249
  del prior. No hay demostración de rentabilidad ni de precisión futura.
- La fórmula XN01 original define confianza interna como
  max(P(subida),1-P(subida)), usando conteos locales y prior de peso ocho.
  Un valor de 54% es probabilidad interna, NO aciertos de mercado.
- El archivo M001 prospectivo V001 verificó ocho resultados: MAE 529.551458
  USD frente a 504.960000 USD de mantener el precio inicial.
- XG01 y estudio causal C001 están en ramas de investigación; no se
  atribuye mejora a un código que no mostró holdout superior.
- Los experimentos físicos/cosmológicos P001–P005 y salto temporal E005
  no se cuentan como predictores de finanzas por carecer de evidencia
  de transferencia a precios.

## Contrato de predicciones crudas

XN01 debe ejecutarse mediante ORIGINAL XI/Ether, no con una reescritura
de la probabilidad en JavaScript. Conservar todos sus registros nativos,
máscara, dirección, prior, P(subida), soporte, número de muestras, fecha
y hash. La confianza interna se muestra separada del éxito empírico.

M001 publica sin redondeo de interfaz el precio, retorno logarítmico,
precio de referencia, los análogos escogidos, pesos, errores y fechas.
F001 conserva sus campos históricos redondeados para compatibilidad,
pero añade raw_diagnostics con precio binario64 previo a round,
retorno, bandas, distancias y evidencias. Si faltan ocho patrones
independientes NO se fabrica candidato, aunque se muestre evidencia
bruta de los casos existentes.

EF004 conserva los datos en su archivo bitemporal. Un clamp matemático,
la selección de una muestra, y una política de persistencia constituyen
decisiones explícitas del MODELO; no son redondeo gráfico. Publicar
las salidas originales de esas decisiones no equivale a quitarlas sin
comprobación de estabilidad. Ningún método predice exactamente el
futuro por aplicar la PDE estacionaria de Laplace.

No se convierten fallos, fuentes restringidas ni estados privados
en cifras cero. Los parámetros de predicción deben congelarse antes de
medir los resultados. La decisión V001 sigue NO_GO_MODEL_PRODUCTION.

## Recuperación priorizada

1. XN01 original en APK con bitmask, confianza y traza cruda, comprobado
   en ejecutor pinned, no una simulación.
2. M001/F001 crudos y registro de predicciones fechadas/observables.
3. Calibración X002 y comparación XG01 global/local con holdout fresco.
4. Bolsa SPY/AAPL/NVDA y fuentes de microestructura cuando tengan API
   válida y continuidad 5m.
5. Recolectores históricos y vintages ETF, FINRA, D001/D002, BIS y
   blockchain antes de activar aprendizaje conjunto EF004.

## Seguimiento de integración Android 3.4 (31-oct-2026)

Esta auditoría describe la pérdida histórica en Android 3.2. La rama de
recuperación 3.3 ya restauró XN01 nativo y sus registros, más la salida
`raw_diagnostics` F001. La integración 3.4 no reescribe esos motores.

La matriz de veinte grupos ahora se genera desde un solo archivo canónico
(`nucleo/registro-capacidades.mjs`) en dos lugares: el núcleo integral Node
y el panel de la APK. Así se puede comprobar qué módulo **existe**, cuál
**observó** un dato y cuál **se ejecutó**. Cada grupo publica un motivo
e identificación de archivo, sin etiquetar la presencia de código como
aprendizaje real.

El empaquetador EF002 verifica todos los manifiestos archivados, exporta
el índice cronológico íntegro (hashes, fecha y conteo) y los estados de la
última captura. El almacenamiento bitemporal EF001/EF005 y sus valores
históricos íntegros siguen en la rama `laplace-archivo`, no dentro de la
APK. No se puede reconstruir una historia multivariante completa a partir
del índice de manifiestos, ni llamar a eso motor predictivo integrado.

El reporte EF004 de `laplace-modelos` se incorpora cuando coincide con
el archivo, mostrando tanto abstenciones como pares realmente existentes.
A fecha de corte de esta integración existían tres capturas y sólo un
segmento temporal continuo. No se estimaron transiciones suficientes para
certificar un modelo independiente ni pronósticos financieros futuros.

### Dependencias que todavía impiden una integración predictiva completa

- **Ingesta continua y autorizada** para ETF/SEC, FINRA, derivados, BIS,
  blockchain, mercado bursátil y microestructura; límites de publicación,
  licencias y credenciales no se transforman en datos inventados.
- **Archivo y sincronización** de series completas EF001/EF005 entre
  backend y dispositivo; este cambio incluye el índice y la procedencia,
  no una base de datos global móvil.
- **Ejecución de módulos condicionados**: EF003 necesita escenario
  declarado y observaciones financieras exactas. X002/XG01 requieren
  train/validación/holdout fuera de muestra. EF004 requiere capturas
  consecutivas suficientes. No se sustituyen por aproximaciones de UI.
- **Resultados predictivos**: BIS, DeFi o tasas no deben alterar la salida
  central F001 por mera coexistencia. Se exige mejora prospectiva
  registrada y replicable frente a persistencia; el estado V001 sigue
  NO_GO_MODEL_PRODUCTION.

Por tanto, la restauración de observabilidad de los 20 grupos sí es
trazable, pero **no equivale a tener 20 motores predictores completos**.
