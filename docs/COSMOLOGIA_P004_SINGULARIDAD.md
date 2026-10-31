# LAPLACE P004 — frontera de la singularidad cosmológica clásica

## Qué se calcula

LAPLACE P004 extrapola las ecuaciones de Friedmann de un universo **FLRW plano y dominado por radiación** hacia factores de escala positivos cada vez más pequeños. Es el modelo matemático en el cual la singularidad clásica aparece como un **límite** de la solución, no como un estado físico que podamos simular en t=0.

P004 se añade a P003 (fondo ΛCDM desde a=10^-30 hasta hoy). El programa P004 comienza en a=10^-30 y consulta a=10^-31, 10^-32, ... 10^-80 sin enumerar transiciones temporales entre esas escalas.

El núcleo de ecuaciones ejecuta **exclusivamente en XI Machine de REVERSE-PC** y utiliza la autoridad original de Inverse Ether Memory. El host JavaScript solo valida rangos, sustituye parámetros decimales acotados, interpreta el JSONL devuelto y ejecuta tests como referencia independiente.

### Solución clásica en la era de radiación

Cuando Ωr/a⁴ domina sobre materia y vacío, con a0=1:

    H_rad(a) = H0 sqrt(Ωr) / a²
    ρ_rad c²(a) = ρcrit,0 c² Ωr / a⁴
    T_rad(a) ≈ T0 / a
    t_rad(a) = a² / [2 H0 sqrt(Ωr)]
    a(t) = [2 H0 sqrt(Ωr) t]^(1/2)
    K(a) = 24 [H_rad(a)/c]^4  en m^-4

K es el escalar de Kretschmann para el FLRW plano dominado por radiación (no una afirmación sobre espacio-tiempo real a escalas cuánticas). Aunque para un fluido ideal puro de radiación el escalar de Ricci R es cero, K diverge: comprobar solo R=0 no demostraría ausencia de singularidad.

El resultado de LAPLACE para a→0+ es **formal y no numérico**:

- H(a) crece sin cota como a^-2.
- Densidad local de energía ρ c² crece como a^-4.
- La extrapolación simple de temperatura crece como a^-1.
- El escalar de Kretschmann crece como a^-8.
- El tiempo desde el cero formal en esta solución t_rad(a) tiende a 0 como a².

**Nunca se devuelve un registro con a=0.** La expresión H(0) no es un valor físicamente calculado, y no se ejecutan divisiones por cero ni se crea una partícula singular. P004 no puede afirmar qué pasó exactamente en el instante cero.

### Frontera de Planck

Se utiliza tP = 5.391247 × 10^-44 s como umbral heurístico de pérdida de confianza clásica, no como una discontinuidad demostrada de la naturaleza. En la aproximación t_rad(a), este umbral corresponde a a≈4.75×10^-32.

Por ello, el registro a=10^-31 aún da t_rad > tP; a=10^-32 da t_rad < tP. En la historia XI, cada época tiene una bandera below_planck_time que toma 0 o 1 después de calcular el tiempo físico aproximado.

**No se infiere que el modelo sea preciso por encima de tP:** ya antes de este umbral faltan cambios del número de grados de libertad relativistas, transiciones térmicas, tratamientos de materia y geometría cuánticos. Para t por debajo de tP se etiquetan los registros como **extrapolación matemática sin validación física**, no como resultados observables del Big Bang.

## Estados mínimos y costos honestos

Cada época entrega 12 campos firmados i64:

    k, H_mantissa, H_exponent, T_mantissa, T_exponent,
    energy_mantissa, energy_exponent, t_rad_mantissa, t_rad_exponent,
    kretschmann_mantissa, kretschmann_exponent, below_planck_time

Los campos numéricos son mantisa ×10^exponente. La memoria Ether persiste esos campos mediante codificación ZigZag de 8 bytes little-endian por campo. Es un registro lógico de **96 bytes por época**, 51 épocas, **4896 bytes lógicos** (sin metadatos ni runtime). No se usa un número float infinito para representar curvatura con exponentes gigantes; la mantisa y exponente permanecen separados. Un número con un exponente de cientos no implica una asignación física de 10^cientos de bytes.

Se mide RSS real en el ejecutor Linux con /usr/bin/time. La métrica RSS no se confunde con los bytes lógicos ni con memoria cuántica física: el experimento es una simulación clásica sobre CPU.

## Integración con P003 y REVERSE-PC

Los estados de P003 se guardan primero como RVPC2 en la región Ether 7000000004000000. La ejecución P004 lee ese mismo snapshot y agrega su historia en otra región Ether 7000000005000000. Posteriormente se leen **las dos regiones** desde el mismo estado y se exige igualdad exacta con sus salidas previas. Así no se destruyen E001–E005 ni los modelos anteriores.

### Cómo ejecutar

Crear un programa de la singularidad clásica:

    node tools/singularidad.mjs ejemplo singularidad.xi
    reverse_pc compile singularidad.xi LAPLACE-P004.rxe
    reverse_pc init laboratorio-inicial.rvp
    reverse_pc run LAPLACE-P004.rxe laboratorio-inicial.rvp laboratorio-final.rvp

O cambiar el rango del estudio:

    node tools/singularidad.mjs rango -30 -60 alternativa.xi
    node tools/laplace.mjs crear-singularidad parametros.json salida.xi

Solo usar snapshots de laboratorio, no los archivos persistentes personales del escritorio. Para los tests reproducibles se usan los hashes fijos de REVERSE-PC y Mundo X en la CI.

## Validación y falsación

- Leyes de potencias H, T, densidad, tiempo y K contra fórmulas independientes de doble precisión (en log10 para evitar overflow).
- Pendientes entre décadas exactamente +2, +1, +4, -2 y +8 en exponente decimal según la magnitud.
- Primer registro por debajo del tiempo de Planck: k=-32, con k=-31 todavía por encima del umbral.
- Los 4896 bytes de Inverse Ether Memory se recuperan y comparan exactamente con la salida XI.
- Identidad del resultado generado mediante fuente XI y ejecutable RXE, y rollback ante programa inválido.
- Al agregar épocas nuevas, no se alteran predicciones ni snapshots anteriores.
- Prueba de estrés de 128 intervalos de extrapolación con cómputo real XI, error máximo y RAM física.
- Comprobación de compatibilidad con P003 al comienzo a=10^-30 y persistencia completa de 33 épocas previas.

No se demuestra teoría física de singularidades cuánticas, un estado fundamental con densidad realmente infinita, ni observación de una frontera universal. Los números muy por debajo de Planck son una forma de **estresar representación y álgebra**, no un pronóstico de la realidad.

## Fuentes científicas

- Ohio State University, A5682 Cosmic Expansion History (solución a ∝ t^1/2 para radiación):
  https://www.astronomy.ohio-state.edu/weinberg.21/A5682/notes5.pdf
- NIST / CODATA 2018, tiempo de Planck (valor recomendado):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9888147/
- Stanford Gravity Probe B, singularidades y límites de la teoría clásica:
  https://einstein.stanford.edu/content/relativity/q2351.html

## Siguiente frontera de investigación

La simulación singular pura de radiación es simbólicamente resoluble y compacta. Para aproximarse a física cosmológica realmente desconocida habría que incorporar una familia definida de teorías candidatas de gravedad cuántica o de rebote, imponer conservación y consistencia, y contrastar predicciones observablemente distintas. Sin esas hipótesis, el software no puede inferir una ley única a través de t=0.
