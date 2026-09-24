# Embedded Virtual FX Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `tdd-orchestrator` to implement this plan task-by-task.

**Goal:** Make the LC Balance demo independently provide its non-production BOOKING-rate endpoint on the existing Balance backend port 4300.

**Architecture:** The existing Express backend owns a local virtual FX fixture and pure quote builder, and exposes the same HTTP contract previously hosted by LC Payment. The Balance microservice continues to consume the provider over HTTP, but its endpoint configuration changes to the Balance backend.

**Tech Stack:** Node.js, Express, Jest, Supertest, JSON fixtures, TypeScript Balance microservice.

---

### Task 1: Lock the HTTP Contract with a Failing Test

**Files:**
- Create: `backend/test/fx-booking-rate.test.js`

1. Add Supertest cases for an approved EUR quote, explicit GBP BOOKING quote, unavailable pair, invalid request, stale quote and JPY rounding.
2. Run `npm test --prefix backend -- --runInBand test/fx-booking-rate.test.js`.
3. Expect RED because `/api/fx/booking-rate` does not exist in the Balance backend.

### Task 2: Add the Balance-Owned Virtual Provider

**Files:**
- Create: `backend/virtual-booking-rate.js`
- Create: `backend/data/virtual-booking-rates.json`
- Modify: `backend/server.js`

1. Add deterministic decimal conversion and quote validation copied from the proven LC Payment demo contract.
2. Add only the virtual USD-to-owner fixtures required by Balance testing.
3. Add `GET /api/fx/booking-rate` to the existing Express application.
4. Preserve `X-Virtual-Fx-Adapter: true`, Approved/Effective, freshness, audit metadata and fail-closed responses.
5. Run the focused backend test and expect GREEN.

### Task 3: Remove the Runtime Dependency

**Files:**
- Modify: `.env`
- Modify: `.env.example` if present
- Modify: relevant Balance configuration documentation

1. Change `CURRENCY_EXCHANGE_ENDPOINT` to `http://localhost:4300/api/fx/booking-rate`.
2. Document that `npm run dev:all` now supplies the demo FX endpoint.
3. Search the LC Balance runtime configuration for remaining port-3001 or `lc-payment-wc` dependencies.

### Task 4: Regression and Quality Gates

**Files:**
- Test: `backend/test/fx-booking-rate.test.js`
- Test: existing Balance backend and microservice suites

1. Run backend tests and coverage.
2. Run Balance microservice integration/unit tests and typecheck.
3. Run frontend tests, typecheck and lint.
4. Run `git diff --check`.
5. Run the ARM64 SonarQube scan and require Quality Gate PASS with zero unresolved issues.
6. Commit only LC Balance source, tests, fixtures, configuration template and design records; do not include local `.env`, coverage output or sibling-project files unless explicitly approved.
