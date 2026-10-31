# Verificación de fuentes primarias — 30 de octubre de 2026

La consulta manual de siete fuentes primarias produjo 40 estados reales y
12 contratos de commodities con identificador y fecha de último negocio.
`entradas/` conserva las respuestas originales, verificables por SHA-256.
`reproduccion-respuestas.json` confirma que volver a procesarlas reproduce
exactamente esos 40 estados y los metadatos de los 12 contratos.

La consulta global integrada produjo 551 estados en 17 dominios, con 92 fuentes
observadas. Son capturas separadas: los 40 estados no se suman a los 551.
La base U002 tuvo 368 estados disponibles frente a 369 posiciones nominales;
un dato ausente permanece ausente y no se transforma en cero.

`xi-fuentes-reales.json` y `xi-captura-integrada.json` verifican recorrido exacto
de 40 y 551 registros por XI / Inverse Ether Memory, respectivamente. La
captura integrada materializó 17.648 bytes sin diferencias. Runtime original
Mundo X fijado en `3d29556eff4d1079c791abab38e203fc209f1722`, compilado sin
modificaciones.

Validación local final:
- Batería general: 217 pruebas; 154 aprobadas, 0 fallidas y 63 omitidas por
  componentes nativos ajenos a esta verificación.
- Batería de fuentes y transporte con el runtime original: 42 aprobadas,
  0 fallidas y 0 omitidas.
- Reproducción de las siete respuestas primarias: hashes y estados idénticos.

Pendientes observados en la captura global:
- Los siete temas de GDELT fallaron con HTTP 503. No hay señales inventadas de
  noticias geolocalizadas.
- ALFRED, OpenSky y JPX requieren credenciales no disponibles en esta ejecución.
- B3 completo y Deutsche Börse requieren acceso contratado. B3 público conserva
  solo la muestra oficial de mayores movimientos.
- La hora exacta de releases macro, todas sus revisiones, más bolsas y unidades
  verificadas de los futuros siguen pendientes.
- Esta revisión modifica LaPlaceDIG. No recompila la APK de REVERSE.

Las pruebas verifican datos, fechas, integridad y transporte. No miden una
mejora del pronóstico financiero; las nuevas entradas predictivas continúan
desactivadas.
