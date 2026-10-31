# U001 — Laplace Universal: estados observables, cadenas y escalas

## Concepto
Objetivo: estudiar multiples sistemas (mercado, economia, fisica, cosmologia e informacion), manteniendo orden:
estado observado -> cambios anteriores -> leyes o hipotesis -> estado futuro condicionado -> contraste empirico.

No implica observar ni simular la totalidad del universo. El sistema opera bajo demanda, con ausencia explicita de datos.

## Componentes
- universo/estados.mjs: contrato de observaciones numericas de cualquier dominio. Hasta 4096 estados y 4096 relaciones por snapshot. Registra dominio, variable, unidad, valor, fuente HTTPS, observed_at y known_at. Cualquier hecho conocido despues del corte se excluye. SHA-256 del snapshot y conteo de repeticiones. Relaciones solo de precedencia o hipotesis; no presume causas demostradas.
- universo/mercado.mjs: integra sin modificar I015 BTC 15 minutos y cuatro lecturas publicas del mercado: libro L2 BTC-USD, operaciones BTC-USD, spot ETH-USD y BTC-EUR. Calcula spread, desequilibrio del nocional de los 10 mejores niveles, nocionales por lado maker y dos precios externos. Marca fuentes fallidas sin inventar cifras.
- universo/geomagnetismo.mjs: lectura independiente y fechada del indice geomagnetico Kp publicado por NOAA SWPC, con rechazo de muestras anticuadas. No genera relacion causal con Bitcoin.
- cosmos/ y fisica/: simulaciones existentes, NO observaciones fisicas actuales del universo.
- Economia mundial, geopolitica completa, otras bolsas y otros sistemas reales permanecen como dominios aun no capturados.

## Reglas cientificas
I015 mantiene su prediccion de quince minutos, baseline y prueba retrospectiva. Las nuevas variables no alteran el valor pronosticado hasta disponer de una historia temporalmente valida y demostrar mejora fuera de muestra. El libro de ordenes es una fotografia; sus ordenes pueden cancelarse. Trades REST muestran una muestra, no flujo total. Las relaciones se etiquetan como hipotesis aunque exista asociacion. No RNG, no ordenes ni pretendida omnisciencia.

## Ejecutar
    node tools/laplace.mjs universo-btc-15m
    node tools/laplace.mjs universo-btc-15m nueva-captura.json
    node tools/laplace.mjs universo-corte estados.json 2026-10-29T18:00:40Z
    node --test tests/universo.test.mjs tests/intradia15.test.mjs

El archivo de entrada estados.json es un array de observaciones:
    [{"id":"fisica-001","domain":"fisica","variable":"energia","value":80,"unit":"J","observed_at":"2026-10-29T18:00:00Z","known_at":"2026-10-29T18:00:01Z","source_url":"https://example.org/measurement"}]
La URL example.org es solo sintaxis, no una fuente cientifica de medicion.

## Proxima ampliacion
1. Coleccionar capturas punto-en-tiempo repetidas de todas las fuentes con latencias verificadas.
2. Comparar asociaciones con controles historicos y reservar datos futuros para probar modelos.
3. WebSocket L2 y matches con manejo de secuencias perdidas y limites de memoria.
4. Datos macroeconomicos y globales con vintages correctos; integrar solo si son observables.
5. Validar que el instrumento mejorado supere a I015 fuera de muestra antes de ajustar el precio.

U001 amplia cobertura y trazabilidad. No calcula el universo completo, no demuestra causalidad universal, no es un oraculo financiero.