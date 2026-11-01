## LAPLACE Android 3.8 — regímenes y aprendizaje M004

La nueva versión incorpora inteligencia estadística experimental, no pesos
neuronales ni una certificación de exactitud financiera.

M004 calcula la volatilidad (baja, media, alta), la tendencia
(alcista, bajista o lateral) y la actividad de volumen a partir de
las velas cerradas del activo elegido. Los umbrales se ajustan
únicamente con datos históricos conocidos al momento de decidir.

El botón **Comprobar si el régimen ayuda a predecir la amplitud**
realiza tres cortes cronológicos, con entrenamiento, validación y
prueba reservada. Compara tres variantes condicionales con la
referencia de la magnitud histórica incondicional, y publica los
errores negativos, muestras insuficientes y abstenciones.

### Prueba auténtica sobre 7.488 velas BTC de cinco minutos

| Horizonte | Error modelo M004 | Error referencia histórica | Diferencia |
| --- | ---: | ---: | ---: |
| 5 minutos | 4.890765 pb | 5.129500 pb | +4.6542 % |
| 15 minutos | 8.846849 pb | 8.840645 pb | -0.0702 % |
| 60 minutos | 17.671145 pb | 17.512636 pb | -0.9051 % |

Las cifras son errores absolutos de magnitud de retorno logarítmico
en puntos básicos. No son errores de precio ni aciertos direccionales.
Todos los resultados son RETROSPECTIVOS; el archivo X002 no contiene
vintages minuto a minuto autenticados. Ni siquiera 5 minutos tiene
una ventaja prospectiva demostrada.

En Android la tarjeta M004 observa únicamente velas cerradas del
activo seleccionado; la prueba explícita utiliza ese mismo historial.
Acciones y ETF continúan usando Yahoo indicativo, potencialmente
retrasado; un mercado cerrado no se transforma en cotización viva.

M004 no sustituye, corrige ni reentrena M001, F001, F002, M003,
EF004 o XI/Ether. No accede a Robinhood ni coloca operaciones.

La APK 3.8 usa versionCode 13 y el paquete de depuración
com.entidadlaplace.mobile.regime38, independiente de 3.7.
No migra registros locales anteriores.

### Reproducir

    node --test apps/laplace-android/tests/regime-m004.test.cjs
    node tools/m004-regimes.mjs build/m004/report.json
    node apps/laplace-android/prepare-regime.mjs

GitHub Actions vuelve a probar la historia real y los controles Android.
Chromium usa datos simulados únicamente para comprobar la interfaz.


## Android 3.7 — mercado ampliado y consulta con Robinhood

Esta versión conserva el núcleo BTC original y agrega **31 activos
seleccionables**: 10 criptomonedas Coinbase y 21 acciones/ETF de EE. UU.
(AAPL, NVDA, TSLA, AMD, MSFT, AMZN, GOOGL, META, HOOD, COIN, MSTR,
SOFI, PLTR, NFLX, JPM, SPY, QQQ, DIA, IWM, VOO, VTI).

- BTC/USD conserva **F001 de 14 horizontes** y su Laplaciano, más XN01
  nativo, M001, EF002, EF004, F002 y el laboratorio.
- Otras criptomonedas y 21 valores bursátiles usan **M001
  experimental de 16 horizontes** (5 minutos hasta 90 días/sesiones).
  No se afirma que los modelos estén calibrados igual que BTC.
- Para bolsa, *días* largos equivalen a **sesiones bursátiles
  observadas**, no a días calendarios. No se inventa un instante
  exacto para fines de semana ni se guardan pronósticos bursátiles
  como vencidos a una hora ficticia.
- **Coinbase:** cotizaciones públicas y WebSocket solo para los tres
  activos originales BTC, ETH y SOL. Los demás usan HTTPS por selección.
- **Acciones/ETF:** Yahoo Finance Chart público **no oficial**,
  potencialmente retrasado, limitado o bloqueado (HTTP 429).
  No es un feed NBBO consolidado, ni información del broker, ni
  precio garantizado de ejecución. Fuente caída equivale a abstención.
