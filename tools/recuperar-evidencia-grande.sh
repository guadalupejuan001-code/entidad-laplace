#!/usr/bin/env bash
set -euo pipefail

BASE="https://raw.githubusercontent.com/guadalupejuan001-code/LaPlaceDIG/63efe4f6fb00ae1cdb74aad32f259f77d81c13ca"
fetch_checked() {
  local path="$1" expected="$2" target="$path" temp
  mkdir -p "$(dirname "$target")"
  temp="$(mktemp)"
  trap 'rm -f "$temp"' RETURN
  curl --fail --location --show-error --silent --retry 2 "$BASE/$path" -o "$temp"
  local actual
  actual="$(git hash-object "$temp")"
  if [ "$actual" != "$expected" ]; then
    echo "SHA incorrecto para $path: $actual" >&2
    return 1
  fi
  mv "$temp" "$target"
  trap - RETURN
  echo "Verificado: $target"
}
fetch_checked "evidencia/pulso-20261030/raw/2e119cb5d8cb393d720d080a56370794e2513e03de11a4c1c6d90dd36743fe82.txt.gz" "2d87334d97b6751a2bf8987716efc816617739bc"
fetch_checked "evidencia/pulso-20261030/resultado/registry.json.gz" "3143ccb04f231c01088e490e7aad82a3e78be744"
