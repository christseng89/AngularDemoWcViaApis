# MT2 139-case curl runner

`run_mt2_139.sh` executes the frozen 139-case MT2 workbook against the reviewed
resolution endpoints. It uses `curl` for every HTTP request and writes one
machine-readable JSON report. The workbook and expected outcomes remain
read-only and are never rewritten.

## Run

Prerequisites: Bash 4+, Node.js 22+, and curl 8+.

```bash
cd staging_swift_sd
BASE_URL=https://staging.example.internal/api \
  qa/mt2/test_cases/run_mt2_139.sh
```

The default report is `qa/mt2/reports/mt2-139-curl-results.json`. Override it with
`--output FILE` or `MT2_QA_REPORT`. For an authenticated environment, set
`MT2_QA_AUTH_TOKEN`; the token is used as a Bearer token and is not written to
the report. TLS verification is always enabled. Clear-text HTTP is accepted
only for localhost unless `MT2_QA_ALLOW_INSECURE_HTTP=1` is explicitly set.

Useful options:

```text
--base-url URL       Override BASE_URL and case-endpoints.json baseUrl
--output FILE        Select the machine-readable result file
--workbook FILE      Select a compatible workbook (must contain exactly 139 cases)
--keep-artifacts     Retain generated requests and per-case responses for diagnosis
```

The endpoint is selected in this fail-closed order: explicit
`request/context.domain`; reviewed redirect/message-contract expectation; then
the exact message-type adapter registry. An unknown domain, missing endpoint,
invalid JSON, duplicate/missing case, mismatched MX/MT HTTP status, transport
error, unexpected HTTP response, or MT/MX structural mismatch fails the run.
Responses are collected first and validated together after all curl calls, so a
single failed case does not hide the remaining case results.

Only paths declared in `qa/mt2/mt2-final/case-endpoints.json` and ending in
`/resolve` are callable. The runner does not seed, import, delete, or otherwise
invoke fixture/database administration APIs. Run it only against an isolated QA
environment because the target service may still record normal request audit
events.

## Validate locally

```bash
node --test qa/mt2/test_cases/*.test.mjs
npx prettier --check qa/mt2/test_cases
npm run lint
npm run typecheck
```
