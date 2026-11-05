# LAPLACE 4.9 · Comprobación automática e historial

## Causa comprobada

La sincronización de LQT construía una selección sin `days`. El adaptador de
campaña la enviaba sin completar esa ventana. Android rechaza los valores que
no coinciden con `MarketCatalog.allowedHistoryDays`; la comprobación real podía
fallar aunque el mock del navegador aceptara cualquier argumento.

Había además consultas del registro que recuperaban el historial de
entrenamiento completo. Un origen antiguo podía quedar fuera de la ventana
reciente y una caché reciente podía seguir sin incluir el cierre requerido.
La sincronización nativa también interrumpía el resto de grupos ante el error
de una fuente. La actividad anterior carecía de su propio ciclo automático.

Dos paneles distintos compartían `activityStatus`, por lo que un mensaje de
estado de M001 podía sobrescribir el de volatilidad y volumen. Se separaron
sus identificadores y se añadió comprobación de unicidad al examen Chromium.

## Corrección

- Un coordinador comprueba los tres registros con sus evaluadores originales.
- Las criptomonedas consultan desde el origen hasta el cierre objetivo exacto,
  en ventanas de hasta 280 velas. Se agrupan períodos solapados y se evitan
  consultas simultáneas duplicadas. El horizonte mínimo acepta dos velas;
  no exige las diez del antiguo descargador de entrenamiento.
- La consulta Java conserva activos, resoluciones, fechas, tamaño y endpoints
  permitidos. Rechaza futuro y contradicciones, y filtra datos fuera de rango.
- Las acciones conservan la fuente y sus límites de disponibilidad existentes.
  Un origen fuera de esa historia se identifica; no se inventa una sesión.
- Los fallos se aíslan por fuente y cada registro conserva el motivo y la fecha
  de su revisión. Los reintentos tienen espera; el botón manual consulta datos
  nuevos. Los errores al guardar no se cuentan como resultados comprobados.
- La comprobación se activa al cerrar el plazo, al abrir o volver a la app,
  al recuperar conexión y al incorporar registros. No usa ticks como cierres.

Este ciclo verifica con la aplicación abierta o al reanudarla. No incorpora
un servicio Android que ejecute comprobaciones mientras la app está cerrada.
Si el proveedor publica con retraso o faltan velas, el pronóstico se conserva
pendiente con su explicación, sin sustituir su precio ni reentrenarlo.

## Interfaz

Una sola vista reúne los registros con filtros por activo, plazo, origen y
estado. Cada entrada distingue el precio previsto, el cierre observado y su
error; también conserva volatilidad, volumen y cifras originales. No se
promedian dólares de activos diferentes. Los controles de respaldo y las
vistas originales siguen disponibles en un desplegable.

Las pantallas anteriores del panel de análisis se agrupan en una sola sección.
El encabezado se adapta a la página. Los iconos son SVG originales con doble
trazo y medallones de cobre, sin depender de glifos de texto del dispositivo.
El historial antiguo y los JSON de cada entrada se dibujan al abrirse.

## Validación y entrega

Las pruebas reproducen el argumento de días omitido; comprueban un pronóstico
de 40 días mediante su rango exacto, errores parciales, huecos, ausencia de
velas futuras, consultas duplicadas, reanudación sin botón, errores de
almacenamiento y notas importadas que no pueden inventar un resultado válido.
JUnit prueba el transporte acotado. Chromium utiliza el núcleo XI auténtico
con OHLCV archivado: vence un objetivo, reanuda el verificador sin pulsar el
botón y exige el rango correcto y la conservación de las salidas originales.

Versión 4.9.0-Registro-Automatico, versionCode 24 y paquete de prueba
`com.entidadlaplace.mobile.learn49`. Se instala junto a 4.8. El respaldo LQT
incluye todos sus pronósticos y el modelo del activo/plazo seleccionado;
importarlo antes de crear un modelo nuevo en 4.9 activa la comprobación de
sus pendientes. Los registros y modelos de 4.8 permanecen en esa instalación.

Contrato público contrastado con la documentación de
[velas Coinbase](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).
Las pruebas de ingeniería no constituyen una mejora de precisión financiera.
