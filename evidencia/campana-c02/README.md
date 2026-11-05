# LAPLACE 4.6 · Campaña C02 integrada

Se entrenaron y empaquetaron 33 modelos nativos: BTC y ETH en 14 plazos cada uno, SOL en cinco plazos intradía. Cada modelo contiene el estado entrenado real y su huella. La primera ejecución carga ese estado; los resultados nuevos ya cerrados actualizan la lectura del modelo. Los demás activos pueden entrenar localmente si disponen de historia suficiente.

## Resultado completo

La dirección mejoró en 14 de 33 contextos, empató en cuatro y empeoró en 15 frente a C01 en exactamente los mismos objetivos. El error de precio bajó en 29 de 33. No se demostró una mejora direccional general, validación prospectiva ni ventaja financiera. Los plazos comparten datos; sus casos no se suman como observaciones independientes. Los plazos largos tienen muestras pequeñas.

| Activo | Plazo (min) | Casos reservados | Aciertos C01 | Aciertos C02 | MAE precio C01 (USD) | MAE precio C02 (USD) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BTC-USD | 5 | 256 | 52.7% | 54.3% | 59.9828 | 55.5699 |
| BTC-USD | 15 | 256 | 50.0% | 50.0% | 105.9876 | 100.7647 |
| BTC-USD | 30 | 201 | 53.7% | 50.7% | 145.0091 | 139.2219 |
| BTC-USD | 60 | 100 | 57.0% | 56.0% | 208.5886 | 208.3138 |
| BTC-USD | 120 | 50 | 58.0% | 56.0% | 308.7350 | 309.6337 |
| ETH-USD | 5 | 256 | 49.6% | 50.4% | 2.3277 | 2.1777 |
| ETH-USD | 15 | 256 | 50.0% | 51.6% | 4.3725 | 4.2353 |
| ETH-USD | 30 | 201 | 50.2% | 51.2% | 5.6514 | 5.5838 |
| ETH-USD | 60 | 100 | 52.0% | 58.0% | 8.3509 | 8.2701 |
| ETH-USD | 120 | 50 | 50.0% | 54.0% | 12.7167 | 12.6484 |
| SOL-USD | 5 | 256 | 49.6% | 48.0% | 0.1133 | 0.1095 |
| SOL-USD | 15 | 256 | 49.2% | 51.6% | 0.2052 | 0.2008 |
| SOL-USD | 30 | 201 | 55.7% | 53.2% | 0.2935 | 0.2839 |
| SOL-USD | 60 | 100 | 55.0% | 51.0% | 0.4137 | 0.4178 |
| SOL-USD | 120 | 50 | 48.0% | 64.0% | 0.6346 | 0.6204 |
| BTC-USD | 240 | 256 | 49.6% | 49.6% | 411.2576 | 390.5222 |
| BTC-USD | 300 | 256 | 51.2% | 50.0% | 435.0294 | 423.4889 |
| BTC-USD | 480 | 161 | 49.7% | 50.9% | 638.8265 | 606.5065 |
| BTC-USD | 720 | 107 | 44.9% | 51.4% | 733.4561 | 705.9908 |
| BTC-USD | 1440 | 53 | 58.5% | 64.2% | 999.0102 | 1008.9802 |
| BTC-USD | 2880 | 164 | 49.4% | 50.6% | 1803.2434 | 1707.7021 |
| BTC-USD | 4320 | 109 | 48.6% | 47.7% | 2357.0703 | 2220.3507 |
| BTC-USD | 10080 | 47 | 55.3% | 42.6% | 3450.4405 | 3280.8703 |
| BTC-USD | 20160 | 23 | 56.5% | 56.5% | 4557.5666 | 4462.0877 |
| ETH-USD | 240 | 256 | 49.6% | 49.6% | 16.9903 | 16.3983 |
| ETH-USD | 300 | 256 | 51.6% | 53.9% | 18.1251 | 17.4600 |
| ETH-USD | 480 | 161 | 51.6% | 49.1% | 25.9216 | 24.8129 |
| ETH-USD | 720 | 107 | 50.5% | 47.7% | 28.8126 | 28.5600 |
| ETH-USD | 1440 | 53 | 49.1% | 52.8% | 37.4676 | 37.2810 |
| ETH-USD | 2880 | 164 | 48.8% | 44.5% | 71.5296 | 69.8201 |
| ETH-USD | 4320 | 109 | 50.5% | 45.9% | 96.5639 | 91.9791 |
| ETH-USD | 10080 | 47 | 53.2% | 51.1% | 138.5480 | 137.2956 |
| ETH-USD | 20160 | 23 | 43.5% | 39.1% | 196.5172 | 197.4474 |

## Procedimiento reproducible

- Código matemático fijado en `8b6545b12765426a9957b1441d6eec609db107eb` antes de descargar y evaluar la captura nueva; captura autenticada en el run 41941370265.
- Datos públicos OHLCV de Coinbase, solo velas cerradas, con huellas en el manifiesto comprimido. Sin datos inventados ni acceso a cuentas.
- Separación temporal 60 % entrenamiento, 15 % selección, 10 % calibración y 15 % prueba; solo objetivos maduros dentro de su bloque. Casos separados por el horizonte y repartidos en todo el bloque.
- Por contexto, 216 combinaciones prefijadas de regularización, familia de observables, mezcla con prior, temperatura y fusión con el modelo C01. La selección utiliza exclusivamente validación, nunca la prueba.
- El conjunto intradía reservado comienza después del corte del archivo anterior de 30 de octubre. Sigue siendo un estudio retrospectivo, no una emisión prospectiva.
- Se conserva el circuito conectado de 1.000 qubits simulados en XI/Ether. La lectura regularizada utiliza agregados exactos del circuito y variables causales OHLCV. El codificador queda fijo tras la campaña; el aprendizaje posterior actualiza la lectura con etiquetas nuevas maduras.
- Los 33 modelos, sus estadísticas y `resultados.json` se verifican reproduciendo el entrenamiento nativo y restaurando los checkpoints incluidos en la APK. Modificar solo el bloque de prueba no cambia los parámetros ajustados.
- La prueba controlada de aporte del circuito C01 permanece separada y sin cambios. C02 no aporta por sí sola una nueva prueba de ventaja cuántica frente a métodos clásicos.

## Integración Android

Se mantienen los módulos anteriores de precio, volatilidad, volumen, PDE/grafos, EF002/EF004, F002, M003/M004, biblioteca de registros, respaldo y fuentes de mercado. C02 es el motor principal del panel de predicción y muestra sus aciertos junto con la referencia C01. Los registros de versiones distintas conservan su identidad.

El APK lleva 33 estados entrenados, funciona con cálculo local y consulta velas recientes para emitir nuevos pronósticos. Cada pronóstico queda guardado y se evalúa cuando su objetivo ha cerrado. Los intervalos son históricos; se muestra su cobertura observada. Si falta historia o hay huecos, el motor se abstiene. Los respaldos antiguos se conservan separados; no se reinterpretan como modelos C02.

Reproducción desde el repositorio:

```sh
g++ -O2 -std=c++17 -Ideps/mundo-x/native/include -Iapps/laplace-android/app/src/main/cpp apps/laplace-android/tests/campaign-runner.cpp -o build/campaign-runner
python3 apps/laplace-android/study-campaign.py --verify
python3 apps/laplace-android/tests/campaign-native.py
node apps/laplace-android/build-campaign-assets.mjs --verify
```
