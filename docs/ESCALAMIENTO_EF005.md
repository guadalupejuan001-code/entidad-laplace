# EF005 — Laplace sin topes artificiales de estados ni evolución

Fecha: 31 octubre 2026.

EF005 elimina límites rígidos de alcance heredados de EF001–EF004. El
motor trabaja con los registros que existen realmente, las leyes que ha
podido comprobar y la capacidad del proceso que lo ejecuta.

## Qué se eliminó

| Antes | EF005 |
| --- | --- |
| 4.096 observaciones máximas en U001/U002/U003 | Sin máximo fijo de observaciones en una captura |
| Restricción SQL de 4.096 estados en EF001 | Migración aditiva elimina la restricción y conserva los datos |
| Lectura de solo 4.096 estados EF001 | Consulta completa o paginación con tamaño decidido por el usuario |
| 48 capturas consecutivas obligatorias | Evidencia mínima adaptativa según pares de entrenamiento, validación y prueba |
| 2.500 capturas máximas en EF004 | No existe máximo fijo en el lector ni en el panel |
| 10.000 archivos EF002 como máximo | Restauración secuencial y descubrimiento iterativo sin techo por cantidad |
| 16 señales y 6 objetivos máximos | Todas las series elegibles salvo presupuesto opcional explícito |
| 3 vecinos y 4/8 pasos máximos | Vecinos según cantidad de muestras; horizonte elegido por el usuario |
| Cadencia forzosamente de 6 horas | Cadencia estimada de las fechas reales; admite intervalos menores o mayores |
| Archivo máximo de 32 MiB | Tamaño según presupuesto de memoria y configurable |
| 1.024 registros XI por lote | **Continúa siendo un tamaño físico por lote**, no un máximo global de estados |

## Principio matemático y límites científicos

No se puede aprender una ley a partir de una sola fotografía del
sistema. La eliminación del número 48 NO elimina la necesidad de
muestras independientes.

EF005 exige por defecto al menos 6 transiciones de entrenamiento,
2 validaciones y 2 resultados reservados, con más muestras necesarias
si aumenta la cantidad de parámetros. La división temporal sigue
protegiendo contra la fuga de información futura y contra el
autoengaño de un modelo evaluado sobre sus datos de ajuste.

Los resultados construidos con pocas observaciones son experimentales,
no evidencia de una ventaja de mercado. El aprendizaje no inventa
períodos intermedios ni transforma un informe trimestral repetido en
numerosas transiciones.

Para cada objetivo, el algoritmo inspecciona las series elegibles
y decide un número de relaciones dependiente de la cantidad de datos
disponibles. La estimación utiliza la regresión temporal ridge existente
y conserva la referencia de persistencia.

El cálculo conjunto sigue actualizando todas las variables del mismo
paso simultáneamente; el horizonte puede ser de minutos, días o
períodos mayores cuando el tiempo de las capturas y el calendario lo
permiten. El modelo no garantiza fiabilidad a horizontes largos.

## Lotes, memoria y capacidad física

El serializador nativo original XI/Ether debe materializar una cantidad
finita de bytes por transacción. Por eso EF001/EF004 empaqueta el
universo en lotes independientes de hasta 1.024 estados. El número
total de lotes no tiene un máximo impuesto en EF005.

Los límites reales que NO se eliminan son:

- RAM, disco, cuotas de GitHub, tiempo de ejecución y tamaño de los
  archivos permitido por la infraestructura;
- validez criptográfica de capturas y pronósticos;
- restricciones de acceso legal a feeds y licencias;
- precisión numérica, rango de fechas y evidencia disponible;
- controles de seguridad del parser contra datos corruptos;
- imposibilidad de afirmar que un modelo parcial conoce todos los
  estados del planeta.

EF002 adapta el límite de descompresión/archivo al heap y memoria
disponible, o utiliza un presupuesto explícito de entorno:
LAPLACE_EF002_MAX_ARCHIVE_BYTES. Para archivos superiores a los límites
de un proveedor de alojamiento, debe elegirse almacenamiento externo
o particionado, no desactivar verificaciones.

La reconstrucción importa un archivo a la vez, conservando hashes,
revisiones, known_at y la semántica original.

## Configuración opcional de EF004

Sin variables específicas, EF004 analiza todas las series elegibles,
escoge objetivos sin tope de cantidad y calcula un horizonte base de
24 horas, que es una elección operativa, NO el máximo matemático.
El intervalo se detecta automáticamente desde los datos.

Variables para cambiar presupuesto voluntariamente:

    LAPLACE_DEMON_HORIZON_HOURS=168
    LAPLACE_DEMON_MAX_STEPS=336
    LAPLACE_DEMON_MAX_SIGNALS=500
    LAPLACE_DEMON_MAX_TARGETS=500
    LAPLACE_DEMON_MAX_PEERS=40

Esas variables NO son obligatorias. Si se omiten las opciones de
cantidad, la selección no aplica un máximo global fijo. Los vecinos
del modelo se regularizan/limitan según el número de transiciones
suficientes para estimar los coeficientes.

El calendario de capturas EF002 sigue definido en GitHub Actions
(cuatro intentos diarios). No es una restricción del algoritmo: nuevas
capturas pueden agregarse por disparo manual o por otra instalación
autorizada. En la práctica cada consulta está sujeta a rate limits,
latencia y horarios de publicación de sus proveedores.

## Pruebas

    npm ci
    node --test tests/universo.test.mjs tests/ef005-scale.test.mjs
    npm run test:ef004
    npm run test:financiero

Casos añadidos: más de 4.096 observaciones, importación de 4.101 estados
en PGlite, paginación de 2.048 estados, 2.501 capturas continuas,
entrenamiento con menos de 48 capturas, selección de 21 señales/objetivos,
capturas de 30 minutos, más de 8 pasos temporales y verificación con
el XI/Ether original fijado por commit.

La primera captura real conservada por EF002 tiene 1.051 estados y una
única fecha histórica de observación conjunta. Por ahora EF004
correctamente se abstiene de declarar un modelo financiero entrenado.
NO_GO_MODEL_PRODUCTION permanece vigente. No hay trading automático.
