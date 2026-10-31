# I015 — Instrumento de precio BTC/USD a quince minutos

## Motivación física e informacional
El sistema no interpreta «azar» como una orden para inventar eventos futuros. La hipótesis de un universo determinista es compatible con **ignorancia sobre su estado y sus fuerzas externas**: aunque las causas existan, no se conocen necesariamente las órdenes futuras, las decisiones de participantes ni su efecto completo sobre el precio.

Se calcula una proyección **determinista y revisable** a partir de entradas observadas: una misma entrada produce exactamente la misma salida. No se usa generador de números aleatorios, Monte Carlo ni datos futuros disfrazados de presentes.

## Ruta de medición
1. bitcoin/agente.mjs obtiene el precio spot BTC-USD directamente de Coinbase Exchange, con marcas de hora y rechazo de datos antiguos.
2. bitcoin/intradia15.mjs lee hasta 300 velas de cinco minutos de Coinbase Exchange, excluyendo la barra abierta.
3. Cada estado comprende momentum de 5 y 15 minutos, volatilidad cuadrática de 30 minutos, rango intrabarra y volumen relativo (seis barras).
4. Se recorren estados históricos cuyo siguiente período de quince minutos **ya terminó** antes del momento histórico evaluado.
5. Se seleccionan hasta 18 estados similares sin ventanas futuras superpuestas dentro de la selección, se calculan sus retornos logarítmicos de quince minutos y su media ponderada por cercanía.
6. Cálculo candidato:
   r_15 = suma[ r_i/(1+d_i) ] / suma[ 1/(1+d_i) ]
   P_15 = P_spot * exp(r_15).
7. El intervalo descriptivo contiene percentiles 10 y 90 de los retornos seleccionados multiplicados por el precio actual. **No es un intervalo de confianza ni una garantía.**
8. Se realiza un examen walk-forward de hasta 48 decisiones históricas, comparando error absoluto del modelo contra P_15=P_spot (persistencia). Si no mejora o faltan 20 decisiones evaluables, el centro visible no promueve la analogía y muestra persistencia. El precio candidato se conserva para inspección.
9. La salida incluye estado, fórmula, número de velas, brechas, ejemplos, corte temporal, hashes SHA-256, origen y evaluaciones. **Nunca genera una orden ni activa trading.**

Esta técnica es semejanza estadística, no prueba causalidad. Para incorporar las hipótesis del motor C001 (narrativa, geopolítica y efectos de acumulación) a quince minutos, faltan observaciones de noticias y órdenes con disponibilidad real a esa escala. No se reutilizan estadísticas diarias como si fueran intradía. El motor nativo XI/Ether y el historial principal permanecen intactos. El cálculo condicional I015 está actualmente escrito en JS como adaptador de análisis medido; **no es una ejecución de operaciones XI**.

## Ejecutar

~~~bash
node tools/laplace.mjs bitcoin-15m
node tools/laplace.mjs bitcoin-15m resultado.json
node --test tests/intradia15.test.mjs
~~~

Se requiere acceso a Coinbase Exchange. Si falta una cotización reciente, se produce error sin fabricar datos.

## Límites
- Historial máximo de 25 horas: muestra corta, sensible a cambios de régimen.
- Walk-forward reciente: no certificación extensa ni prueba de ganancias.
- No modela spread, deslizamiento, tarifas o liquidez futura.
- El precio futuro es una **proyección condicional**, no una observación adelantada: contrastar posteriormente con el precio real.
