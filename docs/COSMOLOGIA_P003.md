# LaPlaceDIG P003 — expansión cosmológica temprana sobre XI/Ether

## Qué hemos simulado y qué no

P003 modela **la evolución del fondo homogéneo de un universo espacialmente plano** mediante la ecuación de Friedmann para radiación, materia y una constante cosmológica. No modela el "instante cero" del Big Bang, la singularidad, la inflación, el recalentamiento, una teoría cuántica de gravedad, formación de galaxias ni fluctuaciones espaciales.

En términos simples: la simulación puede preguntar **qué ocurriría con la temperatura, la densidad de energía y la expansión** si las leyes ΛCDM elegidas describieran el universo desde un factor de escala diminuto hasta la actualidad. No constituye una observación directa del comienzo del universo.

Modelo base: H(a)^2 = H0^2 [ Ωr/a^4 + Ωm/a^3 + ΩΛ ]; a0 = 1 y Ωr+Ωm+ΩΛ=1.

También T(a)=T0/a, suponiendo expansión adiabática simplificada. La historia térmica completa no obedece esta regla sin correcciones en todas las épocas: el número de grados de libertad relativistas cambia y existen transiciones de partículas que aquí no se simulan.

## Condiciones, unidades y referencias

- H0 = 67.4 km/s/Mpc, usado como 2.184285 × 10^-18 s^-1 en representación científica (valor redondeado).
- Ωm = 0.315, Ωr = 0.000092, ΩΛ = 0.684908. Esta última es el residuo elegido para que la suma sea uno. No es una nueva medición propia; es una aproximación plana compatible con un escenario cosmológico de referencia.
- Temperatura CMB actual T0 = 2.7255 K (aproximada).
- Densidad energética crítica actual ρc,0 c² = 7.668948 × 10^-10 J/m³, calculada a partir de H0 y constantes físicas; usada para convertir densidad relativa en energía local por volumen.
- Una salida de densidad en J/m³ NO implica conocer la energía total de un universo posiblemente infinito, ni que toda energía gravitacional tenga una definición global universal.
- Las fracciones de radiación, materia y vacío se expresan en partes por 100000 del valor E²(a). No son tasas de precisión ni probabilidades.
- El tiempo de Hubble tH = 1/H se expresa en segundos. **NO es la edad del universo**. Para edades cósmicas es necesario integrar dt = da/(aH), con hipótesis adicionales y un esquema de error verificado.

La constante H0 y Ωm están motivadas por Planck 2018:
https://doi.org/10.1051/0004-6361/201833910

Ecuación de Friedmann y densidades:
https://www.damtp.cam.ac.uk/user/tong/cosmo/cosmohtml/S1.html

La NASA describe la temperatura media observada del CMB como aproximadamente 2.725 K:
https://science.nasa.gov/universe/glossary/

## Arquitectura computacional nueva

**cosmos/lcdm.mjs** es un compilador de fuente XI, NO otro simulador del universo. Sólo verifica parámetros y construye instrucciones originales de XI Machine para REVERSE-PC. No genera valores físicos de salida, ni ejecuta un bucle JS de épocas, ni calcula una referencia en producción.

**XI ejecuta:**

1. Evolución de las tres contribuciones cosmológicas en representación de exponente decimal, sin crear enteros de longitud 10^120.
2. División y escalado por potencias de diez bajo demanda, usando registros enteros de 64 bits.
3. Raíz cuadrada entera iterativa para la expansión H(a), y proyección de temperatura, densidad de energía y tiempo de Hubble.
4. Normalización a mantisa×10^exponente; las magnitudes físicas nunca se materializan como un gran arreglo denso.
5. Cálculo de fracciones de densidad y escritura de una historia de 33 instantes en **Inverse Ether Memory**.

La fuente XI recorre exponentes decimales del factor de escala entre a=10^-30 y a=1. Hay 31 escalas por década y dos muestras extra: a=3×10^-4 para estudiar igualdad radiación/materia y a=9×10^-4, cercano a T≈3000 K. Los 33 registros se calculan dentro de XI.

