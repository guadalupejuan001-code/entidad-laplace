# K001 — Blockchain y DeFi: observación pública de estados

**Plan:** penúltimo ciclo; **V001 es el último** (validación predictiva y
auditoría final). No se trata de una billetera, exchange, robot de
negociación, sistema de desanonimización ni acceso a dinero privado.

**Validación verificada en GitHub Actions (31-oct-2026):**
[119/119 pruebas Node aprobadas](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41176213081)
(20 K001 y 99 regresiones). La captura pública real devolvió **16 señales**:
Bitcoin 5, Ethereum 6, TVL por cadena 3 y stablecoins 2; **4/4 fuentes
observadas**, ninguna ausente. Esta captura valida la conectividad de
esos endpoints, no cobertura DeFi mundial ni precisión financiera.

## Módulos implementados

| Submódulo | Fuente pública | Métricas | Qué no representa |
| --- | --- | --- | --- |
| Bitcoin | Blockstream Esplora `GET /api/blocks` | Altura confirmada, transacciones por bloque, tamaño, peso y dificultad | No es volumen financiero en USD, flujos de exchanges ni identidad |
| Ethereum | `https://ethereum-rpc.publicnode.com` Ethereum JSON-RPC | Último bloque reportado como finalized, gas usado/límite, uso del gas, transacciones y base fee | No es volumen de ETH ni balance de cuentas |
| DeFi | DefiLlama `GET /v2/chains` | TVL por cadena Ethereum, Arbitrum y Base | TVL no es ingreso de capital; no se suma entre cadenas como dinero único |
| Stablecoins | DefiLlama `GET /stablecoins?includePrices=true` | Suministro circulante reportado de USDT y USDC, por emisor | La diferencia entre capturas no demuestra emisiones/retiros verificados |
| Puentes | `universo/cripto/puentes.mjs` (sin feed) | Reconciliación determinista de eventos ya verificados con mismo message ID y monto | No es un feed activo ni identifica usuarios |

### Anonimato y seguridad

**No se recogen direcciones, nombres de usuarios, balances personales
ni claves.** Ethereum devuelve hashes públicos de transacciones en la
respuesta de bloques: K001 los valida para contar transacciones y NO
los guarda en resultados. Bitcoin consulta solamente el resumen de
bloques de Esplora, sin transacciones individuales ni direcciones.

Los usuarios de Bitcoin/Ethereum pueden usar pseudónimos. Este módulo no
afirma quién controla una dirección. Las transacciones blindadas o
anónimas de otras redes no son recuperables por cálculo a partir de
datos que no fueron publicados. Tampoco se intenta eludir protecciones.

### Finalidad y marcas temporales

- Bitcoin: utiliza el **sexto bloque desde la punta** de una secuencia
  contigua de bloques públicos (seis confirmaciones en ese instante).
  Es una **heurística**, no garantía absoluta contra reorganizaciones.
- Ethereum: pide `eth_chainId` (debe ser mainnet `0x1`) y
  `eth_getBlockByNumber("finalized",false)`. La finalidad se
  atribuye a la respuesta del proveedor RPC; no es prueba de consenso
  independiente.
- DeFiLlama: las capturas de TVL y suministro no incluyen un timestamp
  oficial por punto. Se usa `known_at = first_seen_by_laplace`
  y `observed_at = known_at`. Nunca se retrocede esa información
  para backtesting.
- Los cuatro grupos se capturan **concurrentemente**, cada uno
  registra su estado, hash SHA-256 y posible error. Una respuesta
  429/403 o una cadena ausente se guarda como faltante, no como
  cero actividad.
- Los números de distintas redes y tokens **no se suman** como liquidez
  neta mundial. Un bloqueo en Ethereum y una emisión equivalente en
  Base pueden ser dos patas del mismo traslado, no creación neta.

### Reconciliador de puentes

`reconcileBridgePairs` acepta únicamente objetos públicos previamente
comprobados con `message_id`, clase de evento `lock/mint/burn/release`,
cadena, activo, cantidad exacta en unidades crudas, decimales,
fuente, finality declarada, fecha del hecho y fecha de conocimiento.

Un par `lock + mint` o `burn + release` por igual `message_id`,
unidad y monto se identifica como **reubicación de activos, no
nueva emisión global**. Mensajes sin pareja, duplicados, pendientes
o con cantidades distintas quedan `pending`. La prueba de procedencia
de cada evento sigue siendo responsabilidad de un futuro adaptador
autorizado. **No existe conexión a puentes vivos en K001.**

## Uso

```bash
npm ci
npm run test:blockchain
npm run blockchain:k001 -- --out=registros/k001/captura-publica.json
npm run blockchain:k001 -- --groups=bitcoin,defi --out=registros/k001/btc-defi.json
```

Si las fuentes están disponibles, se guarda captura con U001,
SHA-256, metadatos públicos y fuente faltante. La ruta nunca se
sobrescribe y, cuando todas fallan, se rechaza en vez de crear un
resultado ficticio.

Para añadir a una captura U003 **solo cuando se solicite**:

```bash
LAPLACE_K001_ENABLED=true node tools/laplace.mjs universo-global-u003
```

K001 no modifica el cálculo de precio central F001, ni envía órdenes,
ni requiere/guarda contraseñas, datos bancarios o una cuenta conectada.

## Fuentes y límites

- [Blockstream Esplora: API de bloques](https://github.com/Blockstream/esplora/blob/master/API.md).
- [Ethereum: JSON-RPC y tag finalized](https://ethereum.org/en/developers/docs/apis/json-rpc/).
- [DefiLlama: API gratis de TVL y stablecoins](https://api-docs.defillama.com/).
- [DefiLlama: código y documentación del API](https://github.com/DefiLlama/api-docs).

Los proveedores y sus licencias, tiempos de indexación, cobertura
y permisos de redistribución pueden cambiar. Esta implementación
no resuelve DeFi mundial completo, DEX swaps individuales, costes
de bridges, transacciones privadas, reservas auditadas de emisores,
etiquetas de exchange verificadas, ni un índice confiable de
**flujo neto mundial de capital**.

## Validación y continuación

Las pruebas de K001 usan fixtures para rechazo de cadenas ajenas,
BTC seis confirmaciones, Ethereum finalized, finitud de cantidades,
TVL/no-flujo, suministro no-verificado, duplicados y
reconciliación de dos patas. El workflow `.github/workflows/k001.yml`
ejecuta también los anteriores B001/C001/D002/D001/O001/F001/U003
y un smoke real no bloqueante para documentar restricciones regionales
o fallos de proveedor.

**Siguiente y ÚLTIMO ciclo: V001.** Hará inventario de todas las
fuentes, capturas punto-en-tiempo, datos ausentes y evalución fuera de
muestra contra persistencia, con ablación por familia de señales.
El último ciclo puede detectar tareas adicionales pendientes;
no implica que una red o el mundo entero sean observables.
