# F001: Laplace simultáneo y multiescala (experimental)

Esta implementación conserva U003/U004, X002, I001 y el código M001 anterior.
**No sustituye el predictor validado ni autoriza trading.** El nuevo F001 emite
un reporte con 14 horizontes, su estado y un escenario contextual explícito.

## Horizontes

| Datos de velas cerradas | Ventana observada | Horizontes |
| --- | --- | --- |
| 5 minutos | 14 días | 5, 15, 30, 60 y 120 minutos |
| 1 hora | 45 días | 4, 8, 12 y 24 horas; 3 días |
| 1 día | 1.000 días | 7, 14, 30 y 90 días |

La selección de horizontes largos necesita barras históricas largas, no
multiplicar un resultado de cinco minutos. Coinbase admite máximo 300 barras
por petición: la extracción divide ventanas, aplica límite de concurrencia
y descarta barras abiertas o fuera de ventana. Las resoluciones se solicitan
**en paralelo**, junto con cotización spot y captura mundial U003/U004.

## Un solo cálculo temporal

Las cinco tareas comienzan en un mismo lote: cotización Coinbase BTC-USD,
historia 5 minutos, historia 1 hora, historia diaria, y mundo U003, que a su
vez lanza U002, U004 y otras fuentes concurrentes.

F001 espera a que terminen, comprueba fechas, contabiliza fallos y emite
un informe único con fecha as_of. Si faltan velas, el horizonte afectado se
abstiene; si falta el mundo, los pronósticos quedan como solo-mercado.
Nunca se transforma una fuente fallida en dato cero.

## Qué entra en el resultado

- **Precio candidato:** busca estados pasados similares en tendencia,
  volatilidad, rango y volumen, con resultado futuro histórico ya cerrado.
  Selecciona hasta 18 ventanas no solapadas y exige al menos ocho.
- **Contexto mundial:** cada estado U003/U004 utilizable entra en el
  cómputo de cobertura, frescura y dominios; solo retornos comparables
  de mercados expresados como ratios contribuyen al estrés numérico.
  No se suman temperaturas, salarios, precios y tasas arbitrariamente.
- **Escenario contextual:** amplía el intervalo empírico de análogos según
  frescura/cobertura y estrés. Este intervalo **no es calibrado ni un
  intervalo de confianza estadística**; el mundo no cambia todavía el
  precio central por falta de validación temporal fuera de muestra.
- **Trazabilidad:** identificadores de las cinco tareas, estado por fuente,
  dominios, fechas de corte y estado por horizonte.

Las señales que figuran en U003 no garantizan cobertura de todos los
mercados/países. Fuentes con licencia o credenciales faltantes no se
simulan. La concurrencia de I/O no significa ejecución de cada función
matemática en un núcleo físico separado.

## Ejecución

En una instalación Node 20+ de esta rama con dependencias presentes:

    npm run test:fusion
    npm run fusion -- resultado-f001.json
    npm run fusion -- resultado-solo-precios.json --sin-mundo

No sobrescribe archivos existentes. La captura mundial puede tardar más
que la cotización y sus fuentes pueden fallar o caducar.

## Validación pendiente

Las pruebas automatizadas verifican separación temporal, cálculo de
14 horizontes, inicio simultáneo, fallos parciales y rechazo de velas
contradictorias. Esas pruebas **no certifican precisión predictiva ni
ventaja financiera**. Para utilizar U003/U004 cambiando el precio central
harán falta varias capturas fechadas con vintages, entrenamiento
cronológico, prueba reservada y contraste contra persistencia.

Esta rama no genera por sí misma una APK Android: el núcleo puro F001 es
compatible con JavaScript móvil, pero la adquisición y la interfaz
requieren integración y pruebas específicas.
