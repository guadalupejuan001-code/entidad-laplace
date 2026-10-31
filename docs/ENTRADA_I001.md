# Entrada continua I001 de Laplace

Implementación del módulo investigado el 30 de octubre de 2026. El servidor Node
existente captura, valida, conserva y prepara observaciones. XI/Ether mantiene
su runtime original y recibe proyecciones numéricas por su contrato U002.

## Arranque instalado

Probado con Node 24.22.1. Desde la raíz del repositorio:

```sh
npm ci
npm run input:install
npm run laplace
```

`INICIAR_LAPLACE.cmd` instala las dependencias y arranca entrada y panel en
Windows. `INICIAR_ENTRADA.cmd` o `sh input/iniciar.sh` arrancan solo la entrada.
El panel está en `http://127.0.0.1:4179`; «Factores observados» muestra su estado.
`npm run input:status` lee el último resumen, incluyendo si el proceso se detuvo.
La operación continua dura mientras el proceso y el equipo permanezcan activos.
Esta sesión verifica una instalación de desarrollo; no instala servicios en el
equipo del usuario ni en un servidor externo.

La configuración local usa PostgreSQL embebido PGlite y habilita dos fuentes
públicas: ticker BTC/USD de Coinbase cada 10 segundos y RSS de comunicados de la
Reserva Federal cada minuto. No confundir esa frecuencia de consulta con la
frecuencia de publicación original. `npm run panel` conserva el panel aislado.

El instalador importa el P001 existente de BlackRock/JPMorgan, verifica su sello
y preserva sus identificadores: 15.787 entidades y 27.093 relaciones. Cada
registro importado conserva su versión. Las posiciones 13F no se convierten en
control societario. Los EX-21 no representan todas las filiales existentes.
El NLP reutiliza las identidades del registro para sus entidades vigiladas.

## Componentes

| Componente | Implementación y alcance |
| --- | --- |
| Concurrencia | Supervisor independiente por fuente; HTTP, WebSocket, webhook y RPC |
| Búfer | Cola limitada, grupos de escritura, WAL segmentado con SHA-256 y `fsync` antes del ACK |
| Transporte | KafkaJS, productor idempotente, `acks=all`; topics raw, clean, documents y quarantine |
| Persistencia | PostgreSQL; TimescaleDB activa hypertable sobre `known_at` en servidor |
| Efectos únicos | Tabla SQL global de claves y huellas semánticas; duplicado igual se ignora, conflicto se aísla |
| Publicación | Outbox SQL en la misma transacción que las observaciones; se reintenta después de caídas |
| Texto | RSS/Atom, HTML acotado, JSON documental y léxico ES/EN con entidades, negación e intención |
| Auditoría | Integridad y corroboración estructurada; conflictos de indicadores y procedencias; texto no verificado queda pendiente |
| On-chain | Bitcoin Core RPC; Ethereum RPC y `newHeads` como aviso; recuperación por bloques y retractación de reorganizaciones |
| Laplace | Exportación al diario histórico y lotes XI/Ether de hasta 1.024 estados |

RabbitMQ e InfluxDB eran alternativas evaluadas. El stack elegido utiliza Kafka
y PostgreSQL/TimescaleDB; no exige ejecutar mensajería o bases redundantes.

## Durabilidad, orden y recuperación

El sobre conserva identidad nativa, revisión, alcance del flujo, hora UTC de
recepción y bytes originales admitidos en base64 con hash. Los números JSON
externos se leen como cadenas, sin pasar por float64. Se distingue hora del
hecho, publicación y captura. Se mantiene la primera versión recibida de una
misma identidad/revisión; un contenido distinto con esa clave se pone en
cuarentena y exige una revisión explícita.

El WAL confirma después de sincronizar archivo y directorio. Se agrupan hasta
256 registros por escritura, con espera inicial configurable de 3 ms. Se
reconstruye al arrancar, solo se recorta una cola incompleta y se detiene ante
corrupción interior. El bloqueo impide dos escritores. Un bloqueo de un proceso
comprobablemente muerto en el mismo host se conserva como evidencia y se
recupera; cuando no se puede comprobar su ausencia, se exige inspección.

