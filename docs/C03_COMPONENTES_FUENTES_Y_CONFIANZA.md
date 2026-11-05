# C03: conectar la observación con cálculos comprobables

La prioridad es disponer de más ejemplos temporales verificables y medir el
aporte individual de las señales. Añadir variables, cúbits o un porcentaje
de confianza mayor no crea por sí solo precisión.

## Diagnóstico real

La auditoría de `laplace-archivo` en `118bc33` verificó 15 capturas, desde
2026-10-31T15:27:12.324Z hasta 2026-11-04T21:58:34.954Z. La última contiene
1.042 estados. Son muchas mediciones simultáneas y pocas transiciones.
No equivalen a 15.630 ejemplos independientes.

Al emparejarlas con las velas BTC reales ya archivadas de C02, sin rellenar
objetivos ni multiplicar ventanas solapadas, resultaron:

| Plazo | Resultados históricos emparejados | Entrenamiento / validación / calibración / prueba |
| --- | ---: | --- |
| 5–30 min | 15 | 8 / 2 / 2 / 3 |
| 1–2 h | 13 | 7 / 2 / 2 / 2 |
| 6 h | 9 | 4 / 2 / 1 / 2 |
| 24 h | 3 | 1 / 1 / 0 / 1 |
| 2 días | 2 | 1 / 0 / 0 / 1 |
| 7 y 14 días | 0 | 0 / 0 / 0 / 0 |

El ajuste C03 exige al menos 24/8/8/8 casos después de purgar las fronteras
temporales. Este es un requisito mínimo de ingeniería, no una certificación
estadística de precisión. Todas las rutas actuales se abstienen por falta
de resultados. La evidencia es `evidencia/c03-componentes/auditoria-real.json`.
Las pruebas con series sintéticas verifican implementación; no demuestran
aciertos de mercado.

## Qué se implementó

`prediccion/conjunta-c03.mjs` reutiliza la regresión regularizada de F002.
Cada serie conserva dominio, variable, unidad y proveedor. Las columnas son
nivel normalizado con asinh, cambio de publicación, frescura y presencia.
Las estadísticas y el catálogo se fijan con entrenamiento; la selección
usa validación. Calibración y prueba son bloques posteriores separados.

La identidad de una serie no se pierde en una mediana de seis familias.
Dos señales opuestas de una familia pueden aprender pesos distintos.
Los valores originales permanecen en el archivo. Cada ajuste suficiente
emite contribuciones individuales y sensibilidad por familia. Esa sensibilidad
suprime coeficientes del modelo ya fijado: no es una ablación reentrenada
ni prueba causal. Un predictor que combina todo todavía puede empeorar.

La implementación dual de ridge reduce la matriz a capturas² cuando hay
más columnas que ejemplos; no elimina series por un presupuesto oculto.
El cómputo puede seguir siendo costoso con un archivo grande y requiere
medir tiempo/memoria antes de ampliar su frecuencia.

El núcleo integral y el botón de predicción Android invocan C03. El worker
reutiliza las capturas EF004 y las velas del activo seleccionado. Los cierres
OHLCV son objetivos históricos precisos de vela, no precios al segundo exacto
ni evidencia prospectiva certificada. El adaptador de objetivo implementado
es BTC/USD; ETH/SOL y bolsa informan explícitamente que falta su adaptador.

El resultado nativo C02 de 1.000 cúbits en XI/Ether sigue siendo la referencia
del panel. El candidato mundial conserva precio de referencia, objetivo,
versión y evidencia propios. No se mezcla con C02 por una ponderación
inventada. Falta entrenar y evaluar una fusión emparejada con emisiones
reales de ambos modelos. Los checkpoints nativos no se modificaron.

## Los veinte componentes tienen funciones distintas

