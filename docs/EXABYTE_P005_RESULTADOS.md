# P005 — Cálculo ejecutado en un sistema de escala exabyte

**Fecha:** 28 de octubre de 2026

**Ejecutor real:** REVERSE-PC 01829217cfb0a3a704d37f0c0f66527a23ec149d con Mundo X Ether e2778d962af22f6f1a0794058dd4685fc2573966 (ambos fijados por SHA).

**GitHub Actions:** https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/40773088476

## Desafío resuelto

Ley: Regla 90, x(t+1,i) = x(t,i-1) XOR x(t,i+1), en un anillo circular.

- Número de celdas lógicas: **1 152 921 504 606 846 976** (2^60).
- Estado denso a un byte/celda: **1 152 921 504 606 846 976 bytes** (1,15 exabytes decimales).
- Estado denso empaquetado a un bit/celda: **144 115 188 075 855 872 bytes** (~144 petabytes decimales).
- Semillas originales: **16** bits activos, uniformemente espaciados cada 2^56 celdas.
- Horizonte: **1 125 891 316 776 447** generaciones (t = 2^50-1-2^33-2^17-2^9), con 47 bits activos en representación binaria.
- Resultado calculado en XI: **2 251 799 813 685 248** celdas activas (2^51).
- 224 consultas binarias: **112 activas y 112 apagadas**, confirmadas una por una contra un oráculo independiente.
- Porción encendida exacta: **1/512 = 0,1953125 %** de las posiciones lógicas.
- Actualizaciones de celdas de una implementación densa ingenua que recorra todo el campo en cada generación: **1 298 064 310 961 685 447 906 732 929 974 272** pasos de actualización (~1,3×10^33). NO se ejecutó ese método.

La respuesta se obtiene en XI aplicando la paridad de coeficientes binomiales (identidad de Lucas), en vez de generar secuencialmente todas las generaciones y las celdas. La población total corresponde a 16×2^popcount(t), válida porque se verificó que los conos causales no se superponen.

## Pruebas realizadas

- **7/7 pruebas nativas**, sin errores ni omisiones. Las pruebas con un anillo de 256 celdas evolvieron todos sus estados de modo convencional para tiempos 0,1,3,7,13,25 y los contrastaron bit por bit con XI.
- **224/224 consultas de escala exabyte** correctas frente a una implementación independiente del teorema de Lucas. Dentro de esas consultas se incluyeron bordes periódicos, casos activos, inactivos y huecos binarios de la recurrencia.
- **Conteo global exacto** calculado por la máquina XI y contrastado con un oráculo BigInt, sin pérdida de precisión JSON.
- Equivalencia exacta entre fuente XI y ejecutable RXE.
- Las 224 respuestas se escribieron y leyeron desde Inverse Ether Memory en el estado persistente RVPC2.
- Instrucción inválida rechazada sin publicar snapshot nuevo.
- **Cero componentes cuánticos simulados** atribuidos a este cómputo clásico.

## Coste observado

- 25,753 ms para una ejecución completa RXE de las 224 consultas y el conteo global en GitHub Actions Linux. Incluye inicio del proceso y restauración del estado.
- **5632 KiB de RSS mediano** en tres ejecuciones (5,50 MiB) para el ejecutor REVERSE-PC; no es la RAM de un móvil.
- Inverse Ether Memory registró **1426 excepciones clásicas** (bytes que difieren del fondo), incluidos datos de entrada y respuestas, no 2^60 celdas materializadas.
- Ejecutable real RXE v1: **78 088 bytes**, **1927 instrucciones**, 1825 constantes.
- Fuente XI: **51 163 bytes**. El artefacto CI conserva código, ejecutable, manifiesto, registros, tres medidas RSS y snapshots de evidencia.

### Muestra de resultados reales XI

| Celda consultada | Resultado |
|---:|:---:|
| 0 | 0 |
| 1 | 0 |
| 1 125 891 316 776 445 | 1 |
| 1 125 891 316 776 447 | 1 |
| 1 125 891 316 776 448 | 0 |
| 1 151 795 613 290 070 529 | 1 |
| 1 151 795 613 290 071 553 | 0 |
| 1 151 795 613 290 072 577 | 1 |

Los números en la tabla se conservan como cadenas de entero decimal exacto en el manifiesto, ya que superan la precisión segura de Number en JavaScript.

## Interpretación correcta

**Sí**, se calculó un resultado matemáticamente exacto sobre un campo cuyo estado denso no cabe en una computadora de un petabyte, ni siquiera si se empaquetaran los bits.

**No**, no se almacenó un exabyte ni se ejecutaron 10^33 actualizaciones. Se representó el campo por una ley y 16 excepciones iniciales, y se calcularon salidas solicitadas y una propiedad global por un atajo algebraico correcto.

**Tampoco prueba superioridad sobre todas las computadoras clásicas**: cualquier sistema que utilice la misma identidad matemática puede resolver el mismo problema. La diferencia es entre una estrategia ingenua de datos densos y un algoritmo compacto. No demuestra aceleración cuántica ni soluciona dinámicas no lineales arbitrarias.

Esta es una prueba válida de la tesis de arquitectura de LAPLACE: **las dimensiones de un espacio lógico y el coste mínimo para responder una consulta específica no tienen por qué escalar juntos**, cuando la ley y las condiciones iniciales permiten compresión exacta.
