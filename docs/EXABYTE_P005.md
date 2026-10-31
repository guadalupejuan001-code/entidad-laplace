# LAPLACE P005 — cálculo exacto sobre un exabyte de celdas lógicas

## Problema concreto

Se define un anillo de **2^60 = 1 152 921 504 606 846 976 celdas binarias**. Una representación densa necesitaría:

- **1 152 921 504 606 846 976 bytes** (1.153 exabytes decimales) si se reserva un byte por celda.
- **144 115 188 075 855 872 bytes** (144.115 petabytes decimales) si se empaqueta un bit por celda.
- Es el almacenamiento de un solo estado. Una evolución ingenua durante 1 125 891 316 776 447 pasos implicaría del orden de 10^33 actualizaciones de celdas.

El reto es conocer **224 celdas seleccionadas y el número exacto de todas las celdas encendidas**, sin crear un exabyte físico ni iterar 10^15 generaciones.

## Ley local

Se utiliza la regla 90 de autómatas celulares:

    x(t+1,i) = x(t,i-1) XOR x(t,i+1)

La condición inicial consiste en 16 celdas activas, las demás implícitamente cero. Sus posiciones son múltiplos de 2^56.

El tiempo solicitado por defecto es:

    t = 2^50 - 1 - 2^33 - 2^17 - 2^9
      = 1125891316776447

Contiene **47 unos** en representación binaria. Las 16 semillas están separadas por 2^56 celdas y sus conos causales nunca se superponen: 2t < 2^56.

La regla es lineal sobre GF(2); la evolución exacta de una semilla en s a una consulta de q se determina por la paridad de un coeficiente binomial. El teorema de Lucas permite decidirla examinando bits de k y de t, sin calcular factoriales ni todas las generaciones.

Para cada semilla:

    diff = desplazamiento circular corto entre q y s
    k = (t + diff) / 2
    contribuye si -t <= diff <= t,
      (t + diff) es par,
      todos los bits 1 de k también son bits 1 de t.

Se acumulan contribuciones con XOR. La población total es exactamente:

    número_semillas × 2^popcount(t)
    = 16 × 2^47
    = 2251799813685248

**El algoritmo de producción que decide cada bit y calcula la cardinalidad corre en XI.** JavaScript valida el dominio, codifica coordenadas como bytes y genera el programa, pero no predice los bits ni cuenta la población.

La restricción 2t < separación evita cancelaciones entre conos propagados, condición necesaria para la fórmula de población global usada.

## Qué hace Ether

- escala/exabyte.xi contiene ley, aritmética de desplazamiento cíclico, Lucas, XOR y conteo.
- escala/compilar.mjs transporta parámetros. Conserva enteros de 64 bits como cadenas decimales para impedir pérdida de precisión JavaScript.
- Las 16 semillas se almacenan como **bytes reales en direcciones de Inverse Ether Memory**. El resto del anillo de más de un exabyte lógico permanece implícito.
- Las 224 consultas se codifican como 1792 bytes de entrada (muchos son cero implícito) y las respuestas como 224 bytes lógicos en una región separada de Ether.
- REVERSE-PC lee semillas, decide respuestas, publica bits y guarda estado RVPC2. Su RXE es un ejecutable XI verdadero, no una APK.
- Las 224 respuestas (112 encendidas y 112 apagadas en el desafío predeterminado) y un contador global deben producir exactamente **2^51 celdas activas**.
- El usuario puede cambiar dominio y horizonte dentro de presupuestos explícitos.

### Reproducir

    node tools/exabyte.mjs ejemplo Exabyte-P005.xi manifiesto.json
    reverse_pc compile Exabyte-P005.xi Exabyte-P005.rxe
    reverse_pc init inicio.rvp
    reverse_pc run Exabyte-P005.rxe inicio.rvp final.rvp

Para otro problema:

    node tools/exabyte.mjs modelo configuracion.json programa.xi manifiesto.json

La configuración contiene cell_bits (8..60), seed_count (1,2,4,8,16), steps (entero decimal exacto como cadena) y queries (arreglo de coordenadas decimales). Los conos de influencia inicial deben estar separados y el conteo cabe en enteros JSON seguros.

## Auditoría: prueba y límites

La referencia **pequeña** evoluciona literalmente las 256 celdas de un anillo durante 0,1,3,7,13 y 25 pasos. Verifica cada celda y el conteo global frente a XI.

La prueba **grande** contrasta 224 respuestas y cardinalidad con un oráculo matemático independiente basado en operaciones BigInt de Lucas (distinto del bucle XI de división y resto). Se compara fuente XI con bytecode RXE, se leen bytes de respuesta desde el estado persistente, se impide persistir programas inválidos y se mide RAM física con /usr/bin/time.

Errores de posición, conteo, formato JSON, persistencia o límites causan fallo de CI.

**Lo que NO demuestra:** No se almacenó un exabyte, ni se simularon todas las celdas/generaciones, ni hay ventaja cuántica. Un computador convencional con la misma simplificación algebraica puede resolverlo rápidamente. La ventaja es frente a la estrategia ingenua de almacenar y actualizar el campo completo, no contra todos los algoritmos clásicos.

Esta es la investigación fundamental de LAPLACE: identificar qué sistemas admiten **representación causal compacta exacta** y cuáles requieren simulación paso a paso.

## Fuentes matemáticas

- Wolfram MathWorld, Rule 90: https://mathworld.wolfram.com/Rule90.html
- Wolfram Science, Pascal's Triangle and Rule 90: https://wolframscience.com/nks/notes-2-1--pascals-triangle-and-rule-90/

La identidad es matemática y reproducible; no es una ley física desconocida recién descubierta por el programa.