- **Robinhood:** enlace externo a la ficha del activo. La app no
  solicita credenciales ni accede a saldo, órdenes o posiciones.
- **Favoritos locales:** máximo 12, no sincronizados con Robinhood.
- **Actualizar precio:** lectura de un ticker sin descargar historial.
- **Auto 2 min:** opción apagada por defecto; consulta solo el
  activo elegido mientras la interfaz está visible.
- **Marea M003:** resumen del experimento retrospectivo sobre 7488
  velas BTC, con resultado negativo para ventaja consistente. No
  modifica predicciones bursátiles.
- **F002/EF004:** estados independientes; abstención si falta evidencia.

Instalación: debug de paquete **com.entidadlaplace.mobile.multi37**
(versionCode 12, versión 3.7.0-MULTI-MARKET-RESEARCH), paralelo a
3.4/3.5/3.6. No transfiere ni borra registros anteriores.

Chromium usa cotizaciones SIMULADAS para la prueba de UI; Android JUnit
comprueba el parser Yahoo offline. Esas pruebas no acreditan
disponibilidad real de Yahoo en todos los dispositivos. La investigación
es experimental y no constituye asesoría de inversión.


# Laplace Android — APK financiera independiente

Aplicación Android autónoma basada en el concepto visual aportado para
Entidad Laplace: ojo triangular y vórtice central como identidad estética
de entrada de señales. No instala REVERSE-PC ni reemplaza los modelos
científicos del repositorio principal.

### Instalación de pruebas 3.5

La APK de depuración se instala como **LAPLACE 3.5** con identificador
`com.entidadlaplace.mobile.ux35`, diferente del identificador de la
3.4. Los certificados de depuración de GitHub Actions pueden cambiar,
por lo que una actualización directa fallaría con "App no instalada".
Esta variante se instala **junto a 3.4** sin desinstalarla: conserva
el historial de la aplicación antigua en su propio espacio. Los
registros M001 no se migran entre aplicaciones ni se prometen como
datos sincronizados. Requiere Android ARM64 (arm64-v8a), API 26+.

## Android 3.6 — F002 conjunto y evaluación verificable

- Motor nuevo de servidor F002: incorpora los estados de todas las fuentes
  públicas archivadas en seis familias de cambios normalizados. Cada
  medición conserva identidad, unidad, fecha conocida y SHA del archivo.
- Añade las cinco capturas históricas originales del 30-oct-2026 con
  verificación de integridad; diez capturas, 927 series y 30 dominios
  examinados en el ciclo real. Sólo un resultado futuro comparable:
  **F002 se abstiene y no predice un precio validado**.
- Las pruebas usan validación temporal y holdout separado. Cuando
  exista evidencia suficiente, las salidas permanecen en modo shadow
  y se congelan para evaluación prospectiva posterior.
- Pestaña Multiplazo: diagnóstico F002 con fuentes nuevas, repetidas,
  pares train/validación/holdout y explicación de abstención. F001
  mantiene sus 14 cálculos originales sin fusionar un modelo no validado.
- Pestaña Fuentes: incluye información vinculada al SHA del reporte.
- Instalación de depuración paralela a las anteriores:
  id com.entidadlaplace.mobile.f002, nombre LAPLACE 3.6, versionCode 11.
  No borra la 3.4 ni la 3.5 y no transfiere sus registros locales.
- La APK no ejecuta automáticamente 927 series en cada fotograma:
  la inferencia conjunta se ejecuta en GitHub Actions al capturar
  archivos; la compilación integra su diagnóstico verificable.
  Ningún dato licenciado inaccesible se inventa.

Véase docs/F002_PREDICCION_CONJUNTA_AUDITABLE.md.

## Android 3.5 — centro de análisis y navegación inteligente

**Objetivo:** quitar fricción y botones redundantes sin cambiar el cálculo original.

- Cinco destinos: **Inicio, Multiplazo, Validación, Fuentes y Laboratorio**;
  página de señales M001 accesible desde Fuentes y herramientas individuales
  ocultas por defecto en un panel técnico ampliable.
