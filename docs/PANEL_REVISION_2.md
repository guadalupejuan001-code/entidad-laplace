# LAPLACE · Panel local, revisión 2

Esta revisión corrige los seis defectos de la auditoría anterior, sin añadir un
modelo financiero nuevo ni afirmar integración nativa en REVERSE-PC.

## Correcciones

1. El punto inicial de la proyección usa exactamente el precio y la fecha de la
   cotización, no el último cierre de vela. La persistencia es horizontal.
2. Todos los puntos usan coordenadas temporales reales. Los huecos conservan su
   duración y el objetivo está exactamente quince minutos después de la cotización.
3. La etiqueta de antigüedad cambia por sí sola al superar tres minutos desde la
   cotización. También indica cuándo vence el objetivo. El reloj no consulta fuentes.
4. El colector sella la captura completa con SHA-256 canónico. El registro v2 sella
   todo el historial y comprueba concordancia entre precio, memoria, fechas y resumen.
5. Se rechazan duplicados, capturas anteriores y retrocesos de la cotización.
6. La tabla presenta todas las lecturas retenidas, hasta 144, sin truncar a 30.

Además: gráfica adaptable con tipografía legible; manejo del origen localhost;
respaldo antes de migrar un historial v1; no se vacían archivos dañados silenciosamente;
mensajes al usuario en español y arranque mediante scripts locales.

## Qué protege el sello

Detecta cambios que no hayan sido resellados y contradicciones entre bloques.
No es cifrado, no es firma de Coinbase/NOAA y no impide a un atacante con permiso
para reescribir archivos y hashes reemplazar un conjunto completo coherente.
La integridad local no prueba autenticidad del proveedor ni precisión financiera.

Los archivos v1 válidos se convierten y dejan una copia .v1-respaldo.json.
Se muestra un aviso: un sello creado al migrar NO acredita integridad histórica.
Un archivo previo incoherente se conserva sin modificar y el servidor rechaza cargarlo.

## Uso

Desde la raíz del proyecto: `npm run panel` o `node panel/servidor.mjs`.
En Windows también existe INICIAR_LAPLACE.cmd; en Linux/macOS, INICIAR_LAPLACE.sh.
Abrir `http://127.0.0.1:4179` en el mismo equipo y pulsar «Actualizar lectura».
No necesita instalar paquetes de terceros para funcionar; sí un runtime Node compatible
(se prueba con Node.js 22) y acceso a Coinbase/NOAA para capturas nuevas.

No es una APK ni un servicio publicado. No realiza órdenes financieras, no ejecuta
XI para estas estadísticas y no incluye vigilancia en segundo plano.

## Pruebas reproducibles

- `npm run test:panel`: contratos, regresiones, API local y módulos de observación.
- `node auditoria/panel-final.mjs`: controles reales en Chromium mediante Playwright.
  Playwright es dependencia de prueba, no de la aplicación. El ejecutor acepta
  LAPLACE_PLAYWRIGHT (ruta al módulo), LAPLACE_CHROME (navegador),
  LAPLACE_AUDITORIA_SALIDA y LAPLACE_AUDITORIA_CAPTURA.
- El navegador usa una captura real pasada por LAPLACE_AUDITORIA_CAPTURA.
  Puede obtenerse con `node tools/laplace.mjs universo-btc-15m registros/captura-para-pruebas.json`.
  Nunca se carga automáticamente en la pantalla de producción.
- Los casos de fechas simuladas, fallos inducidos y cadenas hostiles están etiquetados
  en la salida. Los tamaños móviles se emulan: no sustituyen probar un teléfono real.