Tras el ACK de Kafka se guarda el cursor de entrega. Un crash entre ambos puede
repetir mensajes; la clave SQL evita repetir su efecto. El consumidor confirma
su offset después del commit SQL que incluye el outbox. Un crash después de
publicar y antes de marcar el outbox puede repetir un mensaje limpio; cualquier
consumidor externo también debe deduplicar por `event_key`. No se promete una
transacción global exactamente una vez entre Kafka, SQL y servicios externos.

La retención local predeterminada es 24 horas para segmentos cerrados ya
entregados. Los pendientes nunca se eliminan. El log Kafka propuesto retiene
siete días. El máximo local predeterminado es 4 GiB, la cola 32 MiB y el cuerpo
individual 2 MiB; al agotarse, se rechaza con presión de retorno, no con éxito
silencioso. Dimensionar y monitorizar estos límites según tasas y reparaciones
reales. Un disco no es un archivo histórico ilimitado.

La garantía cubre eventos admitidos dentro de este modelo de fallos. No asegura
recibir cada paquete que una fuente externa no entrega, ni sobrevivir a la
pérdida simultánea de todas las copias. Replicación Kafka no equivale a `fsync`
por mensaje. La prueba de un broker detenido tampoco mide ese escenario.

HTTP solo actualiza ETag/Last-Modified después de la admisión durable. WS emplea
heartbeat y cola limitada. El ticker de Coinbase recupera el estado más reciente
con REST; no reconstruye todas las operaciones ni un libro completo perdido.
Los huecos no se presentan como cobertura completa. El supervisor usa reintentos,
espera creciente, jitter operativo y aislamiento por fuente. El dato malformado
se conserva en cuarentena y el siguiente continúa. No se genera ni despliega
código reparador automáticamente.

## Texto, procedencia y auditoría

Se prefieren APIs y RSS oficiales. HTML/XML se limitan por tamaño y profundidad;
se rechazan DTD y entidades XML. Los documentos se conservan separados de las
interpretaciones NLP, que tienen versión, `processed_at`, `available_at` y hora
de conocimiento propia. Una interpretación hecha hoy no se retrofecha al día
del artículo. La captura de precios indica conocimiento de bytes en el
colector; para reproducir el retraso operacional del predictor también se deben
conservar sus propias lecturas y emisiones, como hace el diario de pronósticos.

El léxico pequeño reconoce los objetivos vigilados, términos positivos/negativos
y algunas intenciones o acciones declaradas. No resuelve sarcasmo, toda sintaxis
o todos los idiomas. «Acción reportada» sigue siendo una afirmación de su fuente.
Polaridad no significa probabilidad de precio. Las copias por contenido se
agrupan; el número de editores no acredita independencia ni opinión mundial.

`entrada auditar CONFIG DIRECTORIO CORTE_UTC SALIDA_NUEVA.json` compara indicadores
estructurados por entidad, métrica, periodo y unidad. Conserva revisiones y
procedencias; discrepancias simultáneas siguen visibles. Una mayoría de textos
repetidos no valida un hecho. Verificar afirmaciones libres requiere evidencia
primaria y una extracción específica todavía no implementada como verificador
general de noticias. Ningún hash, voto o confianza de extracción prueba veracidad.

## Activar conexiones adicionales

Copiar `input/config.local.json`, editar y usar:

```sh
node tools/laplace.mjs entrada iniciar CONFIG.json DIRECTORIO
```

El WebSocket Coinbase, webhook macro y los dos nodos blockchain se instalan
deshabilitados. Requieren configuración concreta, y los RPC que autentican,
credenciales del operador. No se inventan claves ni se instala una cadena
completa como parte de esta sesión. Elegir explícitamente una altura inicial
adecuada; `0` supondría un recorrido desde génesis.

Un webhook configura `transport:webhook`, adaptador y `secret_env` (al menos
24 caracteres). POST a `/webhook/ID_CODIFICADO` con `x-delivery-id`,
`x-laplace-timestamp` (Unix, segundos o milisegundos) y
`x-laplace-signature: sha256=HEX`. El HMAC-SHA256 firma `timestamp + '.' + bytes`.
Se limita la antigüedad a cinco minutos. HTTP 202 significa admisión durable;
la validación semántica puede ponerlo después en cuarentena. HTTP 503 exige
reintentar. `macro_json` requiere `id`, `revision`, `series_id`, `observed_at`,
`unit` y `value` como cadena decimal; `published_at` es opcional.

