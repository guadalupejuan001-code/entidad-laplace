# LAPLACE P002 — gravedad interactiva de tres cuerpos en XI/Ether

## Objetivo y diferencia respecto a P001

P001 describe una sola partícula, sin fuerzas, con solución cerrada y rebotes elásticos. P002 implementa **tres masas que se atraen simultáneamente entre sí** en 2D. La fuerza cambia a medida que se mueven: es una dinámica **acoplada y no lineal**. Un estado ligeramente distinto puede producir una trayectoria diferente, y las masas afectan a todos los participantes.

Esta etapa no demuestra que una computadora pueda anticipar sin error un fenómeno natural real. Demuestra una familia de ecuaciones físicamente motivadas ejecutadas por los lenguajes del proyecto, con estado persistente, oráculos independientes y condiciones de refutación.

## Unidades, ley y método

Todos los valores enteros de entrada se expresan en puntos fijos de escala Q=100000, con G=1 en unidades normalizadas.

- Coordenadas x,y: enteros entre -300000 y 300000 (u / Q).
- Velocidades vx,vy: enteros entre -1000000 y 1000000 (u / Q por tiempo).
- Masas: enteros entre 1 y 100000 (M / Q).
- Suavizado gravitatorio Plummer: epsilon=0.05 u. Es un modelo con fuerza regularizada; evita fuerzas infinitas en separaciones cero y **no** reproduce el potencial Newtoniano puro en el interior del suavizado.
- Paso temporal fijo: h=1/1024 unidades de tiempo.
- G=1 en u³/(M·tiempo²), no la constante SI universal 6.674... × 10^-11.
- Se usa una aproximación entera de la raíz cuadrada y divisiones truncadas; todas las operaciones se ejecutan dentro del programa XI.

Para cada cuerpo i, la aceleración utilizada se aproxima a

    a_i = sum_{j != i} G*m_j*(r_j-r_i) /
          ( |r_j-r_i|² + epsilon² )^(3/2)

El integrador symplectic Euler actualiza primero v y después x:

    v_i(n+1) = v_i(n) + h * a_i(r(n))
    r_i(n+1) = r_i(n) + h * v_i(n+1)

El método es una aproximación de tiempo discreto, no una solución analítica exacta. La energía total puede variar por discretización y redondeo; hay que medir el error y detectar cambios de régimen, en vez de prometer conservación perfecta. Cuando los cuerpos se aproximan demasiado, la fuerza suavizada se desvía de la ley sin suavizado.

## Dónde se ejecuta y persiste

- `fisica/tres-cuerpos.mjs` compila y valida entradas; emite XI Machine. No calcula gravitaciones ni predice posiciones en JS.
- XI ejecuta pares dirigidos de fuerzas, raíz cuadrada entera, velocidad, posición y detección de cercanía. El ejecutor es el REVERSE-PC original con QuantumRuntime/Inverse Ether Memory de Mundo X, ambos fijados en CI.
- Los campos por cuerpo x,y,vx,vy,masa,ax,ay se guardan como enteros ZigZag de ocho bytes little-endian dentro de la región experimental `7000000003000000`. Se conservan 3 × 7 × 8 = 168 bytes lógicos de variables, más tres bytes de reloj, evento y marca de sesión; el proceso requiere más RAM física.
- El snapshot RVPC2 conserva todas las velocidades, masas y posiciones. En el modo `continuar` no se reescribe el estado inicial, sino que se recupera la sesión y se continúa con las mismas leyes.
- Cada ejecución admite 0..64 pasos y cada sesión experimental 254 pasos acumulados; la cota proviene del presupuesto acotado de XI y del contador del prototipo. No habilita avances instantáneos a 10^12 para fuerzas no lineales.
- Se registra un acercamiento cuando la distancia de dos cuerpos es ≤0.25 u al comenzar una iteración; se devuelve el índice inicial de esa iteración o null. Es una condición de estudio, no una colisión física simulada.

## Cómo compilar

Ejemplo de tres masas iguales con configuración próxima a una órbita de figura ocho, discretizada:

    {
      "modo": "iniciar",
      "pasos": 32,
      "cuerpos": [
        {"x":-97000,"y":24309,"vx":46620,"vy":43236,"masa":100000},
        {"x": 97000,"y":-24309,"vx":46620,"vy":43236,"masa":100000},
        {"x":0,"y":0,"vx":-93240,"vy":-86472,"masa":100000}
      ]
    }

Se trata de números de modelo, no posiciones de cuerpos astronómicos observados.

Para una prueba aislada:

    node tools/gravedad.mjs ejemplo 32 tres-cuerpos.xi
    reverse_pc compile tres-cuerpos.xi Gravedad-P002.rxe
    reverse_pc init estado-inicial.rvp
    reverse_pc run Gravedad-P002.rxe estado-inicial.rvp estado-32.rvp
    node tools/gravedad.mjs continuar 32 continuar.xi
    reverse_pc run continuar.xi estado-32.rvp estado-64.rvp

Solo usar snapshots de prueba. Un programa de inicialización escribe en la región del laboratorio; un programa de continuación exige que exista la marca válida de una sesión P002.

## Evidencia y requisitos de aceptación

- Comprobación numérica de los tres pares gravitatorios, y respuesta a variar la masa de un cuerpo.
- Referencia física independiente con doble precisión, sin reutilizar el integrador de estados XI; medir diferencias en las 12 coordenadas y velocidades.
- Comparar evolución monolítica de 64 pasos y 32+32 pasos al reiniciar y restaurar el archivo RVPC2. Exigir igualdad exacta dentro de la aritmética del mismo motor.
- Leer 123 bytes desde Inverse Ether Memory y reconstruir los 15 valores de estado más reloj/evento/marca; comparar exactamente con lo que XI emitió.
- Medir energía mecánica y momento total con un potencial gravitatorio **suavizado consistente** con la fuerza.
- Perturbación controlada del estado inicial y registro de la separación entre trayectorias; la separación NO constituye por sí sola un exponente de Lyapunov, caos demostrado o una previsión del mundo real.
- Rechazar continuidad de un estado sin inicializar, entradas fuera de límites y programas inválidos sin guardar snapshots.
- Medir duración, programas, RAM real, archivos de estado e instrucciones; no atribuir eficiencias cuánticas sin controles equivalentes.

La CI conserva la prueba de P001 y E005 y ejecuta este nuevo P002 desde el binario REVERSE y sus fuentes originales.

## Paso de investigación posterior

Con esta base, un siguiente experimento podría aumentar los cuerpos, estudiar divergencia en condiciones iniciales cercanas, medir horizontes de predictibilidad y comparar la evolución numérica contra familias de reglas que puedan componerse. Un salto algebraico grande como el de E005 no puede extrapolarse a ecuaciones no lineales arbitrarias sin una demostración específica.
