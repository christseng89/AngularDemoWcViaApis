#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
WORKSPACE="$(cd -- "$SCRIPT_DIR/../../.." && pwd -P)"
WORKBOOK="${MT2_QA_WORKBOOK:-$WORKSPACE/qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx}"
ENDPOINTS="${MT2_QA_ENDPOINTS:-$WORKSPACE/qa/tests/mt2/final/case-endpoints.json}"
REGISTRY="${MT2_QA_REGISTRY:-$WORKSPACE/qa/tests/mt2/final/message-adapter-registry.json}"
BANK_SERVICES="${MT2_QA_BANK_SERVICES:-$WORKSPACE/qa/fixtures/mt2/baselines/bank-service.current.json}"
OUTPUT="${MT2_QA_REPORT:-$WORKSPACE/qa/reports/latest/mt2/mt2-139-curl-results.json}"
CURL_BIN="${MT2_QA_CURL_BIN:-curl}"
CONNECT_TIMEOUT="${MT2_QA_CONNECT_TIMEOUT:-5}"
MAX_TIME="${MT2_QA_MAX_TIME:-30}"
BASE_URL="${BASE_URL:-}"

usage() {
  printf '%s\n' \
    'Usage: run_mt2_139.sh [--base-url URL] [--output FILE]' \
    '                         [--workbook FILE] [--keep-artifacts]' \
    '' \
    'Runs all 139 frozen MT2 cases using curl. Configuration may also be' \
    'provided through BASE_URL, MT2_QA_REPORT, MT2_QA_WORKBOOK,' \
    'MT2_QA_AUTH_TOKEN, MT2_QA_CONNECT_TIMEOUT, and MT2_QA_MAX_TIME.'
}

KEEP_ARTIFACTS=0
while (($#)); do
  case "$1" in
    --base-url) BASE_URL="${2:?--base-url requires a value}"; shift 2 ;;
    --output) OUTPUT="${2:?--output requires a value}"; shift 2 ;;
    --workbook) WORKBOOK="${2:?--workbook requires a value}"; shift 2 ;;
    --keep-artifacts) KEEP_ARTIFACTS=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

for command in node "$CURL_BIN"; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Required command not found: %s\n' "$command" >&2
    exit 2
  }
done
[[ "$CONNECT_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || { echo 'MT2_QA_CONNECT_TIMEOUT must be a positive integer' >&2; exit 2; }
[[ "$MAX_TIME" =~ ^[1-9][0-9]*$ ]] || { echo 'MT2_QA_MAX_TIME must be a positive integer' >&2; exit 2; }
[[ -r "$WORKBOOK" && -r "$ENDPOINTS" && -r "$REGISTRY" && -r "$BANK_SERVICES" ]] || {
  echo 'Workbook, endpoint map, registry, or Bank Service fixture is not readable' >&2
  exit 2
}

RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mt2-curl.XXXXXXXX")"
cleanup() {
  if [[ "$KEEP_ARTIFACTS" == 1 ]]; then
    printf 'Artifacts retained: %s\n' "$RUN_DIR" >&2
  else
    rm -rf -- "$RUN_DIR"
  fi
}
trap cleanup EXIT
mkdir -- "$RUN_DIR/cases" "$RUN_DIR/results"

generator=(node "$SCRIPT_DIR/generate-mt2-curl-fixtures.mjs" "$WORKBOOK" "$ENDPOINTS" "$REGISTRY" "$RUN_DIR/cases" "$BANK_SERVICES")
[[ -n "$BASE_URL" ]] && generator+=("$BASE_URL")
"${generator[@]}"

node -e '
  const fs=require("fs");
  const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  for(const c of m.cases) console.log([c.index,c.testCaseNo,c.messageType,c.domain,c.endpoint,c.requestFile,c.expectedFile,c.metadataFile].join("\t"));
' "$RUN_DIR/cases/manifest.json" > "$RUN_DIR/manifest.tsv"

while IFS=$'\t' read -r index test_case message_type domain endpoint request_file expected_file metadata_file; do
  case_number="$(printf '%03d' "$index")"
  body_file="$RUN_DIR/results/$case_number.body"
  error_file="$RUN_DIR/results/$case_number.stderr"
  curl_args=(
    --silent --show-error --location --max-redirs 0
    --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME"
    --request POST --header 'Content-Type: application/json'
    --header 'Accept: application/json'
    --header "X-QA-Test-Case: $test_case"
    --header "X-QA-Message-Type: $message_type"
    --header "X-QA-Domain: $domain"
    --data-binary "@$request_file" --output "$body_file" --write-out '%{http_code}'
  )
  if [[ -n "${MT2_QA_AUTH_TOKEN:-}" ]]; then
    curl_args+=(--header "Authorization: Bearer ${MT2_QA_AUTH_TOKEN}")
  fi
  set +e
  actual_status="$($CURL_BIN "${curl_args[@]}" "$endpoint" 2>"$error_file")"
  curl_exit=$?
  set -e
  printf '%s\n' "$actual_status" > "$RUN_DIR/results/$case_number.status"
  printf '%s\n' "$curl_exit" > "$RUN_DIR/results/$case_number.curl-exit"
  printf '%s\t%s\n' "$test_case" "REQUESTED"
done < "$RUN_DIR/manifest.tsv"

set +e
node "$SCRIPT_DIR/aggregate-mt2-curl-results.mjs" \
  "$RUN_DIR/cases/manifest.json" "$RUN_DIR/results" "$OUTPUT"
aggregate_exit=$?
set -e
printf 'Machine-readable report: %s\n' "$OUTPUT"
exit "$aggregate_exit"
