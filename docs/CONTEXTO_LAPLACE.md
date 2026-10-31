# Continuidad de Laplace

## Intención

Construir el demonio de Laplace digital: representar estados, descubrir leyes y calcular consecuencias. La inteligencia debe aprender de observaciones y reconocer lo que desconoce. LaPlaceDIG es el repositorio de este proyecto.

La dirección original usa Ether como estado/reglas y sus diferencias, Inverse Ether Memory para consultas y XI como lenguaje ejecutable. Evitar reemplazar la tecnología propia por un modelo externo. No modificar REVERSE ni BBY Q desde este trabajo.

## Punto de partida conservado

La migración inicial incorporó un mundo de 16 celdas con reglas conocidas y una memoria histórica de precios, economía y acontecimientos. El núcleo original de Mundo X se fija al commit `3d29556eff4d1079c791abab38e203fc209f1722`. Los programas migrados del demonio se conservan idénticos.

La prueba de reglas dadas acreditó 33/33 estados de un universo cerrado, no aprendizaje. Las consultas históricas separan cuándo ocurrió un hecho y cuándo se pudo conocer. No se ha descargado toda la historia financiera.

## Avance E001

Se agregó un aprendiz de leyes afines binarias. El anfitrión planea la eliminación con entradas; XI transforma las salidas y ejecuta las predicciones. Los resultados aprendidos se recuperan reproduciendo un programa XI guardado. Se verifican evidencia insuficiente, hipótesis refutadas, ausencia de acceso a publicaciones futuras y un pronóstico reservado de 32 pasos.

Esto inicia la parte de descubrimiento de reglas. No completa una inteligencia general ni la predicción de mercados. Las fuentes y los límites técnicos se explican en [INTELIGENCIA.md](INTELIGENCIA.md) y [ARQUITECTURA.md](ARQUITECTURA.md).

## Restricciones que siguen vigentes

- Conservar el runtime original y una autoridad clara del estado aprendido.
- No incorporar información futura ni inventar precios, precisión o disponibilidad histórica.
- Explicar qué hace el anfitrión y qué calcula XI.
- Medir recursos reales; no presentar memoria lógica como RAM ilimitada.
- Mantener pruebas reproducibles, ramas de trabajo y revisión por PR.
- Distinguir resultados sintéticos de evidencia del mundo abierto.

## Próximo objetivo

Ampliar las familias de reglas y el manejo de ruido/cambios de régimen. El paso hacia datos reales debe conservar el contrato temporal existente y demostrar predicción fuera de muestra. No rebajar la misión a ejecutar un simulador con leyes entregadas de antemano.

## Dirección solicitada en E002

El usuario pidió fijar una métrica de interés, implementar entrenamiento y fórmula, crear el espacio con sus leyes y hacer que una probabilidad dependa exclusivamente de la narrativa geopolítica y humanitaria. Esa exclusividad se aplica a las entradas de inferencia. Los precios son necesarios para enseñar y medir un objetivo de mercado, pero no se usan como características del predictor.

Se fija por defecto BTC/USD, horizonte 24 horas y retorno superior a 10 puntos básicos de coste total supuesto. Se aprenden condiciones sobre temas, regiones, combinaciones y secuencias. Las probabilidades se estiman con conteos suavizados hacia una referencia de entrenamiento; se seleccionan solo mediante validación anterior al test. Cada patrón generado queda auditado, incluidos descartes y falta de soporte. La prueba final se reserva con un modelo congelado.

La estimación de E002 es clásica y propia en el anfitrión existente. Las reglas y estadísticas guardadas tienen una única copia autoritativa en el checkpoint reproducible Ether/XI. Se conservan ambos experimentos y sus diferencias técnicas. La evidencia de E002 sigue siendo sintética. El próximo avance debe reunir capturas históricas verificables y precios con disponibilidad documentada, y comprobar la señal narrativa fuera de muestra sin agregar precios a las entradas.

## Coexistencia y realidades solicitadas

