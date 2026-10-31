# Ecuación de Laplace auténtica — laboratorio PDE

La ecuación de Laplace es **∇²φ = 0**; en dos dimensiones,
**∂²φ/∂x² + ∂²φ/∂y² = 0**. No es el demonio de Laplace
de la mecánica clásica ni una ecuación de predicción del futuro.
No incluye una derivada temporal.

## Código nuevo

- **ecuacion/laplace-pde.mjs**: resolución de una malla por diferencias
  finitas de segundo orden y relajación sucesiva (SOR), condiciones
  de frontera Dirichlet, puntos interiores opcionalmente observados.
- **ecuacion/laplace-grafo.mjs**: versión para una red con nodos y aristas
  declarados de forma explícita. Resuelve el laplaciano ponderado
  Σⱼ wᵢⱼ(φᵢ−φⱼ)=0. No inventa conexiones.
- Ambos exponen tolerancia, residuo, convergencia y rechazo explícito
  si faltan fronteras o si la malla no converge.
- El código no realiza operaciones, predicciones ni aprende
  leyes financieras sin datos suficientes.

## Ejecutar

~~~bash
npm run test:laplace-pde
npm run ecuacion:laplace -- demo
npm run ecuacion:laplace -- demo-grafo
npm run ecuacion:laplace -- resolver mi-malla.json
npm run ecuacion:laplace -- resolver-grafo mi-grafo.json
~~~

Malla JSON:

~~~json
{"grid":[[0,0,0],[0,null,1],[0,1,1]],"dx":1,"dy":1,"tolerance":1e-8}
~~~

Grafo JSON:

~~~json
{"nodes":[{"id":"A","value":0},{"id":"B","value":null},{"id":"C","value":1}],
 "edges":[{"from":"A","to":"B","weight":1},{"from":"B","to":"C","weight":1}]}
~~~

El grafo devuelve para B el valor armónico 0.5. Eso es una
**interpolación bajo supuestos**, NO una predicción del precio de
un activo. Para aplicar la ecuación a la base EF002 habría
que justificar topología, pesos, escalas comunes, frontera
temporal sin fuga y ventaja medida frente a persistencia.

## Validación

Pruebas con soluciones analíticas armónicas
(ax + by + c y x² − y²), malla anisotrópica, condiciones
interiores, media ponderada en red, fallos de convergencia y
rechazo de datos inválidos.

EF004 y la APK Android existente permanecen intactos.
La PDE no se promueve a motor predictivo sin pruebas prospectivas.
