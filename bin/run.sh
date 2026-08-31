#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Google MMB & Enterprise Runner for DeepSeek Harness
# Boots upstream DeepSeek Harness with Google MMB profile overlay
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-31415}"
PATCH_FILE="${REPO_ROOT}/profiles/google-mmb/cordis.patch.yml"

echo "=== Booting Google MMB Migration Workbench ==="
echo "Patch overlay: ${PATCH_FILE}"
echo "Server host:   ${HOST}"
echo "Server port:   ${PORT}"

if [ -n "${DSH_EXEC:-}" ] && [ -x "${DSH_EXEC}" ]; then
  exec "${DSH_EXEC}" web --patch "${PATCH_FILE}" --host "${HOST}" --port "${PORT}" "$@"
elif command -v dsh >/dev/null 2>&1; then
  exec dsh web --patch "${PATCH_FILE}" --host "${HOST}" --port "${PORT}" "$@"
else
  echo "Error: 'dsh' binary not found on PATH. Set DSH_EXEC=/path/to/dsh or ensure it is in PATH." >&2
  exit 1
fi
