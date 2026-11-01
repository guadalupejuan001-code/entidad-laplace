# LAPLACE R001 · Auditoría de cambios de régimen (ciclos de investigación)

## Por qué existe si ya tenemos M004

La APK 3.8 en main ya ejecuta M004, que describe regímenes de
volatilidad, tendencia y actividad y evalúa la magnitud de los retornos.
R001 NO es una segunda implementación para reescribir ese motor.
Es una capa de comprobación *independiente y aislada* para responder:

1. ¿Con qué frecuencia cambia el estado de volatilidad?
2. ¿El estado actual añade información al estado de la siguiente vela
   frente a una frecuencia incondicional aprendida del pasado?
3. ¿Ayuda a anticipar la amplitud absoluta del siguiente retorno
   mejor que la mediana histórica de la amplitud?

Un resultado positivo no establece causalidad, rentabilidad o capacidad
de predecir un precio puntual.

## Ciclo R001.1: estado conocido a la fecha

Velas OHLCV cerradas de BTC/USD, de cinco minutos. Se calcula RMS
volatilidad de las últimas 24 velas, se compara con los percentiles
25 y 75 de una distribución histórica de **288 ventanas anteriores**.
La ventana actual no participa en sus propios umbrales.

Las discontinuidades dejan de producir estados. No se rellenan huecos,
no se interpreta ausencia como volatilidad baja y un cierre de vela
no puede tener fecha superior al corte. Solo tres estados: bajo,
normal, alto. La tendencia es un descriptor adicional, no una ley.

## Ciclo R001.2: transición y amplitud

Para cada estado en t se compara el estado realizado en t+1, siempre
que las velas sean consecutivas. Una probabilidad de transición
condicionada se aprende de las frecuencias históricas con suavizado
aditivo fijo, sin selección usando el futuro. Se compara con la
frecuencia incondicional de régimen y con «permanece igual».

Además, el modelo estima la mediana histórica de la **magnitud** del
siguiente retorno condicionado por régimen; se compara con la
mediana incondicional. Cada estimación sólo consume etiquetas que
habían madurado antes del periodo reservado.

## Ciclo R001.3: prueba temporal

Tres particiones cronológicas: 70–80 %, 80–90 % y 90–100 %.
Se readapta exclusivamente al pasado antes de evaluar cada tramo.
Se publican *todos* los errores Brier, MAE en puntos básicos, casos
y periodos sin seleccionar umbrales ni modelo a partir del holdout.

Los ejemplos de velas consecutivas están autocorrelacionados.
**No equivalen a miles de experimentos independientes** ni demuestran
ventaja fuera de este conjunto histórico. La captura X002 usa
cierres pasados cuya disponibilidad intradía se supone, no se
certificó mediante vintages de cada cierre. El script verifica el
SHA de las filas, pero no vuelve a descargar cada respuesta
original individual del proveedor.


## Resultado medido sobre el archivo X002 (1 de noviembre de 2026)

Se procesaron 7.488 velas BTC de 5 min, dando 7.176 clasificaciones
retrospectivas, 7.175 transiciones cronológicas comparables y
2.153 transiciones puntuadas en tres holdouts. Las transiciones
contiguas **no son observaciones estadísticamente independientes**.

| Holdout | Brier de transición R001 | Brier «mismo régimen» | Brier incondicional | MAE de magnitud R001 (pb) | MAE de magnitud incondicional (pb) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 0,13060 | 0,13928 | 0,63978 | 3,7843 | 3,8593 |
| 2 | 0,13076 | 0,13947 | 0,64247 | 4,7166 | 4,8467 |
| 3 | 0,11861 | 0,12535 | 0,64302 | 6,5891 | 6,8025 |

El Brier de estado mejora muchísimo contra *frecuencia
incondicional* pero solo ligeramente contra la referencia más fuerte
**«el régimen permanece igual»**. Esto muestra que la persistencia
de la clasificación explica gran parte de la aparente ventaja.

Las mejoras medias de magnitud fueron 0,075, 0,130 y 0,213 puntos
básicos. El remuestreo exploratorio de los errores emparejados mediante
bloques contiguos de **72 velas (6 horas)** dio estos intervalos
percentiles 2,5–97,5 para «mejora en puntos básicos»:

- Holdout 1: [-0,068, 0,215].
- Holdout 2: [0,002, 0,276].
- Holdout 3: [0,050, 0,396].

**El primer intervalo incluye cero.** Los otros dos son positivos bajo
este procedimiento exploratorio, pero la muestra temporal es corta,
el tamaño de bloque se eligió heurísticamente, y la estrategia se
ha analizado repetidamente. No constituye prueba prospectiva ni
garantiza una ventaja estable con más datos, otro activo o costes
reales de negociación.

### Decisión

R001 queda **aislado como auditoría**. No ajusta ninguna predicción
de precio, no modifica M004, no altera la APK 3.8 y no se habilita
trading. El próximo ciclo debe congelar hipótesis y probarlas contra
observaciones que lleguen después de la fecha de emisión original.

## Ciclo R001.4: conexión opcional

Conservar R001 en backend como auditoría, sin activar ninguna inferencia
ni cambiar M004, F001, F002, M001, XI o Ether. La decisión de incorporar
una señal a la próxima APK requiere una evaluación posterior con
predicciones congeladas antes de recibir las etiquetas futuras.

## Reproducción

    node --test tests/regime-r001.test.mjs
    node tools/regime-r001.mjs \
      evidencia/entrenamiento-x002-20261030/velas.json \
      build/r001/reporte.json

El CI verifica los datos históricos reales y publica un artefacto
JSON con probabilidades y errores sin resúmenes maquillados.
**Nunca genera ni ejecuta órdenes financieras.**
