#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/upgrade-angular.sh 17
  bash scripts/upgrade-angular.sh 18
  bash scripts/upgrade-angular.sh 19
  bash scripts/upgrade-angular.sh 20
  bash scripts/upgrade-angular.sh 21

Run exactly one target per clean Git revision. After validation, review and
commit that major before invoking this script for the next major.

Safety rules:
  - Angular CLI performs the Node compatibility check for the selected target.
  - Start with a clean Git worktree.
  - No --force and no automatic rollback are used.
  - The selected major runs lint, type-check, all Jest tests, and a production build.
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

angular_major() {
  node -p "Number(require('./node_modules/@angular/core/package.json').version.split('.')[0])"
}

verify_environment() {
  require_command git
  require_command node
  require_command npm
  require_command npx

  cd "${PROJECT_DIR}"
  [[ -f package.json && -f package-lock.json && -f angular.json ]] || die "Run this script from the lc-balance repository."

  if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    die "Git worktree is not clean. Commit or stash all changes before upgrading."
  fi
}

validate_stage() {
  local major="$1"
  printf '\nValidating Angular %s...\n' "${major}"
  npm run lint
  npx tsc --noEmit -p tsconfig.app.json
  npm test -- --runInBand
  npm run build -- --configuration production
}

upgrade_to() {
  local target_major="$1"
  local current_major
  current_major="$(angular_major)"

  if (( target_major < current_major )); then
    printf '\nAngular %s already exceeds requested Angular %s; skipping.\n' "${current_major}" "${target_major}"
    return
  fi
  if (( target_major > current_major + 1 )); then
    die "Cannot jump from Angular ${current_major} to ${target_major}. Upgrade one major at a time."
  fi

  printf '\nUpgrading Angular %s -> latest %s.x...\n' "${current_major}" "${target_major}"
  npx ng update "@angular/core@^${target_major}" "@angular/cli@^${target_major}"

  local installed_major
  installed_major="$(angular_major)"
  (( installed_major == target_major )) || die "Expected Angular ${target_major}, but Angular ${installed_major} is installed."

  validate_stage "${target_major}"
  printf '\nAngular %s validation passed. Review and commit this stage before continuing in production workflows.\n' "${target_major}"
}

main() {
  local target="${1:-}"
  if [[ -z "${target}" || "${target}" == "-h" || "${target}" == "--help" ]]; then
    usage
    [[ -n "${target}" ]] && exit 0
    exit 2
  fi
  [[ $# -eq 1 ]] || die "Pass exactly one target: 17, 18, 19, 20, or 21."
  [[ "${target}" =~ ^(17|18|19|20|21)$ ]] || die "Unsupported target: ${target}"

  verify_environment

  upgrade_to "${target}"

  printf '\nAngular upgrade workflow completed successfully.\n'
  printf 'Installed Angular core: %s\n' "$(node -p "require('./node_modules/@angular/core/package.json').version")"
  printf 'Review and commit this major before running the script for the next major.\n'
}

main "$@"
