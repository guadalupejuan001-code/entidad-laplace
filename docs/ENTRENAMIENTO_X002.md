# X002: entrenamiento, calibración y evaluación temporal

X002 ajusta probabilidades de dirección BTC a 15, 30, 60, 240 y 1440 minutos.
El ajuste de conteos y la probabilidad por estado se ejecutan en el binario
`laplace_temporal`, sobre QuantumRuntime/Inverse Ether Memory original. El
anfitrión prepara entradas, selecciona parámetros y aplica calibración escalar
clásica; no simula el motor XI ni declara aceleración cuántica.

## Un error de selección corregido

X001 seleccionaba `alpha` por Brier de la emisión del paso cero. `alpha` cambia
la matriz de transición, pero no esa emisión. Ahora X001 selecciona `alpha`
por pérdida logarítmica de transición y conserva todas las particiones en su
informe. Los resultados históricos ya archivados no se reescriben.

X002 selecciona `prior_strength` entre 1, 4, 16 y 64. Este parámetro sí cambia
la regularización de las emisiones direccionales. Una prueba nativa demuestra
ambas relaciones. El ejecutor y su fuente C++ permanecen sin cambios.

## Cuatro particiones, sin etiquetas posteriores al corte

El plan se escribe antes de descargar los datos:

1. Entrenamiento: 14 días. Estados de cuatro bits extraídos de seis velas
   cerradas; etiquetas al terminar el horizonte correspondiente.
2. Validación: tres días. Selección por Brier; empate favorece mayor regularización.
3. Calibración: tres días. Tras seleccionar, se reajustan conteos con los últimos
   14 días anteriores a esta partición. Se ajusta una mezcla escalar de la
   probabilidad nativa y la frecuencia de esta partición con pesos
   1, 0,75, 0,5, 0,25 y 0. Con menos de ocho casos se conserva identidad.
4. Evaluación: cinco días reservados. Modelo y calibrador se congelan antes de
   generar las predicciones. Sus hashes y los de las observaciones se conservan
   por separado. El resultado no selecciona parámetros ni activa producción.

Dentro de cada horizonte, los intervalos objetivo no se solapan. El entrenamiento
selecciona hasta 256 filas uniformemente del conjunto elegible para respetar el
presupuesto nativo. No se inventan etiquetas para completar ese cupo. Los cinco
horizontes comparten datos y no constituyen ensayos independientes.

Un estado no observado produce abstención. Las comparaciones nativo/calibrado/
prior y M001 usan los mismos casos soportados; el informe también conserva la
cobertura completa de M001 y su error frente a persistencia. Brier mide subida
frente a no subida; la exactitud direccional distingue subida, bajada y cierre
sin cambio. No se confunden esas métricas ni se asigna una probabilidad artificial
de subida al precio persistente.

Un peso de calibración cero elimina la señal del estado y usa exclusivamente
la frecuencia de calibración: una mejora así no demuestra poder predictivo de XI.

## Disponibilidad histórica y límites

El proveedor entrega hoy velas pasadas. La recepción real se conserva con URL,
hash y respuesta original; asumir que un cierre estaba disponible en su antigua
fecha es una hipótesis retrospectiva explícita, no una certificación de vintages.
La evaluación es cronológica retrospectiva, no una nueva validación prospectiva
autenticada. Una modificación de precios reservados no puede cambiar el modelo,
calibrador ni la primera predicción, como comprueban las pruebas nativas.

Las fuentes U003/U004 capturadas hoy quedan excluidas del entrenamiento pasado:
no tenemos todavía sus vintages intradía verificables. Un ensayo exitoso de
transporte de datos por Ether tampoco acredita una mejora predictiva.

## Reproducir

```bash
LAPLACE_TEMPORAL=/ruta/laplace_temporal npm run test:entrenamiento
npm run entrenar -- /ruta/laplace_temporal registros/ensayo-nuevo
# Reutilizar exactamente las velas archivadas, sin volver a descargarlas:
npm run entrenar -- /ruta/laplace_temporal registros/reproduccion RUTA_VELAS_JSON
```

El directorio de salida debe ser nuevo: el programa protege el plan, el informe,
los modelos `.xi` y sus metadatos contra sobrescritura. Para reproducir las velas
desde HTTP se usa `replayTrainingBars` de `tools/entrenar.mjs`; valida cada hash.
El informe completo contiene todos los pronósticos, sus objetivos, las
observaciones y las comparaciones, además de los programas nativos entrenados.

Para ejecutar toda la batería sin omitir pruebas nativas, conectar también
`MUNDO_X_QUANTUM` y `REVERSE_PC_BIN` antes de `npm test`. Los ejecutores se compilan
desde las revisiones fijadas por los workflows, incluidos los overlays
verificados que forman parte del propio REVERSE-PC.

La API oficial de Coinbase limita a 300 velas por petición. El recolector usa
ventanas de 24 horas para cinco minutos, excluye la vela sin cerrar, valida
duplicados y OHLCV, conserva discontinuidades y limita las respuestas a 512 KiB:
https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
