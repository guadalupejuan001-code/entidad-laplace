# LaPlaceDIG P001 — Primer mundo físico en Ether/XI

## Qué sistema físico construimos

Un **billar ideal newtoniano bidimensional**: partícula puntual de masa constante que se mueve dentro de una caja rectangular con paredes rígidas, reflexión perfectamente elástica, sin fricción, gravedad ni interacción con otras partículas. No es un mundo físico completo ni un modelo cuántico real. En la escala de P001, sus leyes están declaradas y son verificables.

- Espacio: caja de ancho W y alto H, coordenadas enteras en milímetros.
- Velocidades en mm/s, masa en kg, tiempo en segundos enteros.
- Entre paredes, movimiento rectilíneo uniforme.
- En cada pared, se invierte la componente normal de velocidad. Si la partícula cae justo en una pared al instante consultado, se registra la velocidad **después** del choque.
- Energía cinética: E = m (vx² + vy²) / 2. Se registra como entero E2 = m(vx² + vy²) en kg·mm²/s² para evitar redondeo; la conversión SI es E_J = E2 / 2.000.000.
- Una intervención externa opcional en tiempo tau cambia instantáneamente vx y vy. Este es un impulso conocido, no una fuerza descubierta por un agente.

Este es un sistema mecánico físicamente idealizado con una solución exacta para su propia ley de movimiento. No simula fuerzas electromagnéticas, fricción, deformación de paredes, aceleración gravitatoria, objetos macroscópicos reales ni incertidumbre de medición.

## Cálculo de grandes saltos

En cada eje, posición libre u = posición_inicial + velocidad × tiempo.
La reflexión corresponde al plegado del intervalo periódico de longitud 2L:

    r = ((u mod (2L)) + 2L) mod (2L)
    nueva_posicion = r si r <= L; en otro caso 2L-r

El signo de la velocidad cambia al reflejarse; en las paredes se observa la velocidad después de la colisión. El algoritmo XI usa aritmética entera con signos comprobados. Permite saltar hasta **10^12 segundos sin recorrer las colisiones intermedias**. Su coste no crece proporcionalmente al número de segundos, pero sí hay límites de enteros, RAM e instrucciones.

La fuerza de este ejemplo es verificar la reutilización de tu arquitectura en un problema físico realista pero acotado. Las leyes son conocidas; **no** declara haber aprendido la física ni predecir cualquier sistema natural.

## Dónde se calcula realmente

- **fisica/billar.xi**: núcleo de reflexión, evolución, impulso, observables y serialización; es código XI ejecutado por REVERSE-PC.
- **fisica/compilar.mjs**: valida unidades, límites y parámetros; convierte la configuración del experimento a código XI. No calcula las trayectorias.
- **Inverse Ether Memory**: almacena seis resultados en 48 bytes lógicos, como enteros de 64 bits firmados con codificación ZigZag + little-endian; sólo materializa excepciones que difieren del fondo.
- **REVERSE-PC**: ejecuta el mismo QuantumRuntime de Mundo X y guarda un snapshot RVPC2. El laboratorio no crea una segunda CPU ni reemplaza Ether por un motor JS.
- **tests/fisica.test.mjs**: referencia independiente de evolución paso a paso, sin usar fórmula de reflexión XI; verifica lecturas reales de memoria, integridad, eventos, energía y extremo.
- **tests/fisica-experimento.mjs**: pronóstico antes de revelar un choque, trayectoria real con impulso oculto, trayectoria condicional y horizonte de 10^12 segundos.

El runtime REVERSE usa una CPU clásica y un intérprete XI; en este laboratorio no se materializan qubits físicos.

## Ejecutar en el repositorio LaPlaceDIG

Ejemplo de escenario configurable:

    {
      "ancho_mm": 1500,
      "alto_mm": 900,
      "masa_kg": 2,
      "x_mm": 120,
      "y_mm": 210,
      "vx_mm_s": 17,
      "vy_mm_s": 11,
      "horizonte_s": "1000000",
      "impulso": {
        "instante_s": "9",
        "delta_vx_mm_s": 5,
        "delta_vy_mm_s": -7
      }
    }

Convertir el mundo a XI desde el CLI principal:

    node tools/laplace.mjs crear-fisica escena.json escena.xi

O generar una prueba predeterminada:

    node tools/fisica.mjs ejemplo 1000000000000 billar.xi

Construir ejecutable de REVERSE e iniciar una sesión aislada:

    reverse_pc compile billar.xi Billar-Laplace.rxe
    reverse_pc init inicio-fisica.rvp
    reverse_pc run Billar-Laplace.rxe inicio-fisica.rvp estado-fisica.rvp

No ejecutar en el snapshot personal de REVERSE-PC: los datos físicos se escriben en la región experimental 7000000001000000..7000000001000047.

## Criterios de aceptación

1. Se conserva la posición en [0,W]×[0,H].
2. Sin impulso, se conserva exactamente E2 para todos los tiempos examinados.
3. La evolución XI coincide con un oráculo independiente por pasos, incluido el rebote en el instante exacto de pared.
4. La lectura posterior de los 48 bytes de memoria inversa recupera exactamente los seis registros de salida.
5. Un evento desconocido produce primera divergencia al introducirse, sin alterar los pronósticos previamente sellados. Un evento conocido restaura la coincidencia.
6. La ejecución hasta 10^12 segundos produce un estado exacto bajo las leyes del modelo, sin desplegar un billón de pasos.
7. Se informa de errores de unidades, velocidades fuera de presupuesto y comandos inválidos sin publicar estado corrupto.

Límites: W,H de 1 a 1.000.000 mm, masa 1..1.000 kg, velocidades acotadas a 1.000.000 mm/s, tiempo 0..10^12 segundos. Se garantizan rangos de aritmética firmada de 64 bits para estas entradas. No hay todavía partículas interactuando entre sí, gravedad, adquisición de datos físicos externos ni renderizado 3D. Estos quedan como objetivos posteriores, sin declarar su implementación anticipadamente.

## Procedencia técnica

La CI física fija el commit de REVERSE-PC y el SHA del propietario Mundo X usados en los tests. Se compila el ejecutor real desde esos fuentes y se ejecutan programas XI/RXE. El resultado completo, salida por instante y manifest de la sesión se conservan en un artefacto de GitHub Actions. Una CI exitosa demuestra equivalencia en los escenarios ensayados; no es evidencia de predicción física universal.