- **Analizar ahora** es el único botón primario. Verifica que haya velas
  cerradas frescas (o las recupera), ejecuta el M001 canónico, y sólo emite
  y guarda un candidato si dispone de soporte histórico real. El resultado
  describe precio de referencia, plazo, patrones, evaluación retrospectiva,
  comparativa frente a persistencia y fuente; ante fallos se abstiene.
- **Validación** ahora tiene acción propia. Recupera series si faltan,
  ejecuta evaluación cronológica M001 y comprueba los pronósticos locales
  únicamente después de alcanzado su objetivo.
- **Fuentes** permite buscar y filtrar 20 capacidades por funcionamiento
  real: ejecutadas/observadas frente a no conectadas o parciales; el botón
  Restablecer cambia los filtros, no simula una actualización remota.
- XN01 nativo y los controles de análisis manual permanecen accesibles
  dentro de los detalles técnicos. El módulo XI no se ejecuta
  automáticamente sobre ETH/SOL ni se reemplaza con JavaScript.
- La interfaz informa cuando una respuesta de Coinbase falla o los datos
  son antiguos. No inventa cotizaciones, probabilidades ni datos SEC.
  Estilo de estación financiera de alto contraste, navegación móvil inferior,
  foco accesible y movimiento reducido para usuarios que lo solicitan.
- Se prueba con Chromium/Playwright y velas claramente SIMULADAS en el
  harness de interfaz, mientras que la APK real usa el puente Android
  existente. Las capturas visuales del test **no representan precios reales**.
- versionCode 10 · versionName 3.5.0-INTELLIGENT-UX.

**Alcance honesto:** la versión 3.5 es una mejora de operatividad e interfaz.
No añade un modelo aprendido EF004, ni conectores L2/L3 o SEC de pago.
Los 20 módulos siguen auditados pero no se convierten en 20 pronosticadores
solamente por visualizarlos.

## Android 3.4 — Integración auditable de las 20 capacidades

- **Un único inventario canónico** en `nucleo/registro-capacidades.mjs`, utilizado
  por el ejecutor Node y empaquetado sin bifurcar sus reglas a WebView.
- La pestaña Datos muestra los **20 grupos del informe de pérdidas**,
  con estado diferenciado: ejecutado, observado en archivo, parcial,
  abstención, no ejecutado o no observado. Incluye el código de origen,
  razón concreta y JSON completo inspeccionable.
- Se ejecutan realmente en Android los módulos que ya tienen runtime:
  XN01 mediante XI/Ether nativo (tras solicitarlo), M001 y F001 históricos,
  la auditoría EF002 y el Laplaciano de grafo. No se reetiquetan como
  ejecutados los colectores que sólo existen en Node.
- EF002 ahora verifica **todos los manifiestos del archivo** al construir
  el APK y conserva su índice cronológico y hashes, más el estado completo
  de la captura más reciente. En el teléfono no se duplica el almacén
  bitemporal EF001/EF005 íntegro; el archivo original sigue en
  `laplace-archivo`. Las observaciones se pueden recorrer por páginas
  de 100, no quedan ocultas tras el límite visual antiguo de 40.
- El constructor integra el reporte EF004 de `laplace-modelos` **solo**
  si corresponde al archivo verificado. Expone pares de entrenamiento,
  validación y capturas contiguas. Un reporte de abstención sigue siendo
  abstención, no inventa aprendizaje.
- Las fuentes BIS, DeFi, derivados, FINRA y ETF no se añaden al valor
  central F001 sin continuidad, unidades comparables y evidencia
  prospectiva. L2/L3 y acciones SPY/AAPL/NVDA siguen necesitando
  datos autorizados y ejecutor; EF003 requiere un escenario y EF001.
- Reglas de regresión: 20 IDs únicos, identidad de fuente en bundle,
  pruebas Node, controles de panel Chromium y compilación Android.
  Ningún pronóstico es orden de trading ni mejora demostrada.

