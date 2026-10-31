# Pulso Mundial P001: BlackRock y JPMorgan Chase

Primera disección documental institucional en LaPlaceDIG. Refina las identidades
del catálogo existente y conserva cada informe como una versión fechada. Separa
las filiales del grupo publicadas en EX-21 de las posiciones de inversión 13F.

## Evidencia inicial

Fuentes originales, portadas, respuestas de descubrimiento, hashes y marcas de
captura: `evidencia/pulso-20261030/capture.json`. Las respuestas se conservan
comprimidas y se verifican antes de importarlas. El desglose reproducido está en
`evidencia/pulso-20261030/resultado/resumen.json`.

| Institución | Filiales EX-21 al 2025-12-31 | Filas 13F al 2026-06-30 | Posiciones agrupadas |
| --- | ---: | ---: | ---: |
| BlackRock | 286 | 49.968 | 5.696 |
| JPMorgan Chase | 18 | 34.064 | 7.720 |

Fuentes primarias: [BlackRock EX-21](https://www.sec.gov/Archives/edgar/data/2012383/000119312526071966/blk-ex21_1.htm),
[JPMorgan EX-21](https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/corp10k2025exhibit21.htm),
[BlackRock 13F](https://www.sec.gov/Archives/edgar/data/2012383/000201238326003238/primary_doc.xml)
y [JPMorgan 13F](https://www.sec.gov/Archives/edgar/data/19617/000001961726000325/primary_doc.xml).

Se verifican el número de filas y la suma exacta de los valores contra cada
portada 13F. La agrupación conserva CUSIP, clase, put/call, tipo de cantidad,
gestores incluidos, discreción de inversión y votos. Los valores son los
declarados, sin multiplicador de miles; no se equiparan al AUM ni al porcentaje
de propiedad. Las posiciones no son una lista de empresas controladas y pueden
incluir instrumentos de fondos, opciones u otros valores.

Ambos EX-21 omiten filiales no significativas. Se guarda la pertenencia publicada
al grupo; no se inventan padres intermedios ni propiedad del 100 %. Los informes
describen sus fechas de referencia, no un organigrama completo en tiempo real.

## Identidades y refinamiento

JPM conserva `market:JPM`. Los emisores del catálogo existente se enriquecen con
el CIK y nombre del catálogo oficial SEC. Para otras posiciones, una coincidencia
única de nombre normalizado se etiqueta como conciliación por nombre, no como
equivalencia CUSIP/CIK verificada. Nombres ambiguos quedan provisionales. CUSIP
identifica un valor, no una sociedad. No se hacen uniones por coincidencia parcial.
Las enmiendas del mismo periodo se registran como pendientes de conciliación.

Importar dos veces la misma captura no duplica identidades, posiciones ni fuentes.
Una captura posterior agrega evidencia; no retrocede su disponibilidad ni borra
la historia. La consulta temporal selecciona el último informe conocido de cada
tipo. Conocer ahora un documento antiguo no lo hace disponible en el pasado.

## Uso

```sh
node tools/laplace.mjs instituciones importar evidencia/pulso-20261030/capture.json salida-nueva
node tools/laplace.mjs instituciones consultar salida-nueva/registry.json.gz CORTE_UTC
node tools/laplace.mjs instituciones verificar-xi salida-nueva/registry.json.gz CORTE_UTC BIN_XI prueba-nueva
node tools/laplace.mjs validar salida-nueva/entrenamiento.jsonl
```

Para actualizar: configure `SEC_USER_AGENT` con identificación y contacto real del
operador y ejecute `instituciones actualizar DIRECTORIO_NUEVO [REGISTRO_ANTERIOR]`.
Se hacen solicitudes secuenciales y se conservan los fallos. Si los formularios
necesarios salieron del listado reciente, se exige revisar el archivo histórico;
no se completa la cobertura con datos inventados.

Las relaciones se exportan por lotes de hasta 1.024 estados al contrato U001/U002
y al compilador XI/Inverse Ether Memory existente, sin cambiar el núcleo. La
prueba compara los bytes materializados. Los nombres y evidencias completos
siguen en el registro del host; la carga nativa contiene estados numéricos y
claves del diccionario. Se exportan seis hechos económicos compatibles con el
contrato de entrenamiento. Preparar estos datos no ejecuta entrenamiento
predictivo ni demuestra una mejora de pronósticos.

La implementación extiende LaPlaceDIG/main. La rama U003 y la APK de REVERSE no
se modifican en este corte. Continúan pendientes el seguimiento de nuevos
informes, cambios de participaciones entre periodos, métricas contables y señales
narrativas dirigidas a cada institución, así como su validación predictiva.
