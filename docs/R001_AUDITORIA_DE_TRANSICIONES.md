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