**Alcance:** se recupera la conexión de **observabilidad y procedencia**
de los 20 grupos; no se afirma la ejecución predictiva de los 20 en
Android, ni que exista cobertura financiera mundial completa.

## Android 3.2 — Coinbase WebSocket en vivo
- Fuente pública: wss://ws-feed.exchange.coinbase.com; canales ticker y
  heartbeat para BTC-USD, ETH-USD y SOL-USD. Sin credenciales.
- Precio de la última operación actualizado automáticamente cuando
  Coinbase publica operaciones. Heartbeat confirma conectividad, no es
  un precio ni una operación nueva.
- Cliente nativo OkHttp Android con validación de activo, precio y hora,
  secuencias monotónicas y reconexión progresiva de 2 a 60 segundos.
- Una conexión en primer plano; desconexión al minimizar la aplicación,
  reinicio al volver y botón Activar/Detener para control manual.
- Ticks agrupados cada 300 ms para no bloquear WebView; curva de
  los últimos 80 eventos por activo, antigüedad y fuente explícitas.
- WebSocket muestra el último trade y REST trae velas OHLCV. M001/F001
  mantienen sus datos históricos cerrados; escenario en vivo (si se
  entrenó M001) solo reancla el valor actual, sin nuevas predicciones
  archivadas ni aprendizaje ficticio.
- Incluye JUnit para el protocolo nativo y Chromium para UI con
  mensajes de flujo simulados. La prueba de red real depende del equipo.
- VersionCode 7, versionName 3.2.0-COINBASE-LIVE.

## Android 3.1 — reparación real de controles y simplificación del panel
- Resuelto el bug crítico de alcance JavaScript que hacía fallar el arranque
  (`runIntegral is not defined`) y desactivaba otras acciones sin aviso.
- Seis secciones siempre visibles, sin navegación horizontal recortada.
- Mercado: activo, horizonte en selector, botón Proyectar principal;
  panel de 16 botones solo si el usuario decide desplegarlo.
- Las acciones del mercado permanecen deshabilitadas hasta tener velas,
  para evitar controles que parezcan muertos; actualiza desde Coinbase.
- La sección F001 indica explícitamente que calcula BTC y presenta
  análogos, abstenciones y fuente. PDE y estados mundiales siguen separados.
- Se realizan pruebas reales de interacción de botones y de errores
  de la API mediante navegador automatizado, además de CI de APK.
- Android versionCode 6 y versionName 3.1.0-UI-REPAIRED.

## Android 3.0 — F001 original, 16 horizontes y operador de Laplace

- Recuperación del motor F001 original (14 horizontes de 5 min a 90 días) en
  el dispositivo mediante un paquete generado de código canónico.
- Se mantienen adicionalmente los horizontes M001 de 5h y 2 días
  (16 opciones en el selector), sin sustituir el motor anterior.
- Datos Coinbase en velas 5m/14 días, 1h/45 días, 1d/1000 días, con
  ventanas de consulta paginadas, campos OHLCV y faltantes explícitos.
- Nueva pestaña Núcleo: cálculo simultáneo de los 14 horizontes F001
  con fecha y fuente, diagnóstico armónico Lφ=0 sobre retornos adimensionales
  de BTC y auditoría de EF002 con todas las observaciones disponibles.
- Si hay al menos dos fronteras experimentales, el solucionador de
  Laplace evalúa el campo entre horizontes. Nunca publica un
  valor interpolado como pronóstico de precio, ni cambia la predicción central.
- El campo global de ETF C001 y los estados EF004 no se simulan. X002/XN01
  son nativos y aún no forman parte de la APK independiente.
- versionCode 5; versionName 3.0.0-F001-LAPLACE. La APK continúa
  siendo investigación, no trading ni rentabilidad comprobada.

## Android 2.0 — M001 restaurado, EF002 completo y panel corregido