El usuario eligió integrar cálculo condicional y predicción probabilística, con dos resultados cuando sea posible y registro por patrón. E003 enlaza ambas rutas al mismo objetivo. La ruta afín aprende una función narrativa del indicador del retorno; la estadística conserva su estimación. Ambas pueden abstenerse independientemente. Un diario encadenado conserva cada par y añade el resultado real cuando se conoce. Las vistas se agrupan por identidad del patrón, no por fecha, y registran refutaciones sin modificar pronósticos anteriores.

El usuario describió además analizar realidades probabilísticas con más de mil qubits y contar positivos/negativos. E004 implementa un análisis nativo acotado: escenarios con entradas 0/1/? y pesos declarados; XI calcula marginales bajo la ley aprendida y el anfitrión suma masas ponderadas. Los análisis se añaden al mismo patrón y no incrementan el número de pronósticos.

Se midieron 1.536 qubits activos en 512 componentes de tres qubits. Esto demuestra esta familia compacta Clifford en el runtime original, no simulación arbitraria de todos los estados de 1.536 qubits ni conocimiento de todos los futuros físicos. Los positivos y negativos con incertidumbre son cantidades esperadas, no mediciones de mercados ni mundos físicos observados. La probabilidad narrativa principal permanece separada de las hipótesis de escenarios.

La próxima investigación debe aprender pesos y leyes de fuentes históricas verificables, probar incertidumbre/correlaciones más ricas y conservar esta separación de resultados, supuestos y evidencia. [COEXISTENCIA.md](COEXISTENCIA.md) describe comandos y límites.

## Bitcoin actual y pruebas cortas del pasado

El usuario pidió centrar el trabajo de mercado solo en Bitcoin, consultar el precio actual y disponer de un agente activado por botón que registre medios, gobiernos y contexto. Se implementó `bitcoin/agente.mjs` y un observatorio privado con dos capturas reales verificadas, deduplicación de titulares, primera fecha de observación persistida, estado de fuentes y exportación JSONL. El precio actual es `spot_quote`, separado del cierre diario. Las entradas de inferencia continúan limitadas a geopolítica y narrativa humanitaria; las noticias monetarias/regulatorias solo se muestran como contexto.

También pidió calibrar después con pruebas rápidas prediciendo el pasado. `bitcoin/historico.mjs` reunió 91 cierres BTC/USD y 715 anotaciones de 91 archivos GDELT. `bitcoin/calibracion.mjs` separa 28/8/8/7 días para entrenamiento, validación, calibración y prueba. Se repitieron seis ventanas con 42 objetivos reservados. Brier referencia 0.247090, narrativa 0.248952, calibración 0.255053: la calibración no mejoró y no se activa como señal en vivo. Se guardan pronósticos, observaciones y resultados por patrón/modelo.

Los precios históricos mantienen `known_at` de descarga: no hay vintage original verificado. La evaluación estricta devuelve evidencia insuficiente. Solo el modo exploratorio, nombrado explícitamente, supone disponibilidad al cierre en una vista temporal interna; nunca modifica el ledger. No afirmar que esta reconstrucción equivale a pronósticos realmente emitidos entonces. No ajustar sobre los mismos 42 casos para intentar convertirlos en una prueba favorable. Más detalle, fuentes y reproducción en [BITCOIN.md](BITCOIN.md).

## Control del tiempo solicitado

El usuario pidió una estructura más convincente y un control manipulable de fecha hasta 2030, con probabilidades que respondan al moverlo. Se agregó una consola temporal, calendario, deslizador diario, saltos de año y controles narrativos. Las fechas pasadas consultan los pronósticos archivados sin alterarlos; las futuras consultan un recorrido clásico precalculado en un Worker. Las hipótesis, semilla y conteos pueden exportarse.

El nuevo kernel `bitcoin/tiempo.mjs` compone trayectorias con una probabilidad beta por trayectoria y retornos diarios de las 28 etiquetas de entrenamiento. `bitcoin/perfil-tiempo.mjs` genera el perfil desde el checkpoint XI verificado. El horizonte máximo es 31 de diciembre de 2030. Los conteos son simulaciones condicionales bajo narrativa fija, independencia diaria y magnitudes históricas de entrenamiento. No presentarlos como hardware cuántico, hechos del futuro, precisión validada ni activación de una señal financiera. Las 2.048 combinaciones de temas se contrastan con el estimador nativo. La calibración anterior continúa sin superar la referencia.