Los secretos solo se referencian con `headers_env`, `secret_env` y variables de
entorno; no se escriben en el manifiesto ni se imprimen en salud. El webhook es
por defecto local. Cualquier publicación externa requiere un despliegue de red
con autenticación y TLS acorde al operador.

Bitcoin comprueba la red mediante `getblockchaininfo`, sigue hashes de bloques
y procesa salidas con dirección. Orígenes, cambio y pagos internos no resueltos
permanecen explícitos; una salida a una dirección etiquetada no acredita una
entrada neta o venta. La finalización por confirmaciones es probabilística.

Ethereum comprueba `eth_chainId`, procesa transferencias nativas directas y
logs ERC-20 de contratos configurados. No cubre trazas internas. Se distingue
el evento ERC-721 que comparte firma. Se conservan uint256 exactos y decimales
desconocidos como desconocidos. `eth_getLogs` consulta el hash concreto del
bloque. El canal WS solo despierta al lector RPC; no aporta replay histórico.

El cursor guarda hasta 32 cabeceras por defecto (2..64 configurables). Tras una
desconexión se busca el ancestro, se retractan bloques y se lee la nueva rama.
Un reorg fuera de esa ventana o conflicto con finalización de Ethereum aísla la
fuente y exige revisar el nodo y reanudar desde un ancestro elegido. Los lotes
grandes se dividen antes de emitir el manifiesto canónico del bloque. Se
conserva una proyección RPC filtrada y huellas de las respuestas, no cada byte
de toda la cadena. Las etiquetas públicas son fechadas e inciertas; se excluyen
movimientos internos conocidos y no se atribuye una identidad desconocida.

## Kafka y TimescaleDB en un servidor

`input/compose.yml` configura tres nodos Kafka 4.1.2 y TimescaleDB 2.22.1 con
PostgreSQL 17, imágenes fijadas por digest. Configura una contraseña URL-safe,
por ejemplo hexadecimal, en `LAPLACE_DB_PASSWORD`, y ejecuta desde la raíz:

```sh
docker compose -f input/compose.yml up --build -d
```

El instalador crea esquema, hypertable y topics con réplica 3/minISR 2. Las
claves globales viven fuera del hypertable; su índice único temporal incluye
`known_at`. Kafka/SQL no se publican en puertos externos; la API se liga al
loopback del host. El tráfico Kafka del ejemplo queda en una red Docker privada.
Para separar hosts, configurar TLS/SASL y la red del operador.

En `mode:kafka`, `role:collector` usa WAL y broker sin depender de SQL;
`role:processor` consume sin abrir fuentes y `all` reúne ambos. Múltiples
procesadores pueden usar PostgreSQL servidor. PGlite permite un solo proceso
por directorio, con bloqueo propio: detener el servicio antes de exportaciones
offline o emplear PostgreSQL servidor para acceso concurrente.

En esta sesión se descargó y verificó Kafka 4.1.2 oficial y se ejecutaron tres
brokers nativos con Java 17. El stack Docker/TimescaleDB no se ejecutó porque
el entorno no dispone de Docker y no permite el usuario separado de PostgreSQL.
La configuración de ese despliegue está preparada; no se declara instalado en
producción ni se sustituye Timescale por PGlite al reportar resultados.

## Entrenamiento y puente XI

Detener primero el servicio si se utiliza la base embebida:

```sh
node tools/laplace.mjs entrada exportar input/config.local.json registros/input CORTE_UTC hechos-nuevos.jsonl
node tools/laplace.mjs validar hechos-nuevos.jsonl
node tools/laplace.mjs entrada verificar-xi input/config.local.json registros/input CORTE_UTC RUTA_XI PRUEBA_NUEVA
```

