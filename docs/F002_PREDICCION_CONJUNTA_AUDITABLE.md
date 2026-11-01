# Laplace F002 — ejecución conjunta y validación temporal de EF002

## Qué calcula el núcleo

F002 consume todos los archivos EF002 públicos después de verificar
el SHA de la captura, del snapshot, la compresión y el manifiesto.
Incluye familias BIS/B001, CFTC/D002, derivados/D001, blockchain/K001,
mercado U002/U003, flujos SEC/C001, FINRA y nuevos dominios que aparezcan.
El **inventario de todas las series** se conserva aunque las señales no
tengan nuevos valores. Una fuente restringida o ausente no vale cero.

Seis agregados: mercados, banca/tasas, flujos/derivados, economía real,
eventos/ambiente y otros. Cada cambio se mide contra el mismo indicador,
unidad y proveedor de una captura anterior. Los retornos normalizados
son adimensionales; únicamente después se calcula una mediana y máscara
de presencia por grupo. Nunca se suman USD con tasas o conteos.
Un dato antiguo repetido no se trata como observación nueva.

Cada ciclo también crea trazas-f002/trace-SHA.json: archivo inmutable con
los valores originales sin redondeo, unidad, proveedor, fechas bitemporales,
valor anterior, valor nuevo, cambio normalizado o motivo de ausencia de
cada señal. Este registro se conserva por SHA aparte del modelo estadístico;
la agregación a seis familias nunca borra la información cruda original.


El objetivo actual es BTC/USD a 6 horas, debido a la cadencia programada
de EF002. La etiqueta futura requiere una captura posterior auténtica,
con precio Coinbase observado después de la decisión y dentro de ±2 horas.
No se simulan precios futuros ni se aplica a 5 minutos la historia de 6 horas.

## Entrenamiento, selección y prueba

- Entrenamiento cronológico: mínimo 24 pares con targets anteriores a
  la primera decisión de validación.
- Validación: mínimo 8 pares; elige lambda ridge entre 1, 10 y 100 sin
  utilizar el holdout futuro.
- Holdout cronológico: mínimo 8 pares; compara error porcentual de
  predicción contra mantener el precio inicial (persistencia), sin
  seleccionar los parámetros con el holdout.
- Emisión: sólo cuando validación y holdout superan persistencia, el
  historial está fresco y la hora REAL de emisión precede al objetivo.
  El resultado es experimental en modo shadow, sellado SHA-256.
- Evaluación prospectiva: nuevos archivos comparan después las
  predicciones originales sin reescribirlos. Falta evidencia prospectiva
  hasta medir suficientes resultados, incluyendo errores y abstenciones.

F002 no modifica la salida central F001 ni hace trading, incluso cuando
muestra mejora retrospectiva. El scorecard exige 24 evaluaciones futuras
antes de resumir la comparación muestral y **no garantiza rentabilidad**.

## Primer ciclo verificado contra archivos públicos (1-nov-2026)

Resultados reales después de recuperar cinco capturas suplementarias con
sellos íntegros: **diez capturas** (cinco de laplace-archivo y cinco
de evidencias originales), **927 series distintas**, 30 dominios y un
único resultado futuro de mercado comparable. Entrenamiento,
validación y holdout: 0 / 0 / 0 pares. Estado: abstained, razón:
insufficient_verified_market_outcomes. Precio conjunto emitido: ninguno.

Es importante: 910 series no son 910 muestras temporales independientes.
No hay precisión predictiva conjunta demostrada con estas cinco capturas.

## Integración de servidor, historial y teléfono

El ciclo GitHub Actions de EF004 corre también el nuevo predictor F002
sobre los archivos inmutables, serializa informes de fuente con sello,
pronósticos experimentales y evaluaciones prospectivas en directorios
separados de la rama laplace-modelos.

La APK 3.6 independiente (paquete de depuración propio) incluye el
diagnóstico F002 asociado exactamente al SHA de su captura EF002 y presenta datos de entrenamiento, holdout, fuentes y motivos
de abstención en Multiplazo/Fuentes. El cálculo completo permanece en
el servidor: una sola captura compilada en Android no permitiría entrenar.

No se afirma cobertura de todos los mercados financieros: las licencias
y fuentes privadas no se sustituyen por supuestos.

## Reproducción

    npm ci
    node --test tests/conjunta-f002.test.mjs
    node tools/conjunta-f002.mjs ejecutar deps/archivo/capturas /tmp/f002-repro

Para evaluar pronósticos ya emitidos, añadir el directorio de
laplace-modelos como tercer argumento después de la ruta de salida.

El importador de F002 conserva los hashes de los cinco archivos de evidencia
anteriores y evita contar como independientes las capturas próximas o
etiquetas futuras ya empleadas. El sello de fuente de la captura no es
una firma criptográfica del proveedor externo.