## Corrección del núcleo tras la objeción del usuario

El usuario rechazó esa entrega y pidió trabajar en lo pendiente. Se reconoció el error de hacer convincente el panel sin resolver la dinámica. Se retiraron de la interfaz el bootstrap y su porcentaje de 2030. Esos módulos permanecen solo como legado reproducible.

`native/laplace_temporal.cpp` añade operaciones de dominio de Laplace: cuenta transiciones y etiquetas, ajusta un modelo finito de Markov y propaga la distribución con aritmética clásica nativa. Usa QuantumRuntime e Inverse Ether Memory originales sin modificar sus fuentes. `laplace_fit` y `laplace_evolve` son extensiones nuevas de la capa Laplace, no comandos previamente existentes del XI base. Evidencia, conteos y distribución de cada paso se conservan en la memoria original. No atribuirles ventaja cuántica.

El actual modelo ajustado con información conocida al corte real aprende 7 estados, 89 transiciones y 90 etiquetas. La selección y el test retrospectivos separan 42/14/14 días y evalúan anticipaciones 0–7; son períodos ya explorados, no confirmación independiente. A un día, Brier 0.246410 frente a 0.245788 de referencia. El modo estricto histórico se abstiene por disponibilidad de los cierres. No hay horizonte financiero confirmado.

La consola solo consulta trazas calculadas por el ejecutor nativo; no propaga matrices en JavaScript. Las fechas previas usan modelos congelados con corte efectivo posterior a la selección y anterior al origen. La primera fecha futura del perfil comienza después del ajuste real. El calendario continúa hasta 2030. Tras la aclaración del usuario, el motor propaga todas esas fechas: el alcance de las pruebas se registra como información y no impone una abstención por horizonte. Actualizar cotización/noticias no reentrena automáticamente el modelo C++ en el alojamiento: el perfil debe regenerarse y publicarse. [DINAMICA.md](DINAMICA.md) documenta las instrucciones y evidencias.

## Exploración futura sin bloqueo por validación

El usuario aclaró que busca explorar el futuro y rechazó convertir la falta de pruebas de largo plazo en una prohibición de cálculo. Se retiraron los topes de 7 días en la vista y de 32 pasos en el ejecutor nativo. El perfil conserva una traza diaria completa hasta el 31 de diciembre de 2030 para cada estado inicial aprendido, con masa positiva, negativa y distribución narrativa. La matriz aprendida se mantiene durante la proyección y puede converger a un equilibrio. La prueba histórica sigue cubriendo 0–7 días; ese dato no bloquea ninguna fecha del calendario. No se alteraron entrenamiento, objetivo diario ni resultados históricos para conseguir una curva distinta.

## Lectura sencilla del panel

El usuario indicó que la interfaz no se entendía. La vista principal ahora guía con dos pasos: elegir una fecha y leer las dos posibilidades. Expresa el objetivo como «Sube más de 0,10% en 24 horas» y el complemento como «No supera esa subida», aclarando que incluye subir menos, mantenerse o bajar. Añade un ejemplo con $100.000 y $100.100. Los controles de noticias, gráfica, explicación técnica y archivo de pruebas anteriores comienzan cerrados. El botón de captura se llama «Actualizar precio y noticias». Se conservaron el perfil numérico, los contextos manipulables, la comparación histórica, la exportación completa y la proyección hasta 2030.

Fuente publicada: `87eb4ab345f67e9cfa38c81f47b5b27a88937397`. La comprobación HTTP, el significado de las dos tarjetas y la igualdad del perfil se registran en `evidencia/BTC-INTERFAZ.json`. TypeScript y compilación pasan; la revisión visual sigue sin verificar por un fallo de conexión de la previsualización.
