# LAPLACE 4.7: contexto fresco y diario compacto C04

El botón de predicción ahora consulta ticker, libro y operaciones del activo
seleccionado. Conserva las medidas nuevas como un delta que referencia una
captura mundial auténtica. El cálculo contextual admite BTC/USD, ETH/USD y
SOL/USD con etiquetas de velas del activo correcto. La comparación posterior
con el modelo nativo exige idéntico activo, referencia y cierre objetivo.

## Prueba real

Se consultaron los nueve endpoints públicos Coinbase de los tres activos.
Las respuestas produjeron ocho observaciones por activo: precio, spread,
profundidad de cada lado, desequilibrio y tres medidas de operaciones.
Las 24 observaciones se guardaron en `evidencia/c04-contexto-vivo/`.

| Registro | JSON compacto, bytes |
| --- | ---: |
| BTC/USD | 3.684 |
| ETH/USD | 3.682 |
| SOL/USD | 3.681 |
| Captura mundial base completa | 924.508 |

La comparación corresponde al JSON serializado, no a RAM total ni al tamaño
del APK. Los tres deltas se reconstruyeron con sus sellos y sin referencias
faltantes. El diario no copia todos los estados mundiales a cada actualización.
La reconstrucción y el ajuste C03 todavía requieren memoria de trabajo;
esto no los convierte en cálculo disperso sin coste.

Estas capturas nuevas todavía no tienen resultados futuros evaluados.
`predictions_evaluated=0` y `predictive_gain_demonstrated=false` son parte
del informe real. No se presenta una prueba de ingeniería con datos
sintéticos como entrenamiento o ventaja financiera real.

## Funcionamiento

1. El anfitrión Android consulta tres rutas fijas de Coinbase del activo
   elegido. Cada respuesta conserva la hora de recepción y SHA-256 de los
   bytes recibidos. Solo se transmite el prefijo L2 utilizado por el cálculo.
2. El worker verifica activo, origen, límites temporales, estructura y sellos.
   Un fallo de libro u operaciones se informa como ausencia; no se inventa
   profundidad cero. Sin ticker válido no se crea un delta nuevo.
3. Cada delta guarda ocho medidas como máximo, fuentes y el SHA de su base
   mundial. Los deltas se conservan en una clave propia de IndexedDB.
4. La reconstrucción incorpora también las últimas medidas de otros activos
   conocidas antes del corte. La macroeconomía conserva su fecha original;
   la llegada de un ticker no renueva una publicación de BIS o SEC.
5. C03 empareja las decisiones con cierres OHLCV precisos del activo pedido.
   Una misma ventana objetivo no cuenta varias veces aunque haya varios
   deltas dentro de ella. Mantiene las divisiones temporales y la abstención
   si faltan ejemplos.
6. Cada pronóstico nativo guarda el resumen del contexto y la huella del
   candidato contextual, si existe. Cuando cierra el objetivo, se comparan
   errores de precio y Brier únicamente si ambos modelos usaron el mismo
   activo, precio de referencia y cierre futuro.

No se descargan fuentes mundiales completas cada vez que se pulsa Predecir.
La captura mundial del servidor conserva su programación existente. Los
deltas nuevos se generan en esta versión al producir un pronóstico nuevo
en el teléfono; esto no es un recolector continuo en segundo plano.

El libro es una fotografía de los diez primeros niveles; las órdenes pueden
cancelarse. Las operaciones REST son una muestra reciente, con lado maker;
no se denominan flujo global completo ni se convierten automáticamente en
intención compradora/vendedora.

## Conservación e integridad

Un delta alterado se rechaza. Una referencia mundial que falta queda
identificada como pendiente; el diario no inventa una base sustituta.
Capturas contradictorias con la misma fecha no se sobrescriben. El contexto
guarda por separado la fecha del mercado y la fecha de su base mundial.
Los hashes locales verifican integridad, no son firmas de Coinbase.

El APK 4.7 se instala con identificador `com.entidadlaplace.mobile.learn47`,
separado de la versión de prueba 4.6. La instalación no borra 4.6. Para
trasladar el aprendizaje nativo, exportar el respaldo LQT de 4.6 e importarlo
en 4.7 antes de producir un nuevo modelo allí. Se mantienen los controles
de restauración que evitan sobrescribir un checkpoint existente distinto.

El exportador EF004 incluye el diario compacto y el índice de bases. La
importación específica de ese diario no está implementada en este ciclo;
su conservación automática local y tras reinicio sí se verifica. El respaldo
LQT continúa preservando sus modelos y pronósticos. Los checkpoints y el
circuito nativo de 1.000 cúbits no se sustituyen.

## Validación

- Pruebas de integridad, futuro, cambio de activo, URLs, fallos parciales,
  deduplicación, conservación de fechas y objetivos sin solapamiento.
- Ajuste y emisión ETH/SOL con fixtures sintéticos explícitos; sus etiquetas
  no proceden de BTC. Es una prueba de implementación.
- Equivalencia exacta del comparador Node/WebView, incluyendo verificación
  SHA del pronóstico contextual y rechazo de manipulación.
- Reconstrucción de los tres deltas reales en Node y en el worker móvil.
- JUnit del transporte Java: únicamente los tres activos y rutas permitidos,
  recepción, integridad y fallo parcial de una fuente.
- Examen Chromium con ejecutor XI real y velas reales archivadas: captura
  compacta mediante fixtures declarados de libro/operaciones, dos predicciones,
  posterior comprobación, exportación/importación nativa y conservación del
  diario tras recargar la aplicación.

La suite Android continúa comprobando JNI, motores anteriores, firma y
contenido del APK. Los plazos largos y la intervención validada de los
veinte componentes siguen necesitando historia y resultados suficientes.
Todavía no se aprende ni se activa una mezcla C02/C03 por tener un único
caso favorable.

## Reproducción

```sh
node --test tests/contexto-c04.test.mjs tests/conjunta-c03.test.mjs
node apps/laplace-android/build-ef004-assets.mjs --verify
node apps/laplace-android/build-c04-assets.mjs --verify
node tools/capturar-contexto-c04.mjs ARCHIVO_EF002 NUEVA_SALIDA
```

Las rutas públicas se contrastaron con la documentación oficial de
[libro Coinbase](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-book)
y [operaciones Coinbase](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-trades).
