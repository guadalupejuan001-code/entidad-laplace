# Entidad Laplace — EF002 y EF003: continuidad y leyes

Fecha: 31 de octubre de 2026. Conserva EF001, XI/Ether, I001 y V001.

## EF002: capturas mundiales recuperables

- Recupera U003 en paralelo con D001 derivados, D002 swaps CFTC, B001
  BIS y K001 blockchain/DeFi. C001 SEC se habilita solo si está
  configurado SEC_USER_AGENT; FINRA requiere periodos/credenciales.
- Archiva capturas U003 con los dos sellos verificados, manifiesto de
  integridad SHA256 y contenido comprimido, sin sobrescribir.
- Conserva la primera hora real de conocimiento (known_at) registrada
  por cada captura; jamás retrodata una revisión.
- Las fuentes faltantes, restringidas o con error no se convierten en
  cero. La clasificación B001/C001/D001/D002/K001 conserva su semántica.
- Las consultas separan series por población BIS, moneda, unidad,
  instrumento, mercado y contraparte. Pagina hasta 1024 estados.
- Puede restaurar todos los manifiestos en una base PostgreSQL/PGlite
  nueva de manera idempotente.

## EF003: evolución exacta bajo supuestos

- Ley contable: saldo inicial + entradas - salidas declaradas.
- Interés simple: principal multiplicado por una tasa fija por periodo.
- Red de transferencias: conservación exacta del total de un conjunto
  cerrado de entidades con la misma población, divisa y unidad.
- BigInt para aritmética decimal. No inventa cotizaciones FX ni saldos.
- Lee valores EF001 por SHA y exige que ya se conocieran en el momento
  de decisión; los resultados se guardan solo en una rama de
  simulación, jamás como observaciones del sistema real.
- Si faltan flujos, cobertura, permisos o balances suficientes,
  se abstiene.

EF003 no ha descubierto una ley universal del mercado. Los experimentos
verifican operadores deterministas condicionados por entradas y
supuestos declarados. Se conserva el veto V001 NO_GO_MODEL_PRODUCTION.

## Ejecución local

Desde la raíz de Entidad Laplace:

    npm ci
    npm run test:financiero
    npm run ciclo:financiero -- capturar registros/archivo-financiero registros/input/postgres
    npm run ciclo:financiero -- recuperar registros/archivo-financiero registros/input/postgres
    npm run ciclo:financiero -- estado 2026-10-31T15:00:00.000Z registros/input/postgres

Detener I001 antes de abrir un segundo escritor en el mismo PGlite.
En PostgreSQL servidor definir LAPLACE_DATABASE_URL, usando un usuario
con permisos para migrar, consultar e insertar.

Para simular EF003, crear un plan JSON con referencias a
source_assertion_sha reales que ya existan en la base. Ejemplo conceptual:

    {
      "law": "accounting",
      "source_assertion_sha": "SHA256_ORIGINAL_DE_EF001",
      "target_at": "2026-11-01T18:00:00.000Z",
      "complete_flow_scope": true,
      "assumptions": {"scope": "flujo_hipotetico_cerrado"},
      "flows": [
        {
          "direction": "inflow",
          "amount_text": "10",
          "unit": "USD",
          "currency": "USD",
          "population_id": "MISMA_POBLACION_QUE_EL_SALDO",
          "origin": "assumption",
          "effective_at": "2026-11-01T17:00:00.000Z"
        }
      ]
    }

El SHA, la moneda, la población y el horizonte deben coincidir con una
observación real y con un futuro aún no vencido. Ejecutar:

    npm run simular:finanzas -- escenario.json registros/input/postgres

El instante de decisión se toma del reloj actual; no puede retrotraerse
para fabricar un experimento prospectivo.

## Automatización de capturas públicas

El workflow .github/workflows/captura-ef002.yml propone cuatro intentos
diarios: 04:23, 10:23, 16:23 y 22:23 UTC. Al integrar el cambio a main
intenta su primera captura. Guarda una copia temporal como artefacto
Actions y publica un histórico en la rama laplace-archivo.

El archivo Git permite recuperar capturas cuando termina el runner.
No equivale a tener una base de datos viva disponible 24/7. Las
tareas programadas pueden retrasarse/fallar y no garantizan baja
latencia de órdenes. No hay trading automático.

Secretos opcionales: SEC_USER_AGENT, FRED_API_KEY, JQUANTS_API_KEY,
OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET. Sin acceso la fuente sigue
figurando como no disponible; no existe acceso a información bancaria
privada, L3 licenciado o movimientos anónimos protegidos.

La meta de EF004/V001 sigue siendo probar prospectivamente cualquier
ventaja de una nueva ley financiera contra referencias convencionales
antes de modificar un pronóstico central. Ningún método cuenta con
ventaja acreditada por registrar más fuentes.
