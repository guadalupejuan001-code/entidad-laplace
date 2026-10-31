#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
npm ci
npm run input:install
exec npm run input
