#!/usr/bin/env bash
# Wipe ALL rows from balance_contracts and balance_movements (tables/schema
# stay in place). For cleaning up one LC only, use cleanup-by-lc.sh instead.
#
# Usage:
#   ./scripts/cleanup-all.sh [--dry-run] [--yes]
#
# Env:
#   DB_PATH   defaults to balance-component.sqlite (same default as src/server.ts)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

DRY_RUN=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node not found on PATH" >&2
  exit 1
fi

# Always preview first so the confirmation prompt has something to confirm.
node scripts/cleanup-all.mjs --dry-run

if [[ "$DRY_RUN" -eq 1 ]]; then
  exit 0
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Delete ALL rows from balance_contracts and balance_movements? [y/N] " reply
  case "$reply" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

node scripts/cleanup-all.mjs
