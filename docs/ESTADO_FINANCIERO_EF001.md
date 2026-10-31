# EF001 — Entidad Laplace, estado del sistema financiero mundial

Fecha de introducción: 31 de octubre de 2026.
Rama: feature/ef001-mundo-financiero-estados-20261031.

## Definición

Laplace es un motor de estados, leyes, historia, inferencia y evaluación sobre
un mundo financiero abierto. No está limitado a Bitcoin o a la bolsa.
Su estructura permite analizar bancos, dinero, mercados, crédito, fondos,
derivados, redes on-chain, instituciones, comercio, economía real y shocks
externos de forma interrelacionada sin afirmar que se conocen datos no medidos.

La ecuación conceptual del proyecto es:

    S(t+h) = F^h(S(t), I(t,t+h); theta, U)

donde S es el estado representado, F es una ley descubierta o declarada,
I representa intervenciones o causas externas, theta identifica la versión
congelada de F y U las causas no observadas. Se separan las trayectorias
deterministas dentro de un modelo cerrado de los pronósticos probabilísticos
en el mundo real. No es lo mismo que resolver la ecuación diferencial espacial
de Laplace. F no se acepta como verdadera solo porque esté programada.

El objetivo de EF001 es reconstruir la BASE INFORMACIONAL necesaria para
la evolución, no inventar una simulación perfecta del sistema económico
ni promover el predictor F001. Sus estados densos pueden ser inmensos,
pero se almacenan reglas, referencias y excepciones dispersas en vez de
materializar todas las combinaciones.

## 1. Inventario explícito (48 dominios)

El catálogo es código ejecutable en estado-financiero/catalogo-mundial.mjs,
se registra en laplace_fin_domain_catalog y tiene 48 dominios en 15 sectores:

1. Mercados: precios, acciones, deuda, divisas, commodities, L1/L2,
   L3 con licencias, transacciones y microestructura.
2. Capital y derivados: FINRA off-exchange, futuros/perpetuos, opciones,
   swaps OTC, liquidaciones, fondos, NAV, creaciones/redenciones ETF.
3. Sistema bancario: BIS locacional y consolidado, bancos mayoristas,
   reservas y bancos centrales, colateral, repos y liquidez monetaria.
4. Crédito y banca no tradicional: crédito público/privado, seguros,
   fondos de pensión, intermediación no bancaria y exposiciones.
5. Infraestructura: pagos, compensación, liquidación y redes institucionales.
6. Instituciones: identidades P001, filiales reportadas, 13F, posiciones,
   propiedad, reclamos, deudas y relaciones no equiparadas a control.
7. Criptoeconomía: Bitcoin, Ethereum, derivados, DeFi, TVL, stablecoins,
   custodios, DEX, bridges y privacidad.
8. Economía real: inflación, empleo, PIB, comercio, productividad, energía,
   transporte aéreo/marítimo y cadenas de suministro.
9. Factores externos: clima, desastres, geopolítica, comunicados públicos
   y narrativas sin certificación causal automática.
10. Metasistema: fechas de disponibilidad, faltantes, red de relaciones,
    leyes y aprendizaje, memoria inversa, escenarios, pronósticos,
    evaluación contra bases de referencia y límites de observabilidad.

Un dominio catalogado NO es un flujo conectado. Cada señal nueva tiene:
dominio, entidad/sujeto, variable, instrumento, mercado, contraparte,
moneda, jurisdicción, población, unidad, estado de disponibilidad, periodo,
observed_at, known_at, published_at, origen, identificador/revisión y hash.

Una observación desconocida o restringida se registra con valor NULL y
motivo. El cero numérico es un valor observado diferente.
Stocks, flujos, precios, contratos nocionales, OI, TVL, balances y volúmenes
no se agregan indiscriminadamente. LBS/CBS pueden solaparse y no se suman
como si fueran dos conjuntos independientes.

## 2. Esquema PostgreSQL — migración aditiva

El módulo I001 sigue siendo la autoridad del evento recibido:

- input_inbox: bytes y huellas originales de entrega.
- input_events/input_event_keys: eventos normalizados, claves únicas,
  versiones e instante conocido.
- input_quarantine: anomalías, identificadores o contenido conflictivo.
- input_outbox: entrega idempotente.
- input_chain_current: finalización y reorganizaciones.
- input_registry_imports/input_entity_versions/input_institution_assertions:
  registro institucional P001 original.

