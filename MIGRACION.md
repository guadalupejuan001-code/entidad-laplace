# Entidad Laplace — traslado y procedencia

**Repositorio independiente:** `guadalupejuan001-code/entidad-laplace` (privado).

## Importación principal

Origen: `guadalupejuan001-code/LaPlaceDIG`, rama `feature/d001-derivados-perps-opciones-20261031`, commit exacto `63efe4f6fb00ae1cdb74aad32f259f77d81c13ca`.

Los **445 archivos** de esa revisión se han incorporado. La comparación de Git SHA-1 de los blobs confirma coincidencia exacta de **444 de 445 archivos**. La única diferencia deliberada es `README.md`, al que se añadió una portada para Entidad Laplace.

La rama original contiene el núcleo M001, F001 (14 horizontes), U003/U004, X002, O001-A/B, D001, documentación, pruebas, capturas y experimentos. Los workflows originales están preservados en `procedencia/workflows-originales/` sin ejecución programada duplicada.

Dos archivos `.gz` de más de 1 MB necesitaron exportación puntual en trozos para superar la limitación de lectura de archivos binarios grandes de la API de GitHub. Ambos se restauraron como blobs idénticos en el nuevo repositorio:
- `evidencia/pulso-20261030/raw/2e119cb5d8cb393d720d080a56370794e2513e03de11a4c1c6d90dd36743fe82.txt.gz`, SHA `2d87334d97b6751a2bf8987716efc816617739bc`.
- `evidencia/pulso-20261030/resultado/registry.json.gz`, SHA `3143ccb04f231c01088e490e7aad82a3e78be744`.

`tools/recuperar-evidencia-grande.sh` es una herramienta opcional para volver a verificar o recuperar esos archivos en un equipo con red. **No es necesaria para el repositorio completo actual.**

## Integraciones conservadas, sin alterar anfitriones

- `integraciones/reverse-pc/`: 29 archivos relacionados con Laplace de `guadalupejuan001-code/REVERSE-PC`, rama `feature/laplace-f001-multiescala-android-20261030`, commit `311a9623382e8b5e0b87d00fd22c726ef332043a`. Incluye assets, clases Java y tests del adaptador; no es una APK autónoma.
- `integraciones/mundo-x/`: 15 archivos de `guadalupejuan001-code/mundo-X`, commit `6f36ba5701efcedd5173fb8107db1994328c5810`. Incluye el prototipo Android y el experimento de demonio de Laplace.

Las carpetas de integración conservan las rutas originales bajo su prefijo para poder distinguirlas del código central.

## Historial y verificación

La migración directa por la API de GitHub **copió instantáneas verificadas, no el historial completo de commits/ramas**. Los repositorios anteriores, sus PR, branches y commits se conservaron intactos. La verificación de hashes demuestra equivalencia de los archivos; **no equivale a ejecutar toda la suite ni a probar exactitud de los pronósticos**. La ejecución automática de importación en el nuevo repositorio falló antes de iniciar; se empleó transferencia directa comprobada.

Las predicciones y señales son experimentales; no hay ventaja financiera estable acreditada, ni conocimiento perfecto del futuro, ni órdenes automáticas de trading.
