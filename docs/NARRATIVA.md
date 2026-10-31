# E002 — espacio narrativo y probabilidad de mercado

## Métrica que queremos predecir

Objetivo inicial: que el retorno de BTC/USD durante las próximas 24 horas supere un coste total supuesto de 10 puntos básicos (0,10 %):

    R_(t,h) = P_(t+h) / P_t - 1
    Y_t = 1{10000 * R_(t,24h) > 10}

Esto define un evento verificable de retorno positivo después del coste supuesto. No es una política de trading ni una estimación del beneficio esperado: importan también los tamaños de pérdidas y ganancias. El sistema no envía órdenes. Los 10 puntos básicos son un parámetro de investigación, no una comisión de proveedor verificada.

Las etiquetas se calculan con enteros de precisión arbitraria a partir de decimales como texto. La comparación justo en el umbral no depende de redondeos flotantes. Se requieren precios `raw_close`, mismo activo/moneda y tiempos exactos; no se completan huecos con ceros o cotizaciones inventadas.

## Exclusividad de la narrativa

    N_t = {relatos geopolíticos y humanitarios con t-L < known_at <= t}
    Z_t = C(N_t)
    p_t = P_estimado(Y_t=1 | Z_t; parametros_aprendidos)

El modelo congelado no recibe precios, volumen, indicadores técnicos, economía, día de semana ni rendimientos pasados. Los precios históricos forman las etiquetas supervisadas; esa dependencia del entrenamiento se declara, no se oculta. La exclusividad de las entradas no implica que los movimientos reales de mercado tengan una única causa.

`observed_at` conserva el tiempo del hecho o relato, y `known_at` cuándo estuvo disponible esa versión. Los hechos publicados tarde permanecen fuera de los estados anteriores. La ventana se basa en disponibilidad. Los relatos conservan origen e identificadores para explicar las condiciones activadas.

## Espacio y familias de leyes

La extracción simbólica reconoce un vocabulario declarado, sin un modelo externo de lenguaje:

| Dominio | Temas iniciales |
| --- | --- |
| Geopolítica | Escalada militar, alto el fuego, sanciones, interrupción marítima, cooperación diplomática |
| Humanitario | Daño civil, desplazamiento, inseguridad alimentaria, ayuda bloqueada, acceso a ayuda, emergencia sanitaria |

Un mismo relato puede contener temas de ambos dominios. Los códigos estructurados reconocidos se consideran anotaciones de entrada. Cuando no los hay, un diccionario español/inglés busca expresiones y maneja negaciones locales simples. Los números de precio dentro de un titular no se convierten en características.

Esto no comprende cualquier narración, ironía, negación distante o veracidad de una noticia. Los textos sin clasificación permanecen visibles en los contadores de cobertura; no se interpretan como demostración de ausencia de crisis. Hay deduplicación por URL sin seguimiento y por texto normalizado; no se garantiza deduplicación semántica de todos los relatos de un mismo hecho.

Cada estado genera:

- Un tema presente y su contexto regional admitido.
- Un par de temas coexistentes, incluso entre geopolítica y situación humanitaria.
- Una secuencia de dos temas observados en relatos distintos y con orden de disponibilidad estricto.

Publicaciones simultáneas no producen una secuencia inventada. Las repeticiones no suman intensidad: la presencia se cuenta una vez por decisión. El contexto de país se usa solo cuando está declarado como geografía del hecho; el país del medio de comunicación no se reutiliza como ubicación del evento.

No hay una dirección alcista/bajista preprogramada para ninguna crisis o alivio humanitario. El entrenamiento aprende asociaciones dentro del historial disponible. “Cada patrón” significa cada condición generada por esta gramática y esos datos, con presupuestos explícitos; no todos los patrones posibles del mundo.

## Fórmula de las leyes probabilísticas

La referencia usa únicamente las etiquetas de entrenamiento:

    p0 = (S + 1) / (N + 2)

Para una condición narrativa j:

    p_j = (s_j + kappa * p0) / (n_j + kappa)

`N/S` son los casos y positivos globales de entrenamiento; `n_j/s_j` son los casos y positivos donde aparece el patrón. `kappa=8` por defecto suaviza las estimaciones hacia la referencia. Es un suavizado de tipo Beta con centro empírico, no una garantía de probabilidad real calibrada ni un intervalo causal.

