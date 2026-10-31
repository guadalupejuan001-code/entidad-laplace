#!/usr/bin/env bash
set -euo pipefail
BASE="https://raw.githubusercontent.com/guadalupejuan001-code/LaPlaceDIG/63efe4f6fb00ae1cdb74aad32f259f77d81c13ca"
check_or_restore() {
  local path="$1" expected="$2" temp actual
  if [ -f "$path" ]; then
    actual="$(git hash-object "$path")"
    if [ "$actual" = "$expected" ]; then
      echo "Archivo ya verificado: $path"
      return 0
    fi
    echo "Hash actual distinto, se intentará recuperar: $path" >&2
  fi
  mkdir -p "$(dirname "$path")"
  temp="$(mktemp)"
  trap 'rm -f "$temp"' RETURN
  curl --fail --location --show-error --silent --retry 2 "$BASE/$path" -o "$temp"
  actual="$(git hash-object "$temp")"
  test "$actual" = "$expected" || { echo "Falló verificación de $path" >&2; return 1; }
  mv "$temp" "$path"
  trap - RETURN
  echo "Restaurado y verificado: $path"
}
check_or_restore "evidencia/pulso-20261030/raw/2e119cb5d8cb393d720d080a56370794e2513e03de11a4c1c6d90dd36743fe82.txt.gz" "2d87334d97b6751a2bf8987716efc816617739bc"
check_or_restore "evidencia/pulso-20261030/resultado/registry.json.gz" "3143ccb04f231c01088e490e7aad82a3e78be744"
