#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Falta Node.js. Esta versión fue probada con Node.js 22.' >&2
  exit 1
fi
exec node panel/servidor.mjs
