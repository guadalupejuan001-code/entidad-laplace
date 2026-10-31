# LAPLACE en REVERSE — M001 + XN01

## Arquitectura empaquetada

LAPLACE queda dentro de la APK de REVERSE con dos rutas explícitas:

- **BTC/USD · M001 + XN01:** M001 mantiene el candidato multihorizonte (15m, 30m, 1h, 4h, 24h y 7d) y XN01 calcula en paralelo la dirección inmediata de 5 minutos dentro de XI/Ether.
- **Bolsa · XN01:** SPY, AAPL y NVDA calculan la dirección del siguiente intervalo cerrado de 5 minutos en la **XI Machine de REVERSE sobre NativeRuntime/InverseMemory**.

La ruta bursátil es:

```
serie pública OHLCV
      ↓
LaplaceActivity / LaplaceXiCompiler
(validación, continuidad, serialización a bytes)
      ↓
x001-native.xi
(estado 4 bits + aprendizaje de conteos + probabilidad + dirección)
      ↓
NativeRuntime.initialize + NativeRuntime.execute
      ↓
InverseMemory / salida JSONL de registros
      ↓
interfaz Laplace
```

JavaScript **no calcula SUBIDA/BAJADA**. `x001.mjs` normaliza la respuesta bursátil y conserva evidencia histórica del experimento anterior; la decisión viva procede del programa `x001-native.xi`.

XN01 se ejecuta tanto para BTC como para bolsa y usa cuatro propiedades enteras calculadas dentro de XI:

1. cierre de 5 minutos no menor al anterior;
2. cierre actual no menor al de 15 minutos antes;
3. movimiento absoluto de 5 minutos mayor que la media absoluta de 30 minutos;
4. volumen actual mayor que la media de 30 minutos.

Los precios se transportan a XI en centavos enteros y el volumen como entero uint32. Las pausas de mercado se marcan como límites de continuidad y no se aprenden como transiciones de cinco minutos.

## Aislamiento

XN01 ejecuta un estado nativo aislado creado con `NativeRuntime.initialize()`. No modifica el checkpoint `session.rvp` del escritorio REVERSE. La memoria usada durante el cálculo sigue siendo la InverseMemory real del runtime.

## Interfaz

La interfaz incluye selector BTC/SPY/AAPL/NVDA, navegación inferior en móvil, Resumen/Datos/Flujo/Registro, gráficos temporales y manejo acotado de HTTP 429/502/503. Una acción bursátil muestra dirección, confianza interna, soporte, prior, máscara y estado de los cuatro bits; no inventa un precio futuro.

## Pruebas obligatorias

La integración no debe fusionarse ni compilarse como próxima APK si fallan:

- contrato SHA-256 de recursos;
- paridad M001;
- adaptador bursátil sin predictor JavaScript;
- ejecución de `x001-native.xi` en el `reverse_pc` real y coincidencia con referencia independiente;
- compilación Java/Android del puente;
- navegación Chrome en escritorio, vertical y horizontal;
- prueba Android 15 que ejecuta XN01 mediante JNI y verifica que el checkpoint principal queda intacto.

El contrato está en `laplace-android/integration-lock.json` y `NEXT_APK_LAPLACE.json`.

## F001 (rama de actualización, no APK publicada)

- Se incorpora el motor JavaScript puro F001 de LaPlaceDIG sin modificar M001,
  XN01 o los programas XI nativos. El selector BTC dispone de 14 horizontes
  (5 minutos hasta 90 días) sobre velas cerradas de 5 min, 1 h y 1 día.
- Android puede pedir rangos horarios (45 días) y diarios (1.000 días),
  en lotes de máximo 300 barras por petición y URLs Coinbase autorizadas.
- La cotización, los tres históricos y la captura mundial se inician
  conjuntamente. U003 es opcional cuando exista captura firmada en
  laplace-registro; U002/369 es alternativa con round-trip nativo XI.
- F001 usa el estado mundial para cobertura, frescura y amplitud exploratoria
  del escenario, nunca para alterar el precio central sin validación
  histórica. Cada horizonte sin al menos ocho análogos se abstiene.
- El reporte móvil conserva en su historial las salidas F001, M001 y XN01,
  el origen por resolución y qué fuentes fallaron.
- Esto sólo integra **código fuente para la próxima APK de REVERSE**. No
  demuestra existencia de una APK independiente 0.4.3 actualizada, ni una
  compilación/instalación Android real hasta pasar sus pruebas.

Ver pruebas: laplace-android/tests/fusion-f001.test.mjs y flujo CI
laplace-integration.yml. Probar también latencia, memoria y UI en el dispositivo
antes de publicar un APK como versión funcional.
