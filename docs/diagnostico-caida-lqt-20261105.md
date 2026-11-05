# Caída BTC: fallo de una hora y diagnóstico de actividad

El pronóstico emitido el 5 de noviembre de 2026 a las 09:22:25 de Nueva York
esperaba 79,334.66734130758 USD desde una referencia de 79,313.98 USD. El
cierre objetivo de las 10:20 quedó registrado en 77,247.21 USD. El error
absoluto es 2,087.4573413075705 USD; la dirección falló y el cierre quedó
fuera del intervalo histórico central del 80% de esa emisión.

Los cierres son los contenidos en la exportación del usuario. Esta auditoría
no los certifica contra una segunda fuente ni reconstruye noticias o un libro
de órdenes histórico ausentes del archivo.

## Señales que se pueden reconstruir antes del objetivo

Se comparan exclusivamente datos de entrada registrados en dos pronósticos
del mismo activo, resolución, algoritmo y horizonte. Ambos estaban emitidos
antes de que terminara el período fallido. No se leen sus resultados futuros.

| Medida de referencia | Cierre 00:50 | Cierre 09:20 | Razón |
| --- | ---: | ---: | ---: |
| Volatilidad del horizonte (%) | 0.29082454309670464 | 0.4308626996888525 | 1.4815211092606533 |
| Volumen del horizonte (BTC) | 115.56211812000001 | 505.90452171 | 4.37777127955259 |

La separación entre esas observaciones es de **8 horas y 30 minutos**.
El volumen de referencia se obtiene de las 24 velas anteriores y se escala
al horizonte. La volatilidad de referencia se obtiene de los retornos de
esas mismas 24 velas. Estas razones describen un cambio de actividad; no
son probabilidades de desplome ni prueban por sí solas un precursor causal.

En `laplace_campaign.hpp`, `CampaignModel::predict` usa
`magnitude * (2 * probability - 1)` para el retorno normalizado del precio.
Con una probabilidad de subida de 0.5356418139592403, ese factor es
0.0712836279184806. Este mecanismo comprime el movimiento central cuando
la dirección es incierta. Un movimiento central pequeño no caracteriza
por sí solo el riesgo de eventos extremos. La fusión C03 se abstuvo en
este caso y no modificó el precio central.

## Cambio implementado

`forecast-risk.js` conserva un diagnóstico de actividad por emisión:

- Compara volatilidad y volumen de referencia con la emisión anterior
  disponible del mismo contexto; conserva también la separación temporal.
- Guarda las últimas 31 velas cerradas usadas por el diagnóstico, el cierre
  conocido y la huella del programa nativo que ya devolvía Android.
- Compara las últimas seis velas con las 24 anteriores para describir
  cambios de volumen y volatilidad, sin usar velas parciales o futuras.
- Muestra una alerta visible cuando una razón de actividad se duplica.
  Un hueco impide calcular los indicadores de ventana regular.
- La probabilidad de caída extrema queda en `null`, con estado
  `not_established`. La ausencia de alerta no se presenta como seguridad.
- Al importar un respaldo se recalculan los indicadores para validar las
  cifras guardadas; los respaldos anteriores siguen siendo compatibles.

La duplicación es una regla descriptiva fijada en esta revisión. Se ha
desarrollado después de ver el fallo y **no está validada como predictor**.
El caso activa la regla de volumen en una reconstrucción posterior; no se
añade una alerta retrospectiva al registro original ni se suma un acierto.

El diagnóstico usa cálculos descriptivos en la interfaz. El modelo, su
circuito de 1,000 qubits, sus coeficientes, sus 33 checkpoints empaquetados
y sus resultados originales se conservan. Este cambio no demuestra una
mejora del pronóstico de precio ni entrena el circuito con el caso.

## Reproducción

```sh
node tools/auditar-riesgo-lqt.mjs /ruta/LAPLACE-LQT-aprendizaje.json
node tools/auditar-riesgo-lqt.mjs
node --test apps/laplace-android/tests/forecast-risk.test.cjs
```

El primer comando audita la exportación. El segundo usa la fixture reducida
de las dos emisiones; contiene la huella de la exportación y sustituye los
identificadores del diario por identificadores de regresión. La fixture
queda marcada como caso de desarrollo y no como validación prospectiva.

La auditoría completa reproduce 12 emisiones, nueve cierres comprobados,
cuatro aciertos de dirección y 354.57932819988247 USD de error medio de
precio. Las pruebas cambian los resultados posteriores y añaden velas y
emisiones futuras; las señales anteriores deben permanecer idénticas.

La exportación original no incluye el historial OHLCV ni el checkpoint de
cada emisión: contiene solo el último checkpoint seleccionado. Por tanto,
no permite repetir exactamente la inferencia nativa de las 09:22. Las 31
velas nuevas permiten repetir el diagnóstico, no la inferencia completa.

## Validación pendiente

Evaluar la regla congelada en días y eventos distintos, conservando también
períodos tranquilos, para medir anticipación, cobertura de eventos y falsas
alarmas. Este caso ya conocido queda excluido de cualquier afirmación de
ventaja predictiva independiente. Entrenar de manera separada la magnitud
y las colas requerirá una campaña nueva con selección y prueba temporal
reservadas; ensanchar intervalos hasta cubrir este resultado no demostraría
capacidad para anticipar la caída.
