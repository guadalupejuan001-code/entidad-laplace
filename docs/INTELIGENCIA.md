# Inteligencia Laplace — E001

Laplace debe aprender las reglas que conectan estados observados y usar esas reglas para calcular consecuencias. E001 separa por primera vez la ley desconocida del aprendiz: este recibe ejemplos de entrada/salida, sin acceso a la definición del entorno.

## Qué aprende

Una ley de transición afín sobre bits:

    y = b XOR A*x

Cada salida puede depender de cualquier combinación XOR de entradas y de una constante. Se admiten de 1 a 16 variables, hasta 128 transiciones y horizontes de 1 a 32 pasos. No se supone que un mercado siga esta ley.

El diseño de observaciones usa las filas `[1, x0, ..., xN]`. Tener muchas muestras no basta: hace falta rango `N+1` para identificar todos los coeficientes dentro de esta familia. El número de leyes posibles no se enumera. Si falta rango, Laplace propone una entrada experimental que lo aumentaría; ejecutar ese experimento corresponde al entorno.

Con rango completo y sin contradicciones hay una única ley **dentro de esta gramática**. Un número finito de muestras no prueba que el mundo siga siendo afín, cerrado o estable. Cualquier salida incompatible refuta esa hipótesis fija. Ruido, una ley no lineal o una causa externa pueden producir la misma refutación; E001 no decide por sí solo cuál fue la causa.

## Dónde ocurre el cálculo

| Componente | Trabajo |
| --- | --- |
| Anfitrión Node existente | Valida fechas, selecciona evidencia, reduce solo la matriz de entradas y planifica pivotes |
| XI original | Codifica salidas observadas como estados de base y aplica sumas de filas mediante CNOT; los intercambios usan tres CNOT |
| Inverse Ether Memory | Expone los coeficientes reducidos mediante enlaces explícitos `mem_bind` y lectura sin colapso |
| Anfitrión | Lee la proyección, detecta contradicciones, explica reglas y compila consultas |
| XI original | Ejecuta todos los estados futuros del pronóstico |

No se ha cambiado C++, el intérprete ni las operaciones del núcleo. No hay solver de coeficientes de salida ni predictor alternativo en JavaScript. La planificación desde entradas sí usa eliminación clásica; esto no es aprendizaje enteramente autoalojado en XI. Tampoco demuestra ventaja sobre una implementación clásica del mismo algoritmo.

Los bits se materializan como estados clásicos en el runtime cuántico simulado; no hay superposición en este aprendiz. En el experimento reproducible, el runtime registra 768 qubits activos al terminar el aprendizaje. Los bytes de tableau y direcciones reportados corresponden a sus estructuras, **no a toda la RAM del proceso ni a un pico de RAM medido**. La memoria inversa no comprime automáticamente las muestras de este laboratorio.

## Diario de observaciones

El formato JSONL binario es independiente del diario financiero; cada línea contiene exactamente:

```json
{"id":"ejemplo-1","before":"10","after":"01","observed_at":"2020-01-01T00:00:00Z","known_at":"2020-01-01T00:01:00Z"}
```

Este ejemplo es sintético. El carácter de la izquierda representa la variable de índice 0. `observed_at` es el fin de la transición; `known_at` indica cuándo la transición completa estuvo disponible. Solo las observaciones con `known_at <= corte` entran al programa de aprendizaje y a su hash. Todos los registros deben pertenecer al mismo sistema y usar el mismo ancho.

El formato no admite noticias, precios decimales ni texto. No convertir esas fuentes en bits sin definir y validar una representación que preserve la información pertinente. El diario histórico existente conserva su propio contrato y procedencia.

## Uso

Construir primero el runtime fijado por SHA según el README. Después:

```sh
node tools/laplace.mjs aprender-leyes transiciones.jsonl 2020-01-02T00:00:00Z ./build-ether/mundo_x_quantum modelo-001.json
node tools/laplace.mjs predecir-estado modelo-001.json 10 4 ./build-ether/mundo_x_quantum
```

Si se identifica una ley, el primer comando crea un archivo nuevo. Rechaza sobrescribir uno existente. Si faltan evidencias o hay contradicciones, devuelve el motivo y no crea checkpoint. Un archivo antiguo permanece como artefacto histórico; no representa una ley vigente tras una refutación. Incorporar nuevas observaciones exige volver a aprender con el diario actualizado y usar el resultado nuevo.

El segundo comando reproduce el programa XI del checkpoint para recuperar los coeficientes y luego ejecuta el pronóstico. La predicción está condicionada al estado inicial proporcionado. `cutoff` indica el corte del entrenamiento; no acredita que ese estado inicial fuese públicamente conocido entonces. Esta interfaz no es un backtest financiero.

El checkpoint conserva el programa XI de aprendizaje, sus hashes, la fecha del corte, el rango y los identificadores de las observaciones. Las reglas impresas son una proyección explicativa; no se guardan coeficientes en JSON como segunda autoridad. Guardar y volver a ejecutar un programa no equivale a serializar una sesión nativa viva.

## Evidencia reproducible

```sh
MUNDO_X_QUANTUM=./build-ether/mundo_x_quantum node --test tests/*.test.mjs
node tools/laplace.mjs experimento-aprendiz ./build-ether/mundo_x_quantum build-evidence/aprendiz
```

El experimento:

1. Ejecuta en XI un entorno oculto de 16 variables para obtener 48 transiciones.
2. Pasa únicamente esas transiciones al aprendiz y obtiene rango 17/17.
3. Guarda y recupera el checkpoint desde disco.
4. Guarda y sella el pronóstico desde otro estado inicial antes de ejecutar su futuro.
5. Revela 32 estados: 32/32 coincidencias, cero errores de bits; persistencia logra 0/32 en ese mismo horizonte.
6. Repite con una causa externa desconocida: primera divergencia en el instante 9.
7. Añade esa transición al diario: el nuevo resultado refuta la ley fija y se abstiene. La misma transición, cuando todavía era futura respecto al corte anterior, no altera el aprendizaje previo.
8. Con cuatro observaciones se abstiene y propone un experimento informativo.

Las pruebas también usan un oráculo clásico independiente, entradas reservadas, leyes no lineales, contradicciones con rango incompleto, intercambios de filas, límites de recursos, recuperación y corrupción del programa aprendido. La CI vuelve a ejecutar el experimento y conserva sus programas/evidencias como artefactos.

El [registro de E001](../evidencia/E001.json) conserva las reglas recuperadas, errores, referencias y hashes de una ejecución reproducible. La batería completa contiene 16 pruebas y exige el binario original para los controles nativos.

## Siguiente investigación

Ampliar la gramática a relaciones numéricas y no lineales, medir incertidumbre con ruido y aprender cuándo cambia una regla. Después conectar precios, economía y eventos conocidos en cada fecha y evaluar cronológicamente contra persistencia y referencias comparables. Cada ampliación debe demostrar utilidad fuera de las muestras usadas para aprender antes de atribuirle inteligencia más general o capacidad financiera.