Una ley tiene la forma `si condicion_j(Z_t), estimar p_j`. Se exige soporte de entrenamiento y validación (8 casos por tramo por defecto). El patrón debe mejorar Brier en validación por más de un umbral fijado de antemano. Las reglas activas se ordenan por mejora de validación; una consulta utiliza una sola regla aplicable. No se multiplican probabilidades de patrones solapados. La política completa también debe mejorar la referencia en validación.

El informe `pattern_audit` incluye todas las condiciones generadas: soporte, positivos, estimación, validación y motivo de selección o descarte. Solo se seleccionan hasta 16 leyes, entre un máximo de 256 candidatos estudiados. Explorar muchas hipótesis puede ajustar en exceso la validación: por eso no se usa como evidencia final y se reserva un test independiente.

Sin relato clasificado o condición validada, se devuelve `probability: null`, abstención y una referencia separada. No se presenta el prior como una señal narrativa descubierta.

## Entrenamiento y evaluación temporal

1. Definir activo, horizonte, coste, ventana y límites de fechas antes de entrenar.
2. Generar decisiones en una cuadrícula temporal fija. `step >= horizon` evita objetivos solapados.
3. Usar en entrenamiento solo objetivos cuya disponibilidad esté dentro de su corte.
4. Seleccionar y ordenar patrones con el tramo de validación posterior. Excluir horizontes que crucen la siguiente partición.
5. Guardar y congelar el modelo antes de evaluar el tramo final.
6. Medir Brier, log-loss, cobertura y frecuencia observada por intervalos de probabilidad.

    Brier = promedio((p_t - Y_t)^2)
    LogLoss = -promedio(Y_t*log(p_t) + (1-Y_t)*log(1-p_t))

Menor es mejor en ambas puntuaciones. El resultado global sustituye abstenciones por el prior congelado, para conservar también los casos difíciles. Se informa además del resultado condicional solo sobre predicciones emitidas y su referencia sobre exactamente los mismos casos. Los objetivos ausentes o todavía no disponibles se cuentan aparte: no tienen un resultado que pueda puntuarse.

La calibración compara probabilidad media con frecuencia observada en 10 intervalos fijos. No es una calibración perfecta demostrada. No se eligen horizonte, coste, vocabulario, umbrales o reglas a partir del test final. La estabilidad del estado frente a cambios en etiquetas futuras es una prueba automática.

## Ether/XI y reparto del cálculo

El anfitrión existente realiza extracción, agregación, suavizado y selección. El estado completo de estadísticas, reglas y configuración se almacena mediante `mem_store` en Inverse Ether Memory del runtime original. El checkpoint guarda un programa XI reproducible y hashes; para consultar o evaluar se vuelve a ejecutar y materializar ese estado. No contiene una segunda copia de las reglas autoritativas en campos JSON externos al programa.

La versión y hash del extractor se conservan: cambiar su significado no puede reinterpretar silenciosamente un modelo anterior. Los informes de reglas son proyecciones explicativas. El almacenamiento comprobado no demuestra compresión, aprendizaje autoalojado ni aceleración de la aritmética estadística por XI. No se modificó el núcleo original y no se crean qubits implícitos para estas estadísticas clásicas.

Presupuestos: 512 decisiones por ejecución, 256 relatos por ventana, ventana de hasta 168 horas y checkpoint de hasta 24 KiB materializados. El archivo histórico conserva el límite existente de 10.000 hechos. Los presupuestos excedidos producen error; no se trunca evidencia silenciosamente para favorecer resultados.

## Reproducir el control sintético

```sh
node tools/laplace.mjs experimento-narrativa ./build-ether/mundo_x_quantum build-evidence/narrativa
MUNDO_X_QUANTUM=./build-ether/mundo_x_quantum node --test tests/*.test.mjs
```

El generador construye cuatro contextos narrativos y una asociación probabilística conocida solo por el entorno. Las interacciones contienen información que los temas aislados no explican bien. El aprendiz recibe los relatos y precios sintéticos, sin recibir esas probabilidades. Usa 128 casos para entrenamiento, 64 para validación y 64 de prueba reservada.

