# Recuperación XG01 y R015, registro crudo

El inventario principal compara 20 grupos de capacidades de la APK 3.2
con el repositorio de LaPlaceDIG, su REVERSE-PC e integraciones.
No son 20 modelos entrenados ni implica que todos estén ausentes en 3.3.

## Piezas recuperadas en el repositorio, sin alterar el predictor de la APK

1. XG01 experimental, original LaPlaceDIG/experiment/u002-predictive-ab-20261030.
   Blob original Git: 2284e144404ac62b924a51cf718413b69ad35507.
   Test original Git: 492d2144c71daea14233a5ab83018da52132319d.
   Compara máscara local del estado con amplitud de mercados,
   VIX y DXY; peso de fusión elegido en validación, test cronológico.
   **No existe ventaja real reservada demostrada**, solo tests de código
   con series sintéticas. NO se ejecuta automáticamente en Android.
2. Informe R015 del experimento de recalibración negativa, blob original
   5b60cc9811980274218d8550145a4e2c5d054e97.
   MAE del retorno 0.12196644864761973 puntos porcentuales tras
   recalibrar, versus 0.11990383597310622 candidato anterior y
   0.11625716275625436 persistencia. Ese ajuste NO debe activarse
   solo por estar conservado.
3. XG01 traza cruda adicional: cada decisión de test conserva estado,
   máscaras, probabilidades locales y globales, mezcla seleccionada,
   prior, soporte, pérdida Brier, etiqueta posterior y representaciones
   IEEE754 binario64 originales sin toFixed. Las pérdidas de cada fold
   se contrastan con el experimento original antes de publicarse.
   Una ausencia de señal crea una fila excluida, jamás un cero.

## Qué significa crudo

Un valor antes de formateo no es lo mismo que quitar decisiones del modelo.
El M001 original selecciona hasta 18 análogos y exige 8 para emitir;
XN01 usa un prior suavizado. Cambiar esas fórmulas produce otro modelo
y requeriría evaluación reservada nueva. Sus registros originales sí
deben conservarse junto a métricas de reserva y errores negativos.

XG01 clasifica **dirección**, no precio absoluto. La traza histórica
no certifica que un operador hubiera conocido esas observaciones en
el momento exacto de cada predicción; no incorpora datos privados, L3 ni
información SEC sin autorización.

## Reproducir

    node --test tests/u002-predictive-xg01.test.mjs tests/xg01-raw-trace.test.mjs
    node tools/xg01-raw.mjs ENTRADA.json SALIDA.json

ENTRADA.json acepta un objeto con las claves target, samples y plan opcional.
Cada fila de samples usa t (epoch segundos), local, global e y (0/1).
Se preserva el detalle de cada test; nunca sobrescribe un registro existente.

El predictor central de F001/M001 NO cambió ni se habilitó trading.
