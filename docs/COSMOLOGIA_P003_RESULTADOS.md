# LaPlaceDIG P003 — Resultados verificados de cosmología de fondo

**Fecha:** 28 octubre 2026.

**Evidencia nativa original con prueba extrema:** https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/40766916289

Este experimento **no reconstruye la singularidad física del Big Bang**. Ejecuta una extrapolación de la expansión promedio del universo desde a=10^-30 hasta a=1 mediante un modelo espacialmente plano ΛCDM, con radiación, materia y vacío.

## Qué se ejecutó realmente

El programa XI emitido por cosmos/lcdm.mjs calcula H(a), temperatura, densidad local de energía, tiempo de Hubble 1/H y las tres fracciones cosmológicas. REVERSE-PC mantiene un único estado en Inverse Ether Memory. La única tarea de JavaScript de producción es validar la configuración y compilar texto XI.

**Modo por décadas:** 33 épocas (31 décadas más dos etapas instrumentales), 27 bytes lógicos por época, **891 bytes lógicos** en total. Se registraron 710 excepciones clásicas del fondo nulo.

**Modo fino:** 271 épocas (nueve dígitos por cada década negativa y una época actual), **7317 bytes lógicos**, y 5784 excepciones no nulas. Su ejecutable RXE mide aproximadamente 5,5 KiB y el programa original trabaja sin enumerar partículas o voxeles universales.

**Prueba extrema:** 1024 cosmologías planas distintas, con 33 etapas cada una: **33792 estados comprobados, 1024/1024 ejecuciones aprobadas**. Referencia independiente de la ecuación de Friedmann para todas las etapas. La comprobación de XI ↔ memoria persistente ↔ RXE fue exacta en los laboratorios seleccionados.

## Resultados físicos dentro del modelo

Parámetros: H0=67.4 km/s/Mpc, Ωr=0.000092, Ωm=0.315, ΩΛ=0.684908 y T0=2.7255 K.

| Factor de escala a | H (s^-1) | Temperatura (K) | Densidad energética (J/m³) | Dominio principal |
|---:|---:|---:|---:|---|
| 10^-30 | 2.095078e40 | 2.7255e30 | 7.055432e106 | radiación |
| 10^-10 | 2.095078 | 2.7255e10 | 7.055432e26 | radiación |
| 10^-6 | 2.09866e-8 | 2.7255e6 | 7.07959e10 | radiación |
| 10^-4 | 2.4274e-12 | 27255 | 947.115 | radiación |
| 3×10^-4 | 3.31421e-13 | 9085 | 17.6575 | igualdad aproximada |
| 9×10^-4 | 5.22481e-14 | 3028.33 | 0.438910 | materia |
| 10^-3 | 4.40662e-14 | 2725.5 | 0.312126 | materia |
| 0.1 | 3.88658e-17 | 27.255 | 2.42803e-7 | materia |
| 0.8 | 2.49081e-18 | 3.40687 | 9.97244e-10 | vacío |
| 1 | 2.184285e-18 | 2.7255 | 7.668948e-10 | vacío |

La tabla incluye resultados emitidos por XI y convertidos desde mantisa/exponente, no valores precalculados para el ejecutor.

### Transiciones visibles

- En a=2×10^-4, radiación ≈59.35 % y materia ≈40.64 % de densidad efectiva.
- En a=3×10^-4, radiación ≈49.33 % y materia ≈50.67 %. La igualdad se encuentra entre ambas escalas, consistente con a_eq≈Ωr/Ωm≈2.92×10^-4.
- En a=9×10^-4, T≈3028 K. Es una aproximación de escala térmica cercana a recombinación; **no existe un algoritmo de recombinación de hidrógeno o transporte de fotones**.
- En a=0.7, materia ≈57.27 %, vacío ≈42.71 %; en a=0.8, materia ≈47.31 %, vacío ≈52.67 %. El modelo distingue otra transición de dominancia.

### Exactitud de la prueba extrema

Errores relativos máximos sobre 33792 comparaciones por observable:

- H(a): **0.04718 %**.
- Temperatura T(a): **0.0001101 %**.
- Densidad energética local: **0.0001581 %**.
- Tiempo de Hubble: **0.04691 %**.

Fracción absoluta máxima por componente: 24.2 partes de 100000 (≈0.0242 puntos porcentuales).

Son errores entre la aritmética XI entera y la referencia doble precisión del **mismo modelo**, no errores frente a observaciones físicas reales.

### Coste real

La campaña de 1024 modelos registró una **mediana de 4.64 ms** por mundo de 33 épocas en el servidor Linux de GitHub Actions (cada comando incluye arranque del proceso y restauración de estado). El pico de memoria física mediano de tres ejecuciones fue **4844 KiB**, aproximadamente 4.73 MiB. La sesión de 271 épocas registró 20.232 ms en una ejecución; no es mediana ni garantía de latencia Android.

Una historia de 891 o 7317 bytes lógicos **no implica** RAM total de ese tamaño. El ejecutor, los mapas de memoria, snapshots y metadatos exigen recursos adicionales.

## Física aún no implementada

- La singularidad t=0, física anterior/después de inflación, gravedad cuántica o época de Planck.
- La historia térmica detallada de partículas, nucleosíntesis, recombinación, desacoplamiento y espectro CMB.
- Perturbaciones de densidad, estrellas, galaxias, agujeros negros y campos gravitatorios locales.
- El tiempo cosmológico desde la singularidad: el valor 1/H publicado es **tiempo de Hubble, no la edad del universo**.
- Una ventaja cuántica o un cálculo de la energía **total** de un universo espacialmente infinito.

Son limitaciones explícitas; no se debe extrapolar la prueba matemática de 10^-30 como observación directa de esa etapa.

## Próxima iteración

Prioridades investigables: (1) integrar la edad cósmica dt=da/(aH) con control de error; (2) resolver perturbaciones lineales y su crecimiento con distintas condiciones iniciales; (3) introducir transición de relativistas y un universo térmico físicamente más fiel; (4) comparar con observaciones reales y con referencia numérica a mayor precisión. La representación por mantisas/exponentes en XI permite investigar el coste sin crear un segundo simulador externo.

## Fuentes de física

- Planck 2018 cosmological parameters: https://doi.org/10.1051/0004-6361/201833910
- Friedmann y densidad de energía: https://www.damtp.cam.ac.uk/user/tong/cosmo/cosmohtml/S1.html
- Temperatura media del fondo de microondas: https://science.nasa.gov/universe/glossary/

Estos enlaces son fundamentos físicos; los resultados del programa deben reproducirse con los comandos de la carpeta tests y el workflow cosmos-p003.yml.