| Componente | Función matemática y estado de esta conexión |
| --- | --- |
| XN01 | Predictor legado; no se declara ejecutado porque haya respondido LQT/C02 |
| XN01_RAW | Registros/procedencia de XN01; siguen siendo distintos del checkpoint C02 |
| EQUITIES | Series bursátiles observadas entran individualmente; falta objetivo C03 bursátil |
| X002 | Separación temporal, transformaciones y calibración cuando hay suficientes casos |
| XG01 | Sensibilidad reservada implementada; la ablación causal/reentrenada sigue pendiente |
| CAUSAL | Eventos numéricos observados entran como variables; ninguna causalidad se presume |
| M001_DIARY | Diario legado preservado; la confianza nueva usa emisiones LQT locales evaluadas |
| U002_XI | Estados observados disponibles; no se finge un nuevo roundtrip XI del archivo |
| WORLD | Cada serie pública elegible entra con su columna y unidad propia |
| ORDER_FLOW | L2/operaciones U001 conectados ahora al colector mundial; nueva historia por acumular |
| NOAA_EUR | Señales numéricas disponibles se consideran sin presumir relación con BTC |
| C001 | Entrada lista; última captura no intentó SEC/N-PORT; acceso e historia pendientes |
| O001 | Entrada lista para series FINRA; sin inventar un flujo global a partir de corto/ATS |
| D001_D002 | Derivados y swaps individuales conservan unidades, proveedor y reloj |
| B001 | BIS entra como series lentas; una recaptura no es otra publicación trimestral |
| K001 | Blockchain/DeFi entran como series; stock, TVL y flujos no se confunden |
| EF001_EF005 | Sellos y cortes temporales se verifican antes de entrenar |
| EF003 | Necesita escenarios/leyes explícitos; no se inserta una simulación como precio observado |
| EF004 | Evolución conjunta original preservada; su salida no se fusiona automáticamente con C02 |
| RAW_V001 | Trazas sin redondear y procedencia; V001 completo no se presenta como ejecutado |

El manifiesto muestra `not_supplied_to_c03` donde corresponde. Tener veinte
entradas en el inventario no significa veinte motores entrenados ni veinte
votos independientes. PDE/grafos y M004 siguen siendo diagnósticos separados;
falta validar su uso como regularizador o variable de régimen.

## Confianza interna que pueda comprobarse

`nucleo/confianza-c03.mjs` separa:

1. P(subida) estimada por el modelo.
2. Frecuencia observada en emisiones anteriores de probabilidad parecida.
3. Error Brier y error de calibración.
4. Cantidad de períodos sin solapamiento y banda Wilson aproximada del grupo.

Se excluyen importados, duplicados, otros activos/versiones, resultados
comprobados después del corte y ventanas solapadas. La prueba histórica
inicial no se cuenta como nueva evidencia prospectiva. El panel indica
evidencia insuficiente si hay menos de 30 resultados comparables. Treinta
no garantiza calibración; ni el no solapamiento garantiza independencia.
Se puede observar una probabilidad interna de 80% y una frecuencia real
de 50%: mostrar esa diferencia permite corregir sobreconfianza.

El intervalo contextual actual usa residuos de un bloque separado y declara
su cobertura histórica observada. No garantiza cobertura bajo cambios de
régimen. La inferencia conformal adaptativa es una siguiente mejora a
evaluar, no una capacidad que esta entrega diga haber implementado.

## Qué conexiones aportan primero

| Prioridad | Fuente y uso | Falta concreta |
| --- | --- | --- |
| 1 | Coinbase L2 + operaciones: spread, profundidad, desequilibrio | Conexión al archivo añadida; hacen falta historia y prueba de aporte |
| 2 | Fed/BLS/ALFRED: decisiones, inflación, empleo y versiones conocidas entonces | Calendario de publicación y sorpresas; mantener fecha real de disponibilidad |
| 3 | Derivados: funding, interés abierto, base y liquidaciones | Completar proveedores fallidos y archivo temporal de cada contrato |
| 4 | SEC/EDGAR y emisores ETF: balances, hechos y participaciones | Identificación SEC válida; series de emisiones/rescates para flujo diario |
| 5 | CFTC/FINRA/BIS: posiciones y estructura | Respetar retrasos; datos semanales/mensuales no son un feed intradía |
| 6 | X/Stocktwits y prensa: atención y narrativas | API autorizada, archivo completo y ensayo fuera de muestra antes de dar peso |

