# Dinámica temporal nativa de Laplace

La consola anterior componía retornos en JavaScript bajo una narrativa fija. Su cifra de 2030 no demostraba una dinámica aprendida. Esa ruta fue retirada de la interfaz. Sus archivos se conservan para reproducir el experimento anterior, identificados como legado.

La nueva capa aprende **transiciones entre estados narrativos** y propaga su distribución en código nativo, sobre el QuantumRuntime e Inverse Ether Memory originales. La inferencia no recibe precios ni indicadores económicos: recibe un estado narrativo y un horizonte. Los precios enseñan y puntúan la etiqueta BTC/USD.

## Qué ejecuta cada componente

| Componente | Trabajo |
| --- | --- |
| `dinamica/modelo.mjs` | Valida procedencia y cronología; extrae estados y etiquetas disponibles; selecciona regularización con validación anterior al test; invoca el ejecutor. |
| `native/laplace_temporal.cpp` | Cuenta transiciones y etiquetas, ajusta probabilidades y propaga cada paso con aritmética clásica nativa. |
| QuantumRuntime / InverseMemory originales | Conservan evidencia, conteos aprendidos y distribución propagada; ejecutan sin cambios los bloques XI estándar. |
| `dinamica/vista.mjs` y panel | Consultan resultados nativos precalculados; no ejecutan Monte Carlo ni multiplican matrices para inventar el futuro. |

`laplace_fit` y `laplace_evolve` son **operaciones de dominio nuevas de LaPlaceDIG**, implementadas en su capa nativa. No eran comandos del XI original ni se atribuyen a su gramática previa. Los bloques estándar se delegan literalmente al runtime original. Sus fuentes fijadas por SHA no se modifican. La aritmética de la dinámica es clásica; no se demuestra ventaja cuántica ni se crean qubits para disfrazar cálculos estadísticos.

## Ley temporal aprendida

Cada estado es la máscara del vocabulario geopolítico/humanitario declarado en `narrativa/espacio.mjs`, con relatos conocidos en las 24 horas anteriores. Un intervalo sin relatos clasificados se marca ausente. El vocabulario de estados del modelo se obtiene únicamente del tramo de entrenamiento; una combinación no observada se abstiene.

El ejecutor aprende los conteos `N(i,j)` de estados consecutivos, las visitas `V(i)` y las etiquetas positivas `S(i)` de BTC en cada estado. La frecuencia de referencia narrativa es `pi(j)=(V(j)+1)/(sum(V)+K)`. Su transición es:

```text
T(i,j) = (N(i,j) + alpha*pi(j)) / (sum_j N(i,j) + alpha)
```

Sin salidas observadas y con `alpha=0` se utiliza `pi`. La referencia del retorno es `p0=(S+1)/(N+2)`; la emisión en un estado usa `e(i)=(S(i)+8*p0)/(N(i)+8)`. Estas probabilidades son asociaciones estimadas, no leyes causales comprobadas.

Desde una distribución inicial `d0`, el ejecutor calcula `d(h+1)=d(h)T` y `p(h)=sum_i d(h,i)e(i)`. Antes de avanzar otro paso escribe la distribución en Inverse Ether Memory y la recupera desde allí. Los conteos aprendidos se vuelven a leer de esa memoria, protegidos por una comprobación de integridad; el checkpoint ejecutable lleva además SHA-256 del programa, extractor y fuente del ejecutor.

La métrica permanece **superar +10 puntos básicos en las 24 horas posteriores a la fecha elegida**. El horizonte `h` indica cuántos días separan el estado inicial de esa fecha. Ya no se mezcla este objetivo diario con una subida acumulada hasta 2030.

## Entrenamiento y examen

El plan se fijó antes de ejecutar esta prueba: 42 días de entrenamiento, 14 de selección y 14 de test; avance de 14 días. Se evalúan anticipaciones de 0 a 7 días. La selección de `alpha` entre 0, 1, 4 y 16 usa exclusivamente log-loss de estados narrativos en validación. Se congela el modelo con un corte efectivo al final de esa selección y se impide consultarlo para un origen anterior.

La prueba usa dos ventanas sobre la muestra existente. Esos períodos ya habían sido explorados en experimentos anteriores: no constituyen una nueva confirmación independiente. El informe completo registra candidatos, matrices, programas, pronósticos sellados, observaciones y resultados por horizonte.

| Anticipación | Casos BTC | Brier temporal | Referencia |
| --- | ---: | ---: | ---: |
| 0 días | 28 | 0.265191 | 0.244540 |
| 1 día | 26 | 0.246410 | 0.245788 |
| 3 días | 22 | 0.244796 | 0.244835 |
| 7 días | 14 | 0.247843 | 0.247786 |

Menor Brier es mejor. Las diferencias diminutas favorables en algunos horizontes no acreditan significación estadística ni ventaja financiera. El modo histórico estricto no puntúa BTC porque las versiones originales de esos cierres no están verificadas; el informe exploratorio conserva expresamente la hipótesis de disponibilidad al cierre.

