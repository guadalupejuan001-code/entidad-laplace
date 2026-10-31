# LaPlaceDIG — arquitectura del demonio digital sobre Ether

## Objetivo

Crear una inteligencia predictiva de sistemas inspirada en el demonio de Laplace. No un chatbot convencional, ni una máquina que prometa rentabilidad infinita. La tarea es calcular qué futuro se sigue de un estado y unas leyes y distinguir lo desconocido.

El demonio determinista en un mundo cerrado:

    S(t+h) = F^h(S(t))

S(t) es el estado completo de ese MODELO; F es su ley de transición; h es el horizonte. No confundir con la ecuación diferencial espacial de Laplace (nabla²u=0): resolver esta última no proporciona conocimiento del futuro.

## 1. Ether — base preexistente

Tecnología original en Mundo X: QuantumRuntime, InfiniteCore, CompactCore e Inverse Ether Memory. Se reutiliza como dependencia fija, sin copiar otra CPU ni crear un simulador alternativo:

- Estado de fondo definido por reglas y diferencias finitas materializadas.
- Reglas globales y relaciones exactas para familias cuánticas admitidas.
- Direcciones lógicas enormes sin materializar todas las direcciones intermedias.
- Sesión y rollback transaccional.
- Los bytes clásicos son proyecciones bajo solicitud.

Esto es simulación cuántica en CPU clásica. La compresión conocida no es universal y no demuestra aceleración para una IA de mercados.

## 2. Dos laboratorios conectados conceptualmente

### A. Demonio digital — migrado

- Mundo artificial determinista cerrado de 16 celdas.
- El runtime XI original aplica puertas CNOT y obtiene los observables.
- La evolución real se compara con los estados futuros predichos previamente.
- Una intervención externa desconocida produce divergencia.
- Si se conocen también las causas nuevas, vuelve la predicción exacta.
- Reversibilidad y una prueba separada de superposición cuántica.

Fuente idéntica: demonio/modelo.mjs y demonio/experimento.mjs. Original: Mundo X, commit 3d29556eff4d1079c791abab38e203fc209f1722.

### B. Historial temporal — primer adaptador

- Precio, economía, acontecimientos geopolíticos y relatos humanitarios son hechos externos, no resultados fabricados por Ether.
- Cada registro contiene observed_at (cuándo ocurrió) y known_at (primera disponibilidad verificada).
- Valores originales decimales y URLs de procedencia se preservan.
- La consulta asOf(corte) solo muestra registros conocidos antes o en el corte.
- Las revisiones económicas se guardan por separado y se seleccionan según la fecha de disponibilidad.
- historia/ether-xi.mjs proyecta los bytes del historial elegible a Inverse Memory con el XI ORIGINAL y exige recuperación idéntica.

**Límite de persistencia:** el CLI aislado mundo_x_quantum inicia una sesión nueva para cada ejecución. La fuente persistente es el archivo JSONL; la proyección XI actual verifica fidelidad dentro de una transacción, NO es aún una base mundial persistente ni comprime automáticamente millones de precios.

## 3. Inteligencia de Laplace — primer aprendiz y objetivo restante

    Z_t = C_Ether(observaciones conocidas hasta t)
    F_estimado_t = AprenderLeyes(Z_0 ... Z_t)
    pronostico_t_h = P(Y_(t+h) | Z_t, F_estimado_t)
    nueva_observacion -> CorregirModelo(F_estimado_t)

E001 implementa un caso restringido de esta ecuación: aprender `F(x)=b XOR A*x` desde transiciones binarias conocidas. El anfitrión calcula el plan de eliminación con las entradas; el XI original aplica ese plan a las salidas, por lo que los coeficientes desconocidos son resultados de operaciones CNOT nativas. El predictor recupera ese estado aprendido y compila sus consecuencias en XI. No recibe las puertas ocultas del mundo de evaluación.

Si el diseño no tiene rango `ancho+1`, conserva la incertidumbre y propone una entrada que aportaría evidencia independiente. Si una combinación nativa deja una contradicción, refuta la hipótesis de una ley afín fija. Estas condiciones producen abstención, sin checkpoint nuevo. El diario completo puede volver a procesarse al llegar observaciones: todavía no hay servicio continuo ni selección autónoma de ventanas ante cambios de régimen.

