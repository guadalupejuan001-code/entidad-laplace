# LAPLACE — panel de análisis (versión funcional)

## Identidad y alcance
Nombre: LAPLACE. Idioma completo de la interfaz: español. El panel no presenta «Universal Observatory», cifras inventadas ni controles sin función. Usa los módulos U001 e I015 realmente implementados. No instala todavía una aplicación .rxe en REVERSE-PC ni altera la APK Android.

## Arranque sin dependencias nuevas
En la raíz de LaPlaceDIG, con Node 20 o posterior:

    npm run panel

En el mismo equipo abre la dirección:

    http://127.0.0.1:4179

El servidor escucha solo 127.0.0.1. El botón «Actualizar lectura» solicita datos reales mediante el colector Coinbase y NOAA existente. El navegador no consulta los exchanges directamente y no hay órdenes financieras.

## Pantallas con comportamiento real
- Mercado: precio, fuente y fecha, estimación central a quince minutos, estado del modelo, velas realmente recuperadas, tramo futuro discontinuo y candidato experimental sin validar. Sin selector fingido de plazos: I015 solo calcula a quince minutos.
- Factores observados: libro L2, nocionales por el lado maker de una muestra de trades, ETH/USD, BTC/EUR, índice Kp y estado de fuentes. Nunca se equipara una instantánea a una orden futura.
- Historia: solo capturas que realmente se recibieron y guardaron. Una lectura única no demuestra relaciones causales. Historial limitado a 144 capturas resumidas más última captura completa. Las velas históricas se recuperan ahora; no se certifican sus fechas de disponibilidad originales.
- Validación: errores MAE del modelo y la referencia, decisiones evaluadas, estados, dominios, hash de memoria y límites científicos.

## Almacenamiento, seguridad y controles
- Archivo local: registros/panel-laplace.json, ignorado por Git.
- Escritura mediante archivo temporal y renombrado para evitar registros parciales.
- Verificación del hash de snapshot, rechazo de esquemas inválidos y capturas repetidas.
- GET /api/estado, POST /api/actualizar, GET /api/exportar.
- Origen local, contenido estricto, sin paquetes externos ni recursos remotos incrustados.
- Actualización manual; impide lecturas simultáneas y clics repetidos en menos de dos segundos.
- Si falla la lectura, conserva la última observación y muestra un error.
- Si el modelo no supera la persistencia, el precio central utiliza la referencia; el candidato queda etiquetado como experimental.
- El rango de escenarios es empírico; no constituye un intervalo de confianza calibrado.

## Relación con REVERSE-PC
El panel local es funcional en LaPlaceDIG, usando HTML/CSS/JS únicamente para la interfaz. No se afirma que la visualización o las estadísticas se ejecuten en XI/Ether. Para empaquetar la pantalla como programa propio de REVERSE-PC habrá que conectar un adaptador de datos o un servicio compatible con el runtime que esté realmente presente en el dispositivo. No se ha creado un segundo motor gráfico ni se ha prometido una APK.

## Verificación

    npm run test:panel

Las pruebas son aisladas y usan registros artificiales solo dentro de la batería de test. Las pantallas de usuario no inyectan cifras ficticias. Para leer valores reales se requiere red accesible al colector y pulsar el botón de actualización.