Elimina el AR(1) simplificado que sustituyó al antiguo motor del precio.
Se restauró la matemática de análogos históricos de M001, originalmente
en LaPlaceDIG/seguimiento/modelo.mjs: cinco rasgos reales de impulso (1
y 3 velas), volatilidad RMS, rango y volumen relativo, distancia
normalizada, hasta 18 analogías sin solapamiento y retorno logarítmico
ponderado por 1/(1+distancia). Precio candidato = precio inicial × exp(retorno).
No se impone un aumento artificial de 1 dólar ni se sustituye el candidato
por persistencia cuando el test sea desfavorable. El panel muestra los
errores frente a la referencia para que se vean también los fallos.

**Horizontes**: 15m, 30m, 1h, 4h, 5h, 12h, 24h, 2d, 3d, 7d, 14d.
Velas de Coinbase 5m (14 días), 1h (50 días) y 1d (300 días),
obtenidas por ventanas con máximo 280 barras. Verifica velas cerradas,
huecos, OHLCV y fuente. Si los datos son antiguos o faltan al menos
ocho patrones independientes, se abstiene de emitir candidato.

**Panel**: cotizaciones spot de BTC/ETH/SOL separadas del último
cierre histórico; botones Analizar, Probar, Evaluar y Proyectar
ejecutan operaciones comprobables. Muestra patrones seleccionados,
validación walk-forward cronológica, errores, fuentes, fechas y registro
local de candidatos. No confunde pruebas retrospectivas con aciertos futuros.

**Mundo**: EF002 proporciona estados financieros verdaderos, valores,
unidades, fechas known_at y observed_at, fuentes públicas, grupos y
capturas verificadas por SHA256. Se pueden filtrar los estados desde
la APK. La inclusión del contexto mundial no constituye evidencia de
que EF004 haya aprendido relaciones predictivas: EF004 continúa en
su infraestructura independiente hasta obtener datos suficientes.

**Ecuación**: conserva ∇²φ=0 y el Laplaciano de grafos como matemáticas
estacionarias exactas, sin falsear una predicción de mercado.

Android versionCode 4, versionName 2.0.0-M001-EF002.
Solo investigación: sin trading ni garantía financiera.


## Versión Android 1.1 — ecuación de Laplace real en el teléfono

- Nueva pestaña **Ecuación**, que integra el solucionador PDE auténtico de
  `ecuacion/laplace-pde.mjs` y el de grafos `ecuacion/laplace-grafo.mjs`,
  empaquetados dentro del APK (JavaScript sin conexión de red).
- Campo 2D con fronteras personalizadas, mallas 11/21/31/41, heatmap, número de
  iteraciones, tolerancia y residuo calculado. Dos verificaciones analíticas
  adicionales: campo lineal y x²-y².
- Grafo A—X—B con valores y pesos introducidos por el usuario: resuelve el
  estado intermedio si existe una frontera conocida; **no inventa señales**.
- Se conservan precios BTC/ETH/SOL, ocho horizontes, vórtice, mundo EF002
  verificado y modelo AR(1) original en la pestaña Panel.
- **Importante**: la ecuación ∇²φ=0 es estacionaria. La nueva pestaña no
  predice un precio ni sustituye EF004 con una fórmula no validada.
- `versionCode 3`, `versionName 1.1.0-LAPLACE-PDE`. APK de depuración
  firmada en CI; si la firma difiere de la versión instalada, Android puede
  exigir desinstalar la anterior (perderá el registro local).

## Versión Android 1.0 — precios y controles visibles

Los tres precios públicos de BTC/USD, ETH/USD y SOL/USD aparecen **arriba del
triángulo/vórtice**, en tarjetas que también sirven para seleccionar el activo.
Se consultan mediante el endpoint HTTPS ticker de Coinbase Exchange, con
fecha de fuente y aviso cuando el precio no está disponible. Si el ticker
falla y hay velas, la tarjeta activa muestra el último cierre de vela
etiquetado como histórico (nunca como spot en vivo).

Debajo del precio hay un aviso contextual siempre visible, que explica
cuando falta conexión, no llegaron velas, hubo un fallo o la prueba terminó.
El orden sugerido es Actualizar → Entrenar → Proyectar. Probar y Evaluar
abren la pestaña de pruebas y detallan el error histórico.

