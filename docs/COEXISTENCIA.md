# E003 y E004 — dos resultados, patrones y escenarios

## Una consulta, dos salidas

Ambas rutas preguntan por el mismo evento: `Y=1` si el retorno del activo y horizonte configurados supera el coste supuesto. No deciden comprar o vender.

| Ruta | Resultado | Significado |
| --- | --- | --- |
| Ley identificada | `Y_calculado = f(Z_t)` | Consecuencia exacta de la ley afín guardada, condicionada a sus supuestos |
| Narrativa probabilística | `p = P_estimado(Y=1 | Z_t)` | Frecuencia suavizada y validada de patrones conocidos |

El resultado calculado es un indicador binario del objetivo, no una cotización exacta. Su cálculo nativo puede ser exacto sin que la hipótesis aprendida sea una ley física del mercado. El horizonte lo define la etiqueta; E003 no confunde ejecutar una vez la función con simular 24 pasos físicos del mercado.

Las salidas se conservan por separado. La comparación informa la probabilidad asignada al resultado calculado y si la dirección más probable difiere. No se promedian, no se convierten en una orden y no se presenta la distribución como certeza. Puede haber dos resultados, uno solo o abstención en ambos.

## Puente entre los aprendices

E003 utiliza los mismos relatos y etiquetas de E002. El estado binario contiene temas narrativos declarados; los precios siguen fuera de la inferencia y solo producen etiquetas o resultados observados.

El anfitrión identifica una base de columnas independientes usando únicamente entradas. Así, temas complementarios como `CEASEFIRE` y `CONFLICT_ESCALATION` no producen una falsa falta de rango. La base y el dominio de entradas quedan guardados en Ether. Un contexto nuevo fuera del dominio identificado causa abstención del cálculo condicional.

Las ecuaciones repetidas idénticas pueden comprimirse, pero se conservan ambos resultados cuando una misma entrada tuvo `Y=0` y `Y=1`. Ese conflicto refuta una ley afín fija en XI; no desaparece por deduplicación. Hay un límite de 128 ecuaciones representativas para la ruta exacta y hasta 16 variables.

El resultado del objetivo se coloca en el bit 0 de salida; los restantes son padding cero. Solo se ejecuta un paso de esta función de objetivo. No se reutiliza ese vector como un supuesto estado narrativo del día siguiente.

La ruta afín usa todas las ecuaciones de los tramos ya conocidos de entrenamiento y validación. La probabilística conserva su separación entre estimación y selección. El test final queda fuera de ambas. Las dos rutas pueden estar disponibles independientemente: una ley puede estar identificada con pocos ejemplos y la probabilidad todavía abstenerse por falta de soporte; con ruido puede ocurrir lo contrario.

Los parámetros originales siguen en sus checkpoints XI. El contexto nativo vincula objetivo, codificación, fechas, dominio y hashes de ambas rutas. Cambiar la ley por otra ajena al objetivo compartido se rechaza.

## Registrar resultados dentro del patrón

Cada pronóstico conserva:

- Objetivo, corte de conocimiento, horizonte y versión del modelo.
- Definición e identificador del patrón: temas, región, secuencias y ventana.
- Las dos salidas, sus abstenciones y su comparación.
- Fuentes narrativas y hashes que permiten reproducir el cálculo.

El identificador del patrón no contiene la fecha ni los IDs individuales de los relatos. Por eso un patrón que reaparece en días distintos conserva un historial común. El objetivo y el extractor forman parte de la identidad: no se mezclan métricas incompatibles.

Al llegar los precios correspondientes se añade una observación, con etiqueta, procedencia y fecha real de disponibilidad. El pronóstico original no se modifica. La conciliación depende solo de los precios del objetivo, no del presupuesto o clasificación del corpus narrativo.

El registro informa aciertos y refutaciones de la ley, Brier de la probabilidad emitida, cobertura, casos pendientes y diferencias de dirección. Las métricas de probabilidad son condicionales a los casos emitidos y se acompaña su cobertura; no equivalen a beneficio financiero. Cada ocurrencia conserva la versión del modelo usada.

Si un resultado conocido refuta una ley en ese mismo patrón, las consultas posteriores registradas retiran su predicción activa y conservan `calculated_value` como diagnóstico. La probabilidad narrativa permanece separada. Una observación publicada después del corte consultado no puede retirar retrospectivamente una predicción anterior. Una ley nueva tiene su propia identidad y evidencia.

## Archivo y memoria nativa

El JSONL es un archivo de evidencia con eventos encadenados por hash: `forecast`, `observation` y `analysis`. Las vistas de patrones se reconstruyen de él. Los parámetros de los aprendices conservan su autoridad en XI; el diario es su registro de evidencia, no un segundo motor aprendido.

Las escrituras usan un bloqueo exclusivo y reemplazo atómico. Una consulta repetida es idempotente; archivos incompletos o alterados se rechazan. El hash detecta corrupción local, no acredita por sí solo un sello temporal externo ni impide que alguien reescriba una cadena completa con nuevos hashes.

El archivo admite 2.048 eventos y 8 MiB. No se descartan eventos silenciosamente. La proyección de un patrón a Ether conserva sus dos resultados y observaciones, métricas, análisis resumidos y el hash del archivo completo. Las explicaciones extensas permanecen en el JSONL. La proyección nativa es un lote de hasta 24 KiB, no una sesión histórica infinita residente.

