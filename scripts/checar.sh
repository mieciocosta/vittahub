#!/usr/bin/env bash
# ✅ CHECAGEM COMPLETA ANTES DE COMMITAR (regra da casa, reforçada em 19/09
# depois de um build quebrado chegar à main). Falha em QUALQUER erro:
#   1. node --check em todo arquivo do backend
#   2. build do frontend
#   3. lint TDZ (só informa; os avisos antigos são conhecidos)
#   4. teste de fumaça: abre o dist no Chromium e importa todos os chunks
set -euo pipefail
cd "$(dirname "$0")/.."
echo "── 1/4 backend: node --check"
find backend/src -name '*.js' -print0 | xargs -0 -n1 node --check
echo "   ok"
echo "── 2/4 frontend: build"
( cd frontend && npm run build 2>&1 | grep -vE '^\s*$' | tail -4 )
echo "── 3/4 frontend: lint TDZ (informativo)"
( cd frontend && npx eslint --config lint-tdz.config.mjs "src/**/*.jsx" 2>&1 | grep -cE '^\s+[0-9]+:[0-9]+\s+error' | sed 's/^/   avisos no-use-before-define: /' ) || true
echo "── 4/4 frontend: fumaça no Chromium"
CHROME="${CHROME_PATH:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
( cd frontend && node scripts/fumaca.cjs "$CHROME" )
echo "✅ TUDO OK — pode commitar"
