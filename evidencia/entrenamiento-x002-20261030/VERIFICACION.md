# Laplace: pruebas completas y entrenamiento X002

Fecha de trabajo: 30 de octubre de 2026. Las capturas y los informes JSON
conservan sus horas reales en UTC. Las fronteras del backtest son cortes lógicos,
no afirmaciones de ejecución en una fecha pasada.

## Resultado verificable

- **256/256 pruebas aprobadas**, cero fallidas y cero omitidas, con los tres
  ejecutores nativos conectados. Salida completa: `pruebas-completas.txt`.
- **12/12 laboratorios adicionales** completados: física P001, tres cuerpos
  P002 y encuentros/escenarios, cosmología P003 y estrés, singularidad P004 y
  estrés, exabyte P005, salto E005 de estrés/rendimiento e integración E001→E005.
  Sus informes originales comprimidos están en `laboratorios/` y sus hashes
  en `laboratorios.json`. Los umbrales originales no se cambiaron.
- Nueva consulta mundial: **684 estados, 21 dominios y 99 fuentes observadas**.
  Los 684 registros se recuperaron exactamente desde XI/Ether: 21.904 bytes.
  Los siete temas de GDELT fallaron; cinco accesos opcionales requieren
  credenciales o licencia. PortWatch respondió en esta captura.
- U004 mantiene sus **121 estados y seis fuentes** dentro de esa consulta.

## Entrenamiento real, con cuatro particiones

Se archivaron **26 respuestas originales de Coinbase**, con recepción y hash,
que reconstruyen exactamente **7.488 velas cerradas de cinco minutos**. El día
adicional permite calcular rasgos anteriores al inicio del entrenamiento.

El plan se declaró antes de descargar los datos. Se separaron 14 días de
entrenamiento, tres de validación, tres de calibración y cinco de evaluación.
Los cortes exactos están en `plan.json` y `resultado.json`. Ninguna etiqueta
termina después del corte de su partición. El histórico sigue siendo una
evaluación retrospectiva con disponibilidad del cierre supuesta: no se presenta
como una reserva prospectiva autenticada.

Los cinco modelos se ajustaron en el ejecutor temporal nativo, sobre Inverse
Ether Memory original. Los archivos `.xi` y sus calibradores se conservan en
`modelos/`. La calibración escalar es clásica en el anfitrión. El código C++
del ejecutor y el runtime original no se modificaron.

Se reconstruyeron **875 decisiones**, incluidas cinco abstenciones nativas.
Las probabilidades nativas y calibradas se reprodujeron exactamente desde los
programas XI archivados. La prueba está en `reproduccion.json`.

| Horizonte | Casos nativos / elegibles | Dirección nativa | Dirección calibrada | M001 en los mismos casos | Brier calibrado / prior |
|---|---:|---:|---:|---:|---:|
| 15 min | 480 / 480 | 45,83 % | 52,92 % | 50,00 % | 0,249175 / 0,251897 |
| 30 min | 240 / 240 | 46,67 % | 46,67 % | 41,67 % | 0,257324 / 0,255354 |
| 60 min | 120 / 120 | 48,33 % | 48,33 % | 46,67 % | 0,250933 / 0,247828 |
| 240 min | 28 / 30 | 35,71 % | 57,14 % | 50,00 % | 0,245714 / 0,253863 |
| 1440 min | 2 / 5 | 50,00 % | 50,00 % | 100,00 % | 0,228840 / 0,265625 |

Los casos de horizontes distintos comparten precios y no son independientes.
En 15 y 240 minutos el peso elegido fue **cero**: se descartó la señal del
estado y se usó la frecuencia de calibración. Esa mejora no demuestra una
ventaja de XI. A 24 horas solo hay dos estados soportados; con tres observaciones
de calibración se conservó identidad por soporte insuficiente. Los casos
ausentes no se rellenaron con el prior ni se puntuaron como fallos.

M001 tuvo menor error de precio que persistencia solo en el horizonte de 24
horas, con cinco casos. En 15/30/60/240 minutos persistencia tuvo menor MAE.
El conjunto no acredita una mejora predictiva consistente: **sin promoción
automática, sin órdenes, sin activación de nuevas entradas U003/U004**.

## Ajustes aplicados

X001 seleccionaba `alpha` con Brier de la emisión del paso cero, que ese
parámetro no cambia. Se corrigió su criterio a pérdida de transición y se
conservaron los resultados de cada partición. X002 selecciona un parámetro que
sí afecta a la dirección, `prior_strength`, entre 1/4/16/64, y calibra en una
partición separada. El resultado reservado no participa en esa selección.

Las pruebas verifican que cambiar precios reservados no modifica el modelo,
el calibrador ni la primera predicción de cada horizonte. También comprueban
discontinuidades, etiquetas posteriores al corte, presupuestos nativos,
duplicados, integridad de archivos y estados desconocidos.

Se conservan los informes de intentos iniciales comprimidos: hubo una corrección
del adaptador de fechas numéricas a ISO para el contrato de calibración y una
aclaración de los cortes lógicos en los metadatos. El plan estadístico se mantuvo.
Cuatro laboratorios necesitaron instalar GNU Time, ausente en el entorno; luego
se repitieron sin relajar comprobaciones. `ejecutores.json` registra versiones,
revisiones y hashes de los binarios realmente utilizados.

## Registro prospectivo M001 existente

Se verificó la cadena de 26 eventos de la rama de datos fijada en
`3704478ee2fc26c27773c96b07c73d763912c617`. Su resumen original se reconstruyó
exactamente: 15 pronósticos y ocho resultados.

En una copia local se contrastaron tres objetivos adicionales ya vencidos contra
sus velas reales de un minuto: **11 evaluaciones, cinco aciertos de dirección y
dos de precio** dentro de 10 pb. Los pronósticos originales no se reescribieron;
el diario remoto de producción no se modificó. Original, copia auditada,
resúmenes y respuestas están en `m001-prospectivo/`. Es una muestra pequeña,
distinta del backtest X002, y no se usó para seleccionar sus parámetros.

## Comandos de reproducción

```bash
MUNDO_X_QUANTUM=/ruta/mundo_x_quantum \
LAPLACE_TEMPORAL=/ruta/laplace_temporal \
REVERSE_PC_BIN=/ruta/reverse_pc npm test

npm run entrenar -- /ruta/laplace_temporal DIRECTORIO_NUEVO \
  evidencia/entrenamiento-x002-20261030/velas.json
```

El informe reproducido tendrá otra hora de generación. Sus métricas,
programas entrenados, cortes y probabilidades deben coincidir cuando se usa
la misma versión del código. Los hashes del código y de las entradas están
registrados en cada informe.
