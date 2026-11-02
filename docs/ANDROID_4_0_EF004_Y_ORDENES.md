# LAPLACE 4.0 — EF004 local y órdenes manuales

## Qué faltaba y qué se incorpora

La 3.9 incluía un resumen de EF004 del servidor, no su ejecutor local. La tarjeta de órdenes era texto fijo y no existía un conector de operaciones. Esta versión integra ambos componentes con acciones verificables.

### EF004 original dentro del teléfono

`build-ef004-assets.mjs` empaqueta directamente `demonio/finanzas-ef004.mjs`, `series.mjs`, `evaluacion-ef004.mjs` y sus contratos U003/U001. No introduce otro modelo con el mismo nombre. Los SHA de las fuentes quedan incluidos en el paquete y CI exige identidad del bundle. El ajuste sigue siendo JavaScript clásico, como el EF004 original. XI/Ether conserva su ejecutor nativo independiente; no se afirma que la regresión EF004 sea un cálculo cuántico.

La implementación móvil usa SHA-256 de `@noble/hashes` (MIT), contrastado contra Node. Las pruebas comparan el modelo completo, coeficientes y sellos entre Node y el paquete móvil sobre el mismo conjunto controlado. Alterar una captura o un pronóstico se detecta con los verificadores canónicos.

- El constructor incorpora **todas** las capturas EF002 completas disponibles, no sólo el índice o las dos últimas.
- **Actualizar archivo** consulta la rama pública `laplace-archivo`, fija un commit, verifica cada archivo gzip y su manifiesto y conserva los objetos JSON originales para verificar U001/U003 en el dispositivo.
- **Entrenar EF004** ejecuta el algoritmo canónico en un worker local autocontenido. Los datos no se envían a un servicio de aprendizaje. El worker puede cancelarse sin sustituir el último resultado completo.
- IndexedDB conserva capturas, modelos, pronósticos y evaluaciones. Los errores de almacenamiento se notifican, sin recorte silencioso del archivo.
- **Comprobar resultados** ejecuta el evaluador prospectivo original sobre pronósticos congelados y capturas posteriores. No cambia retrospectivamente las predicciones.
- **Exportar aprendizaje** conserva los resultados y su procedencia, con todos los coeficientes y cifras originales.

Se mantienen los requisitos estadísticos originales. Ocho capturas totales pueden contener sólo dos consecutivas; estados simultáneos no son transiciones. Si falta evidencia, el teléfono ejecuta EF004 y muestra cantidades observadas/requeridas, sin fingir que entrenó pesos útiles. Tampoco mezcla los resultados EF004 con M001/F001 sin una validación que lo justifique.

### Órdenes financieras

**Cuenta virtual** permite comprar/vender, usar órdenes de mercado o límite, cancelar pendientes, conservar posiciones, efectivo y resultado realizado y exportar el diario. La contabilidad usa BigInt con unidades de 1e-8 y centavos USD; compras redondean el débito hacia arriba y ventas el crédito hacia abajo. No permite gastar más del saldo ni vender posiciones que no existen. Se comprueba con cotizaciones recibidas después de la orden. Son ejecuciones simuladas de referencia sin spread, comisión ni garantía de ejecución real.

**Robinhood Crypto** incorpora la API oficial v2 para clientes elegibles. Acciones y ETF conservan consulta/análisis y enlace a Robinhood: este conector no utiliza endpoints privados de bolsa.

1. Se genera una semilla Ed25519 de 32 bytes en el teléfono. Se cifra mediante AES-GCM con una clave no exportable de Android Keystore. Sólo se muestra su clave pública para registrarla en Robinhood.
2. El usuario introduce la API key en el teléfono; queda cifrada. La aplicación no pide contraseña Robinhood y el agente de desarrollo no recibe credenciales.
3. La consulta verifica cuentas, poder de compra, disponibilidad del par, incrementos, límites y una estimación reciente de ejecución y comisión.
4. **Preparar y revisar** sólo realiza lecturas. Fija cuenta, símbolo, lado, cantidad, precio y un identificador único. No envía una orden.
5. **Continuar a confirmación nativa** abre un diálogo Android con los datos fijados. Sólo la confirmación expresa desde ese diálogo permite un POST de orden real.
6. El cliente firma exactamente los bytes enviados mediante Ed25519. No sigue redirecciones ni reintenta automáticamente una mutación. Los endpoints están limitados a `trading.robinhood.com` y rutas Crypto v2 permitidas.
7. El diario guarda `client_order_id` antes del envío. Un fallo de red posterior no se convierte en éxito ni provoca un reenvío automático: se exige consultar el estado en el bróker. Cancelar una orden real también exige confirmación nativa.

Los modelos no colocan órdenes automáticas. El entrenamiento y las operaciones son acciones independientes. Un escenario experimental no se transforma por sí solo en una orden.

## Pruebas y límites

Las pruebas de interfaz usan cotizaciones y un puente de bróker **simulados**. Comprueban compra/venta virtual, configuración, preconsulta sin envío, cancelación del diálogo simulado y desconexión. No se accede a una cuenta real ni se coloca una operación real durante el desarrollo.

EF004 se prueba por paridad matemática con Node, dependencia temporal controlada, hashes, manipulación y el archivo EF002 auténtico. El vector Ed25519 fija los bytes del mensaje y se contrastó independientemente con `cryptography`; los datos de ejemplo de clave provienen de la documentación pública de Robinhood, no de un usuario. CI compila las clases nativas, ejecuta JUnit y comprueba la APK/firma/recursos.

La disponibilidad de una cuenta, permisos API, cotizaciones y operaciones reales sólo puede comprobarse al configurar las credenciales propias en el teléfono. La ejecución física de la APK en el teléfono del usuario no se acredita con Chromium.

## Instalación

LAPLACE 4.0, versionCode 15, Android 8+ ARM64. Paquete de prueba `com.entidadlaplace.mobile.learn40`, instalado junto a 3.9 por las firmas de depuración independientes. No borra ni importa automáticamente el historial de otras instalaciones. El archivo EF002 completo viene incorporado y puede actualizarse desde el teléfono.

## Fuentes oficiales de la integración

- https://docs.robinhood.com/crypto/trading/
- https://robinhood.com/us/en/support/articles/crypto-api/
- https://robinhood.com/us/en/support/articles/third-party-connections/

Para reproducir: `npm ci --ignore-scripts`, `node apps/laplace-android/build-ef004-assets.mjs --verify`, preparar el archivo con `prepare-ef004.mjs RUTA_CAPTURAS`, ejecutar las pruebas Android y el harness Chromium. El workflow `laplace-android-apk.yml` conserva el ejecutor XI/Ether fijado por SHA.
