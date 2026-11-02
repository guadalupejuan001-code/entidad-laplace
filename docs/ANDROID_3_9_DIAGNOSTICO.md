# LAPLACE Android 3.9: diagnóstico y correcciones

Base revisada: `43addea228df1a219514b17ad937af851e1e74f7` (`main`).

## Fallos reproducibles en el código anterior

| Problema | Consecuencia | Corrección |
| --- | --- | --- |
| `refresh()` esperaba cuatro consultas de ticker antes de liberar los controles | Una cotización lenta podía bloquear botones hasta 135 segundos aunque las velas ya estuvieran listas | Las cotizaciones se completan independientemente del historial |
| El evaluador sólo examinaba `asset` y `historyGranularity` activos | Un candidato de otro activo o resolución quedaba pendiente aunque hubiese vencido | Comprobación explícita y periódica de todos los grupos pendientes sin cambiar la selección |
| El registro se recortaba a 250 entradas al cargar y guardar | Se perdía evidencia antigua sin una decisión del usuario | Sin recorte automático; advertencia ante fallo de almacenamiento y exportación JSON |
| La lista sólo dibujaba los últimos 35 | No se podían inspeccionar candidatos anteriores | Paginación con acceso a todo el registro |
| Las acciones y ETF no se registraban | No se podía medir el escenario bursátil frente a su cierre posterior | Registro por número de velas/sesiones posteriores al cierre de origen; sin vencimiento calendario inventado |
| El rótulo del plazo del registro dependía del activo abierto | Podía rotular un registro antiguo con la semántica de otro mercado | Cada entrada usa su propio activo/mercado/plazo |
| La navegación presentaba un laboratorio PDE junto al análisis financiero | Parecía una función necesaria para obtener precios | Herramienta conservada dentro de Datos, con explicación y botón de regreso |
| La respuesta del puente no comprobaba la resolución solicitada | Una respuesta fuera de contrato podía aceptarse en una solicitud distinta | Coincidencia estricta de activo/resolución y rechazo de velas abiertas en JavaScript |

## Flujo e identidad

Cuatro destinos: **Analizar, Plazos, Historial y Datos**. La pantalla inicial reúne activo, precio, plazo y una única acción primaria. Favoritos, refresco manual y pruebas por pasos siguen disponibles dentro de detalles. El cálculo histórico y el registro prospectivo se muestran separados.

Paleta: carbón `#101318`, panel `#181D24`, marfil `#F2EEE8`, texto secundario `#AAB1BC`, cobre `#E8AF7E`; verde `#8CD4C1` y coral `#F49B93` para resultados. El icono mantiene la geometría triangular y la espiral originales, añade máscara adaptativa y margen de seguridad. La cabecera comparte esa geometría.

El video aportado se incluye localmente en H.264, sin sonido, 640×480/24 fps, aproximadamente 464 KiB frente a los 24 MiB originales. No participa en ningún cálculo. Se pausa al salir de Analizar, al ocultar la app, por decisión del usuario o al activar movimiento reducido. Hay imagen de respaldo si el video no puede reproducirse.

## Registro y medición

Cada escenario conserva cifras originales, precio inicial, candidato, rango, emisión, referencia temporal, plazo, resolución y evidencia del modelo. Al verificarse se congela el cierre, hora de cierre, fuente y hora de comprobación.

- Diferencia con signo: candidato menos precio observado.
- Error absoluto: valor absoluto de esa diferencia, en USD.
- Error relativo: error absoluto dividido entre precio observado, por 100.
- Dirección: compara el signo del cambio previsto con el signo del cambio observado; un resultado plano es distinto de subida o bajada.
- Cercanía: porcentaje de registros cuyo error cae dentro del umbral elegido (0.1 %, 0.5 % o 1 %). **No es confianza ni probabilidad de acertar.**
- Referencia de persistencia: error de mantener el precio inicial y mejora/empeoramiento del modelo frente a esa referencia.
- Intervalo histórico: indica si el cierre quedó dentro de los cuantiles; no atribuye cobertura calibrada.
- Desfase de observación: segundos entre objetivo y cierre utilizado. Cripto usa el primer cierre posterior dentro de una sola resolución; no es un trade al segundo exacto.

El resumen conjunto usa errores porcentuales por caso: no mezcla errores USD de Bitcoin con los de otros activos. El filtro de resultado sólo filtra la lista, no mejora artificialmente el denominador de las métricas. El filtro de activo sí delimita el universo del resumen.

La comprobación usa sólo velas cerradas. Si falta el cierre, el objetivo aún no llega o el origen bursátil está fuera de la ventana de la fuente, conserva el registro pendiente. No se inventan resultados. La comprobación periódica funciona con la app visible, no es un servicio Android en segundo plano. Fuentes caídas se notifican por activo. JSON exporta todos los registros sin redondear mediante el selector nativo de Android. El borrado necesita una confirmación dentro de la interfaz.

## Pruebas

- Se reproducen las 42 pruebas Android previas; se añaden 10 pruebas de evaluación del registro.
- Chromium ejercita navegación, análisis M001, F001 de 14 plazos, M001 bursátil de 16, XN01 mediante un puente simulado, fuentes, PDE, grafo, errores HTTP, ticker lento, registro multiactivo/multirresolución, paginación, exportación y movimiento reducido.
- Las cotizaciones, resultados del puente XI y los 44 registros usados por Chromium son **simulados exclusivamente para comprobar la interfaz**. No son una prueba de precisión de mercado ni ejecución nativa XI en Chromium.
- El flujo CI compila la biblioteca XI/Ether original fijada por SHA, ejecuta pruebas JUnit y comprueba APK, firma y recursos empaquetados. La ejecución en un teléfono físico no queda acreditada por estas pruebas.

M001, F001, M004, F002 y XI/Ether mantienen sus motores; este cambio no demuestra una mejora predictiva.

## Instalación

APK de prueba ARM64, Android 8+; nombre **LAPLACE 3.9**, versionCode **14**, paquete `com.entidadlaplace.mobile.tool39`. Se instala junto a 3.8 para evitar conflictos entre firmas de depuración de distintas compilaciones. No se desinstala ni borra la aplicación anterior. Los historiales de paquetes anteriores no se migran automáticamente.
