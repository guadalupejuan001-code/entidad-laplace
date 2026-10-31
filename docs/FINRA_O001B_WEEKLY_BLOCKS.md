# Laplace O001-B — ATS / Non-ATS semanal y bloques mensuales FINRA

**Estado:** código de investigación con contratos y pruebas deterministas, aún no integrado
a la rama main ni a la APK. No hay descarga real acreditada de estas fuentes
sin una credencial pública FINRA autorizada. No se ejecutan órdenes.

## Los tres conjuntos NO son equivalentes

| Fuente FINRA | Dataset | Período | Qué representa |
| --- | --- | --- | --- |
| ATS y Non-ATS por acción | OTCMarket / weeklySummary | semana que empieza lunes | Acciones y operaciones reportadas por segmento en la semana |
| Desglose ATS / Non-ATS por centro reportante | weeklySummary con _SMBL_FIRM | semana | Empresa/ATS que reporta el volumen; **no su cliente** |
| Bloques ATS | OTCMarket / blocksSummary | mes | Operaciones agregadas por categoría de tamaño y venue |
| Bloques Non-ATS | OTCMarket / otcBlocksSummary | mes | Operaciones agregadas por categoría de tamaño y empresa |

El informe diario FINRA Reg SHO O001-A (CNMS/FORF) mide **short-sale
volume**, no la misma población que weeklySummary. O001-B NO suma ambos.
Los bloques **son subconjuntos** del volumen negociado del período, no
un volumen adicional. Tampoco suma los totales de trading repetidos en
varias filas de umbral para la misma firma.

El informe semanal puede incluir una fila *De Minimis Firms*. Identifica
una agrupación de empresas bajo reglas de publicación, no un inversor
que pueda ser desanonimizado. Ni MPID, ni CRD ni firmName revelan quién
ordenó comprar o vender.

## Conectividad y autenticación

Consultar el Query API oficial requiere OAuth2 y credencial FINRA pública,
de firma o de organización. La categoría pública está disponible a
usuarios individuales conforme a sus términos, pero **no significa que
la consulta funcione sin credenciales**.

Fuente oficial:
https://developer.finra.org/docs
https://developer.finra.org/docs/api-explorer/query_api-equity-weekly_summary

Los secretos FINRA deben configurarse únicamente en el servidor:

    export FINRA_API_CLIENT_ID="ID_AUTORIZADO"
    export FINRA_API_CLIENT_SECRET="SECRETO_AUTORIZADO"

Nunca se escriben en el repositorio, logs o snapshots. El cliente solicita un
token a https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials
y consume https://api.finra.org/data/group/otcMarket/name/weeklySummary,
blocksSummary y otcBlocksSummary. Se usa OAuth single-flight, timeout,
tamaño límite, y respuestas HTTP !=200 son errores, no ceros.

## Cortes y retrasos

- weeklySummary se filtra por semana explícita, tier T1/T2/OTCE, símbolo
  y report type ATS_W_SMBL / OTC_W_SMBL. Las vistas de firma
  ATS_W_SMBL_FIRM / OTC_W_SMBL_FIRM permanecen separadas.
- FINRA divulga Tier 1 con al menos ~2 semanas de retraso, Tier 2 y OTCE
  con al menos ~4 semanas. Los registros aportan initialPublishedDate.
- Los bloques son **mensuales**, no semanales. Se mantienen por
  2K a menos de 10K acciones y 10K+, y se exige initialPublishedDate,
  mes coincidente y tiempo de captura posterior al dato publicado.
- El tiempo real conocido por Laplace es **su primera captura**:
  fechas originales de publicación tienen precisión de día,
  no certifican la hora intradía.
- El máximo de 300 registros por página (configurable hasta 1000),
  hasta 4 páginas semanales o 5 mensuales, impide consultas masivas
  por accidente. Si la paginación se agota sin probar su integridad,
  el adaptador NO convierte el fragmento en agregado.
- Los datos históricos editados o revisados posteriormente
  requieren preservar versiones/vintages, no retrotraer valores.

La API weeklySummary actualmente anuncia doce meses rodantes; para historia
anterior existe weeklySummaryHistoric con restricciones propias de
particiones y métodos, **todavía no integrado** en O001-B.

## Invocación manual

Desde Node >=20 con paquete del repositorio:

    npm run test:finra-o001b
    npm run finra:o001b -- --week=2026-09-28 --targets=AAPL:T1,SPY:T1 --out=registros/o001b-week.json
    npm run finra:o001b -- --month=2026-08-01 --out=registros/o001b-blocks.json

Ambos períodos en una solicitud:

    npm run finra:o001b -- --week=2026-09-28 --month=2026-08-01 --out=registros/o001b-completo.json

Nunca se sobrescribe un archivo existente. El archivo emitido tiene
hash, snapshots, reporte de cada fuente, estados faltantes, vistas por
firma y reconciliación de totales sin doble conteo.

Para integrar opcionalmente al snapshot U003 del servidor:

    LAPLACE_FINRA_WEEK_START=2026-09-28 LAPLACE_FINRA_MONTH_START=2026-08-01 node tools/laplace.mjs universo-global-u003

Sin configuración de fecha NO hay consultas. Con fechas pero sin credencial
la fuente se registra como "requires_credentials", no como observada.
I001/P001/Bitcoin no cambian. La APK Android no está incluida.

## Validación

Se exigen pruebas de OAuth, filtros por período, elección de tier,
aislamiento de segmento, autenticación ausente, registros futuros,
duplicados, paginación incompleta y no divulgación de secretos.
Los mocks no acreditan una captura financiera real ni mejora del precio
futuro. La primera prueba en producción requiere **credenciales válidas y
permiso de utilización de FINRA**, que no se proporcionan ni suponen aquí.

Los resultados son agregados y retrasados; no reconstruyen órdenes
secretas, contrapartes cliente, dark pools enteros ni toda la liquidez
estadounidense. El uso/redistribución está sujeto a los términos FINRA.
