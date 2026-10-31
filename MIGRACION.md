# Entidad Laplace — trazabilidad de migración

**Repositorio de trabajo:** `guadalupejuan001-code/entidad-laplace` (privado).

## Código principal

Instantánea de `guadalupejuan001-code/LaPlaceDIG`, rama `feature/d001-derivados-perps-opciones-20261031`, commit `63efe4f6fb00ae1cdb74aad32f259f77d81c13ca`.

Contiene código, tests, experimentos, documentos, U003/U004, X002, F001, O001-A, O001-B, D001, evidencias y herramientas. Se contrastaron los SHA de los archivos con la rama de origen: **442 coincidencias exactas**; `README.md` tiene una cabecera de identidad añadida intencionalmente. Quedan **dos registros binarios grandes** enlazados al origen, con recuperación verificable:

| Archivo | Tamaño original | Git SHA-1 |
|---|---:|---|
| `evidencia/pulso-20261030/raw/2e119cb5d8cb393d720d080a56370794e2513e03de11a4c1c6d90dd36743fe82.txt.gz` | 1,147,650 bytes | `2d87334d97b6751a2bf8987716efc816617739bc` |
| `evidencia/pulso-20261030/resultado/registry.json.gz` | 2,837,230 bytes | `3143ccb04f231c01088e490e7aad82a3e78be744` |

Ejecute `bash tools/recuperar-evidencia-grande.sh` en un equipo con acceso a GitHub para descargar ambas piezas y verificar su hash antes de instalarlas. No están incluidas materialmente en el commit actual.

## Integraciones adicionales

- `integraciones/reverse-pc/`: 29 archivos del adaptador Android y tests, desde `guadalupejuan001-code/REVERSE-PC`, rama `feature/laplace-f001-multiescala-android-20261030`, commit `311a9623382e8b5e0b87d00fd22c726ef332043a`.
- `integraciones/mundo-x/`: 15 archivos del prototipo Android independiente e investigación del demonio de Laplace, desde `guadalupejuan001-code/mundo-X`, commit `6f36ba5701efcedd5173fb8107db1994328c5810`.

El adaptador REVERSE-PC necesita su anfitrión Android. El proyecto de Mundo X es un prototipo independiente, no la misma versión del adaptador nuevo; no se afirma haber generado una APK.

## Historial, versiones y funcionamiento

La migración directa por API conserva el contenido de cada archivo y una referencia fija al commit de origen, **no copia toda la historia Git original**. Las ramas, PR y commits previos permanecen en sus repositorios de origen. Los workflows antiguos se conservan inactivos en `procedencia/workflows-originales/`; no se programaron tareas duplicadas. La validación de hashes es estructural, no sustituye a la ejecución de suites de pruebas.

Los modelos financieros siguen siendo experimentales. No se ha demostrado una ventaja predictiva sostenida ni se han habilitado órdenes financieras automáticas.
