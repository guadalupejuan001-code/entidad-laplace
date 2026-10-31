# Laplace E005: salto temporal por reglas compuestas en XI/Ether

## Objetivo

Sustituye el prototipo temporal heredado que expandía trayectorias con un cálculo por composición de reglas. La misión no cambia: representar estados, descubrir leyes y calcular consecuencias. **El salto aplica únicamente a leyes afines conocidas; no elimina eventos externos ni aporta información ausente.**

Para una ley de w bits, s(t+1) = A s(t) XOR b, se usa la matriz aumentada M de (w+1)x(w+1) sobre GF(2). La predicción del estado lejano es s(t+h) = proyección( M^h * [s(t),1] ). La potencia se construye por cuadrados sucesivos; ejecutar un millón de transiciones NO requiere un millón de aplicaciones de F.

## Qué utiliza de tu tecnología

- salto/nucleo.xi ejecuta la multiplicación binaria de matrices y la potenciación temporal **en XI Machine sobre Inverse Ether Memory**. Utiliza load8, mul, add, mod, store8 y saltos del intérprete original de REVERSE-PC. El nuevo código no implementa ni copia una segunda CPU, simulador cuántico ni librería de álgebra externa.
- salto/compilar.mjs valida/serializa la ley y el estado inicial como programa XI. El anfitrión no calcula las potencias ni los resultados.
- tools/salto.mjs crea una fuente XI de demostración o importa coeficientes de una ley realmente aprendida por E001 mediante el QuantumRuntime original de Mundo X.
- REVERSE-PC compila la fuente a .rxe, ejecuta sobre Ether y guarda RVPC2. **La integración como ventana del escritorio todavía no forma parte de E005.**

En este prototipo los parámetros son 1 a 8 variables y horizonte entre cero y 10^12 pasos; la cota se debe al presupuesto experimental de instrucciones, no a una barrera física universal. Hay tres matrices en memoria inversa de (w+1)^2 bytes lógicos cada una y dos vectores. La memoria física total del proceso incluye estructuras, intérprete y cachés, y debe medirse por separado. Estos son bytes clásicos; no se demuestra ventaja cuántica.

## Ejecutar en una sesión limpia de REVERSE-PC

Generar el programa para un horizonte de un millón de transiciones:

    node tools/salto.mjs ejemplo 1000000 1011 salto-e005.xi

Compilarlo al formato ejecutable propio:

    reverse_pc compile salto-e005.xi Laplace-Salto.rxe

Crear y ejecutar en un estado de prueba aislado:

    reverse_pc init estado-inicial.rvp
    reverse_pc run Laplace-Salto.rxe estado-inicial.rvp estado-final.rvp

**No usar la memoria del escritorio personal para este laboratorio.** La fuente no ejecuta mem_reset; usa una región experimental reservada. Su resultado son 4 registros de salida y el bit constante, seguidos de la cantidad de productos de matrices realizados y estadísticas nativas.

Para una ley recuperada por el aprendiz E001:

    node tools/salto.mjs aprendido MODELO_E001.json 1011 1000000 ./build-ether/mundo_x_quantum salto-aprendido.xi
    reverse_pc compile salto-aprendido.xi Laplace-Aprendido.rxe

El puente de aprendizaje E001 admite hasta 16 variables, pero el prototipo E005 limita la composición nativa a 8 hasta completar pruebas de estrés. E005 sólo calcula **el estado final**. Si se solicitan todos los estados intermedios, escribir esas salidas vuelve a exigir trabajo proporcional a su cantidad.

## Validación y límites

tests/salto.test.mjs incluye referencia clásica independiente y controles de horizonte 0, 1, 2, 3, 31, 500, 1.000 y 1.000.000, matrices identidad, integridad, estado constante, .xi versus .rxe, dominio y límites. Las pruebas de compilación pueden correrse con Node sin binario, pero la evaluación completa exige REVERSE_PC_BIN y debe constar con éxito en CI. No hay ventaja de velocidad demostrada hasta comparar tiempo, RAM física y energía frente a la implementación paso por paso **sobre el mismo backend**.

La optimización de matrices tiene complejidad O(w^3 log h) para el estado final con este algoritmo elemental. Esto no significa tiempo constante, ni una aceleración automática de todas las leyes. Para eventos causales desconocidos, reglas no lineales, ruido y modelos físicos de alta dimensión todavía hacen falta otras estrategias.

## Retiro del prototipo anterior

La rama E005 elimina **el bootstrap temporal heredado** bitcoin/tiempo.mjs, bitcoin/perfil-tiempo.mjs y tests/tiempo.test.mjs, además del comando preparar-tiempo. Su objetivo fue reemplazado por un prototipo de salto temporal sobre reglas, no por otro muestreador de precios. Git mantiene los archivos en commits anteriores para auditoría.

El aprendizaje E001, experimentos E002-E004, datos históricos y el modelo de Bitcoin en dinamica/ permanecen porque son laboratorios distintos; eliminarlos destruiría evidencias y funciones que aún sirven. No se modifica BBY Q, W4u, Mundo X ni REVERSE-PC.