## Estados mínimos

Cada época ocupa un **registro lógico de 27 bytes**, compuesto de:

- factor de escala como exponente decimal firmado de un byte y dígito de un byte;
- H, temperatura, densidad energética y tiempo de Hubble como mantisas de tres bytes y exponentes ZigZag de un byte cada uno;
- tres fracciones del presupuesto cósmico, cada una en tres bytes.

Total: **891 bytes lógicos para 33 épocas**. En modo **detalle=digitos**, XI evalúa también las mantisas decimales 1..9 de cada década (sin crear millones de partículas): **271 épocas** y **7317 bytes lógicos**. Las dos resoluciones utilizan exactamente las mismas ecuaciones cosmológicas y se verifican por separado. Eso NO significa que el motor completo ocupe 891 bytes de RAM física. Los metadatos del runtime, memoria inversa, instrucciones y snapshots tienen un coste adicional medible por separado.

La representación de grandes potencias no equivale a simular todos los grados de libertad del universo: P003 trata únicamente un fondo homogéneo de tres componentes energéticas.

## Ejecución en REVERSE-PC

Generar fuente cosmológica con parámetros predeterminados:

    node tools/cosmos.mjs universo universo.xi

O definir un rango de exponentes y generar otro programa:

    node tools/cosmos.mjs rango -12 0 universo-reciente.xi
    node tools/cosmos.mjs fino universo-271.xi

Un escenario parametrizado puede incluir min_exp, max_exp, detalle ('decadas' o 'digitos') y omega_r_micro, omega_m_micro, omega_lambda_micro, que deben sumar un millón. La entrada se valida contra instrucciones XI maliciosas, rangos y densidades incoherentes.

    node tools/cosmos.mjs modelo parametros.json universo.xi

Compilar y ejecutar sin tocar tu snapshot personal:

    reverse_pc compile universo.xi LAPLACE-Cosmos-P003.rxe
    reverse_pc init universo-inicial.rvp
    reverse_pc run LAPLACE-Cosmos-P003.rxe universo-inicial.rvp universo-final.rvp

También se integra con la interfaz principal del laboratorio como comando crear-cosmos.

## Criterios científicos y de auditoría

1. Todas las magnitudes estimadas desde XI se comparan con un oráculo numérico independiente que evalúa Friedmann en doble precisión.
2. Se verifica una historia completa y cronológicamente ordenada de 33 épocas, desde universo caliente dominado por radiación hasta un presente dominado por energía oscura.
3. Se mide el error relativo de H(a), T(a), ρc²(a) y 1/H(a); se contrastan fracciones por componente. La batería extrema prueba 1024 cosmologías planas independientes (33792 estados en modo normal).
4. Se recuperan los 891 bytes de Inverse Ether Memory desde un snapshot RVPC2 y se exige igualdad exacta con las 33 observaciones que emitió XI.
5. La fuente y su ejecutable RXE deben producir observaciones idénticas sobre el mismo runtime y con igual estado inicial.
6. Se rechazan condiciones fuera de dominio, cosmología no plana sin la curvatura requerida, inyecciones de comandos y programas corruptos.
7. Las pruebas físicas y de coherencia deben funcionar también para otros porcentajes de radiación/materia/vacío, no solo para un caso preparado.
8. Se preservan E005, P001, P002, Bitcoin y BBY Q en sus repositorios sin reescribir el núcleo existente.

## Límite de interpretación

La fecha de a=10^-30 representa una **extrapolación muy temprana** de un modelo homogéneo. No afirma conocer de forma fiable la historia térmica a temperaturas extremas (cambios de especies, inflación, gravedad cuántica, transiciones electrodébiles). El modelo tampoco crea cada partícula o voxel del universo, ni constituye una demostración de potencia computacional ilimitada o de predicción perfecta.

El siguiente experimento cosmológico fundamentado puede introducir perturbaciones de densidad, velocidades peculiares y crecimiento lineal de estructuras con una comparación observacional explícita. Ese sería un paso distinto del cálculo del fondo.
