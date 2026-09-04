---
title: "Configuration Reference"
type: reference
domain: configuration
status: verified
source_of_truth: source-code
source_revision: "1865d80"
verified_date: 2026-09-04
generated: true
aliases: []
tags: ["configuration", "environment", "operations"]
source_files:
  - ".env"
  - "scripts/generate-runtime-config.mjs"
  - "src/app/core/http-retry/http-retry.config.generated.ts"
  - "src/app/core/balance-account-taxonomy.generated.ts"
  - "microservices/balance-component/src/config.ts"
  - "microservices/balance-component/src/server.ts"
  - "backend/server.js"
  - "microservices/balance-component/config/balance-account-mappings.json"
  - "scripts/generate-domestic-calendar.mjs"
  - "microservices/business-days-mock/data/calendar.json"
  - "analysis/standing-microservice-reference/calendars.json"
  - "proxy.conf.json"
  - "e2e/live/proxy.conf.json"
  - "src/app/web-component/balance-component-element.contract.ts"
  - "angular.json"
  - "playwright.config.ts"
  - "playwright.live.config.ts"
---

# Configuration Reference

> [!important] Source of truth
> 本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。

## Configuration authority

| Configuration area | Authoritative source | Runtime consumer | Apply change |
|---|---|---|---|
| Angular retry／Business Case recovery | `.env` + `scripts/generate-runtime-config.mjs` | generated Angular constants | rerun `npm run prepare:app`; restart the dev process when running |
| Account Number validation | process environment, normally populated from root `.env` | Balance microservice `config.ts` | restart Balance microservice |
| Service ports／URLs／CORS | process environment | Balance microservice／Business Case backend | restart affected process |
| Account mapping taxonomy | `balance-account-mappings.json` | generator, Angular Account Number Maintenance | rerun `npm run prepare:app`; rebuild／restart Angular |
| Lifecycle policy constants | Balance microservice `config.ts` | expiry／close jobs and business-day policies | source change, test, rebuild, restart |
| Domestic calendar fixture | generator and JSON files | local business-day mock／reference | regenerate and validate fixture |
| Development proxy | proxy JSON | Angular dev server | restart dev server |
| Web Component host options | `balance-component-element.contract.ts` | embedding host／custom element | host supplies options at runtime |

## Root .env snapshot

The table is generated from the currently tracked root `.env`. Generation precedence for the Angular values is **`process.env` > `.env` > code fallback**. Unknown variables remain visible for review. Names containing `SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL` or `PRIVATE_KEY` are always rendered as `AAA=...`; their values are never copied into this vault.

| Name | Documented value | Code fallback | Validation | Consumer |
|---|---|---|---|---|
| `BALANCE_HTTP_RETRY_COUNT` | `3` | `3` | integer 0–10 | Angular generated HTTP retry |
| `BALANCE_HTTP_RETRY_INITIAL_DELAY_MS` | `250` | `250` | integer 0–60000 ms | Angular generated initial backoff |
| `BALANCE_HTTP_RETRY_MAX_DELAY_MS` | `2000` | `2000` | integer >= initial delay and <=60000 ms | Angular generated maximum backoff |
| `BUSINESS_CASE_RECOVERY_RETRY_COUNT` | `15` | `15` | integer 0–60 | Business Case service recovery polling |
| `BUSINESS_CASE_RECOVERY_INTERVAL_MS` | `2000` | `2000` | integer 100–60000 ms | Business Case recovery polling interval |
| `BALANCE_ACCOUNT_NUMBER_REGEX` | `^.+$` | `^.+$` | valid JavaScript regular expression | Maintained Account Number syntax |
| `BALANCE_ACCOUNT_NUMBER_MIN_LEN` | `1` | `1` | non-negative integer; <= maximum | Maintained Account Number minimum length |
| `BALANCE_ACCOUNT_NUMBER_MAX_LEN` | `128` | `128` | non-negative integer; >= minimum | Maintained Account Number maximum length |

## Service runtime environment

| Process | Variable | Source fallback | Meaning |
|---|---|---|---|
| Balance microservice | `PORT` | `4100` | HTTP listen port |
| Balance microservice | `DB_PATH` | `balance-component.sqlite` | SQLite file path |
| Business Case backend | `PORT` | `4300` | HTTP listen port |
| Business Case backend | `BALANCE_SERVICE_URL` | `http://localhost:4100` | Balance API upstream |
| Business Case backend | `ALLOWED_ORIGINS` | `http://localhost:4200` | comma-separated CORS allowlist |

The Balance microservice start scripts load the repository `.env`; the backend reads its inherited process environment. A change is not live until the relevant process is restarted.

## Source-controlled policy configuration

### Account mapping taxonomy

`microservices/balance-component/config/balance-account-mappings.json` defines configured business categories, balance families, display order and allowed tenor keys. `generate-runtime-config.mjs` validates referential integrity and creates the Angular taxonomy module. The database continues to store the composed Account Number／Description mapping; the taxonomy controls maintenance UI grouping rather than adding GL／SL columns. See [[Balance Account Configuration]].

### Lifecycle and business-day rules

`config.ts` currently defines a 30-second expiry sweep, Import／Export mail-float grace of 5 days, automated Maker／Checker actors, auto-expiry and auto-close enablement, an auto-close reason, and a 2-business-day auto-close grace period. These are source constants, not `.env` overrides. The domestic-calendar generator copies the standing reference into the local business-day mock; this is test／development data and is not proof of a production holiday calendar. See [[Auto Expiry and Auto Close]].

### Proxy routing

The normal Angular proxy sends `/api` to port 4300 and Balance routes to port 4100. The live-E2E proxy uses backend port 4301 while retaining Balance port 4100. Proxy failure therefore appears as Vite `ECONNREFUSED` when the target process is unavailable; retry configuration does not replace service readiness.

### Web Component configuration

The public runtime contract has configuration version `1`, view selection, `system`／`light`／`dark` themes and CSS design tokens. Unknown keys or incompatible versions are rejected by the contract parser.

## Change procedure

1. Change the authoritative source only; do not edit generated TypeScript files manually.
2. Run `npm run prepare:app` for `.env` generation or taxonomy changes.
3. Run the relevant type checks／tests and `npm run docs:verify`.
4. Restart the process whose startup configuration changed.
5. Regenerate this vault with `node scripts/rebuild-obsidian-kb.mjs --write`.

The external documentation counterpart is `docs/configuration.md`; OAS remains the authority for HTTP payloads and does not duplicate deployment settings.