Se verificó en vivo la conexión pública Coinbase: libro y operaciones
respondieron y produjeron siete señales reales, guardadas en
`evidencia/c03-componentes/microestructura-real.json`. Una fotografía L2
no equivale a órdenes ejecutadas; la muestra REST no es todo el flujo.
El WebSocket L2 continuo y su recuperación de secuencia siguen pendientes.

La última captura ya contiene curva FRED, tasas, CFTC, BIS y DeFi; no hay
que duplicar esos conectores. EDGAR no requiere una API key para lectura
pública, pero sí cumplir su identificación y límites de acceso. ALFRED
requiere gestionar sus credenciales y sus versiones. Ninguna conexión
de pago ni cuenta social fue activada en esta entrega.

## Redes sociales verificables

No se identificó una red o autor cuya precisión futura pueda certificarse
como «casi nunca falla». Verificar autoría o registro profesional no
certifica pronósticos. Se necesitan todas las emisiones, no una selección
de capturas con aciertos. El contrato propuesto guarda autor e ID, texto
original, primera captura, cambios/borrados, activo, dirección, objetivo,
vencimiento y referencia de precio. Sin objetivo evaluable, la publicación
se clasifica como narrativa, no como pronóstico acertado.

La evaluación debe incluir fallos, abstenciones y cobertura; deduplicar
republicaciones; comparar con persistencia y con repetir la dirección
mayoritaria; medir calibración y aporte incremental a C02. La actividad
coordinada y el sesgo de supervivencia pueden producir aparente consenso.
Un consenso no aumenta automáticamente la probabilidad de acierto.

## Siguiente campaña de investigación

1. Mantener la captura mundial existente e incorporar microestructura.
   Para señales rápidas hace falta un archivo específico con frecuencia
   adecuada; no descargar BIS o SEC a cada tick.
2. Recuperar historia pública punto en el tiempo de ALFRED, SEC y anuncios
   oficiales, sin retrofechar versiones descargadas hoy. Para plazos largos
   no basta esperar unos días ni repetir una captura miles de veces.
3. Añadir objetivos C03 ETH/SOL y bursátiles con cierres y calendarios correctos.
4. Archivar emisiones C02/C03 con el mismo objetivo y comparar su contribución
   con controles clásicos, sin CZ y por familia. Mantener un examen nuevo.
5. Ajustar pesos por activo/plazo y evaluar régimen, costes, cobertura y
   estabilidad en varias ventanas temporales. Congelar la política elegida.
6. Solo después incorporar una fuente social concreta mediante su API y
   demostrar mejora incremental sobre la versión sin ella.

## Fuentes primarias consultadas

- [Coinbase: canales WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels).
- [SEC: APIs públicas EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
- [ALFRED: períodos de disponibilidad](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html).
- [Fed: calendario y comunicados FOMC](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm).
- [CFTC: COT, referencia martes y publicación generalmente viernes](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm).
- [X: API Filtered Stream y niveles de acceso](https://docs.x.com/x-api/posts/filtered-stream/introduction).
- [SEC: evaluación de afirmaciones de rendimiento](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-47).
- [Gibbs y Candès: inferencia conformal bajo cambio de distribución](https://arxiv.org/abs/2106.00170).
- [Guo et al.: calibración de probabilidades](https://arxiv.org/abs/1706.04599).

Reproducción: `node --test tests/conjunta-c03.test.mjs`,
`node tools/auditar-c03.mjs ARCHIVO SALIDA.json evidencia/campana-c02/datos/BTC-USD-300.json.gz.b64`.
