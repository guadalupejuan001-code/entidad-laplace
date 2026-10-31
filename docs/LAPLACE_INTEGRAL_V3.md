# Laplace integral v3: medición, campo armónico y evolución

## Operador matemático exacto

La ecuación de Laplace estacionaria es ∇²φ=0. En grafos:
Lφ=∑_j w_ij(φ_i−φ_j)=0.

El nuevo núcleo de ecuación aplica el solucionador real a
φ=log(P_candidato/P_base), un valor adimensional del MISMO activo.
Los nodos son horizontes cronológicos ordenados y los pesos entre vecinos
son 1/(log(h_j)−log(h_i)). La topología es una HIPÓTESIS de suavidad
temporal, no una ley física probada del mercado.

Las predicciones F001/M001 son FRONTERAS EXPERIMENTALES, nunca precios
del futuro observados. Si hay un horizonte sin candidato ENTRE dos
fronteras, se resuelve su valor armónico como diagnóstico de campo,
pero no se publica como precio financiero predicho, no se opera con él
y no altera el precio central F001. No se extrapolan extremos.

Si todos los horizontes tienen candidato, el operador mide
inconsistencia entre vecinos y devuelve un diagnóstico; no declara
ventaja predictiva. Sin dos anclas, se abstiene.

## Todo el sistema sin inventar observaciones

El ejecutor integral nucleo/laplace-integral.mjs ejecuta:
- F001 (14 horizontes entre 5 min y 90 días), que reutiliza
  la matemática de análogos M001 con OHLCV observados;
- el operador armónico, la auditoría de cada estado mundial conocido
  al corte y estado explícito de los ETF;
- EF004 si se le entregan capturas temporales independientes válidas.
  Con dos capturas o menos, el resultado será una abstención.

Se emite un inventario separado de X002, XN01, EF001-EF005,
O001, C001, D001/D002, B001, K001, U002/U003/U004. No se
confunde código disponible con ejecución efectiva en el APK.

El mundo NO modifica el precio central sin validación prospectiva.
Un ticker ETF no representa flujo N-PORT. Las unidades diferentes
(USD, tasas, temperaturas, operaciones) no se suman en una ecuación
dimensionalmente inconsistente.

La ecuación de Laplace no contiene una derivada temporal. Para
pronosticar precios se necesita una ley de evolución entrenada con
datos suficientes, no insertar cualquier número en ∇²φ=0.

## Ejecución reproducible

  node --test tests/laplace-financiero.test.mjs tests/laplace-integral.test.mjs
  node tools/calcular-integral.mjs corte-utc.json resultado.json

Formato de entrada: objeto JSON con quote, series por 300/3600/86400
segundos, world opcional, asOf y captures opcional. No se inventan
ni descargan silenciosamente datos.

El pronóstico sigue siendo experimental, NO trading y NO aprobado para
producción. Su precisión solo puede establecerse con evidencia futura.
