# Auditoría E005 — 28 de octubre de 2026

## Reproducción y procedencia

- Código E005 auditado con CI de GitHub Actions: https://github.com/guadalupejuan001-code/LaPlaceDIG/actions/runs/40752758921
- Prueba original del núcleo sobre el commit de REVERSE-PC 01829217cfb0a3a704d37f0c0f66527a23ec149d y Mundo X e2778d962af22f6f1a0794058dd4685fc2573966.
- Aprendiz E001: Mundo X 3d29556eff4d1079c791abab38e203fc209f1722, construido en CI como motor independiente.
- Informe íntegro en los artefactos de la ejecución: extremo.json, rendimiento.json y e001-e005.json. La rama incluye los scripts de regeneración de esos tres informes.
- Entorno de benchmark: Linux ubuntu-latest (runner GitHub Actions, no Android). Sin mediciones energéticas.
- La última ejecución de CI dejó 7/7 pruebas existentes aprobadas, 92/92 casos nuevos de estrés y 5/5 horizontes correctos con una ley aprendida.

## A. Pruebas extremas en el ejecutor nativo

92/92 casos aprobados, 0 fallos. Anchos desde 1 hasta 8 variables; horizontes 0, 1, 2, 3, 31, 1.000.000 y 1.000.000.000.000, además de casos aleatorios y leyes especiales.

Verificador independiente: enumera hasta 256 estados posibles por mundo, detecta ciclos y consulta la posición futura por aritmética modular. No utiliza la multiplicación de matrices que implementa E005. Las pruebas verifican:
- bit constante de la matriz afín y contador exacto de productos;
- coincidencia de estados frente al oráculo de ciclos;
- instrucciones XI y ejecutables compilados RXE;
- memoria inversa acotada, sin creación de componentes cuánticos;
- rechazo de metadatos con salto de línea que intentaban inyectar un comando XI;
- rechazo transaccional: un programa inválido no publica snapshot final.

Pico observado de duración por caso: 48,682 ms, **tiempo del proceso completo para ese caso**, no latencia del algoritmo aislado. Máximo observado de 162 excepciones clásicas InverseMemory, que no equivale a la memoria física del proceso.

## B. Comparación controlada XI frente a XI

Ambos métodos usan el mismo ejecutor REVERSE-PC, la misma ley afín, el mismo estado inicial y una memoria inicial nueva. Se mide tiempo de pared para cada comando 'run', con arranque del proceso y restauración del estado incluidos. Medianas de 3 ejecuciones; además se hace una ejecución de calentamiento. RSS de /usr/bin/time (KiB), no memoria virtual lógica.

| Horizonte | Paso a paso, ms | Salto XI, ms | Razón paso/salto | Pico RSS lineal, KiB | Pico RSS salto, KiB |
| --: | --: | --: | --: | --: | --: |
| 8 | 2,824 | 3,631 | 0,778x | 4712 | 4708 |
| 64 | 4,179 | 4,011 | 1,042x | 4704 | 4748 |
| 256 | 8,530 | 4,322 | 1,974x | 4784 | 4728 |
| 1024 | 27,051 | 4,777 | 5,663x | 4756 | 4776 |

La comparación evidencia crecimiento menos pronunciado del salto para esos casos. Para 8 pasos es más lento que la evolución directa; para 64 la diferencia es marginal. **No hay reducción de RAM física demostrada** (ambos procesos rondaron 4,6 MiB RSS). Un millón de pasos en modo salto llevó 26 productos de matrices y una mediana de 7,892 ms, sin ejecutar el millón de transiciones directas como comparación por el límite de instrucciones del intérprete. A un billón de pasos hacen falta 52 productos para esta familia. Los productos de matrices NO son instrucciones elementales ni tienen coste unitario.

## C. Integración E001 → E005

Un mundo oculto de 4 variables entrega 7 transiciones al aprendiz E001 sin revelar su generador. E001 alcanza rango 5/5 y devuelve un checkpoint XI con SHA y procedencia. Se genera código con tools/salto.mjs aprendido, se compila a RXE y se ejecuta con REVERSE-PC. Antes de revelar todos los estados del mundo, se sellan cinco pronósticos con SHA:

| Horizonte | Estado predicho | Estado observado | Productos XI |
| --: | :--: | :--: | --: |
| 0 | 1010 | 1010 | 0 |
| 1 | 0101 | 0101 | 1 |
| 31 | 0101 | 0101 | 9 |
| 1.000.000 | 1010 | 1010 | 26 |
| 1.000.000.000.000 | 1010 | 1010 | 52 |

Cinco de cinco coincidencias. El oráculo recorre el universo sintético **después** de que los pronósticos estén guardados. Un checkpoint cuya fuente XI fue alterada se rechaza. Esto comprueba la interoperabilidad E001 / E005, pero no una capacidad general para descubrir leyes no lineales, variables ocultas o cambios de régimen.

## D. Incidencias corregidas durante las pruebas

- Compilador: el campo modelo_sha256 era interpolado directamente como comentario en una fuente XI. Se restringe ahora a un SHA-256 hexadecimal de 64 caracteres o al identificador sintético fijo, rechazando saltos de línea y comandos introducidos como metadatos.
- Verificador: la ruta REVERSE devuelve un registro tipo 'quantum_stats', no 'stats'; se ajustaron las comprobaciones a su contrato real. Los primeros fallos del verificador eran falsos positivos; los lotes repetidos pasaron completos.
- Generación aleatoria: se normalizó el horizonte para no generar pruebas fuera del dominio máximo anunciado.

## Qué NO demuestran estas pruebas

- Conocer acontecimientos físicos futuros, Bitcoin o leyes universales.
- Resolver interacciones no lineales, causalidad oculta o toda la computación reversible.
- Aceleración sobre todas las tareas, ventaja física cuántica, memoria infinita o reducción demostrada de RAM física.
- Rendimiento o consumo energético del Galaxy A16, una APK o una estación REVERSE-PC completa.

## Cómo repetir

    node --test tests/salto.test.mjs
    REVERSE_PC_BIN=./build-reverse/reverse_pc node --test tests/salto.test.mjs
    node tests/salto-extremo.mjs ./build-reverse/reverse_pc ci-evidence/extremo.json
    node tests/salto-rendimiento.mjs ./build-reverse/reverse_pc ci-evidence/rendimiento.json
    node tests/salto-integracion.mjs ./build-reverse/reverse_pc ./build-e001/mundo_x_quantum ci-evidence/e001-e005.json

La compilación del motor original y las revisiones exactas están declaradas en .github/workflows/salto-e005.yml. El CI conserva los informes y el ejecutable RXE en un archivo descargable. El baseline y el método nuevo difieren en algoritmo, no en intérprete; las medianas pueden cambiar en hardware real y ante ruido del sistema operativo.