EF001 añade tablas SIN borrar ninguna tabla anterior:

| Tabla | Responsabilidad |
| --- | --- |
| laplace_fin_domain_catalog | 48 contratos de dominios deseados, sin datos sintéticos |
| laplace_fin_entity_versions | identidad y versiones de entidades |
| laplace_fin_observations | hechos numéricos y faltantes bitemporales |
| laplace_fin_relations | relaciones documentadas, precedencia e hipótesis separadas |
| laplace_fin_captures | snapshots globales sellados y auditables |
| laplace_fin_coverage | disponibilidad de cada fuente, licencias y vacíos |
| laplace_fin_rules | leyes, hashes, motor XI/Ether u otro y validación |
| laplace_fin_sparse_deltas | estado mínimo, coordenadas arbitrariamente grandes y excepciones |
| laplace_fin_scenarios | ramas futuras, intervenciones y condiciones iniciales |
| laplace_fin_interventions | intervención hipotética, no evento de mercado |
| laplace_fin_forecasts | dos modos de pronóstico, baseline, horizonte y hash de entrada |
| laplace_fin_evaluations | resultado posterior, métricas y benchmark pareado |

Las vistas laplace_fin_entity_index y laplace_fin_relation_index muestran
también las entidades y afirmaciones institucionales P001 preexistentes.
No se duplican ni se reescriben los 15.787 sujetos/27.093 relaciones
del registro archivado.

## 3. Tiempo: cuatro nociones distintas

- observed_at: instante/periodo del hecho.
- published_at: publicación conocida, cuando está disponible.
- known_at: instante confirmado de primera recepción por Laplace.
- valid_from/valid_to: vigencia del fenómeno o relación, no la disponibilidad.

Una consulta as-of t solamente admite observaciones observadas Y conocidas
antes o en t. Las revisiones se agregan como filas nuevas; una consulta antigua
no recibe la versión revisada posteriormente. Los estados de fuentes diferentes
se mantienen distintos, sin asumir independencia ni sumarlos. El lector
devuelve la última revisión por serie/fuente accesible y advierte si su
presupuesto de estados se excede en lugar de truncar silenciosamente.

Los modelos y pronósticos usan además:
discovered_at, recorded_at, scenario.base_cutoff, decision_at, sealed_at,
input_cutoff, target_at y evaluated_at. Ninguna evaluación puede leer
un resultado antes de que la fuente lo haya publicado/entregado.
Una captura local sellada no es firma criptográfica del proveedor.

## 4. Memoria y evolución a escala P005

La base no materializa 2^60 celdas de manera densa.
Guarda coordenadas lógicas en texto decimal (hasta 300 dígitos),
una ley identificada por hash y deltas que especifican set/unset/unknown,
el tiempo y su procedencia. Una lectura devuelve sólo las excepciones
necesarias según el corte y la rama; rechaza un presupuesto superior a 4096.
La complejidad de una consulta es proporcional a los deltas indexados
seleccionados, no al tamaño de un espacio lógico imaginado.

Se conserva la ley original y la ruta XI/Ether. EF001 no instala una CPU,
simulador de qubits ni un intérprete alternativo. P005 sigue siendo un
experimento de álgebra compacta de Regla 90, no un resultado financiero
ni un cálculo físico de todos los estados económicos.

## 5. Puente EF001 hacia XI/Ether original

El módulo estado-financiero/puente-xi.mjs construye snapshots U001
compatibles con universo/ether-global.mjs:

- Los importes I001 exactos permanecen como cadenas decimales en SQL.
- Solo se transportan como enteros escalados x10^8 si son exactos y caben
  dentro de Number.MAX_SAFE_INTEGER. De lo contrario se excluyen de XI
  y conservan su forma precisa en la base.
- Los números U003, que ya llegaron como float64, se marcan como
  aproximaciones, no se reinterpretan como precisión absoluta.
- Se conservan en un diccionario el origen, instrumento, unidad y población.
- Hasta 1024 registros por lote, 32.784 bytes de materialización máxima
  por lote usando el serializador XI original.
- La prueba de round-trip usa el ejecutor mundo_x_quantum fijado por commit.

Probar conservación de bytes no es demostrar ventaja financiera.

