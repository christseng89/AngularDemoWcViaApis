# standing-mock

A local, deliberately simplified stand-in for the external **Standing** microservice described in
`../../analysis/maturity_date/Standing_Microservice_Maturity_Date_OAS_Design.md` (v2.10.0) — built so
lc-balance's A6/B4 Calculated Maturity Date work has something real to call in dev/demo without a live
Standing instance. See `Maturity-Date-Business-Day-Convention-Decision-Request.md` (repo root) for why this
exists: GAP-15 keeps Balance Component itself holiday-calendar-free, so the calendar-adjustment step is
delegated to Standing instead.

**Wired into `microservices/balance-component/` as of 2026-08-23** — `src/clients/standingClient.ts` calls
this server's `POST /business-days/adjust` (default `STANDING_SERVICE_URL=http://localhost:4400`, matching
this mock's own default port) whenever a Maker opts an Acceptance CREATE (A6, or B4's own Usance-branch
compound-submission leg) into Standing-calculated Maturity Date via the new `maturityDateCalendars` request
field. See `lc-balance/CLAUDE.md`'s own decision-log entry for the full write-up, including a live
end-to-end verification run against this exact mock. Angular UI wiring (a visible field, the manual-override
mechanism) is still separate, not-yet-started work — today this is reachable only by calling
`POST /balance-movements` directly with `maturityDateCalendars` set.

## Scope

Implements **only** `POST /business-days/adjust` — the one endpoint A6/B4's Maturity Date calculation
needs. Everything else in the real v2.10.0 contract is out of scope for this mock (see `server.js`'s own
header comment for the full list: `POST /business-days/add`, the 5 read-only reference-data GET endpoints,
auth/scopes, calendar snapshot/version history, force-majeure tracking, correlation-ID/retry machinery).
The response shape (`calendarAssessments`, `adjustedDateAssessments`, `skippedDates`,
`contractualDateChanged: false`, etc.) follows the real OAS, so a client written against the real contract
should work against this mock unchanged for the one endpoint it covers.

`data/calendars.json` is hand-authored, illustrative 2026 weekend/public-holiday test data for a handful of
common trade-finance markets (US, GB, TW, HK, SG, JP, CN, AE) plus one `CURRENCY_CLEARING` calendar
(`USD_FEDWIRE`) and one always-open `INSTITUTION` calendar (`DEMOBANKXXX`) — the latter two exist
specifically to reproduce the design doc's own canonical Dec-25 worked example (§3.11). **Not an
authoritative calendar feed** — do not use for real date decisions.

## Run

```bash
cd microservices/standing-mock
npm install
npm start          # or npm run dev for --watch auto-restart
```

Listens on port `4400` (`PORT` env var to override) — chosen to avoid this project's existing `4100`
(balance-component)/`4200` (Angular)/`4300` (backend) ports.

## Example — reproduces the design doc's own Dec-25 worked example (§3.11)

```bash
curl http://localhost:4400/business-days/adjust -X POST -H "Content-Type: application/json" -d '{
  "sourceDate": "2026-12-25",
  "sourceDateType": "CONTRACTUAL_MATURITY_DATE",
  "calculationPurpose": "OPERATIONAL_PAYMENT_DATE",
  "calendars": [
    { "calendarType": "INSTITUTION", "code": "DEMOBANKXXX", "role": "PAYING_BANK", "required": true },
    { "calendarType": "CURRENCY_CLEARING", "code": "USD_FEDWIRE", "role": "CURRENCY_CLEARING", "required": true }
  ],
  "combinationRule": "ALL_REQUIRED_OPEN",
  "convention": "FOLLOWING"
}'
```

Expected: `adjustedDate: "2026-12-28"`, `contractualDateChanged: false`, `calendarAssessments` showing the
paying bank open (`businessDay: true`) but USD clearing closed (`businessDay: false`, `PUBLIC_HOLIDAY`) —
matching the design doc's own stated result exactly (verified live 2026-08-23).