## Comandos

```sh
mkdir -p registros
node tools/laplace.mjs entrenar-dual hechos.jsonl configuracion.json ./build-ether/mundo_x_quantum registros/modelo-dual.json
node tools/laplace.mjs pronostico-dual registros/modelo-dual.json hechos.jsonl CORTE_UTC ./build-ether/mundo_x_quantum registros/patrones.jsonl
node tools/laplace.mjs contrastar-dual registros/patrones.jsonl hechos-actualizados.jsonl CORTE_OBSERVACION_UTC
node tools/laplace.mjs patrones registros/patrones.jsonl
node tools/laplace.mjs verificar-patron registros/patrones.jsonl ID_PATRON ./build-ether/mundo_x_quantum
```

El directorio de un modelo nuevo debe existir, igual que en los comandos anteriores de entrenamiento. No se sobrescriben checkpoints. No hay recopilación recurrente ni órdenes; cada consulta y conciliación se ejecuta explícitamente.

## E004 — pesar escenarios positivos y negativos

La idea de analizar realidades posibles se implementa como un conjunto declarado de escenarios. Para cada escenario `s`, el runtime original ejecuta la ley aprendida y calcula la probabilidad del observable objetivo:

    masa_positiva = suma_s peso_s * P_XI(Y_s=1)
    masa_negativa = suma_s peso_s * (1-P_XI(Y_s=1))
    P_escenarios(+) = masa_positiva / suma_s peso_s

Contar alternativas por igual es correcto para pesos iguales. Con pesos distintos hace falta sumar sus masas. El número esperado de positivos puede ser fraccionario: no es un conteo de mediciones efectivamente realizadas.

Cada escenario declara `{id, input, weight}`. `input` sigue el orden de variables seleccionado por el modelo, usando `0`, `1` o `?`. `?` prepara un bit equiprobable mediante Hadamard; los bits inciertos se suponen independientes dentro de cada escenario. Es un supuesto explícito, no una distribución causal aprendida de noticias. Las leyes afines se compilan a X/CNOT sobre esos registros y `probz` consulta sus marginales sin colapso.

Los pesos clásicos son parámetros declarados; no son amplitudes cuánticas ni pruebas de frecuencia real. El resultado de escenarios queda como análisis de la hipótesis, junto al pronóstico. No reemplaza la probabilidad narrativa aprendida ni aumenta el número de pronósticos o aciertos registrados.

```sh
node tools/laplace.mjs analizar-realidades registros/modelo-dual.json hechos.jsonl CORTE_UTC escenarios.json ./build-ether/mundo_x_quantum registros/patrones.jsonl
```

El [ejemplo de escenarios](../ejemplos/realidades.json) corresponde al modelo sintético con variables `AID_BLOCKED, CEASEFIRE`. Hay hasta 1.024 escenarios y un máximo de 4.096 direcciones de qubit en la consulta. Cada escenario requiere su propio registro de entradas y un qubit objetivo; exceder el presupuesto produce error.

## Pruebas reproducibles

```sh
node tools/laplace.mjs experimento-dual ./build-ether/mundo_x_quantum build-evidence/dual-nuevo
node tools/laplace.mjs experimento-realidades ./build-ether/mundo_x_quantum build-evidence/realidades-nuevo
MUNDO_X_QUANTUM=./build-ether/mundo_x_quantum node --test tests/*.test.mjs
```

Usar directorios nuevos para no mezclar resultados ya contrastados con una ejecución posterior.

E003 genera un mundo narrativo cerrado de control, aprende una función desconocida y emite 64 pares de resultados antes del contraste. Después añade 64 observaciones. Hay cuatro patrones, 128 eventos y 64/64 coincidencias del cálculo condicional. En el control con ruido, la ley fija se refuta y la probabilidad sigue disponible. [Evidencia E003](../evidencia/E003.json).

E004 ejecuta **1.536 qubits activos**, repartidos en **512 componentes de tres qubits**, y calcula 256 positivos y 256 negativos **esperados**, con pesos iguales. Otro control muestra que masas 9,5 y 1,5 dan probabilidad `9,5/11`, aunque el conteo esperado sin pesos sea 1,5 frente a 1,5. Ambos análisis se guardan bajo un solo pronóstico y patrón. [Evidencia E004](../evidencia/E004.json).

## Qué demuestran los más de mil qubits

Este experimento representa circuitos Clifford compactos y obtiene observables concretos sin listar amplitudes ni enumerar todas las combinaciones de un registro general. El mayor componente entrelazado medido tiene tres qubits. El núcleo fijado admite hasta 4.096 qubits activos y 1.024 por componente, dentro de sus presupuestos.

Esto es simulación en CPU, no hardware cuántico físico ni una demostración de poder simular cualquier estado de 1.536 qubits. La simulación clásica eficiente de circuitos estabilizadores es una propiedad conocida de esta familia; véase [Aaronson y Gottesman, Improved Simulation of Stabilizer Circuits](https://arxiv.org/abs/quant-ph/0406196).

Los bytes de tableau y direcciones registrados corresponden a estructuras nativas, no a toda la RAM del proceso. El número de qubits no establece la calidad de una predicción financiera. Para aproximar probabilidades reales hacen falta leyes y pesos respaldados por evidencia, así como validación fuera de muestra. Ningún control publicado aquí demuestra todas las realidades físicas ni el futuro real de BTC.
