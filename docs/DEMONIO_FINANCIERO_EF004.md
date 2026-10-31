# EF004 — Núcleo del Demonio de Laplace financiero

Fecha de introducción: 31 de octubre de 2026.

## 1. Objetivo

Crear una inteligencia de evolución que aprenda cómo se relacionan en el
tiempo los estados observados de mercados, bancos, capital, blockchain,
macro y factores externos. Un Demonio de Laplace perfecto presupone el
estado completo y las leyes exactas. EF004 solamente aprende
**dependencias estadísticas** de la información pública registrada;
no atribuye causalidad ni conocimiento de los estados privados.

Se conserva el laboratorio de demonio/modelo.mjs y los componentes
EF001–EF003, XI/Ether, M001, F001, V001, P005 y E001.

## 2. Primera ley aprendible

    z_i(t) = asinh(x_i(t) / escala_i)
    d_i(t) = z_i(t) - z_i(t-1)
    d_j(t+1) ~= b_j + sum_i( W_{j,i} * d_i(t) )

La escala de cada variable proviene EXCLUSIVAMENTE del entrenamiento.
La matriz W se estima con regresión ridge; las aristas conectan señales
con retardo. No son relaciones causales demostradas.

El modelo calcula primero todas las siguientes diferencias del vector y
DESPUÉS aplica juntas las actualizaciones. Puede evolucionar de forma
condicional hasta cuatro pasos de seis horas, con bandas exploratorias
que no se presentan como probabilidades calibradas.

El ajuste EF004 se realiza con aritmética clásica JavaScript. La
última captura pública puede trasladarse en lotes de hasta 1.024 estados
al XI/Ether original y verificarse mediante recuperación exacta de bytes.
Este puente puede procesar capturas mayores en lotes sin materializar
todos los estados lógicos imaginables. El estado
y las comprobaciones XI/Ether originales continúan existiendo como
componentes diferentes; **no** se afirma que XI ejecute la regresión EF004.

## 3. Temporalidad y fuentes

Los datos proceden de capturas EF002 verificadas por hashes, provenientes
de la rama laplace-archivo. Cada fila exige fecha de observación y de
primer conocimiento anterior a su captura.

Las series se identifican por dominio, variable, unidad y proveedor.
Las series incompletas durante entrenamiento se excluyen de ese
entrenamiento. Una serie sin actualizaciones no se trata como miles
de observaciones nuevas: por ejemplo, BIS trimestral repetido.

El ciclo requiere por defecto 48 capturas sucesivas de seis horas
(con tolerancia de 2,75 horas). Esto suele implicar alrededor de 12 días
si se cumplen cuatro capturas diarias. Si falta un ciclo o se rompe
la cadencia, se toma el segmento consecutivo reciente; no se interpola.

La base y el archivo contienen todos los estados; este primer núcleo
modela hasta 16 series y seis objetivos a la vez. Los demás estados
no se transforman en valores artificiales.

## 4. Aprendizaje — comprobación — corrección

Se divide cada secuencia de transiciones como sigue:

- Primer 60%: cálculo de escalas, dependencias con retardo y coeficientes.
- Siguiente 20%: selección entre referencia persistente, ajuste
  univariado y ajuste conjunto; coeficientes ridge 0,1 / 1 / 10.
- Último 20%: conjunto reservado. No participa en la elección del
  algoritmo, conexiones, hiperparámetros o modelo ganador.

Requisitos por objetivo: mínimo 20 parejas de entrenamiento,
8 pares evaluables de validación y 8 de test.
Un candidato debe mejorar en al menos 2% la persistencia en validación
o se mantiene la referencia sin afirmar aprendizaje útil para esa señal.

El modelo se sella con un SHA antes de agregar los resultados del holdout,
y la prueba mide el error normalizado del candidato y el baseline en
exactamente los mismos objetivos. Esto es una evaluación histórica,
no evidencia independiente de ventaja prospectiva.

## 5. Pronósticos prospectivos

Una vez existan suficientes capturas, EF004 emite un pronóstico sellado
para la siguiente ventana de seis horas. Cuando llegue un nuevo archivo
EF002, la evaluación:

- verifica el SHA del pronóstico original;
- exige que el objetivo sea posterior a la decisión;
- busca un dato actualizado y realmente disponible;
- compara error candidato frente a persistencia para el mismo objetivo;
- conserva error, abstención o falta de captura sin alterar el original.

Los informes se guardan en la rama laplace-modelos en tres colecciones:
reportes (ciclos sin suficientes datos), pronosticos (modelos congelados)
y evaluaciones (resultados observados después).

El workflow demonio-ef004.yml ejecuta el núcleo en cada finalización
exitosa de EF002, al integrar una versión del código y mediante un
calendario de respaldo. GitHub Actions no garantiza latencia ni 24/7.

## 6. Comandos

    npm ci
    npm run test:ef004
    npm run demonio:ciclo -- ejecutar ARCHIVO_EF002 SALIDA [DIARIO_ANTERIOR]

La ruta de datos real rechaza capturas con checksums inválidos.
Las pruebas sintéticas sirven para demostrar que el mecanismo identifica
una relación con retardo conocida y no selecciona con información futura,
pero NO se usan para el aprendizaje de mercado en producción.

## 7. Estado de investigación

La primera captura de EF002 registró 1.051 estados simultáneos.
No son 1.051 transiciones independientes por variable. Mientras no existan
48 capturas consecutivas con suficientes observaciones comparables,
el resultado esperado y correcto es ABSTAINED, no un modelo fingido.

Incluso después de formar un modelo, la habilitación de trading sigue
prohibida, la causalidad permanece sin demostrar y las incertidumbres
no están calibradas. V001 conserva NO_GO_MODEL_PRODUCTION.

Siguientes líneas de investigación: datos de múltiples períodos,
modelos estructurales identificables, cambios de régimen, supuestos de
causalidad comprobables, intervalos conformales o bootstrap temporal,
evaluación en activos no vistos y pruebas prospectivas prolongadas.
