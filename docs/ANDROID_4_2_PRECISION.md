# LAPLACE 4.2: medir la cercanía del precio

El registro ya calculaba el error por caso, pero su indicador principal destacaba la dirección. Ahora el resumen y la etiqueta de cada caso muestran primero el error del precio. Se conserva el resultado de dirección por separado.

## Medidas

| Medida | Cálculo y alcance |
| --- | --- |
| Error de precio | Valor absoluto de previsto menos cierre observado. |
| Error relativo | Error absoluto dividido por cierre observado, por 100. |
| Error típico | Mediana; promedio de los dos valores centrales cuando hay un número par. |
| Error medio, MAE | Promedio de los errores absolutos. |
| P90 | Rango más próximo: posición `ceil(0,9 × n)` de los errores ordenados. Se muestra desde diez casos; al menos el 90 % no supera ese valor. |
| Máximo observado | Mayor error de todos los registros evaluados del grupo; los pendientes no cuentan como aciertos ni como errores cero. |
| Referencia | Error de mantener el precio inicial, sobre los mismos resultados. |
| Reducción del error | `100 × (1 − MAE_modelo / MAE_referencia)` dentro de una serie comparable. En un resumen de varias series usa los errores relativos por caso. Si la referencia tiene error cero, no se divide entre cero. |
| Sesgo por grupo | Promedio de previsto menos real: positivo indica precios previstos mayores que los observados. |
| Calidad temporal | Cierres que coinciden con la hora objetivo, cierres posteriores y fechas no comparables; se muestra el máximo retraso. |

Los grupos separan activo, plazo, resolución y mercado. Sólo se agregan errores en USD dentro de un grupo; un resumen de varios grupos usa porcentajes. El selector de resultado filtra la lista, pero no altera las métricas del activo/plazo para evitar que mostrar sólo aciertos mejore artificialmente el resumen.

La evaluación conserva el método anterior: primer cierre disponible a partir del objetivo, dentro de una vela, sin interpolación de ticks ni modificación del precio o la hora originales. Los plazos bursátiles se cuentan por velas/sesiones. Un cierre posterior no se presenta como precio observado al segundo exacto del objetivo.

Una diferencia pequeña respecto al precio real puede coexistir con una dirección equivocada y con un error mayor que mantener el precio inicial. La app muestra esas tres medidas. El umbral de cercanía puede elegirse entre 0,01 %, 0,05 %, 0,1 %, 0,5 % y 1 %. Ese umbral describe el registro; no es probabilidad de éxito futuro.

Los $30 habituales y el máximo de $500 mencionados por el usuario no se cargan como estadísticas ni como límite del modelo: los valores reales deben salir del historial completo del teléfono. No se obtuvo ese historial durante el desarrollo.

## Importar y conservar casos

4.2 se instala con el paquete de prueba `com.entidadlaplace.mobile.learn42`, versionCode 17. Para trasladar registros:

1. En la instalación anterior: Historial → Exportar JSON.
2. En 4.2: Historial → Importar JSON y elegir el archivo.

Android usa el selector del sistema, sin permisos adicionales de almacenamiento. El archivo se limita a 8 MiB y 20.000 registros por importación. Se aceptan exportaciones `laplace-local-evidence-v3` y `v4`. Antes de importar se valida el archivo completo: activo permitido, identidad, fechas, precios, resolución y cierre de evaluación. Si hay un registro inválido, no se importa parcialmente.

Los identificadores ya existentes se conservan y no se sobrescriben. Las cifras exportadas de métricas se ignoran: el resumen se recalcula a partir de los registros. Cada caso nuevo se marca como importado; sus precios y fechas originales permanecen. Una importación no autentica al proveedor ni vuelve a consultar sus cierres. Si el almacenamiento falla, el registro en memoria anterior se conserva.

La exportación v4 incluye todos los registros, métricas por caso, resumen global y grupos. No traslada claves ni credenciales del conector financiero.

## Verificación

Las pruebas unitarias incluyen las cifras de las capturas: $20,20 de error con dirección incorrecta y $37,99 con dirección correcta. Una muestra sintética de diez casos con errores 1–9 y 500 comprueba mediana 5,50, MAE 54,50, P90 9 y máximo 500. Son fixtures para comprobar fórmulas, no resultados de mercado.

Se comprueban también grupos separados por activo/plazo/resolución, referencia con error cero, fechas ausentes, retraso de 197 segundos, importación v3, duplicados, métricas exportadas falsas, archivo corrupto y rechazo sin cambios parciales. Chromium prueba selección del archivo, conservación de los 44 casos previos, importación y datos sin redondear, filtros, métricas conocidas y pantalla de 320 px. La regresión mantiene XI, EF004, cuenta virtual y conector manual.

```bash
node --test --test-reporter=tap apps/laplace-android/tests/*.test.cjs
node apps/laplace-android/tests/browser-smoke.cjs
```

La compilación Android incluye JUnit, el ejecutor XI original y comprobación de firma y recursos del APK. Este cambio mide resultados; no modifica los motores predictivos ni afirma un aumento de precisión.
