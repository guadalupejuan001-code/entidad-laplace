# LAPLACE 4.8 · Instrumento de serpiente

El icono de Android y el sello dentro de la app comparten un emblema original:
piel oscura con escamas, ocho flechas del caos grabadas, triángulo de cobre
envejecido y ojo de dragón ámbar con pupila vertical. La máscara adaptativa
conserva el sello completo en el 60 % central de su capa, sobre un fondo de
escamas. El margen del 20 % es proporcional y se adapta al tamaño del lanzador.

El tema recubre el observatorio con la misma piel, placas de esmalte oscuro,
bordes de cobre, números claros y botones con relieve. El fondo es una textura
local, sin descargas ni fuentes tipográficas externas. Los activos visuales
WebP suman 178.118 bytes en la WebView; Android reutiliza esas mismas imágenes
en sus recursos del lanzador. Los originales generados se codificaron a
512 × 512 sin dibujar ni alterar su contenido mediante código.

## Movimiento y estado

- Parpadeo periódico del ojo, reflejo suave al mover el puntero y luz ámbar.
- Aguja y lámpara responden a las tareas del núcleo y del archivo EF004.
  No representan una cotización, un porcentaje de avance o confianza.
- La pausa está a mano en el observatorio y se conserva tras reiniciar.
- El movimiento reducido deja el ojo abierto y detiene los efectos.
- La aplicación oculta pausa el movimiento. El video anterior sólo se activa
  cuando está visible en la pestaña de análisis.
- Los efectos usan CSS; el reflejo solicita un frame únicamente al recibir
  movimiento del puntero. No hay un nuevo bucle de renderizado o de red.

Los cambios de apariencia no alteran los precios calculados, la selección
de modelos, el historial ni la confianza. El evento de actividad sólo comunica
cuatro indicadores booleanos a la decoración. Se conservan el contexto C04,
los datos de mercado y el aprendizaje nativo.

## Instalación y comprobaciones

Versión 4.8.0-Serpiente-Vintage, versionCode 23 y paquete de prueba
`com.entidadlaplace.mobile.learn48`. Se instala junto a 4.7. Para trasladar
el aprendizaje nativo, exportar su respaldo LQT e importarlo antes de crear
un modelo nuevo en 4.8. La instalación paralela conserva la anterior.

El examen Chromium comprueba imágenes decodificadas, ausencia de desbordamiento
a 320/393/1080 px, pausa persistida, movimiento reducido, controles existentes
y acceso al pronóstico en la primera pantalla. El examen del ejecutor nativo
comprueba además la transición de actividad durante un cálculo real. El APK
verifica que los nuevos activos se incluyen y mantiene sus pruebas JNI/JUnit.

Los prompts de los dos activos originales están en
`design/laplace-v48/asset-prompts.json`. No se usaron logos o texturas ajenos.
