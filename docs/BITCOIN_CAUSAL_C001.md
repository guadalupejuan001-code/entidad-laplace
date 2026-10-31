# LAPLACE — trayectoria causal observacional de Bitcoin (C001)

## Propósito

Construir una memoria verificable de **qué ocurrió**, **cuándo ocurrió**, **cuándo se supo**, **cuántas veces se repitió** y **qué retorno de BTC/USD siguió**. Se une al observatorio Bitcoin ya existente sin reemplazar el motor XI/Ether ni los modelos E001–E005.

## Contrato y medidas

- Entrada: historial existente en formato JSON con `records` y `ledger_sha256`.
- El único activo admitido es BTC-USD; la historia se verifica por el hash original.
- Un evento observado solo puede influir en un pronóstico si `known_at <= cutoff` y `observed_at <= cutoff`.
- Ventana de influencia anterior configurable, predeterminada de 72 horas. El código `kind|event_code` conserva tanto la cuenta en la ventana reciente como el total histórico de registros conocidos. **Un registro no equivale necesariamente a un suceso independiente**: distintas fuentes pueden relatar el mismo acontecimiento.
- Para medir un resultado de 24 horas, se exigen dos cierres `raw_close` exactamente separados por 24 horas. Si faltan, no se interpolan ni se inventan.
- Una muestra histórica solo es entrenable cuando el cierre inicial ya se conocía al decidir y el cierre final ya se conocía en el corte de entrenamiento.
- Por cada evento activo se comparan ventanas con exposición y controles sin ese evento: soporte, frecuencia positiva, retorno medio, diferencia de retornos y rango de Wilson de la frecuencia. Esto **no aísla un efecto causal**: variables omitidas, noticias simultáneas y reacciones anticipadas siguen siendo posibles.
- Si faltan al menos ocho casos de exposición y ocho controles, se abstiene. Si hay varios tipos activos correlacionados, no los mezcla arbitrariamente.
- `causalWalkForward` congela cada pronóstico antes de leer su resultado posterior y compara Brier con la frecuencia base obtenida solo de historia previa.
- No incluye ninguna orden, automatización de trading ni promesa de beneficio.

## Comandos

```sh
node tools/laplace.mjs analizar-causas-bitcoin evidencia/BTC-HISTORICO.json 2026-10-28T00:00:00Z strict
node tools/laplace.mjs probar-causas-bitcoin evidencia/BTC-HISTORICO.json strict
```

Modo `exploratory_close_availability`: **hipótesis explícita**, presupone cierre disponible al instante histórico de cierre, incluso si el libro original informa que se capturó posteriormente. No acredita fuentes punto-en-tiempo. El modo estricto nunca reemplaza `known_at`.

## Estado científico

Es un **observador causal hipotético y estadístico**, no un identificador causal experimental. En el archivo histórico recuperado tarde, `strict` se abstendrá de reconstruir decisiones del pasado en las que el precio no estaba disponible; ese comportamiento es correcto. Mantener la calibración anterior desactivada mientras no exista ventaja validada fuera de muestra.

Esta versión calcula estadísticas de observación en el anfitrión Node, siguiendo el patrón de `bitcoin/calibracion.mjs`; **no afirma que XI/Ether haya ejecutado esas estadísticas**. XI/Ether conserva la evolución temporal existente sin modificaciones. Los nuevos resultados pueden alimentar investigaciones posteriores, pero no se conectan automáticamente como señal en vivo.
