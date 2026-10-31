# LAPLACE · Registro prospectivo M001

## Experimento sin dinero

Cada ejecución horaria emite candidatos de BTC-USD a **15, 30, 60, 240 y 1440 minutos**.
No modifica I015 ni activa R015 (la recalibración que empeoró el ensayo).
Es una extensión experimental del método de análogos de I015, no una validación
financiera, motor cuántico o ejecución XI. Publica el candidato incluso si no
supera a persistencia; se mantiene visible esa referencia. Si no hay datos o
patrones, registra la ausencia, sin inventar precios ni convertirla en acierto.

## Antes y después, sin reescribir

El pronóstico incluye hora de emisión y observación, objetivo, precio inicial,
candidato, referencia, duración, parámetros, versión y huella del código,
identificadores de análogos y hash de entradas. Las entradas reales se conservan
comprimidas. No se permite registrar un pronóstico después de su objetivo.

El resultado se añade como evento nuevo asociado al pronóstico original.
Se usa el **cierre de la vela de un minuto que contiene el objetivo**, nunca
una cotización actual obtenida horas más tarde. Su final está entre 0 y 60 segundos
después del objetivo; no verifica el segundo exacto. Se espera el cierre más
30 segundos antes de consultarla y se registra la hora real de descarga.
Una vela no disponible queda pendiente y se reintenta, sin puntuarla como fallo.

Se registran tres criterios distintos, fijados ANTES de ver los resultados:

- Dirección: coincide subida/bajada/sin cambio con lo observado.
- Precio: error relativo al cierre objetivo <= **10 puntos básicos (0,10 %)**.
  Este umbral es una elección de evaluación, no una garantía de precisión.
- Referencia: error absoluto menor que el precio sin cambio.

Se conservan también errores en USD y porcentaje. El resumen separa horizontes
y versiones. No afirma que acierto direccional equivalga a acierto de precio ni
que predicciones solapadas sean ensayos independientes.

## Registro automático en GitHub

El flujo `seguimiento-m001.yml` se solicita cada hora al minuto 17 UTC. Puede
retrasarse o no ejecutarse por condiciones de GitHub; no es un servicio con SLA.
Sólo las ejecuciones reales emiten pronósticos: no se rellenan horas perdidas.
La rama **laplace-registro** contiene el diario append-only y su resumen.
No se reescribe `main`, no se fuerza Git y no se trunca el historial.

Un bloqueo evita dos escritores. Un archivo incompleto o un hash incorrecto
provocan error, no borrado. SHA-256 encadenado y commits proporcionan trazabilidad;
no son firmas de Coinbase ni impiden reescritura por quien controle todo el repositorio.
Se realizan sólo consultas públicas; no usa cuentas, claves privadas ni órdenes.

Cada ciclo evalúa hasta 40 objetivos vencidos, priorizando los no intentados.
Los pendientes no evaluados siguen en el diario. El presupuesto del diario es
64 MiB: al alcanzarlo se detiene para archivar; NO descarta automáticamente datos.
Las entradas comprimidas también consumen almacenamiento. Desactivar el flujo
pausa el seguimiento; no borrar la rama de datos para pausarlo.

## Ejecutar localmente

    node seguimiento/ciclo.mjs
    node seguimiento/ciclo.mjs --continuo
    node seguimiento/ciclo.mjs --horizontes 15,30,60,240,1440,10080

El último ejemplo incluye siete días. Los horizontes son configurables en
múltiplos de cinco minutos, hasta 16 por ciclo. Un horizonte sin análogos no se
convierte en pronóstico por extrapolación arbitraria. El modo local continuo
requiere mantener el proceso abierto; el registro de GitHub no requiere el teléfono.
La ventana de entrenamiento son 14 días de velas cerradas de cinco minutos.
Los conjuntos de 1 a 7 análogos se muestran con soporte escaso; no se ocultan.

Archivos locales: `registros/seguimiento/diario.jsonl`, `resumen.json`, `entradas/`.
Consulta del panel: `http://127.0.0.1:4179/seguimiento` (diario local).
La rama remota y el diario local son separados; el panel no los mezcla a escondidas.

## Verificación

    node --test tests/seguimiento.test.mjs

Los tests usan datos sintéticos identificados, tiempos controlados y fallos
inducidos. La prueba de red de CI sólo emite candidatos con datos reales;
no declara aciertos hasta que los objetivos hayan ocurrido y se contrasten.

Fuentes de especificación:
https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