El triángulo y vórtice contienen animación SVG/CSS de corriente de datos,
partículas y pulsación, con respeto a "reducir movimiento" de Android.
Es una visualización estética, no una representación causal del mercado.

La interfaz y los mensajes se comprobaron con navegador automatizado y
respuestas públicas simuladas; esto valida la lógica de interacción, no
afirma que esos precios sintéticos sean cotizaciones actuales. La API nativa
solo permite los activos fijados en código. Los datos reales dependen del
acceso a Coinbase desde el dispositivo.

Si Android indica que la nueva APK no puede instalarse encima de una
compilación de depuración anterior, es posible que las firmas de desarrollo
no coincidan. En ese caso desinstalar la versión previa (se perderá el
historial local), e instalar la nueva. No es una versión de Play Store.

---
## Funciones reales

- Datos horarios y diarios públicos de Coinbase Exchange (BTC/USD,
  ETH/USD y SOL/USD), consultados desde Java nativo por HTTPS.
- Ocho horizontes en la interfaz: **1 hora, 5 horas, 12 horas,
  24 horas, 2 días, 3 días, 7 días y 14 días**.
- Entrenamiento local simple de regresión autorregresiva de orden 1
  con regularización ridge. El conjunto de test es cronológicamente
  posterior al período usado para ajustar parámetros.
- Selección entre modelo AR(1) y referencia de persistencia según
  error absoluto en test histórico. Proyecciones de futuro con rango
  de volatilidad **exploratorio y no calibrado**.
- Botones: Entrenar, Probar, Evaluar, Proyectar; gráfico real más
  escenario; registro local de proyecciones y comprobación posterior
  si se obtiene una observación futura comparable.
- Sección Mundo: cantidad de estados, dominios y grupos en la última
  captura pública **EF002**. Durante la compilación se copia un resumen
  de la captura real más reciente de la rama laplace-archivo, verificando
  hashes originales de U003, U001 y el archivo comprimido.
- La captura mundial no se presenta como entrada de la pequeña
  regresión local. **EF005 global permanece en el repositorio/CI**:
  sus leyes y aprendizaje no están incorporados como un motor completo
  y continuo dentro de esta APK.
- Ninguna operación de compraventa, conexión a bancos, credenciales
  de bróker o tratamiento de claves privadas.

## Tecnología

App Android Java (minSdk 26) con WebView de archivos locales e
interfaz JavaScript sin frameworks remotos. Solo se expone un método
nativo a JavaScript para solicitar velas públicas de un conjunto
cerrado de activos y resoluciones. La red no acepta URLs arbitrarias.
No requiere cuentas ni registra datos personales.

## Construir

Desde la raíz del repositorio:

    node --test apps/laplace-android/tests/*.test.cjs
    node apps/laplace-android/prepare-world.mjs world_archive/capturas
    gradle -p apps/laplace-android :app:assembleDebug --no-daemon

En el paso de preparación, world_archive corresponde al checkout de la
rama laplace-archivo del mismo repositorio. GitHub Actions configura
Android SDK 35, comprueba la integridad de la captura y construye una
**APK de depuración firmada**, lista para instalación de pruebas:

    .github/workflows/laplace-android-apk.yml

El APK resultante se encuentra en:

    apps/laplace-android/app/build/outputs/apk/debug/app-debug.apk

Android 8 o posterior. La instalación manual puede solicitar permitir
aplicaciones de esta procedencia. Una versión comercial debería usar
una firma de publicación estable y pruebas instrumentadas adicionales.

## Alcance de los resultados

No se ha demostrado que este pequeño AR(1) supere sistemáticamente la
persistencia ni que las bandas tengan cobertura del 95%. El panel
etiqueta el rango como exploratorio, documenta cuándo es una prueba
histórica y cuándo un resultado posterior sigue pendiente. No ofrece
asesoría financiera ni promete resultados futuros.

El vórtice/triángulo es un símbolo visual. No representa una física de
atracción de datos ni un mecanismo predictivo causal demostrado.