El corte consulta como máximo los 10.000 eventos más recientes anteriores al
corte; las exportaciones no prometen toda la historia. Se informa lo excluido
por el contrato histórico. Preparar hechos no entrena ni activa un predictor.
Ningún nuevo flujo altera automáticamente los pronósticos ya emitidos.

Los lotes numéricos usan enteros escalados que caben exactamente en float64.
Texto, evidencias y cantidades mayores siguen en el host. La prueba compara
bytes en Inverse Ether Memory del runtime original. 1.024 estados ocupan
32.784 bytes (16 + 32 por estado), dentro del límite de materialización de
65.536 bytes verificado para ese runtime. El puente por procesos y `mem_store`
no demuestra una entrada nativa de alta velocidad ni aloja el grafo completo.

`entrada reproducir CONFIG DIRECTORIO_WAL SALIDA_NUEVA` reconstruye la
normalización en una base nueva, conserva capturas y señala prefijos vencidos.
No inventa las antiguas horas de ejecución NLP. Las interpretaciones originales
y pronósticos se conservan en sus registros, no se reescriben con conocimiento
posterior.

## Validación y medidas

```sh
MUNDO_X_QUANTUM=RUTA_XI npm run test:input
node tools/benchmark-entrada.mjs MEDIDA_NUEVA.json
```

La evidencia de esta instalación está en `evidencia/input-20261030/`:

- Pruebas I001: exactitud decimal, revisiones, WAL/rotación/corrupción, capacidad,
  deduplicación, outbox, datos venenosos, parser, negación, HMAC, reorg Bitcoin,
  ERC20/721 Ethereum, partes grandes y lectura nativa XI.
- Tres brokers reales: 12 eventos macro únicos, una entrega repetida, un
  documento y su interpretación por otro consumidor; después de detener un
  broker se incorporó otro evento. Se inyectaron dos fallas transitorias de
  almacenamiento y el consumidor se recuperó. Resultado: 15 eventos y outbox vacío.
- Captura pública: Coinbase y 20 comunicados Fed, interpretaciones separadas,
  exportación de hechos y roundtrip nativo. No son entrenamiento de precisión.
- Un experimento de admisión WAL con 5.000 eventos sintéticos, cuerpos de
  400 bytes y concurrencia 128 midió 4.957 eventos/s y p99 de 47,6 ms en este
  entorno temporal. Incluye `fsync`; excluye Kafka, SQL, NLP y la red de la
  fuente. Es una medición puntual de desarrollo, no un SLO ni capacidad global.

La prueba de Kafka se reproduce con Java 17 y una distribución oficial 4.1.2:
`KAFKA_HOME=RUTA_KAFKA node auditoria/input-kafka.mjs RESULTADO_NUEVO.json`.
Cada ejecución crea un directorio de datos nuevo; no reutiliza directorios de
brokers en ejecución. Los tres procesos de esta prueba comparten un host;
no representan tres máquinas con fallos independientes.

El diseño inicial propuso objetivos a medir; no se ha acreditado aún el p99 de
la ruta completa ni cientos de miles de eventos por segundo. La operación de
producción necesita pruebas de carga sostenida, dimensionamiento de discos,
ventanas reales de replay y ejercicios de pérdida de nodos de almacenamiento.

## Fuentes técnicas primarias

- [Kafka 4.1: diseño](https://kafka.apache.org/41/design/design/) y
  [KafkaJS: producción](https://kafka.js.org/docs/producing).
- [Distribución Kafka 4.1.2](https://downloads.apache.org/kafka/4.1.2/).
- [Timescale: claves únicas](https://www.tigerdata.com/docs/build/performance-optimization/hypertables-and-unique-indexes).
- [PGlite](https://pglite.dev/docs/) y [PostgreSQL: aislamiento](https://www.postgresql.org/docs/current/transaction-iso.html).
- [Coinbase: canales](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels).
- [Reserva Federal: RSS](https://www.federalreserve.gov/feeds/feeds.htm).
- [Bitcoin Core: RPC](https://bitcoincore.org/en/doc/) y [Ethereum: JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/).
- [Geth: suscripciones](https://geth.ethereum.org/docs/interacting-with-geth/rpc/pubsub),
  [ERC-20](https://eips.ethereum.org/EIPS/eip-20), [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