El resultado de control registrado es Brier **0,1083** frente a **0,2493** del prior, con 8 reglas e interacciones recuperadas. Sin relatos, el control se abstiene y vuelve a la referencia. Esto comprueba el mecanismo sobre una asociación construida, **no** una ventaja en BTC real ni causalidad geopolítica. [Evidencia completa](../evidencia/E002.json).

## Usar un diario propio

El diario JSONL admite `precio`, `geopolitica` y la nueva familia `humanitaria`, además del contrato económico existente que el predictor ignora. Un relato tiene exactamente:

```json
{"id":"relato-sintetico","kind":"humanitaria","observed_at":"2020-01-01T10:00:00Z","known_at":"2020-01-01T11:00:00Z","source_url":"https://example.org/synthetic-story","event_code":"TEXT_ONLY","summary":"Ayuda bloqueada; acceso humanitario denegado.","region":"GLOBAL"}
```

El ejemplo y el archivo [narrativa.config.json](../ejemplos/narrativa.config.json) corresponden al control sintético. Para un archivo real hay que fijar sus propios cortes y preservar disponibilidad/procedencia verificable.

```sh
node tools/laplace.mjs entrenar-narrativa hechos.jsonl configuracion.json ./build-ether/mundo_x_quantum modelo-narrativo.json
node tools/laplace.mjs probabilidad-narrativa modelo-narrativo.json hechos.jsonl CORTE_UTC ./build-ether/mundo_x_quantum
node tools/laplace.mjs evaluar-narrativa modelo-narrativo.json hechos.jsonl FIN_TEST_UTC ./build-ether/mundo_x_quantum
```

El entrenamiento no sobrescribe un archivo existente. Con poca supervisión devuelve `evidencia_insuficiente` y no crea un checkpoint. Si hay etiquetas pero ningún patrón validado, conserva una referencia y se abstiene. No hay descarga automática, órdenes ni servicio recurrente.

## Capturas de fuentes reales

Los importadores locales reciben una envoltura `{captured_at, response}`: la fecha es la captura real de esa versión del contenido, no una fecha que se pueda asignar retrospectivamente. Utilizar una captura archivada exige que efectivamente exista ese archivo/versionado desde entonces.

```sh
node tools/laplace.mjs importar-narrativa reliefweb captura-reliefweb.json > relatos.jsonl
node tools/laplace.mjs importar-narrativa gdelt captura-gdelt.json > relatos-gdelt.jsonl
```

ReliefWeb conserva las fechas de publicación original, creación y modificación cuando existen. GDELT conserva `seendate` como tiempo de observación del relato indexado. Para evitar introducir versiones de texto que pudieron cambiar después, la disponibilidad de la captura importada nunca precede a `captured_at`. Descargar hoy una noticia antigua no la habilita para un entrenamiento histórico estricto anterior. Se conserva un extracto de hasta 1.200 caracteres y se declara la limitación de cobertura; no se atribuye comprensión del documento completo.

La disponibilidad de precios también debe ser verificable. En particular, una vela histórica descargada hoy no aporta por sí sola su fecha original de disponibilidad; su timestamp de inicio de intervalo tampoco es su cierre. No se inventa ese dato para conseguir que un backtest pase.

Fuentes primarias consultadas:

- [ReliefWeb API](https://apidoc.reliefweb.int/): requiere `appname` aprobado para las solicitudes. [Campos de reportes y fechas](https://apidoc.reliefweb.int/read/resources/reports/).
- [GDELT DOC](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) y [actualización del alcance de búsqueda](https://blog.gdeltproject.org/doc-2-0-updates-1-5-year-searching-and-updated-mobile-interface/): artículos, campos y límites de consulta.
- [Coinbase Exchange: velas históricas](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles): esquema, inicio del intervalo y posibles huecos.
- [Gneiting y Raftery, reglas de puntuación propias](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf): fundamento de Brier y log-loss para evaluar probabilidades.

La ejecución actual no entrenó un modelo con un corpus histórico real validado: GDELT no respondió en la prueba de acceso y ReliefWeb exige una identificación aprobada. Se comprobó acceso público a velas de Coinbase, pero no se inventó disponibilidad histórica ni se mezclaron esos precios con el control sintético. La ruta de importación y entrenamiento queda implementada para capturas verificables.
