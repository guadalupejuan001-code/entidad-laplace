# X001 — primera prueba real del núcleo XI/Ether contra M001

Revisión X002: se comprobó que `alpha` no modifica la emisión direccional del
paso cero. La selección actual de X001 usa pérdida de transición; X002 ajusta
`prior_strength` y una partición de calibración separada. Los resultados
históricos de este documento se conservan. Véase [X002](ENTRENAMIENTO_X002.md).

Fecha de ejecución: 2026-10-30 UTC. Rama experimental: `experiment/xi-market-headtohead-20261030`. Producción sin cambios.

## Objetivo
Dar una prueba directa al ejecutor temporal nativo de Laplace usando el mismo mercado y un objetivo definido antes de ver los resultados: **dirección del siguiente intervalo cerrado de cinco minutos**.

El estado de mercado se comprimió a cuatro bits observables, calculados únicamente con velas ya cerradas:
1. retorno de 5 minutos no negativo;
2. retorno de 15 minutos no negativo;
3. movimiento de 5 minutos mayor que RMS de 30 minutos;
4. volumen actual mayor que la media de 30 minutos.

El aprendizaje de conteos/emisiones se ejecuta en `laplace_temporal`, y el modelo queda materializado en **original-inverse-ether-memory**. El host solo prepara estados y puntúa el resultado.

## Diseño de comparación
- 14 días de velas BTC-USD de Coinbase.
- 8 folds consecutivos.
- Por fold: 192 filas de entrenamiento, 32 de validación para seleccionar alpha y 32 de test reservado.
- 256 decisiones de test en total.
- M001 recibe el mismo corte histórico y objetivo de 5 minutos.
- La referencia usa solo el prior aprendido en el bloque anterior.
- No hay órdenes, dinero, selección sobre el test ni cambio automático de producción.

## Resultado agregado

| Ruta | Decisiones | Exactitud direccional |
|---|---:|---:|
| **XI/Ether nativo X001** | 256 | **54.296875 %** |
| M001 | 256 | 48.828125 % |
| Referencia | 256 | 47.65625 % |

Diferencia XI/Ether - M001: **+5.46875 puntos porcentuales**.
Diferencia XI/Ether - referencia: **+6.640625 puntos porcentuales**.

### Calibración de probabilidades

| Ruta | Brier |
|---|---:|
| XI/Ether X001 | 0.256693186506883 |
| Referencia | **0.25258132488840157** |

Brier skill XI/Ether: **-0.0162793572**. Menor Brier es mejor.

**Interpretación:** en esta primera muestra reservada, el núcleo nativo clasificó la dirección con mayor frecuencia de acierto que M001 y la referencia, pero sus probabilidades fueron peores calibradas que la referencia. No corresponde llamarlo todavía predictor superior de precio.

## Qué sí demuestra
- La ruta XI/Ether puede recibir un estado intradía real, aprender en Inverse Ether Memory y emitir resultados reproducibles.
- No era correcto evaluar todo el potencial del núcleo únicamente desde M001.
- Existe una señal experimental suficiente para justificar una segunda iteración centrada en calibración, estabilidad por folds y luego magnitud de precio.

## Qué NO demuestra
- No demuestra rentabilidad.
- No demuestra predicción de precio absoluto.
- No demuestra causalidad del mercado.
- 54.3 % en 256 decisiones no establece por sí solo una ventaja persistente.
- Las observaciones de cinco minutos cercanas pueden compartir condiciones de mercado y no son ensayos independientes perfectos.

## Próximo criterio
No integrar X001 como predictor de producción todavía. Próxima fase: congelar el codificador de estados, calibrar probabilidades únicamente en validación, inspeccionar desempeño por fold y por régimen, y ejecutar una segunda reserva temporal fresca. Solo después probar magnitud de retorno/precio.

Evidencia CI: workflow `LAPLACE X001 - XI Ether contra M001`, ejecución 41010333832.
