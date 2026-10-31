# Continuidad U003 — geografía y revisiones macro

La captura real del 30 de octubre de 2026 a las 17:03:17 UTC conservó **563
estados en 18 dominios**, con 93 fuentes observadas. GDACS aportó 224 alertas
vigentes con coordenadas; se excluyeron 60 alertas inactivas. El RSS original se
conserva comprimido en `gdacs-response.xml.gz.b64`: decodificar base64 y después
descomprimir gzip reproduce sus bytes UTF-8 y el SHA-256 de la fuente. La
reproducción local recuperó exactamente las 224 alertas.

Los siete temas de GDELT siguieron devolviendo HTTP 503 en este entorno. La
cobertura de GDACS es desastres naturales; `geo_news_coverage` mantiene esos
temas ausentes y `coverage_status=partial_sources` evita declarar cobertura total.

El diario macro conservó 58 observaciones procedentes de la captura real de las
16:36:42.606 UTC y reconoció esas mismas 58 observaciones en la consulta nueva.
No cambió ningún valor: hubo **0 revisiones reales nuevas y 0 duplicados**. Las
pruebas de cambios y reversiones usan datos artificiales claramente separados.
Un corte a las 16:36:42.605 UTC devuelve 0 estados; un milisegundo después devuelve
58. No se inventa su disponibilidad histórica anterior a la captura conservada.

Validación:
- Batería general: 229 pruebas, 166 aprobadas, 0 fallidas, 63 omitidas por otros
  componentes nativos no configurados en esa batería.
- Fuentes, diario e integración con el runtime original: 54 aprobadas, 0 fallidas,
  0 omitidas.
- XI/Ether reprodujo exactamente 563 registros / 18.032 bytes de la captura
  integrada; también se verificaron las capturas de GDACS y el corte macro.
- Runtime original: `3d29556eff4d1079c791abab38e203fc209f1722`, sin modificaciones.

El registro horario recupera el diario anterior antes de añadir revisiones y
conserva su cadena. El escritor usa exclusión, validación de integridad y
reemplazo atómico. La publicación reintenta conflictos Git sin forzar la rama.

Siguen pendientes los temas generales de GDELT, OpenSky/JPX/ALFRED con credenciales,
feeds contratados de bolsas, y todas las revisiones macro históricas con hora
oficial exacta. Esta revisión no demuestra mejora predictiva ni recompila REVERSE.