## 6. Observación, hipótesis, escenario y predicción: aislamiento

A. Observación: verificada estructuralmente, proviene de una fuente.
B. Relación: fuente afirma una conexión, o bien hipótesis explícita.
C. Ley: determinista/probabilística/aprendida/estructural, con hash, supuestos,
   motor y evidencia; la validación puede ser nula, sintética,
   retrospectiva o prospectiva.
D. Escenario: mundo contrafactual o intervención externa, jamás importado
   a hechos observados por estar en una rama de simulación.
E. Pronóstico: valor o distribución congelada antes de su objetivo, o
   abstención, con hash de la captura y de la ley.
F. Evaluación: solamente contra un objetivo observado después del plazo,
   con baseline comparable y registro explícito de métricas.
G. Falla/laguna: error, falta de licencia, censura, ausencia de publicación
   o valor desconocido que no se convierte a cero.

Las nuevas familias D001/D002/C001/B001/K001 en U003 siguen siendo opt-in,
y F001 NO adopta su contexto como mejora del precio central sin
comparaciones prospectivas emparejadas. V001 mantiene el veto
NO_GO_MODEL_PRODUCTION y no existen instrucciones de trading.

## 7. Uso local en la base I001 existente

Detener I001 antes de abrir PGlite en otro proceso. Conservar un respaldo
de archivos de datos para operaciones reales, aunque la migración es aditiva.
La ruta predeterminada del CLI es registros/input/postgres.

    npm ci
    npm run estado:financiero -- migrar
    npm run estado:financiero -- reindexar-i001
    npm run estado:financiero -- mapa
    npm run estado:financiero -- importar-u003 evidencia/continuidad-u003-20261030/captura-integrada.json
    npm run estado:financiero -- corte 2026-10-30T17:03:17.000Z
    npm run estado:financiero -- cobertura 2026-10-31T00:00:00.000Z
    npm run estado:financiero -- disperso 2026-10-31T00:00:00.000Z
    npm run estado:financiero -- xi 2026-10-31T00:00:00.000Z RUTA_BD RUTA_MUNDO_X_QUANTUM

El CLI sólo se conecta a la base local elegida. Las fuentes históricas
existen en el repositorio y requieren importar una captura específica; no
se importan todos los archivos de evidencia en silencio.

Pruebas:

    npm run test:ef001
    npm run test:input
    npm run test:v001
    npm run test:fusion

El workflow EF001 compila y prueba de forma opcional el runtime original
XI/Ether. No despliega Kafka, TimescaleDB ni una APK Android; esos pasos
requieren infraestructuras y pruebas específicas.

## 8. Estado real y siguiente desarrollo

EF001 IMPLEMENTA el contrato y las tablas, proyección transaccional
desde eventos I001, importador de snapshots U003 sellados, consultas
point-in-time, catálogo de 48 dominios, memoria dispersa, ramas
contrafactuales, registro seguro de modelos y evaluaciones, y el puente
al runtime XI/Ether ya existente.

Todavía NO IMPLEMENTA un modelo general que descubra automáticamente
todas las leyes del mundo financiero, ni proporciona datos privados,
licencias L3, mercados completos, reconstrucción automática de todos
los snapshots anteriores o una base global siempre encendida.
Las fuentes conectadas cubren sólo un subconjunto de los 48 dominios.

Fases siguientes, sin confundir objetivos con resultados:

EF002: completar conectores/licencias y procesos vivos, consolidando
cadencias horarias, diarias, trimestrales y transaccionales en I001.
EF003: normalizar relaciones balanceadas, netos, dobles registros,
identidades y posiciones cruzadas por población, periodo y divisa.
EF004: descubrir/probar leyes sobre transiciones de estados, almacenar
checkpoints XI originales y aplicar modelos a escenarios; no asumir una
ley global determinista.
EF005: generar pares prospectivos world-vs-baseline y pruebas reservadas
de error, incertidumbre, estabilidad por régimen y calibración.
EF006: optimización de particiones, almacenamiento y consultas masivas
sobre TimescaleDB/PostgreSQL sin inventar memoria exabyte física.

La arquitectura es abierta a nuevas familias, unidades y países. El
objetivo de cubrir todo el sistema no autoriza fingir observaciones
ausentes ni extraer información protegida.
