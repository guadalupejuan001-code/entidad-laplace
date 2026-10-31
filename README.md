# Entidad Laplace

Repositorio independiente del programa experimental Laplace: estados, señales, evolución temporal, cálculo y comprobación de pronósticos.

**Estado:** investigación y desarrollo; los modelos financieros no garantizan precisión ni beneficios. Consulte [MIGRACION.md](MIGRACION.md) para conocer la procedencia de cada componente.

---

## V001 — Validación final del plan (auditoría completada)

**Último ciclo de la hoja de ruta de datos financieros O001→V001.**
La ingeniería de validación reproduce y comprueba hashes reales del
diario M001 y la captura U003, evalúa cada precio con la misma referencia
de persistencia, verifica `known_at` y prohíbe usar etiquetas o señales
capturadas después de decidir.

**Resultados reales:** [154/154 tests del contrato V001 y regresiones](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41176921579),
y [409/409 pruebas completas con XI/Ether y REVERSE-PC compilados](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41177189639),
**0 fallos, 0 omitidas**.
En la muestra archivada hubo 15 pronósticos M001, 8 resultados y
2 aciertos de dirección. El **MAE de M001 fue 529,55 USD**, frente a
**504,96 USD de persistencia** (skill **−4,87 %**, no ventaja demostrada).
En un snapshot del 30 de octubre se comprobaron 563 estados U003;
eso NO incluye automáticamente las posteriores fuentes financieras.

**Estado de producción: NO GO.** F001 usa el mundo solo para ensanchar
una banda exploratoria y no modifica el precio central. Aún NO existen
parejas prospectivas congeladas de mundo/no-mundo con historial de
fuentes disponible al corte. No hay evidencia de beneficio estadístico
ni trading automático.

```bash
npm run test:v001
npm run validar:v001 -- --out=registros/v001/auditoria-final.json
```

[Informe completo y pendientes](docs/VALIDACION_V001_FINAL.md).

---

## K001 — Blockchain y DeFi (penúltimo ciclo, verificado)

Cuatro fuentes públicas concurrentes: bloques Bitcoin Esplora, último bloque
Ethereum `finalized`, TVL DeFiLlama (Ethereum/Arbitrum/Base) y suministro
USDT/USDC por emisor. Las dos patas de un bridge no se cuentan como
creación de capital; las identidades privadas NO se investigan.

**GitHub Actions:** [119/119 pruebas Node y 16 señales reales de 4/4 fuentes](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41176213081).
Las métricas son stocks/resúmenes públicos, no entradas netas de capital
ni un predictor financiero validado.

```bash
npm run test:blockchain
npm run blockchain:k001 -- --out=registros/k001/primera-captura.json
LAPLACE_K001_ENABLED=true node tools/laplace.mjs universo-global-u003
```

[Documentación técnica K001](docs/BLOCKCHAIN_DEFI_K001.md).

**Siguiente y último ciclo del plan: V001 — validación predictiva.**

---

## B001 — Banca internacional BIS (piloto verificado)

El módulo `universo/banca/` consulta cuatro series trimestrales de
**LBS/CBS** con metodología y consolidación diferentes. El parser preserva
unidad USD en millones, población, país, corte temporal y hash de fuente.
**No suma LBS con CBS ni infiere flujo instantáneo a partir de stocks.**

