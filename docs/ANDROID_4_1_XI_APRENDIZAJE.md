# LAPLACE 4.1: ampliar el aprendizaje de XI

El porcentaje consultado es la confianza interna de **XN01**, calculada como `max(P(subida), 1 − P(subida))`. Un 58 % no significa un 58 % de aciertos observados. EF004 es otro motor y no produce ese valor.

XN01 sólo recibía 240 velas de cinco minutos, unas 20 horas, aunque la aplicación consultaba más historia. Cuatro contadores se almacenaban en bytes. Aumentar la entrada sin cambiar su almacenamiento causa un error al superar 255 ejemplos; por eso no basta con descargar más velas.

XN02 conserva la máscara, la aritmética entera, el prior y el suavizado originales. Sólo amplía esos cuatro contadores a uint32, sobre el mismo XI/Ether original y aislado. Permite 288, 864 o 1.440 velas: uno, tres o cinco días. El generador `apps/laplace-android/build-xn02.mjs` deriva reproduciblemente la plantilla y el serializador ampliados. La plantilla y el compilador canónicos XN01 siguen idénticos a REVERSE-PC fijado.

Se mantiene el límite original de un millón de instrucciones; 2.016 velas lo superan. El límite de 1.440 pasa también el caso de máximo soporte: 1.433 ejemplos y los cuatro contadores mayores de 255. El transporte JNI admite ahora hasta 512 KiB, sin alterar el núcleo ni su presupuesto de instrucciones. No se calcula la dirección en JavaScript.

Cada ejecución aprende de nuevo con su ventana. Pulsar varias veces con las mismas velas produce la misma probabilidad: no acumula entrenamiento ficticio. La última vela determina el estado actual; sólo los ejemplos anteriores cuyo siguiente cierre ya existe cuentan como entrenamiento. Se omiten estados y etiquetas que cruzan huecos. La interfaz exige la cantidad seleccionada, velas cerradas actuales y rechaza resultados incoherentes.

## Comprobación retrospectiva

Se usaron las 7.488 velas BTC auténticas archivadas en `evidencia/entrenamiento-x002-20261030/velas.json`, con corte declarado el 30 de octubre de 2026. No son vintages autenticadas de lo que se conocía en cada instante. Cada predicción se ejecutó en `mundo_x::QuantumRuntime`, con el mismo programa XI que la APK; un oráculo independiente se usa exclusivamente en pruebas.

Todas las ventanas usan los mismos objetivos: 64 casos de validación para elegir por Brier, seguidos de 128 casos reservados. Se toma un objetivo cada cuatro velas y se predice el cierre siguiente, sin incluirlo en el entrenamiento. Las ventanas de entrenamiento se solapan. Los empates cuentan como ausencia de subida, según la etiqueta binaria original.

| Historia | Aciertos reservados | Brier | Brier del prior |
| --- | ---: | ---: | ---: |
| 20 horas, 240 velas | 75/128 (58,6 %) | 0,25325 | 0,25040 |
| Un día, 288 velas | 68/128 (53,1 %) | 0,25443 | 0,25138 |
| Tres días, 864 velas | 64/128 (50,0 %) | 0,25573 | 0,25030 |
| Cinco días, 1.440 velas | 59/128 (46,1 %) | 0,25461 | 0,24962 |

Menor Brier es mejor. Una probabilidad constante de 0,5 da 0,25. La validación eligió tres días (Brier 0,24934), pero esa ventaja no se repitió en los datos reservados. Ninguna ventana supera 0,25 en esa comprobación. El 58,6 % observado para la ventana original es otra medida y no valida una señal actual de 58 % de confianza. Una muestra corta de un único período no demuestra una mejora general ni precisión futura.

La ventana original sigue por defecto y las ampliadas pueden compararse manualmente. La app incluye la tabla y avisa que no se demostró una mejora. Los resultados completos, fechas, predicciones, soporte, bins de confianza y hashes se guardan en `evidencia/xn02-ventanas/resultados.json`.

## Reproducir

Con las dependencias fijadas en `deps/mundo-x` y `deps/reverse-pc`:

```bash
node apps/laplace-android/build-xn02.mjs --verify
python3 deps/reverse-pc/scripts/prepare-ether-compat.py deps/mundo-x build/ether-compat
g++ -O2 -std=c++17 -DREVERSE_PC_HAVE_BOUNDED_PRODUCT_IMPORT=1 -Ibuild/ether-compat -Ideps/mundo-x/native/include -Ideps/reverse-pc/src apps/laplace-android/tests/native-xi-runner.cpp -o build/native-xi-runner
python3 apps/laplace-android/tests/xn02-native.py --study
node --test apps/laplace-android/tests/*.test.cjs
node apps/laplace-android/tests/browser-smoke.cjs
gradle -p apps/laplace-android :app:testDebugUnitTest :app:assembleDebug
```

Las pruebas nativas cubren paridad exacta con XN01 a 240 velas, contadores por encima de 255, todas las ventanas, precios planos/subida/bajada y huecos. JUnit comprueba la serialización Android. Chromium verifica que el selector envía 1.440 velas, limpia la confianza anterior y rechaza una confianza contradictoria. Las interacciones de EF004, historial y órdenes siguen en la prueba de regresión. La compilación verifica firma, paquete y recursos del APK.

El paquete 4.1 se instala en paralelo a 4.0 por la firma de depuración de CI; no migra automáticamente registros ni credenciales. No se ejecutaron órdenes reales ni se modificó el conector financiero para entrenar XI.
