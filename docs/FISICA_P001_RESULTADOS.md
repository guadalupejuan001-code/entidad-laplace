# LaPlaceDIG P001 — resultados experimentales verificados

**Fecha:** 28 de octubre de 2026. **Proyecto:** LaPlaceDIG. **Dominio:** partícula clásica ideal en caja 2D, sin gravedad ni rozamiento.

**CI nativa verificada:** https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/40755088367

El ejecutor es REVERSE-PC fijado a 01829217cfb0a3a704d37f0c0f66527a23ec149d con Mundo X Ether original e2778d962af22f6f1a0794058dd4685fc2573966. El algoritmo físico se ejecutó como XI Machine dentro del runtime original. Node solo compiló parámetros, organizó los escenarios y verificó los resultados.

## Evidencia real

- **8/8 pruebas nativas aprobadas**, ninguna omitida; también pasó la validación previa sin ejecutable en 4/4 tests aplicables.
- Escenario inicial: caja de 1500 × 900 mm, masa 2 kg, posición (120,210) mm, velocidad (17,11) mm/s.
- Estado calculado a t=32 sin intervención: posición (664,562) mm, velocidad (17,11) mm/s.
- Estado a t=32 con impulso desconocido para el predictor (delta v = +5,-7 mm/s en t=9): posición (779,401) mm, velocidad (22,4) mm/s.
- **Primera divergencia en t=9**. De 33 instantes examinados, 9 coincidieron antes del evento y 24 divergieron tras introducirlo.
- Con el impulso conocido, **33/33 instantes** coincidieron. El pronóstico cerrado quedó sellado con SHA-256 b64426a231adb8e5f85e2693a7c2105da3e88384c4494e7675fcd544a706a910 antes de revelar el evento.
- El valor E2 = m(vx²+vy²) fue **820 kg·mm²/s²** antes del impulso y **1000** después. En joules, 0,000410 J y 0,000500 J. Sin impulso, E2 se conservó exactamente.
- Horizonte de **1.000.000.000.000 segundos**: posición final (880,410) mm, velocidad (-17,11) mm/s, E2=820, obtenido con XI sin recorrer un billón de segundos. Duración de una ejecución observada: 2,923 ms (incluye arranque de REVERSE para ese caso; no es mediana ni comparación controlada). Inverse Ether Memory informó nueve excepciones clásicas no nulas en ese estado.
- El programa fue compilado y ejecutado también como un **RXE1 genuino de REVERSE-PC**: 153 instrucciones, 23 constantes, imagen binaria de 2761 bytes.

La prueba de tests/fisica.test.mjs compara con un oráculo independiente de rebotes paso a paso. Lee los **48 bytes de resultado** desde Inverse Ether Memory, y exige igualdad con las seis cantidades informadas por XI. Verifica estados en paredes, reposo, horizonte extremo, eventos en t=0 y t=T, rechazo de escenarios inválidos y rollback por opcode inexistente.

El experimento reproducible tests/fisica-experimento.mjs contrasta la predicción sellada, un evento externo desconocido y su versión condicionada a la causa revelada. El manifiesto y los snapshots RVPC2 se preservaron con el programa .xi y .rxe como artefacto GitHub Actions.

## Interpretación

Es un sistema físico **idealizado**, cuya ley de movimiento es conocida, con aritmética entera exacta en el dominio establecido. Representa la transición a investigar física y causalidad en LaPlaceDIG, sin fingir que el programa descubre gravedad, mide el universo o construye hardware cuántico.

La aceleración estructural proviene de una solución analítica de reflexión, no de ejecutar una colisión por instante. No se ejecutó aquí una comparación de rapidez con un motor físico paso a paso en el mismo hardware, ni se midieron energía eléctrica o RAM física. La cifra de 2,923 ms no certifica ventaja universal.

## Reproducción

    node tools/fisica.mjs ejemplo 1000000000000 ejemplo.xi
    reverse_pc compile ejemplo.xi Fisica-P001.rxe
    reverse_pc init inicio.rvp
    reverse_pc run Fisica-P001.rxe inicio.rvp despues.rvp
    REVERSE_PC_BIN=./build-reverse/reverse_pc node --test tests/fisica.test.mjs
    node tests/fisica-experimento.mjs ./build-reverse/reverse_pc resultado.json

La CI del repositorio fija las dependencias por commit y ejecuta estos pasos sin alterar REVERSE-PC ni Mundo X. El siguiente paso verificable sería añadir fuerzas y medición física (por ejemplo aceleración gravitatoria), con nuevo contrato de unidades y referencia de cálculo, conservando esta suite como regresión.