Prueba GitHub Actions del 31-oct-2026:
[99/99 tests Node aprobados y 32 estados BIS públicos de cuatro series](https://github.com/guadalupejuan001-code/entidad-laplace/actions/runs/41175476309).
Esto verifica el piloto, no todo el sistema financiero mundial ni precisión
predictiva.

```bash
npm run test:banca
npm run banca:b001 -- --out=registros/banca/bis.json
LAPLACE_B001_ENABLED=true node tools/laplace.mjs universo-global-u003
```

[Documentación B001](docs/BANCA_BIS_B001.md).

---

## C001 — Flujos públicos de fondos (experimental)

Nuevo módulo separado `universo/fondos/`: extracción de informes SEC
NPORT-P/NPORT-P/A de SPY y SPYM, sumas exactas en centavos y
`known_at` para capturas reproducibles. No confundir flujos N-PORT con
creaciones diarias de ETF ni con variaciones de precio. IBIT utiliza
10-Q/10-K y queda pendiente de un adaptador específico.

```bash
npm run test:fondos
# Solo con un User-Agent SEC identificable y contacto real en el entorno:
SEC_USER_AGENT="Organizacion contacto@dominio.org" npm run fondos:c001 -- --out=registros/etf/c001.json
```

C001 y D002 ya superaron pruebas Node en la rama de integración. D002
capturó 150 señales de la CFTC; la descarga SEC real de C001 sigue pendiente.
La incidencia histórica de Actions #6 no impide las ejecuciones actuales.
[Diseño y límites de C001](docs/ETF_FONDOS_C001.md).
[Swaps públicos D002](docs/SWAPS_OTC_D002.md).

---

# LaPlaceDIG

## X002 — entrenamiento y recalibración verificables

Cinco horizontes BTC (15/30/60/240/1440 minutos), cuatro particiones temporales,
conteos y probabilidades en el ejecutor nativo XI/Ether, calibración escalar
clásica y comparación con M001/persistencia. Conserva modelos, predicciones,
resultados y respuestas HTTP por hash. [Método y límites](docs/ENTRENAMIENTO_X002.md).

```bash
npm run entrenar -- RUTA_LAPLACE_TEMPORAL DIRECTORIO_NUEVO
```

## U004 — capital y liquidez

Primera fase del proyecto de fuentes financieras: COT de siete mercados,
curva Treasury diaria y componentes Fed/TGA/ON RRP de EE. UU. La recopilación
entra en U003 y en el diario de revisiones; la integración predictiva permanece
pendiente. [Alcance, fuentes y pendientes](docs/CAPITAL_U004.md).

```bash
npm run capital -- registros/capital-u004
```

## U003 — mundo económico, logístico y de información

U003 extiende U002/369 por **dominios reales**, no por un contador fijo:
benchmarks regionales, futuros de commodities, tasas BIS de bancos centrales,
empleo BLS/FRED, vintages macro ALFRED opcionales, electricidad NESO,
transporte marítimo PortWatch, noticias geolocalizadas GDELT y adaptadores
autorizados para OpenSky/JPX. Las fuentes con credenciales o licencia faltante
se marcan explícitamente y no se sustituyen por datos ficticios.

La revisión de fuentes primarias agrega TWSE diario, una muestra pública de B3,
IMOEX/MOEX, contratos MOEX de commodities con vencimiento y tasas directas de
Canadá/Brasil/BCE. ALFRED conserva el día del vintage separado del instante de
recepción: no se inventan horas de publicación. La captura manual
`npm run fuentes:oficiales -- DIRECTORIO` archiva respuestas originales por hash.

GDACS añade alertas oficiales de desastres con coordenadas y fechas separadas
de su recepción; la falta de GDELT queda declarada por tema. El diario
`universo/vintages-macro.mjs` conserva cambios de valores macro sin sobrescribir
versiones previas y permite reconstruir un corte temporal. El registro U003
recupera ese diario en cada ciclo antes de añadir nuevas observaciones.

```
node tools/laplace.mjs universo-global-u003 captura-u003.json
node tools/laplace.mjs verificar-universo-global captura-u003.json RUTA_MUNDO_X_QUANTUM
```

[Diseño, cobertura y reglas temporales](docs/UNIVERSO_U003_REAL_WORLD.md).

## U002 — expansión global de estados hacia XI/Ether

LAPLACE incorpora una malla mundial extensible de señales observables: mercados
regionales, divisas, bonos/crédito, materias primas, grandes acciones, cripto,
macro de varias economías, 40 celdas meteorológicas mundiales, actividad sísmica
por sectores y geomagnetismo. El presupuesto nominal inicial es de **369 estados**
por captura y permanece bajo el contrato de 4096 estados.

Cada señal conserva fuente HTTPS, `observed_at` y `known_at`. La captura puede
materializarse exactamente en **Inverse Ether Memory mediante XI**; esto no crea
qubits implícitos ni promueve automáticamente las variables a predictor.

```
node tools/laplace.mjs universo-global captura-u002.json
node tools/laplace.mjs verificar-universo-global captura-u002.json RUTA_MUNDO_X_QUANTUM
```

[Arquitectura, cobertura y límites](docs/UNIVERSO_U002_GLOBAL.md).

## Panel LAPLACE en español — lectura real, sin maqueta

El panel local ejecutable permite ver cotización, trayectoria de velas realmente recuperadas, proyección I015 a 15 minutos, mediciones de U001 (libro L2, operaciones, mercados relacionados, NOAA), historial de capturas registradas y resultados de validación. El diseño no muestra cifras de demostración; si falla una fuente, conserva la última captura e indica que es histórica. No ejecuta operaciones y no implica integración nativa automática con la APK de REVERSE-PC.

    npm run panel

Abre http://127.0.0.1:4179 en el mismo equipo y pulsa «Actualizar lectura». Pruebas: npm run test:panel. [Arquitectura y límites del panel](docs/PANEL_LAPLACE_ES.md).



## U001 — Observatorio universal de estados y causas hipoteticas

Nueva capa transversal para registrar mediciones de **cualquier dominio** con marcas de ocurrencia y disponibilidad, memoria compacta (hasta 4096 estados por consulta), conteos historicos y relaciones de precedencia/hipotesis. Adaptador BTC: conserva I015 de quince minutos y mide libro de ordenes, trades y precios relacionados en Coinbase, mas indice geomagnetico Kp de NOAA como dominio fisico separado (sin atribuir causalidad al mercado). La prediccion no se recalibra automaticamente con esos datos; sin validacion temporal son observaciones, no causas demostradas.

Comandos: `node tools/laplace.mjs universo-btc-15m` y `node tools/laplace.mjs universo-corte estados.json CORTE_UTC`. [Arquitectura, limites y pruebas](docs/UNIVERSO_U001.md). No equivale a observar el universo entero.


## I015 — Instrumento BTC en 15 minutos

Cotización BTC/USD y velas cerradas de Coinbase, estado de momentum, rango, volatilidad y actividad; comparación de trayectorias observadas, proyección determinista 15 minutos y backtest walk-forward. Solo promueve la estimación condicional si mejora la persistencia en la prueba reciente. Si no mejora, muestra el precio observado como referencia. **Sin Monte Carlo, sin precio futuro inventado, sin órdenes ni pretensión de predicción exacta.** El módulo estadístico JS es una capa de medición y no sustituye XI/Ether.

Comando: `node tools/laplace.mjs bitcoin-15m` · [Documentación y ecuaciones](docs/BITCOIN_INTRADIA_I015.md).


## C001 — memoria de eventos y trayectorias del mercado BTC/USD

Se incorporó un observador de acontecimientos que cuenta repeticiones históricas, compara retornos posteriores con ventanas de control, respeta la primera fecha de disponibilidad de cada dato y ejecuta una reproducción histórica sin acceder al futuro. Cuando falta evidencia suficiente, se abstiene; no demuestra causalidad ni capacidad de operar con beneficio. Es una capa estadística complementaria: **no sustituye XI/Ether**, ni activa el predictor en vivo.

[Contrato, comandos y límites](docs/BITCOIN_CAUSAL_C001.md).


## P005 — desafío exabyte de evolución exacta sobre XI/Ether

**Cálculo verificado:** un anillo de 2^60 celdas binarias (1,15 exabytes a un byte por celda, 144 petabytes si se almacena un bit por celda) evolucionó **1 125 891 316 776 447 generaciones lógicas**, con reglas de evolución local XOR (Regla 90), sin asignar un campo físico denso ni iterar cada generación.

XI calculó la **población global exacta de 2 251 799 813 685 248 celdas activas**, y 224 consultas: 112 celdas encendidas y 112 apagadas. Las 224 coincidieron con una referencia matemática independiente y las siete pruebas nativas se aprobaron, incluida comparación contra simulación densa real en dominios pequeños.

El ejecutor REVERSE-PC utilizó **5632 KiB de RAM física de pico mediano** (5,50 MiB, Linux), y 1426 excepciones clásicas en Inverse Ether Memory. No significa que el campo completo estuviera en RAM. Un ordenador clásico con el mismo atajo algebraico podría resolverlo también; esto comprueba la **ventaja del cálculo bajo demanda respecto al recorrido denso ingenuo**.

[Diseño y prueba](docs/EXABYTE_P005.md) · [Mediciones y resultados](docs/EXABYTE_P005_RESULTADOS.md)

    node tools/exabyte.mjs ejemplo Exabyte-P005.xi manifiesto.json
    reverse_pc compile Exabyte-P005.xi Exabyte-P005.rxe
    reverse_pc init inicio.rvp
    reverse_pc run Exabyte-P005.rxe inicio.rvp resultado.rvp

También está integrado el comando crear-exabyte en la CLI principal de LAPLACE. E005, P001–P004 y Bitcoin no se sustituyen.

---


## P004 — singularidad clásica del Big Bang como límite computable

**Nuevo laboratorio XI/Ether:** extrapola un universo FLRW plano dominado por radiación hacia a→0+, calculando H(a), temperatura, densidad local de energía, tiempo radiativo aproximado y curvatura de Kretschmann. Registra cada escala como **mantisa × exponente** y marca la primera época con tiempo formal inferior al tiempo de Planck (aproximadamente entre a=10^-31 y a=10^-32).

- **51 épocas** de a=10^-30 a=10^-80, sin intentar materializar infinitos numéricos ni enumerar todas las partículas.
- **4896 bytes lógicos** de registros físicos codificados en la memoria inversa de Ether; la RAM real de REVERSE-PC se mide por separado.
- Se preserva la historia cosmológica P003 en **el mismo snapshot RVPC2**, y se comprueba posteriormente que sus 33 épocas originales permanecen intactas.
- Tests del límite matemático H∼a^-2, energía∼a^-4, curvatura K∼a^-8, temperatura∼a^-1, tiempo∼a², integridad RXE y lectura persistente.
- Ejecuciones extremas de múltiples rangos con comparación independiente de las mismas ecuaciones.

[Fundamentos, documentación y límites de física conocida](docs/COSMOLOGIA_P004_SINGULARIDAD.md). **[Resultados nativos verificados](docs/COSMOLOGIA_P004_RESULTADOS.md): 8/8 pruebas, 128/128 campañas, 3892 estados, primera frontera sub-Planck en a=10^-32; P003 conservado íntegro en Ether.**

    node tools/singularidad.mjs ejemplo singularidad.xi
    reverse_pc compile singularidad.xi Laplace-P004.rxe
    reverse_pc init inicio.rvp
    reverse_pc run Laplace-P004.rxe inicio.rvp resultado.rvp

También está integrado el comando crear-singularidad en tools/laplace.mjs.

**Advertencia científica esencial:** La singularidad clásica **no es una época física cuyo estado hayamos reconstruido**. A=0 no se ejecuta ni devuelve una densidad finita o infinita como dato medido. Los valores por debajo de la escala de Planck son una extrapolación matemática de una teoría fuera de su dominio validado; no demuestran inflación, gravedad cuántica ni que el universo comenzó con un punto físico infinitamente denso.

---


## P003 — expansión del universo temprano y densidad de energía con XI/Ether

**Nuevo experimento cosmológico sobre leyes generales:** LAPLACE calcula la expansión de un universo homogéneo plano ΛCDM, con radiación, materia y energía oscura. Utiliza la ecuación de Friedmann, una representación científica de mantisa/exponente en XI Machine y estados compactos persistidos en Inverse Ether Memory.

- **Escala física cubierta:** 33 épocas desde a=10^-30 hasta el valor actual a=1, incluidos los puntos a=3×10^-4 (transición radiación/materia) y a=9×10^-4 (temperatura cercana a 3000 K).
- **Observables:** H(a), temperatura T(a), densidad energética J/m³, tiempo de Hubble 1/H y participaciones de radiación/materia/vacío. Cada valor procede del cálculo nativo XI, no de resultados precalculados en JavaScript.
- **Estados mínimos:** 27 bytes lógicos por época: **891 bytes** para 33 épocas de referencia o **7317 bytes** para 271 épocas de alta resolución. La RAM física del proceso es mayor.
- **Validación:** tests independientes de Friedmann, lectura completa desde Ether, equivalencia RXE/XI, variación de parámetros y campaña extrema de **1024 universos**, más comprobación nativa del modo fino.

[Descripción técnica, ecuaciones y límites](docs/COSMOLOGIA_P003.md)

Para generar el nuevo ejecutable:

    node tools/cosmos.mjs universo universo.xi
    node tools/cosmos.mjs fino universo-fino.xi
    reverse_pc compile universo.xi LAPLACE-Cosmos-P003.rxe
    reverse_pc init universo-inicial.rvp
    reverse_pc run LAPLACE-Cosmos-P003.rxe universo-inicial.rvp universo-final.rvp

También existe el comando `node tools/laplace.mjs crear-cosmos parametros.json salida.xi`.

**Limitación esencial:** se simula el fondo cosmológico y una extrapolación muy temprana, no la singularidad inicial del Big Bang, la gravedad cuántica, inflación, formación de partículas ni la aparición de galaxias. La densidad energética local no es energía total global del universo.

---


## P002 — Gravedad y acercamientos de tres cuerpos en XI/Ether

**Nuevo experimento de dinámica no lineal:** tres masas interactúan gravitacionalmente en 2D; XI calcula fuerzas, integra posiciones y velocidades, detecta el primer acercamiento y guarda la evolución en Inverse Ether Memory. El ejecutor es REVERSE-PC con el QuantumRuntime de Mundo X, no un nuevo motor externo.

**Evidencia física reproducible:** 8/8 pruebas nativas aprobadas; deriva relativa de energía de 0.00764 % en 64 pasos de un escenario orbital idealizado; primer acercamiento a distancia <=0.25 registrado en el paso 114 frente al paso 113 de una referencia numérica independiente; nueve condiciones iniciales produjeron ventanas de acercamiento entre los pasos 107 y 121. Estos nueve casos no son probabilidades naturales calibradas.

[Modelo, unidades y límites](docs/FISICA_P002_TRES_CUERPOS.md) · [Resultados y evidencias](docs/FISICA_P002_RESULTADOS_2026-10-28.md)

Para crear el programa gravitacional propio:

    node tools/gravedad.mjs ejemplo 32 gravitacion.xi
    reverse_pc compile gravitacion.xi Gravedad-P002.rxe
    reverse_pc init estado-inicial.rvp
    reverse_pc run Gravedad-P002.rxe estado-inicial.rvp estado-32.rvp

La misma función también está disponible mediante `node tools/laplace.mjs crear-gravedad escenario.json programa.xi`. Use solamente snapshots de laboratorio, no la memoria personal del escritorio. P002 se agrega sin retirar P001, E005 ni el observatorio Bitcoin.

**Límite de interpretación:** se trata de gravedad suavizada Plummer con G=1 en unidades normalizadas, paso temporal 1/1024 y aritmética fija. No predice las posiciones de planetas reales ni demuestra caos o aceleración cuántica. A diferencia de E005, la dinámica no lineal todavía exige integrar pasos acotados.

---


## FISICA P001 — laboratorio mecánico en XI/Ether

**Nuevo sistema físico ideal en LaPlaceDIG:** una partícula en caja bidimensional, con masa, posición, velocidad, choques perfectamente elásticos contra paredes y un impulso externo opcional. El motor es [XI](fisica/billar.xi) y ejecuta la evolución en REVERSE-PC / Inverse Ether Memory sin recorrer los instantes intermedios. Hasta 10^12 segundos de horizonte dentro del dominio de enteros y límites declarados.

La configuración y las unidades físicas están definidas en [FISICA_P001.md](docs/FISICA_P001.md). **Pruebas reales:** 8/8 nativas aprobadas, primera divergencia del evento externo en t=9, 33/33 coincidencias cuando se conoce la intervención, y consulta hasta 10^12 s. [Resultados reproducibles](docs/FISICA_P001_RESULTADOS.md). El CLI principal incluye la orden `node tools/laplace.mjs crear-fisica escena.json salida.xi`, y el ejemplo predeterminado se genera con `node tools/fisica.mjs ejemplo 1000000 billar.xi`. REVERSE-PC puede compilarlo como `Billar-Laplace.rxe`. Este laboratorio conserva E001-E005, el sistema temporal Bitcoin y las fuentes anteriores; no predice por sí solo el mundo real ni es un emulador gráfico.

---


## E005 — nuevo prototipo de salto temporal XI/Ether

**Prototipo activo de experimentación fundamental:** compone una ley afín binaria para calcular el estado de un sistema a horizontes de hasta 10^12 pasos mediante potenciación por cuadrados sucesivos en XI Machine, alojada por REVERSE-PC. El cómputo ocurre en el programa [salto/nucleo.xi](salto/nucleo.xi), utilizando Inverse Ether Memory; el anfitrión solo serializa las entradas. El aprendiz E001 entrega leyes desde observaciones. [Diseño, límites y reproducción](docs/SALTO_E005.md).

Generar una fuente de demostración: `node tools/salto.mjs ejemplo 1000000 1011 salto-e005.xi`. Compilarla con REVERSE: `reverse_pc compile salto-e005.xi Laplace-Salto.rxe`. Ejecutar únicamente en sesión de prueba. Se eliminó el bootstrap anterior `bitcoin/tiempo.mjs` y su comando `preparar-tiempo`; Git conserva su historial. El simulador de mercado `dinamica/` continúa como investigación independiente: no es una predicción cierta ni el nuevo núcleo E005.

**Auditoría del 28 de octubre de 2026:** 92/92 pruebas extremas correctas (1..8 variables y horizontes hasta 10^12), cadena E001→E005 verificada y benchmark XI frente a XI con RAM física. [Resultados, límites y metodología](docs/SALTO_E005_AUDITORIA_2026-10-28.md).

---

**Bitcoin actual:** [abrir el observatorio privado](https://laplace-bitcoin-observatorio.guadalupejuan001.chatgpt.site). El botón «Actualizar ahora» guarda cotización BTC/USD, noticias y anuncios oficiales. Se agregó una calibración histórica corta con datos reales: seis ventanas y 42 decisiones reservadas. En esa muestra la narrativa y su calibración no superaron la referencia; el predictor en vivo sigue sin activar. [Comandos, resultados y limitación de disponibilidad histórica](docs/BITCOIN.md).

**Núcleo temporal nativo:** aprende siete estados y sus transiciones; propaga su distribución sobre Inverse Ether Memory con operaciones nativas de Laplace. El navegador consulta esas trazas. Cada día hasta 2030 tiene una proyección nativa positiva y negativa; los siete días de pruebas retrospectivas son información del modelo y no bloquean la exploración. El modelo actual usa 90 etiquetas BTC; la prueba de un día de anticipación obtuvo Brier 0.246410 frente a 0.245788 de referencia. Todavía no hay ventaja financiera confirmada. [Ejecución, examen y reproducción](docs/DINAMICA.md).

## Demonio de Laplace digital — un proyecto independiente

**Misión:** representar el estado de un sistema, conocer o descubrir sus reglas y calcular qué puede ocurrir en el tiempo. Se fundamenta en la idea original de Ether: estados de fondo, relaciones, excepciones y consultas bajo demanda.

No es una nueva app de REVERSE, no es el solucionador de la ecuación espacial de Laplace, no es un chatbot y no promete predicción perfecta de la bolsa.

### Qué se ha trasladado

| Módulo | Estado |
| --- | --- |
| demonio/modelo.mjs | **Copia exacta** del mundo reversible XI de Mundo X |
| demonio/experimento.mjs | **Copia exacta** del auditor que ejecuta el runtime real |
| historia/contrato.mjs | Fechas de observación/publicación, cuatro familias de hechos, revisiones |
| historia/ether-xi.mjs | Proyección y lectura sin pérdida en Inverse Ether Memory original |
| tools/laplace.mjs | Comandos locales para consultar, filtrar y comprobar archivos históricos |
| tests/historia.test.mjs | Regresiones de fuga de futuro y reconstrucción de registros |
| docs/ARQUITECTURA.md | Fórmula objetivo, estado actual y límites de la IA futura |
| docs/FUENTES.md | Shiller, FRED/ALFRED y GDELT; cobertura y limitaciones reales |

**E001 añade el primer aprendiz de leyes:** recibe transiciones binarias, identifica una ley afín desconocida, la conserva como programa XI reproducible y calcula sus consecuencias. Se abstiene con evidencia insuficiente o contradictoria. Ese experimento está comprobado en mundos sintéticos; el nuevo módulo Bitcoin ensaya asociaciones narrativas reales sin demostrar capacidad predictiva financiera. El núcleo Ether está en Mundo X; LaPlaceDIG lo reutiliza fijando el commit 3d29556eff4d1079c791abab38e203fc209f1722.

| Nuevo componente | Función |
| --- | --- |
| inteligencia/laplace.mjs | Planificación desde entradas; aprendizaje y pronósticos ejecutados por XI nativo |
| inteligencia/experimento.mjs | Observación → aprendizaje → pronóstico sellado → contraste → refutación |
| docs/INTELIGENCIA.md | Contrato, comandos, alcance de las leyes y siguiente investigación |
| docs/CONTEXTO_LAPLACE.md | Intención del proyecto y punto de continuidad |

## 1. Comprobar el demonio digital existente

Para reproducir con el motor propio original, obtener Mundo X en una carpeta hermana o subcarpeta y fijar su referencia:

    git clone https://github.com/guadalupejuan001-code/mundo-X deps/mundo-X
    git -C deps/mundo-X checkout 3d29556eff4d1079c791abab38e203fc209f1722
    cmake -S deps/mundo-X/quantum-runtime -B build-ether -DCMAKE_BUILD_TYPE=Release
    cmake --build build-ether --target mundo_x_quantum --parallel 2
    node demonio/experimento.mjs ./build-ether/mundo_x_quantum demon-evidence

Esta prueba ejecuta un mundo cerrado mediante XI original, verifica cada estado contra un oráculo independiente y muestra qué cambia ante un evento desconocido. Los resultados son de un universo sintético, NO de la bolsa.

## 2. Traer datos históricos reales, cuando haya una fuente

LaPlaceDIG admite un diario de hechos en JSONL. Cada registro indica cuándo ocurrió y, especialmente, **cuándo se supo**.

    node tools/laplace.mjs convertir-precios mi-historial.csv > mi-historial.jsonl
    node tools/laplace.mjs validar mi-historial.jsonl
    node tools/laplace.mjs corte mi-historial.jsonl 2020-01-01T00:00:00Z
    node tools/laplace.mjs referencia mi-historial.jsonl 2020-01-01T00:00:00Z SPY
    node tools/laplace.mjs verificar-ether mi-historial.jsonl 2020-01-01T00:00:00Z ./build-ether/mundo_x_quantum

**Las fechas, el activo y el nombre de archivo del ejemplo anterior explican solo la sintaxis; no son resultados bursátiles.** Los valores originales deben provenir de una fuente verificable. Si no hay observaciones válidas, el sistema lo informa; no produce precios inventados.

Para importar un CSV de precios, se exige exactamente este encabezado (sin columnas entrecomilladas):

    id,asset,observed_at,known_at,value,price_basis,currency,source_url

- observed_at y known_at deben ser timestamps UTC ISO-8601 terminados en Z.
- value es decimal como texto, no número convertido en coma flotante.
- price_basis es raw_close, adjusted_close, monthly_average o spot_quote; el entrenamiento BTC exige raw_close.
- source_url es URL HTTPS que identifica la fuente original.
- Para economía y geopolítica, utilizar JSONL con los campos descritos en docs/ARQUITECTURA.md; no reinterpretar datos faltantes como ceros.

El comando verificar-ether acepta un lote pequeño para demostrar transporte y recuperación sin pérdida desde XI. No es una base histórica masiva persistida, todavía.

## 3. Hacia la inteligencia LAPLACE

La formulación de trabajo es:

    Estado compacto Z_t = C_Ether(hechos conocidos hasta t)
    Aprendizaje: reglas_estimadas = Aprender(historial observable)
    Predicción: calcular posibles estados Y_(t+h) desde Z_t y las reglas
    Contraste: registrar antes, medir después y corregir el modelo

El primer ciclo es reproducible con el mismo binario original:

    node tools/laplace.mjs experimento-aprendiz ./build-ether/mundo_x_quantum build-evidence/aprendiz

El aprendiz recibe **48 transiciones observadas de 16 variables**, sin recibir las leyes del generador. Identifica una transformación afín binaria; desde un estado inicial reservado, su pronóstico sellado coincide en **32/32 estados futuros**. Persistencia coincide en 0/32. Una intervención desconocida produce divergencia en el instante 9; incorporar esa evidencia refuta la ley fija y el nuevo aprendizaje se abstiene. Esto mide aprendizaje dentro de una gramática concreta, sin demostrar capacidad financiera ni inteligencia general.

El anfitrión organiza el experimento y planifica pivotes usando solo entradas. XI transforma las salidas observadas mediante CNOT, recupera los coeficientes por Inverse Ether Memory y ejecuta los pronósticos. La persistencia usa **reproducción de un programa XI guardado**, no una sesión nativa que continúe viva. [Detalle y uso](docs/INTELIGENCIA.md).

Las reglas numéricas generales y la validación en mercados reales siguen pendientes. No transformar las cifras de este laboratorio en supuesta precisión bursátil.

Evidencia de E001: [resultado reproducible](evidencia/E001.json). La CI regenera los programas y pronósticos completos.

## 4. E002 — probabilidad desde narrativa geopolítica y humanitaria

**Objetivo inicial:** estimar si el retorno BTC/USD a 24 horas supera un coste total **supuesto** de 10 puntos básicos. Los precios producen las etiquetas de entrenamiento y evaluación; el predictor recibe exclusivamente relatos geopolíticos y humanitarios conocidos al corte.

    Z_t = Estado(narrativa geopolítica + humanitaria conocida en la ventana)
    Y_t = 1 si 10000 * (P_(t+24h)/P_t - 1) > coste_bps
    p0 = (positivos_globales + 1) / (casos_globales + 2)
    p_t = (positivos_del_patron + kappa*p0) / (casos_del_patron + kappa)

El espacio incluye temas individuales, contexto regional, combinaciones y secuencias de publicación. La extracción es simbólica con vocabulario declarado en español/inglés. Cada patrón observado recibe una auditoría de soporte, probabilidad y validación; solo condiciones validadas pueden producir una predicción. No se multiplican señales correlacionadas. Sin patrón validado, el modelo se abstiene.

El entrenamiento reserva tres tramos cronológicos: entrenamiento → selección por validación → prueba final con modelo congelado. Se miden Brier, log-loss, calibración por intervalos y cobertura, incluyendo abstenciones mediante la referencia fija para el resultado global. Se excluyen objetivos todavía no publicados y horizontes que crucen de partición.

    node tools/laplace.mjs experimento-narrativa ./build-ether/mundo_x_quantum build-evidence/narrativa

El control **sintético** usa 128 casos de entrenamiento, 64 de validación y 64 de prueba. Recupera interacciones entre ambos dominios. La aritmética probabilística y la selección ocurren en el anfitrión; el único estado guardado de reglas y estadísticas se recupera desde Inverse Ether Memory mediante el XI original. No hay un servicio continuo ni un modelo financiero real ya validado.

Se añaden hechos `humanitaria`, importadores de capturas ReliefWeb/GDELT y comandos de entrenamiento, consulta y evaluación. Una captura actual nunca se retrofecha como si su contenido hubiera estado disponible antes. [Fórmula, espacio y uso](docs/NARRATIVA.md) · [Evidencia E002](evidencia/E002.json).

## 5. E003 — dos resultados que coexisten y se registran por patrón

Una consulta devuelve una consecuencia condicional calculada por XI y una probabilidad narrativa para **el mismo objetivo**. La primera expresa qué determina una ley identificada; la segunda conserva su incertidumbre estadística. Las dos permanecen separadas y pueden abstenerse independientemente.

Cada ocurrencia se guarda por patrón con su fecha, ambas salidas y versión del modelo. Al llegar el resultado observado, se añade un evento sin reescribir el pronóstico. Las vistas muestran aciertos, errores, cobertura, Brier, refutaciones y diferencias. La ley refutada se retira para ese patrón según cuándo se conoció la evidencia.

    node tools/laplace.mjs experimento-dual ./build-ether/mundo_x_quantum build-evidence/dual-nuevo

El control cerrado produce 64 pares y 64 observaciones, agrupados en cuatro patrones. Es evidencia sintética, no predicción financiera real. [Uso y arquitectura](docs/COEXISTENCIA.md) · [Resultados E003](evidencia/E003.json).

## 6. E004 — masa positiva/negativa de escenarios en XI

El análisis de realidades ejecuta la ley sobre escenarios declarados y suma sus probabilidades con pesos explícitos. Se registra como análisis del patrón sin sustituir las dos salidas ni duplicar pronósticos.

    node tools/laplace.mjs experimento-realidades ./build-ether/mundo_x_quantum build-evidence/realidades-nuevo

El runtime original ejecuta 512 escenarios en **1.536 qubits activos**, divididos en componentes de tres qubits. Obtiene marginales y masas positivas/negativas sin enumerar un estado general exponencial. `?` significa incertidumbre equiprobable declarada; los pesos y leyes del control son sintéticos. [Alcance técnico](docs/COEXISTENCIA.md) · [Resultados E004](evidencia/E004.json).

Documentación: [Arquitectura](docs/ARQUITECTURA.md) · [Fuentes públicas](docs/FUENTES.md) · [Demonio XI](demonio/README.md).

Pruebas locales: node --test tests/*.test.mjs. Las CI compilan también el núcleo QuantumRuntime de Mundo X, fijado por SHA, y verifican el demonio.

## Reglas de ingeniería

Conservar la autoridad de estado original Ether, no usar datos futuros, no fabricar precios ni precisión, no ocultar costes de RAM, no inventar hardware cuántico. Nuevas funciones de la IA deben demostrar su utilidad mediante pruebas reproducibles. Los originales en Mundo X se conservan como referencia y no se alteran con esta migración.
