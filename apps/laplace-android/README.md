# Laplace Android — APK financiera independiente

Aplicación Android autónoma basada en el concepto visual aportado para
Entidad Laplace: ojo triangular y vórtice central como identidad estética
de entrada de señales. No instala REVERSE-PC ni reemplaza los modelos
científicos del repositorio principal.

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
