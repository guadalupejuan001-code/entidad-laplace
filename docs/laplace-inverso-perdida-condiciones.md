# LAPLACE inverso: pérdida hacia condiciones anteriores

El directo estima el resultado desde los datos actuales. El inverso fija un
movimiento adverso del precio al cierre del mismo plazo y busca condiciones
que precedieron movimientos históricos semejantes. Ambos usan el mismo activo,
resolución y corte temporal. El inverso queda guardado con cada nueva emisión.

La metodología sigue el principio de las pruebas de estrés inversas: partir
de un desenlace adverso y explorar circunstancias que podrían producirlo.
Referencia conceptual: [Guidelines on institutions' stress testing,
apartado de reverse stress testing](https://www.bankofengland.co.uk/-/media/boe/files/paper/2020/december/gl-institutions-stress-testing.pdf).
Esta implementación no pretende cumplir una prueba regulatoria bancaria.

## Cálculo

1. El usuario elige caída o subida y un porcentaje hipotético. El 2 % inicial
   es un ejemplo editable, no un límite de riesgo recomendado.
2. Se obtiene el cierre adverso: `precio_actual × (1 ± porcentaje/100)`.
3. Para un horizonte de `h` velas y retorno logarítmico acumulado `R`,
   la desigualdad de Cauchy-Schwarz exige una volatilidad realizada de
   cierres a cierres de al menos `100 × abs(R) / sqrt(h)` puntos porcentuales.
   Es una condición matemática necesaria, no una probabilidad ni un predictor.
4. Se buscan intervalos históricos completos del mismo horizonte, cuyo cierre
   adverso relativo alcance el porcentaje elegido. Se excluyen todos los datos
   posteriores al cierre conocido del pronóstico y las ventanas con huecos.
5. Se examinan sólo los datos anteriores a cada pérdida: movimiento de seis
   velas, expansión de volumen y volatilidad y posición del cierre dentro del
   rango de las 24 velas anteriores. Los tramos de seis y 24 velas usados para
   comparar actividad son disjuntos.
6. Se muestran los conteos de esas condiciones entre pérdidas y otros períodos,
   además de hasta tres antecedentes adversos cercanos al contexto actual.

Las proporciones de cada señal usan sólo períodos donde esa señal pudo medirse.
Una base de volumen o volatilidad nula deja su razón como desconocida, no como
ausencia de expansión. Los conteos medibles se guardan y se muestran por condición.

Los objetivos históricos no se solapan. Las ventanas de entrada pueden
solaparse; no se presupone independencia estadística. La distancia entre
antecedentes se normaliza con los datos históricos disponibles al emitir.
Cuando falta la ventana reciente original, sólo pueden compararse los valores
de referencia conservados de volatilidad y volumen. La interfaz lo indica.

La comparación es observacional. Se mantienen `causalStatus: not_identified`,
`probabilityOfLoss: null` y `predictiveValidation: not_established`. Ocho pérdidas
y ocho períodos de contraste son un requisito mínimo de presentación del estado
de evidencia; alcanzar ese conteo no valida causalidad ni poder predictivo.

## Caso de BTC

El caso conocido se desarrolla después de ver su resultado y sigue excluido
de cualquier afirmación de ventaja predictiva independiente. Una caída de
2,000 USD desde 79,313.98 USD corresponde a un escenario porcentual que termina
en 77,313.98 USD. El inverso calcula el movimiento y la condición mínima para
ese cierre sin leer el precio observado posteriormente.

En los 8,064 registros históricos BTC de cinco minutos archivados antes del
pronóstico hay 669 objetivos separados de una hora. Dos cumplen una caída
al cierre de al menos el 2 %. El volumen rápido se duplicó antes de una de esas
dos pérdidas y en 74 de los otros 667 períodos. Esos conteos no establecen una
causa y resultan insuficientes para calibrar una probabilidad de pérdida.

El archivo termina en `1793838300`, antes del corte `1793888400` de la emisión
fallida. No contiene la ventana original de las 09:20: el reporte retrospectivo
marca los precursores actuales como desconocidos. La exportación de aprendizaje
por sí sola sigue sin permitir repetir exactamente esa inferencia nativa.

## Interfaz y conservación

En «LAPLACE inverso · explorar una pérdida», el movimiento y su magnitud quedan
fijados para cada nueva emisión. El botón «Explorar pérdida» permite probar otro
escenario contra el mismo pronóstico; ese cálculo se etiqueta como posterior
y no reemplaza el análisis original guardado. El respaldo conserva el informe
de la emisión. La importación valida el objetivo, los conteos, los antecedentes,
las fechas y la ventana de señales disponible.

El módulo es un análisis descriptivo en JavaScript conectado al resultado
nativo. No es un nuevo circuito cuántico, un modelo causal entrenado ni una
inversión matemática de toda la función LQC3. Su siguiente etapa requiere
contrastar hipótesis sobre series multivariantes con fechas de disponibilidad
y evaluar alertas en períodos nuevos, incluyendo falsas alarmas.

La pérdida definida es un cambio del precio del activo, no el P&L de la cuenta.
No se conocen posición, cantidad, financiación, comisiones ni tolerancia personal.
El análisis inicial considera el cierre del plazo: no cubre pérdidas
intraperíodo, gaps, deslizamiento ni ejecución de protecciones. No emite órdenes.

## Reproducción

```sh
node tools/explorar-perdida-inversa.mjs
node tools/explorar-perdida-inversa.mjs diario.json historial.json 2
node --test apps/laplace-android/tests/inverse-loss.test.cjs
```

El comando sin argumentos usa la fixture reducida de la caída y el archivo BTC
real ya versionado. El informe incluye la huella SHA-256 del historial leído.
El comando toma el último registro del diario: para otra emisión se prepara
un diario que termine en esa emisión. Las pruebas cubren el caso real, un control
sintético con precursores implantados, etiquetas posteriores alteradas, ventanas
futuras, huecos y adulteración de informes, sin atribuir resultados sintéticos
a mercados reales.
