# U002 — expansión global de LAPLACE

## Objetivo

U002 amplía LAPLACE desde unas pocas señales de BTC a una captura mundial
multidominio. La meta no es declarar que "todo el planeta" está observado,
sino construir una malla amplia, fechada y extensible que pueda materializarse
en XI / Inverse Ether Memory sin perder procedencia.

Ruta:

```
fuentes públicas
  -> observaciones numéricas con observed_at / known_at
  -> universeSnapshot
  -> codificación compacta U002
  -> XI
  -> Inverse Ether Memory
```

Las señales nuevas **no entran automáticamente al predictor de precio**.
Primero deben acumular historia punto-en-tiempo y superar controles fuera de
muestra. Así se evita convertir correlaciones accidentales en "causas".

## Cobertura inicial

El catálogo inicial contiene **369 posiciones de señal nominales**:

- Mercados globales: índices/ETF de EE.UU. y regiones internacionales,
  volatilidad, divisas, bonos, crédito, metales, energía y grandes empresas.
  Cada instrumento aporta cierre, retorno de 5 minutos, retorno de 30 minutos
  y volumen relativo.
- Cripto: BTC, ETH, SOL, XRP y ADA contra USD.
- Macro: crecimiento, inflación, desempleo y cuenta corriente para mundo,
  EE.UU., China, Japón, Alemania, India, Brasil y Reino Unido.
- Clima: malla de 40 celdas mundiales (5 latitudes × 8 longitudes), con
  temperatura, presión superficial, viento y precipitación: 160 estados.
- Física: actividad sísmica global y por ocho sectores geográficos, más Kp
  geomagnético planetario.

La captura conserva fallos por fuente. Una fuente caída no se convierte en cero
ni se rellena con un valor inventado.

## Fuentes

- Series de mercado: Yahoo Finance chart endpoint utilizado por el laboratorio
  B001.
- Cripto: Coinbase Exchange REST.
- Macro: World Bank Indicators API.
- Clima: Open-Meteo (la licencia/plan aplicable debe revisarse antes de uso
  comercial; U002 conserva la URL de cada lectura).
- Sismos: USGS GeoJSON feed de las últimas 24 horas.
- Geomagnetismo: NOAA SWPC Kp.

## Memoria Ether

`universo/ether-global.mjs` transforma cada estado en un registro de 32 bytes:

- 8 bytes: hash truncado de identidad + dominio + variable + unidad.
- 8 bytes: valor Float64.
- 8 bytes: tiempo observado en milisegundos.
- 8 bytes: tiempo conocido en milisegundos.

Se añade una cabecera de 16 bytes. XI escribe únicamente bytes no nulos en una
región lógica dedicada de Inverse Ether Memory y luego materializa la región
completa para comprobar equivalencia exacta. El manifiesto host conserva el
diccionario completo de ids y variables.

Esto es almacenamiento y transporte de estado real dentro de la arquitectura;
no implica que las observaciones sean "qubits" ni que ya exista una ley causal
universal.

## Comandos

```bash
node tools/laplace.mjs universo-global captura-u002.json
node tools/laplace.mjs verificar-universo-global captura-u002.json RUTA_MUNDO_X_QUANTUM
```

## Reglas

1. Toda cifra debe tener fuente HTTPS, `observed_at` y `known_at`.
2. Datos posteriores al corte se excluyen.
3. No se inventa una señal cuando una fuente falla.
4. No se crea una relación causal por el solo hecho de recopilar dos variables.
5. Máximo actual por snapshot: 4096 estados. Si la malla supera ese tamaño se
   particiona; no se descartan silenciosamente señales.
6. U002 no ejecuta órdenes financieras.
7. La promoción de una señal a predictor exige historia y prueba temporal
   reservada.

## Escalado

El catálogo está separado de los colectores. Para añadir un nuevo rincón,
mercado o dominio no hay que cambiar el contrato de estados ni Ether: se agrega
una entrada al catálogo o un colector que produzca observaciones válidas.

U002 es, por tanto, una expansión amplia y medible; **no una afirmación de
omnisciencia**.
