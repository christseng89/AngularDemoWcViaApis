#!/usr/bin/env bash
# Clean up balance_contracts/balance_movements rows for one LC number.
#
# Usage:
#   ./scripts/cleanup-by-lc.sh <LC_NUMBER> [--dry-run] [--yes]
#
# Env:
#   DB_PATH   defaults to balance-component.sqlite (same default as src/server.ts)
#
# Deletes the LC's own balance_contracts row plus any child contracts that
# share its lc_number (SHGT, EPLC_CONFIRMATION, Acceptance — see
# src/store/balanceContractStore.ts, lc_number is part of every natural
# key), and all balance_movements rows tied to any of those contracts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

LC_NUMBER="${1:-}"
if [[ -z "$LC_NUMBER" || "$LC_NUMBER" == --* ]]; then
  echo "Usage: $0 <LC_NUMBER> [--dry-run] [--yes]" >&2
  exit 1
fi
shift

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
node scripts/cleanup-by-lc.mjs "$LC_NUMBER" --dry-run

if [[ "$DRY_RUN" -eq 1 ]]; then
  exit 0
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Delete the rows above for LC ${LC_NUMBER}? [y/N] " reply
  case "$reply" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

node scripts/cleanup-by-lc.mjs "$LC_NUMBER"