El checkpoint es un programa XI reproducible con hash y metadatos, no coeficientes autoritativos en JSON. Cada recuperación lo vuelve a ejecutar. La sesión nativa sigue siendo efímera; no se ha agregado persistencia binaria al núcleo.

El aprendiz afín de E001 no incluye estimación probabilística ni reglas numéricas generales de mercados. Comprender narrativas textuales completas requerirá capacidades adicionales que deben comprobarse.

E002 añade una ruta probabilística específica con etiquetas numéricas: `P(retorno neto a 24h > 0 | narrativa geopolítica y humanitaria)`. La probabilidad de inferencia excluye precios, volumen, indicadores y economía. Los precios solo construyen las etiquetas. El anfitrión estima frecuencias suavizadas, analiza temas/combinaciones/secuencias y selecciona reglas por validación cronológica. Ether/XI conserva y recupera el estado completo aprendido. Esta separación de tareas es distinta a la reducción CNOT de E001; no se atribuye a XI la aritmética probabilística del anfitrión.

La prueba final usa un checkpoint congelado y no participa en la elección de patrones. El vocabulario simbólico se fija por versión y hash de su código, y las capturas de fuentes mantienen disponibilidad verificable. E002 ofrece el mecanismo de entrenamiento y evidencia sintética, sin acreditar señal predictiva en mercados reales. Ver [NARRATIVA.md](NARRATIVA.md).

La representación Z debe conservar aquello que el problema exige para predecir, no simplemente usar pocos bytes.

## 4. Pruebas exigidas antes de hablar de ventaja

1. El modelo no lee información publicada después de su tiempo de predicción.
2. El entrenamiento no mira datos de evaluación final.
3. Se compara contra persistencia y referencias convencionales bajo la misma información.
4. Se miden errores, calibración, memoria, tiempo y causas de abstención.
5. Se registran revisiones económicas, eventos con publicación tardía y cambios de régimen.
6. Toda ventaja atribuida a Ether se demuestra sobre el MISMO cálculo.

## 5. Estado real

| Componente | Estado |
| --- | --- |
| Demonio XI sobre mundo artificial | Migrado; test en CI |
| Ether/Inverse Memory | Dependencia del núcleo original fijado por SHA |
| Contrato de precios, economía y geopolitica | Implementado |
| Filtrado temporal y revisiones conocidas | Implementado |
| Recuperación byte por byte desde XI | Prueba automática con el motor original |
| Aprendizaje de una ley afín binaria desconocida | E001; reducción de salidas por CNOT nativo |
| Pronóstico desde reglas aprendidas y checkpoint XI | E001; 32/32 estados futuros en un mundo sintético reservado |
| Abstención y refutación al incorporar evidencia | E001; rango insuficiente, contradicción y causa externa |
| Probabilidad condicionada solo a narrativa geopolítica/humanitaria | E002; entrenamiento, validación y prueba separados |
| Métrica de retorno a 24h y puntuación probabilística | E002; etiquetas decimales exactas, Brier, log-loss y calibración |
| Fuentes de relatos y preservación de su disponibilidad | Importadores locales de capturas ReliefWeb/GDELT |
| Descarga de todo el mercado mundial | No importada |
| Conectores automáticos Shiller / FRED / GDELT | No instalados |
| IA que aprende leyes y predice mercados | No construida |
| Predicción perfecta o ventaja demostrada en trading | No existe |
| Hardware cuántico físico | No existe |

LaPlaceDIG es el repositorio central de la nueva investigación. Mundo X sigue siendo la dependencia de tecnología propia, no otra app de destino.

## 6. E003/E004 — coexistencia y escenarios

El puente dual usa los mismos objetivos de mercado y relatos para devolver `Y_calculado` y `P_estimado(Y=1)`, separados. La ley afín se ejecuta por XI sobre una codificación de temas; la ruta estadística conserva su propia estimación. El diario agrega resultados observados por patrón sin sobrescribir las predicciones. Las refutaciones se aplican según disponibilidad de evidencia y versión de la ley.

E004 ejecuta copias pequeñas de la ley sobre escenarios declarados, obtiene marginales nativas y suma masas con sus pesos. El análisis no altera la probabilidad narrativa ni se cuenta como un nuevo pronóstico. El control medido usa 1.536 qubits activos en componentes de tres, dentro de la familia Clifford compacta del núcleo. No enumera un espacio general de amplitudes. Véase [COEXISTENCIA.md](COEXISTENCIA.md).
