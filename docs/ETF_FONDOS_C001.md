# C001 — Flujos declarados de fondos y ETF (SEC N-PORT)

Proyecto: [Entidad Laplace](https://github.com/guadalupejuan001-code/entidad-laplace)
  
**Estado:** piloto de dos registrantes con contrato de ingesta, parser XML y
pruebas deterministas. Todavía no acredita una conexión SEC real permanente,
una emisión completa en producción, ni un beneficio del predictor.

## 1. Qué señales nuevas se calculan

C001-A acepta documentos públicos **NPORT-P/NPORT-P/A** de la SEC para:

| ID | CIK | Serie | Cobertura |
| --- | --- | --- | --- |
| SPY | 0000884394 | sin serie única reportada | SPDR S&P 500 ETF TRUST |
| SPYM | 0001064642 | S000006983 | SPDR Portfolio S&P 500 ETF |

Para cada registrante, el parser conserva ocho observaciones numéricas en USD:
activos totales, pasivos, patrimonio neto, ventas declaradas, rescates
declarados, reinversiones, flujo neto excluyendo reinversiones y flujo neto
incluyéndolas.

Los tres objetos `mon1Flow`, `mon2Flow`, `mon3Flow` conservan
sus valores separados en metadatos. **No se adjudica un mes calendario a
esos slots sin validación documental adicional.** El snapshot de los
flujos es del periodo del informe, conocido por Laplace **cuando
recibió** el XML público. No es un feed diario.

### Matemática y semántica

- `gross_sales = Σ sales(mon1..mon3)`.
- `redemption_magnitude = Σ abs(redemption(mon1..mon3))`.
- `net_ex_reinvest = gross_sales − redemption_magnitude`.
- `net_including_reinvestment = net_ex_reinvest + Σ reinvestment`.

Algunos formularios históricos publicaron `redemption` como número
negativo; otros como magnitud positiva. Se normaliza su magnitud antes
de restar. Un archivo que mezcla signos contradictorios entre meses
se abstiene para revisión.

Las cantidades se convierten a **centavos enteros BigInt**, con redondeo
de medios centavos hacia afuera antes de sumar. La observación externa
U001 sigue siendo un número JSON para interoperar con XI/Ether; se
limita a `Number.MAX_SAFE_INTEGER` centavos y se conserva SHA-256 de
la fuente. No se inventan decimales ni se usan precios de mercado para
calcular flujos.

**Importante:** Los campos N-PORT son emisiones/ventas y rescates del
fondo según formulario B.6; no son todos los flujos de mercados
secundarios ni una contabilidad directa de cestas de participantes
autorizados. El `netAssets` es patrimonio total, NO el NAV por
participación. N-PORT no entrega aquí la serie diaria de
participaciones en circulación.

## 2. Arquitectura y seguridad

1. Leer el registro SEC `https://data.sec.gov/submissions/CIK##########.json`
   para el CIK fijado en el catálogo.
2. Filtrar por formularios NPORT-P o NPORT-P/A públicos, fecha
   de aceptación, período y corte; seleccionar solamente la última
   revisión del período más reciente.
3. Obtener el documento XML publicado desde la carpeta EDGAR del accession.
   Si `primaryDocument` no es XML, consultar `index.json` y exigir un
   XML único; no inventar archivos.
4. Validar la sintaxis XML, prohibir DTD/entidades externas, CIK
   y serie exactos, fechas de archivo y sumas de activos.
5. Calcular valores sin redondeo monetario acumulativo, sellar un
   snapshot U001 con fuente, SHA256, fecha de recepción y fallos.
6. Cuando un fondo falta o SEC rechaza acceso, devolver
   `unavailable`/`requires_contact`. **Un error 403 no es flujo cero.**

SEC obliga a identificar al responsable de consultas automatizadas.
No se instala dirección de contacto ficticia ni se almacena en
GitHub. Antes de activar conexiones desde un servidor propio, configurar
`SEC_USER_AGENT` con identidad y correo de contacto reales.
Por defecto, el módulo no consulta sin ese valor.

## 3. IBIT y fondos de Bitcoin

**IBIT NO es NPORT-P del catálogo.** Su fideicomiso iShares Bitcoin Trust
ETF presenta **10-Q/10-K** con estado de acciones emitidas/canceladas,
NAV por cuota y variaciones en patrimonio. Es un contrato documental
distinto. C001-A lo marca expresamente como **NO disponible** en el
módulo N-PORT, sin inventar retornos ni confundir caídas del NAV con
salidas netas de capital.

En una futura extensión C001-B, se podrán leer los formularios 10-Q/10-K
públicos del CIK 0001980994, validar los cambios de acciones y el efecto
de mercado separadamente y contrastarlos con NAV y creación/redención.
Queda pendiente hasta tener parser comprobado y fuente accesible.

## 4. Uso

Requisitos: Node >=20, dependencias del proyecto, contacto SEC autorizado.

```bash
npm ci
npm run test:fondos
SEC_USER_AGENT="Organizacion contacto@dominio.org" npm run fondos:c001 -- --out=registros/etf/c001.json
SEC_USER_AGENT="Organizacion contacto@dominio.org" npm run fondos:c001 -- --funds=SPY --out=registros/etf/spy.json
```

Las cadenas de User-Agent anteriores son **solo formato ilustrativo**,
no credenciales ni contactos reales.

Para activar C001 en U003 sin afectar la captura predeterminada:

```bash
SEC_USER_AGENT="Organizacion contacto@dominio.org" LAPLACE_C001_ENABLED=true node tools/laplace.mjs universo-global-u003
```

El output solo se escribe si existe al menos una fuente válida;
no sobrescribe archivos anteriores. Los modos M001, F001, X002 y XI/Ether
no cambian. `prediction_inputs_enabled=false` y
`automatic_trading=false`.

## 5. Estado de pruebas y pendientes

- Pruebas deterministas con XML de estructura NPORT-P: CIK,
  serie, enmiendas, rechazo de futuro, centavos, redenciones con
  signos históricos, activos/pasivos, XML malicioso, archivo SEC
  y errores parciales.
- Prueba aislada del cálculo con parser XML simulado: NO equivale a
  haber ejecutado `npm test` o `fast-xml-parser` sobre XML real.
- GitHub Actions en el repositorio nuevo aún presenta el problema de
  arranque descrito en la incidencia #6. Antes de fusionar deben
  ejecutar la suite Node completa y contrastar la captura real con
  presentaciones SEC y reportes originales.

Pendientes de C001-B: IBIT y otros trusts que presenten 10-Q, shares
outstanding diarios de emisores autorizados, conexiones NAV/share
verificadas, cotizaciones/cestas primarias vs mercado secundario,
reconciliación cronológica y límites por cambio regulatorio.

Fuentes oficiales:

- SEC Form N-PORT datasets:
  https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets
- SEC registrantes/fondos (EDGAR):
  https://www.sec.gov/edgar/search/
- SEC política de acceso:
  https://www.sec.gov/os/accessing-edgar-data
- Registro SPY NPORT-P del 28-ago-2026:
  https://www.sec.gov/Archives/edgar/data/884394/000141036826089410/0001410368-26-089410-index.html
- Registro SPYM del 28-ago-2026:
  https://www.sec.gov/Archives/edgar/data/1064642/000141036826089197/0001410368-26-089197-index.htm

## Próximos bloques del proyecto mundial

**B001** — banca internacional y estadísticas BIS.
**K001** — flujos públicos blockchain y DeFi.
**V001** — **último ciclo**, validación temporal/ablación del modelo y
cierre de cobertura. El último sigue pendiente, no se anticipan
resultados ni exactitud antes de tener sus pruebas.
