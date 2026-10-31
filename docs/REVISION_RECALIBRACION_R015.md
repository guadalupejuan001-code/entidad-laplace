# Revisión y ensayo de recalibración R015

## Estado de producción

No se activó la nueva calibración ni se modificó main. Base revisada: 6a593fdb7523677790ba1b6c47adb63b120c1613. La rama de auditoría conserva el colector de datos y este informe. El código experimental, los datos completos, resultados por ventana y pruebas se entregaron en el paquete de auditoría de la conversación; no están conectados al panel de producción.

## Pronósticos originales contrastados, sin reescribirlos

Horas locales: America/New_York, 29 de octubre de 2026.

| Emisión aproximada | Objetivo | Precio inicial USD | Pronóstico emitido USD | Cierre de la vela del minuto objetivo USD | Error absoluto frente a ese cierre USD | Error de persistencia USD |
|---|---|---:|---:|---:|---:|---:|
| 14:14:38 | 14:29:38.100 | 80741.69 | 80741.69 | 80682.60 | 59.09 | 59.09 |
| 21:07:33 | 21:22:33.343 | 76906.85 | 76799.49 | 76782.78 | 16.71 | 124.07 |

La primera referencia es el cierre de la vela 18:29:00–18:30:00 UTC: mínimo 80664.43, máximo 80698.70. La segunda corresponde a 01:22:00–01:23:00 UTC del 30 de octubre: mínimo 76755.00, máximo 76849.91. El primer cierre es 21.9 segundos posterior al objetivo nominal; el segundo, 26.657 segundos posterior. El cierre refleja la última operación del intervalo, no necesariamente una operación en su segundo final.

Por tanto, la predicción nocturna fue bajista y se aproximó mejor que la persistencia al cierre consultado. Esto NO verifica el precio del segundo exacto, no prueba ventaja repetible ni significa que Laplace hubiera anticipado toda la caída desde 80 mil a 76 mil.

El pronóstico de las 14:14 se conserva en evidencia/BTC-I015-20261029T181438Z.json. El de las 21:07 se recuperó sin modificar de captura-red.json, artefacto 12946336318, ejecución 40983921912. Sello original de esa captura: bd369bd07459ec30f3a4a87affeef0201fcc5219e72763b11d31740701ddd827.

## Deficiencias revisadas

- La prueba anterior puntuaba 48 decisiones separadas cinco minutos para objetivos de quince minutos; sus intervalos se solapaban. No eran 48 ensayos independientes.
- El estado de semejanza usaba el último cierre, sin incorporar el movimiento entre ese cierre y la cotización instantánea.
- No había ajuste separado de magnitud/sesgo y un bloque posterior reservado para comprobarlo.

## Ensayo R015

Catálogo de análogos congelado antes de calibrar; 20 resultados no solapados para ajustar factor y sesgo; 20 posteriores reservados para evaluar. Factores fijos ensayados: 0, 0.25, 0.5, 0.75, 1. El sesgo se estima por mediana ponderada para minimizar el error absoluto del retorno simple. Controles futuros: mejora relativa mínima del 5 %, RMSE no peor y mejora en ambas mitades del bloque. Desfase máximo cotización/cierre: 60 segundos; saltos excesivos se marcan fuera de soporte. Reglas fijadas antes de inspeccionar esta muestra, no retocadas para favorecer la caída.

Datos: 2304 velas de cinco minutos, del 22 de octubre de 2026 a las 02:00 UTC al 30 de octubre a las 02:00 UTC. Descarga posterior: 30 de octubre a las 02:49:46.303 UTC. No se certifican versiones originales punto-en-tiempo.

Comparación: 34 bloques, 680 resultados reservados de quince minutos, sin solapamiento entre horizontes evaluados. Esto no los hace estadísticamente independientes. Se puntúan los candidatos previamente congelados, sin sustituir retrospectivamente cada resultado por el método ganador.

| Método | MAE de retorno, en puntos porcentuales | RMSE de retorno, en puntos porcentuales |
|---|---:|---:|
| Persistencia | 0.11625716275625436 | 0.17647408214901908 |
| Candidato original | 0.11990383597310622 | 0.18098080856539495 |
| Candidato recalibrado R015 | 0.12196644864761973 | 0.1812404608688 |

Decisión: NO activar R015. Su MAE empeoró un 1.7202224 % frente al candidato original y un 4.9109111 % frente a persistencia. La comparación no es un historial de operaciones de la aplicación ni mide beneficio neto de comisiones.

Pruebas locales: 38/38 del panel existente y 12/12 del experimento. Suite completa: 113 aprobadas, 0 fallidas y 61 omitidas por faltar ejecutores nativos en ese entorno. No se afirma haber vuelto a ejecutar esas 61 pruebas ni haber probado un teléfono físico.

## Procedencia reproducible

Datos de Coinbase Exchange obtenidos mediante ejecución 40993921057, artefacto 12950436545. SHA-256 del archivo datos.json: 1821574d01be8fe087719f22585d64d925776c993aa12d9f20d1d941327dc5b9. El archivo completo y los resultados por ventana se incluyen en el paquete entregado.

Documentación de velas: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
Validación temporal: https://otexts.com/fpp3/toolbox.html#time-series-cross-validation
