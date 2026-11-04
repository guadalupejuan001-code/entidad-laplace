# LAPLACE 4.3: predecir volatilidad y volumen

## Diagnóstico de los resultados de dirección

Se compararon los archivos auténticos de las APK 4.0, 4.1 y 4.2 conservadas durante el desarrollo. `engine.js` tiene en las tres el SHA-256 `7aa226bce6d4a063b40bd9d0f3d3240d163ca92a853557c0e719de335b34c83e`. Las funciones `quoteAnchor`, `forecastAction`, `saveForecast` y `calculateModel` también son idénticas. La regla sigue comparando el signo de previsto menos inicial con el signo de cierre observado menos inicial.

Con las mismas 800 velas auténticas del archivo BTC, las tres APK produjeron exactamente los mismos precios y rangos para 5, 15, 30, 60 y 120 minutos. La evidencia está en `evidencia/actividad-m005/auditoria-apks.json`. Esto descarta un cambio de esas fórmulas entre las APK comparadas; no demuestra la precisión de registros del teléfono ni permite comparar períodos de mercado distintos.

En la captura aportada hay una dirección acertada de siete visibles. Tres filas comparten el cierre 76.858,30. No se dispone de sus referencias iniciales ni de todas sus fechas: hace falta el JSON exportado para comprobar cada etiqueta y si comparten ventana de evaluación.

El verde indicaba estar dentro del umbral elegido, antes 0,5 % por defecto: alrededor de un precio de 76.858,30, ese umbral admite unos 384,29 USD de error. Ese color podía confundirse con acertar. En 4.3 el error monetario usa una etiqueta neutra; la cercanía y la dirección siguen explícitas.

## Dos objetivos futuros

**Volatilidad del período:** `100 × sqrt(sum(log(close[t]/close[t−1])²))` en las próximas H velas. Usa todo el recorrido de cierres del período; su valor expresa magnitud acumulada y no selecciona subida o bajada. No es una volatilidad anualizada ni una banda de precios.

**Volumen futuro:** suma de volumen en las próximas H velas, en las unidades entregadas por la fuente. Para cripto se presenta la moneda base, por ejemplo BTC; en bolsa se indican unidades. Es el volumen de Coinbase Exchange o Yahoo indicativo, según el activo, no la suma de todo el mercado mundial.

El período empieza al cierre de la última vela conocida. Cripto fija una hora final en esa cuadrícula. Bolsa cuenta H velas/sesiones de negociación, sin inventar un vencimiento durante el cierre del mercado. Si falta historia suficiente se explica la abstención. Ocho períodos sin solapamiento son el mínimo de validación y de prueba; algunos plazos largos carecerán de ese historial.

## Aprendizaje y comprobación

M005 reutiliza los cinco rasgos y escalas de distancia de M001, con un mínimo de 24 velas continuas recientes. Busca hasta 18 analogías cuyas etiquetas ya maduraron antes del origen y separa sus períodos de resultados al menos H velas. Los nuevos objetivos son la volatilidad y el volumen de esos períodos, no la dirección del precio.

La referencia proyecta la actividad de las últimas 24 velas: RMS de retornos escalado a H para volatilidad y volumen medio multiplicado por H para volumen. Para cada objetivo se elige en validación un peso entre 0, 0,25, 0,5, 0,75 y 1 para combinar analogías con esa referencia. Si se elige cero, la interfaz lo identifica como referencia de actividad reciente.

El historial se divide cronológicamente: 60 % inicial, 20 % de validación y 20 % posterior de prueba. Se muestrean hasta 48 decisiones por fase con objetivos sin solapamiento. Se congelan los pesos antes de evaluar la prueba; las decisiones posteriores sólo incorporan etiquetas que ya eran conocidas en su propio instante. La prueba no elige pesos. Se presenta MAE y error de referencia por objetivo, incluso cuando no hay mejora.

Se ejecuta en un worker local para mantener la interfaz disponible. `build-activity-assets.mjs --verify` comprueba que el código del worker coincide con los archivos fuente.

## Ensayo sobre archivo real BTC

Se usaron las últimas 4.032 velas de cinco minutos del archivo auténtico `evidencia/entrenamiento-x002-20261030/velas.json`, simulando la ventana de 14 días de la APK. Corte declarado: 30 de octubre de 2026. Son datos retrospectivos, sin vintages autenticadas de lo que estaba disponible en cada instante.

| Plazo | Casos de prueba | Reducción del MAE de volatilidad | Reducción del MAE de volumen |
| --- | ---: | ---: | ---: |
| 5 minutos | 48 | 23,70 % | 6,98 % |
| 15 minutos | 45 | 1,86 % | 13,68 % |
| 30 minutos | 45 | 12,74 % | 18,27 % |
| Una hora | 34 | 28,42 % | 10,78 % |
| Dos horas | 33 | 20,48 % | 3,14 % |

La comparación es contra la referencia de actividad reciente sobre los mismos objetivos. Estos porcentajes describen la reducción del error en esa muestra; no son aciertos de dirección ni probabilidades de una próxima predicción. No se ha demostrado generalización prospectiva. Datos, hashes, pesos, valores previstos y observados por caso están en `evidencia/actividad-m005/resultados.json`.

## Registro y uso

1. Elegir activo y plazo y pulsar **Predecir volatilidad y volumen** en Analizar.
2. Se conservan hora de emisión, origen, valores originales, referencia y validación. Repetir el mismo origen no crea otra predicción.
3. En Historial, **Comprobar actividad** consulta cierres nuevos. Se evalúa sólo si están todas las velas del período; de lo contrario sigue pendiente. No sustituye sus valores originales por los del resultado.
4. **Exportar actividad** e **Importar actividad** trasladan ese registro en un JSON propio. La importación valida completo el archivo, conserva IDs existentes y recalcula errores desde resultados originales. Los importados se identifican como tales. El registro de precios usa sus botones propios y sigue aceptando los JSON anteriores.
5. Para vaciar actividad se ofrece confirmación explícita y la posibilidad de exportar primero. Esa acción conserva el registro de precios.

La APK de prueba se instala aparte con `com.entidadlaplace.mobile.learn43`, versionCode 18. No traslada credenciales de otras instalaciones ni realiza operaciones financieras al aprender o comprobar actividad.

## Reproducción

```bash
node apps/laplace-android/build-activity-assets.mjs --verify
node apps/laplace-android/prepare-activity-study.mjs
node --test --test-reporter=tap apps/laplace-android/tests/*.test.cjs
node apps/laplace-android/tests/browser-smoke.cjs
node apps/laplace-android/tests/activity-file-origin.cjs
```

Se verifican etiquetas futuras exactas, separación temporal, pesos invariantes ante cambios del bloque de prueba, congelación y evaluación, ceros, huecos, importación y paridad del motor de precio. Chromium comprueba predicción real en worker, duplicados, cambio de plazo, registro, exportación/importación y preservación del historial de precios. La prueba `file://` comprueba el worker bajo el esquema de origen de Android. CI conserva además JUnit, XI/Ether original, compilación ARM64 y comprobación de firma del APK.
