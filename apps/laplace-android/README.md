# Laplace Android — APK financiera independiente

Aplicación Android autónoma basada en el concepto visual aportado para
Entidad Laplace: ojo triangular y vórtice central como identidad estética
de entrada de señales. No instala REVERSE-PC ni reemplaza los modelos
científicos del repositorio principal.

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
