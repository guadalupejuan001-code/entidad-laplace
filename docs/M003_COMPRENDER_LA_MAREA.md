# Laplace M003 · Comprender la marea antes de predecirla

## Hipótesis contrastables y no historias bonitas

La predicción financiera **no se vuelve mejor automáticamente por recolectar
927 series**. F002 dispone de diez capturas y apenas un resultado futuro
comparable. La solución no es usar una cuchara más grande: primero hay que
separar *medición*, *precedencia temporal*, *poder predictivo*, *estabilidad*
y *causalidad*. Son cinco cosas diferentes.

M003 empieza por **una única pregunta verificable**:

> ¿Cuáles de las propiedades que YA estaban presentes en una vela cerrada de
> Bitcoin ayudan a anticipar el cambio posterior, en un intervalo dado,
> mejor que no pronosticar movimiento y mejor que solo su inercia?

No afirma que observar un patrón provoque el precio. No usa supuestos de
futuros ni de noticias como si hubieran estado disponibles antes.

## Componentes de las 4 hipótesis

| Grupo | Variables originales al cierre | Qué podría indicar | Qué NO demuestra |
| --- | --- | --- | --- |
| Inercia | Retornos logarítmicos 1, 3, 12 velas | Continuación o reversión | Que el precio esté predeterminado |
| Agitación | Volatilidad RMS 6/24 velas, amplitud de vela | Estado cambiante del mercado | Causa del cambio |
| Participación | Sorpresa de volumen y z-score relativo | Aumento local de actividad | Compra/venta neta u órdenes L3 |
| Geometría | Cuerpo y posición de cierre dentro del rango | Presión aparente de una vela | Flujo real de órdenes ni liquidez oculta |

Los rasgos mantienen sus valores originales. La selección prueba las 15
combinaciones posibles de estos cuatro grupos mediante validación
**sin consultar las etiquetas reservadas**.

## Contrato temporal y tratamiento de datos

- Datos: solo OHLCV **BTC-USD de cinco minutos**, 7,488 velas archivadas
  por X002 del 4 al 30 de octubre de 2026.
- La captura declara que el cierre histórico se conoce por **suposición**;
  no tiene vintages históricos certificados minuto a minuto. El replay
  produce evidencia RETROSPECTIVA, no una predicción emitida en ese pasado.
- Ninguna etiqueta utiliza la vela abierta ni cruza una discontinuidad.
  Se verifican precios, OHLCV, marcas de tiempo, duplicados y hash de
  la matriz archivada. La validación local no reabre todos los archivos
  originales de respuestas del proveedor; esta limitación aparece en
  el reporte.
- Horizontes predefinidos: 5, 15, 60 minutos; etiquetas y resultados
  en el conjunto reservado separados en muestras **sin solapamiento**.
  No se extrapolan resultados a 24 h, 7 días, ni 90 días.
- Tres ciclos de evaluación: 14→18, 18→22, 22→26 días.
  En cada ciclo, los tres últimos días ANTERIORES a la evaluación sirven
  de validación. La selección se congela antes del test de cuatro días.
  La regresión ridge se reajusta exclusivamente sobre pasado.
- Lambda fija, umbral mínimo de mejora en validación de 2 %,
  referencias de **persistencia** y **modelo solo inercia**. El control
  negativo usa etiquetas de entrenamiento desplazadas; si compite con
  el sistema real, es una alerta.
- Se publica la contribución diagnóstica de cada grupo mediante
  ablación por separado, los resultados por régimen de volatilidad
  (el umbral se mide solo en entrenamiento), la estabilidad entre
  cortes y cada caso individual con inicio, vencimiento y error real.

### Qué cuenta como una señal interesante

Solo una hipótesis preliminar si supera persistencia, inercia y placebo
en al menos dos de los tres test folds, y la mejora acumulada es superior
al 2 % frente a persistencia e inercia. Esto **no es una certificación
estadística ni comercial**: varias hipótesis, autocorrelación del mercado,
cambios de régimen y la repetición de la prueba pueden crear aparentes
ganancias. Incluso si pasa, se necesita un periodo nuevo e independiente
con emisión y resultado congelados antes de usar el conocimiento.

M003 nunca cambia los precios de F001 o F002 y no entrega órdenes.

## De precedencia a mecanismos

La siguiente pregunta exige condiciones más exigentes que un predictor:
¿qué precede al cambio, qué llega al mismo tiempo, qué deja de funcionar
cuando cambia el régimen y qué ocurre si un factor exógeno cambia?
Para evaluar causalidad se necesitarían, cuando resulten apropiados,
experimentos naturales, controles de confusión o intervenciones
identificables. La correlación temporal, por sí sola, nunca basta.

Añadir datos BIS, CFTC, cadenas o macro a M003 requerirá primero unirse por
el instante en que **habrían sido conocidos realmente** en cada decisión;
quedan fuera de esta prueba porque F002 todavía no tiene suficientes
transiciones completas para compararlas.

## Reproducción

    npm ci
    npm run test:marea
    node tools/mapa-marea.mjs evidencia/entrenamiento-x002-20261030/velas.json /tmp/marea-experimento.json

GitHub Actions ejecuta el mismo procedimiento en un ambiente limpio y
publica el informe JSON crudo. Resumen, placebos, errores negativos,
abstenciones y contribuciones insignificantes se conservan, sin ocultar
los resultados poco favorables.

## Regla para cambiar la arquitectura de Laplace

**La ruta principal no incorporará ninguna señal de M003** por una
asociación retrospectiva. Habrá que diseñar una evaluación futura
pre-registrada, congelar modelos antes de las decisiones y confirmar su
incremento de información en varios regímenes. M003 es un laboratorio
de descubrimiento, no una segunda máquina que predice por decreto.