El modelo actual sí puede entrenarse **ahora** con cierres ya descargados y conocidos ahora. Ajusta 7 estados, 89 transiciones y 90 etiquetas. Su corte real de entrenamiento se conserva en `as_of`, y la primera fecha futura mostrada comienza después de ese corte. El último estado narrativo archivado es del 27 de octubre; los días intermedios se propagan, no se rellenan con noticias inventadas.

## Proyección futura y publicación

El calendario calcula una **proyección diaria completa hasta el 31 de diciembre de 2030**, con probabilidad positiva, negativa y distribución de estados. Los siete días examinados retrospectivamente son información del modelo, no un límite para explorar. El ejecutor ya no impone el anterior tope de 32 pasos.

La extrapolación utiliza la misma ley aprendida `d(h+1)=d(h)T`, conservando `T` y las emisiones durante todos los pasos. Puede converger a una distribución estacionaria; no se agrega variación aleatoria para que la curva parezca cambiar. Cada resultado sigue referido al retorno de las 24 horas posteriores a su fecha. La prueba de exactitud del software comprueba 1.526 pasos de un ciclo conocido sin convertir ese examen en precisión demostrada de Bitcoin. Las combinaciones narrativas no observadas continúan identificándose como tales; no se les asignan pesos inventados.

El sitio consulta trazas nativas precalculadas. El botón de cotización actualiza precio y noticias; no compila ni ejecuta C++ dentro de Cloudflare Workers. El modelo temporal se vuelve a entrenar con los comandos siguientes y después se publica su nuevo perfil. La fecha del ajuste queda visible en la procedencia del archivo.

## Reproducción

Con CMake:

```bash
cmake -S native -B build-laplace -DCMAKE_BUILD_TYPE=Release
cmake --build build-laplace --target laplace_temporal --parallel 2
```

Compilación directa usada en el entorno local, donde CMake no estaba instalado:

```bash
mkdir -p build-laplace
g++ -std=c++17 -O2 -I deps/mundo-X/native/include native/laplace_temporal.cpp -o build-laplace/laplace_temporal
```

Los encabezados deben corresponder al commit original `3d29556eff4d1079c791abab38e203fc209f1722`. Después, con nombres de salida nuevos:

```bash
node tools/laplace.mjs entrenar-dinamica evidencia/BTC-HISTORICO.json ./build-laplace/laplace_temporal registros/dinamica-001.json exploratory_close_availability
node tools/laplace.mjs entrenar-dinamica evidencia/BTC-HISTORICO.json ./build-laplace/laplace_temporal registros/dinamica-estricta-001.json strict
node tools/laplace.mjs perfil-dinamica evidencia/BTC-HISTORICO.json registros/dinamica-001.json ./build-laplace/laplace_temporal registros/perfil-nativo-001.json
MUNDO_X_QUANTUM=./build-ether/mundo_x_quantum LAPLACE_TEMPORAL=./build-laplace/laplace_temporal node --test tests/*.test.mjs
```

Los informes guardados son `BTC-DINAMICA.json`, `BTC-DINAMICA-ESTRICTA.json` y `BTC-DINAMICA-PERFIL.json`. El perfil de consulta contiene hashes del ejecutor, programa, salida nativa y ledger. Las pruebas verifican un ciclo temporal desconocido hasta 1.526 pasos, recuperación del estado propagado en memoria original, corrupción rechazada, estados nuevos, ausencia de etiquetas, separación cronológica y conservación de pronósticos cuando se alteran precios del test.

Se comprobó también la exportación del navegador para el 25 de septiembre: el programa exportado reproduce exactamente `0.43315340909090916` en el ejecutor nativo. El programa y la comprobación se conservan en `BTC-DINAMICA-REPLAY.xi` y `BTC-DINAMICA-REPLAY.json`. Puede repetirse sin el navegador:

```bash
./build-laplace/laplace_temporal evidencia/BTC-DINAMICA-REPLAY.xi
```

La publicación se verificó mediante acceso autorizado al sitio privado: el perfil y el adaptador publicados coinciden con sus fuentes, todas las trazas vuelven a producirse exactamente en el ejecutor nativo y los dos scripts anteriores responden 404. `BTC-DINAMICA-VERIFICACION.json` conserva la verificación de la versión anterior. `BTC-PROYECCION-2030.json` registra la nueva proyección, sus masas y su reproducción, sin credenciales.

La compilación del panel y las 77 pruebas pasaron. La comprobación visual de esta revisión quedó sin verificar porque la dirección de la previsualización rechazó la conexión del navegador; no se presenta una captura de la versión anterior como evidencia de la nueva.

Referencias metodológicas: [cadenas de Markov, Marco Taboga](https://www.statlect.com/fundamentals-of-statistics/Markov-chains) y [validación con origen temporal móvil, Hyndman y Athanasopoulos](https://otexts.com/fpp3/tscv.html). La implementación nativa y sus límites son propios de LaPlaceDIG; esas fuentes no validan este modelo de Bitcoin.
