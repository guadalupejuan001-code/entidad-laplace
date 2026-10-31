# LAPLACE P002 — resultados del primer experimento gravitacional de tres cuerpos

**Fecha de verificación:** 28 de octubre de 2026.
**CI reproducible:** https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/40758654257

LaPlaceDIG ejecuta las leyes de fuerza de tres masas en 2D dentro de XI Machine de REVERSE-PC, cuyo QuantumRuntime original y la memoria Ether están fijados por commit. El código nuevo solo compila instrucciones XI y ensaya su resultado; no añade un motor físico en C++/Python ni usa un servicio de simulación externo.

## Pruebas funcionales

**8/8 pruebas nativas aprobadas, 0 fallos, 0 omisiones.** Verifican:

- Las tres masas se atraen entre sí; no se modela una estrella central fija que ignore las otras fuerzas.
- La posición y velocidad del sistema calculadas por XI coinciden dentro de tolerancia declarada con una referencia de integración gravitacional independiente en doble precisión.
- El paso 64 calculado en una sesión coincide exactamente con el paso 32+32 calculado al restaurar el estado físico RVPC2 desde disco.
- Lectura de 123 bytes de Inverse Ether Memory, reconstrucción de 15 observables de estado y verificación exacta contra el resultado publicado por el ejecutor.
- Rechazo de entrada corrupta, reanudación sin estado y rollback transaccional sin sobrescritura.
- Ejecución genuina como ejecutable RXE1 de REVERSE-PC con 4160 instrucciones, 327 constantes y archivo de 73872 bytes.

### Campaña A — órbita acoplada cercana a una figura de ocho

Estado inicial (escala Q=100000): tres masas iguales; posiciones (-97000,24309), (97000,-24309), (0,0). Velocidades (46620,43236), (46620,43236), (-93240,-86472).

A 64 pasos, las posiciones de salida fueron:
- Cuerpo 1: (-93874,26913), velocidad (54449,40944).
- Cuerpo 2: (99650,-21587), velocidad (39407,44744).
- Cuerpo 3: (-5824,-5362), velocidad (-93824,-85718).

Se compararon dos ejecuciones con una diferencia inicial de solo 50 ticks en x del tercer cuerpo. El sistema produjo trayectorias distintas, con distancia máxima observada 0.0005 en las 64 iteraciones. **No se demostró aumento exponencial de la separación ni un exponente de Lyapunov**.

La energía mecánica suavizada calculada sobre los observables fue:
- inicial: -1.284524708275567;
- final: -1.2846228980114043;
- deriva relativa absoluta: **0.007644051936456076 %**.

Este error pertenece a la familia de escenarios ensayados: ni conservación exacta ni precisión arbitraria de cuerpos reales.

### Campaña B — primer acercamiento gravitacional

En un segundo escenario, dos cuerpos comenzaron a distancia 0.36 (normalizada) con masas 0.2 cada uno, atraídos también por un tercero de masa 0.15. Las velocidades iniciales se definieron antes de ejecutar el modelo. Se buscó el **primer instante en que la distancia entre los dos cuerpos fuera <= 0.25**.

XI identificó el acontecimiento en el **paso 114**, equivalente a 0.111328125 unidades de tiempo. Una referencia de doble precisión, calculada sin usar las raíces cuadradas enteras de XI, lo identificó en el paso **113**. La diferencia de un paso quedó dentro del criterio de aceptación declarado (±2 pasos).

Muestras observadas de distancia, en las mismas unidades normalizadas:

| Paso | Distancia |
| ---: | ---: |
| 0 | 0.360000 |
| 32 | 0.333704 |
| 64 | 0.303975 |
| 96 | 0.270099 |
| 128 | 0.231047 |
| 160 | 0.185032 |
| 192 | 0.128369 |
| 224 | 0.050848 |
| 240 | 0.007002 |

Al aproximarse tanto, el error relativo de energía aumenta frente al ensayo A. Al final del escenario B el desvío del valor inicial fue aproximadamente 3.9 %; cuando la separación es menor que el suavizado epsilon=0.05, la dinámica corresponde a la ley gravitatoria regularizada, NO a una colisión newtoniana pura. P002 detecta acercamientos; **no simula impactos, fusiones ni fuerzas de contacto**.

### Campaña C — nueve hipótesis iniciales para la fecha del evento

Se variaron dos componentes de velocidad del cuerpo 1 de forma controlada: delta vx ∈ {-0.07,0,+0.07} y delta vy ∈ {-0.03,0,+0.03}. Cada combinación se calculó en XI hasta el paso 176, conservando snapshots y reloj de estado.

| Primer cruce del umbral de 0.25 | Escenarios de 9 |
| ---: | ---: |
| Paso 107 | 3 |
| Paso 114 | 3 |
| Paso 121 | 3 |

Los **9/9 escenarios** cruzaron el umbral antes del paso 176. Seis lo habían cruzado al finalizar el paso 114 y los nueve antes del 128.

Si se les asigna peso igual, la fracción con evento ocurrido al paso 114 es 6/9. **Esto no es una probabilidad real calibrada**: son nueve supuestos declarados; su frecuencia depende de la selección del conjunto y no identifica una distribución empírica de condiciones iniciales.

La amplitud de 107–121 pasos expresa la sensibilidad del tiempo de evento a esas hipótesis, no un límite físico universal a la predictibilidad.

## Qué logra Ether y qué sigue faltando

- Tres cuerpos con masas, posiciones y velocidades evolucionan mediante una única autoridad de estado REVERSE-PC / Inverse Ether Memory.
- Las reglas gravitatorias, la integración numérica, los eventos y la persistencia ocurren en XI Machine.
- La memoria registra diferencias contra un fondo implícito; el experimento A terminó con un máximo observado de 58 excepciones. **No equivale a que toda la computación ocupe 58 bytes de RAM**.
- El laboratorio numérico necesita pasos para actualizar fuerzas y estados; no se puede aplicar sin más la exponenciación compacta de E005 a esta ley no lineal.
- El ejecutor sigue siendo CPU convencional, no qubits físicos; no hay ventaja cuántica demostrada.
- Gravedad suavizada y aritmética de precisión finita imponen error; los encuentros cercanos exigen estudiar paso adaptativo, integradores de mayor orden, rechazo por error y precisión física.

## Reproducibilidad y fuentes

Archivos fuente versionados:
- fisica/tres-cuerpos.mjs
- tools/gravedad.mjs
- tests/tres-cuerpos.test.mjs
- tests/tres-cuerpos-experimento.mjs
- tests/tres-cuerpos-encuentro.mjs
- tests/tres-cuerpos-escenarios.mjs

En la ejecución CI enlazada se conservan las cuatro pruebas y ejemplos como resultado.json, encuentro.json, escenarios.json, Gravedad-P002.rxe, el programa XI y los snapshots RVPC2. El trabajo previo P001 y E005 permanece independiente y sin cambios.

La siguiente investigación prioritaria es un **integrador adaptativo validado** que concentre cálculo en encuentros cercanos y mida hasta dónde alcanza la confianza temporal, sin dejar de representar las causas y las restricciones de recursos.
