# Balance Component Configuration Reference

This document records the configuration implemented by the current source code. HTTP request and response contracts remain defined by the two OAS files; configuration is documented here rather than duplicated into API schemas.

## Root `.env`

`scripts/generate-runtime-config.mjs` reads Angular retry and Business Case recovery values using this precedence:

1. process environment
2. root `.env`
3. source fallback

The Balance microservice start and development scripts load the same root `.env` with Node's `--env-file` option. Account Number validation is read when that process starts.

| Variable | Current `.env` value | Source fallback | Constraint | Consumer |
|---|---:|---:|---|---|
| `BALANCE_HTTP_RETRY_COUNT` | `3` | `3` | integer 0–10 | generated Angular HTTP retry |
| `BALANCE_HTTP_RETRY_INITIAL_DELAY_MS` | `250` | `250` | integer 0–60000 ms | generated Angular initial backoff |
| `BALANCE_HTTP_RETRY_MAX_DELAY_MS` | `2000` | `2000` | integer from initial delay through 60000 ms | generated Angular maximum backoff |
| `BUSINESS_CASE_RECOVERY_RETRY_COUNT` | `15` | `15` | integer 0–60 | recovery polling after database cleanup |
| `BUSINESS_CASE_RECOVERY_INTERVAL_MS` | `2000` | `2000` | integer 100–60000 ms | recovery polling interval |
| `BALANCE_ACCOUNT_NUMBER_REGEX` | `^.+$` | `^.+$` | valid JavaScript regular expression | Balance microservice Account Number validation |
| `BALANCE_ACCOUNT_NUMBER_MIN_LEN` | `1` | `1` | non-negative integer, not above maximum | Balance microservice Account Number validation |
| `BALANCE_ACCOUNT_NUMBER_MAX_LEN` | `128` | `128` | non-negative integer, not below minimum | Balance microservice Account Number validation |

Run `npm run prepare:app` after changing generated Angular settings, then restart a running Angular process. Restart the Balance microservice after changing its startup environment.

Sensitive values must never be copied into documentation. If an environment name contains `SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL`, or `PRIVATE_KEY`, document only its name in the form `AAA=...`.

## Service runtime environment

| Process | Variable | Source fallback | Meaning |
|---|---|---|---|
| Balance microservice | `PORT` | `4100` | HTTP listen port |
| Balance microservice | `DB_PATH` | `balance-component.sqlite` | SQLite file path |
| Business Case backend | `PORT` | `4300` | HTTP listen port |
| Business Case backend | `BALANCE_SERVICE_URL` | `http://localhost:4100` | Balance API upstream |
| Business Case backend | `ALLOWED_ORIGINS` | `http://localhost:4200` | comma-separated CORS allowlist |

The Business Case backend reads the process environment it inherits; its package script does not load `.env` directly. Restart the affected process for a runtime environment change.

## Source-controlled configuration

| Area | Authoritative source | Generated or runtime consumer | Change lifecycle |
|---|---|---|---|
| Account mapping taxonomy | `microservices/balance-component/config/balance-account-mappings.json` | `src/app/core/balance-account-taxonomy.generated.ts` and Account Number Maintenance | `npm run prepare:app`, Angular rebuild/restart |
| Lifecycle and business-day policy | `microservices/balance-component/src/config.ts` | Balance service expiry/close sweep | test, build, microservice restart |
| Domestic calendar fixture | `scripts/generate-domestic-calendar.mjs`, standing reference JSON | `microservices/business-days-mock/data/calendar.json` | regenerate and validate fixture |
| Normal development proxy | `proxy.conf.json` | Angular dev server | restart dev server |
| Live-E2E proxy | `e2e/live/proxy.conf.json` | live Playwright environment | restart live-E2E host |
| Web Component runtime contract | `src/app/web-component/balance-component-element.contract.ts` | embedding hosts | supplied at host runtime |
| Angular build targets | `angular.json` | Angular CLI | rebuild |
| Browser test projects | `playwright.config.ts`, `playwright.live.config.ts` | Playwright | next test run |

The normal proxy routes `/api` to port 4300 and Balance requests to port 4100. The live-E2E proxy uses backend port 4301 and Balance port 4100. A Vite `ECONNREFUSED` indicates that a configured target is unavailable; retry settings do not make an offline service ready.

The taxonomy JSON also owns the 11 current default Account Number/Description pairs exported from the maintenance DB. The Account Number Maintenance `Reload` button immediately and atomically writes those defaults back to DB, resetting each row to version `1` with `updatedBy=SYSTEM_CONFIG_RELOAD`. It is separate from Cleanup Database, which preserves Account Number mappings.

## Lifecycle constants

The current Balance microservice source defines:

- expiry sweep every 30 seconds;
- Import and Export mail-float grace of 5 days each;
- distinct `BATCH_MAKER` and `BATCH_CHECKER` actors;
- auto expiry and auto close enabled;
- auto-close reason `NATURAL_EXPIRY_ALL_BALANCES_CLEARED`;
- auto close after 2 business days.

These are source constants, not environment overrides. The domestic calendar is a local test/development fixture and must not be treated as authoritative production holiday data.

## Related contracts

- [Balance Account Number maintenance](balance-account-number-maintenance.md)
- [Current behavior](current-behavior.md)
- [Balance Component OAS](../analysis/balance-component-api.yaml)
- [Channel OAS](../analysis/balance-component-channel-api.yaml)
- [HTTP retry policy](http-retry-policy.md)
