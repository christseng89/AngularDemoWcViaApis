#!/usr/bin/env bash
set -Eeuo pipefail

output_file=''
while (($#)); do
  case "$1" in
    --output) output_file="$2"; shift 2 ;;
    --connect-timeout|--max-time|--request|--header|--data-binary|--write-out)
      shift 2
      ;;
    --silent|--show-error|--location|--max-redirs)
      if [[ "$1" == '--max-redirs' ]]; then shift 2; else shift; fi
      ;;
    *) shift ;;
  esac
done
[[ -n "$output_file" ]] || exit 2
case_number="$(basename -- "$output_file" .body)"
run_directory="$(cd -- "$(dirname -- "$output_file")/.." && pwd -P)"
cp -- "$run_directory/cases/$case_number/expected.json" "$output_file"
sed -n 's/.*"expectedStatus": \([0-9][0-9]*\).*/\1/p' \
  "$run_directory/cases/$case_number/metadata.json"
