# Amendment Tolerance Change Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make A2/B2 amendments accept a tolerance change magnitude, retain the system-calculated resulting tolerance as protected data, and verify the complete lifecycle through Business Case Runner.

**Architecture:** `toleranceChangePct` is accepted only for monetary amendments. The service derives the resulting `tolerancePct` from the contract's current tolerance and amendment direction using exact decimal arithmetic, persists both values on the movement, and activates only the protected result at Checker Release. Angular previews Current/Resulting Tolerance but sends only the change magnitude.

**Final API clarification:** A1/B1 `tolerancePct` and A2/B2 `toleranceChangePct` are non-negative whole-number strings. While an Amendment is PENDING, its `tolerancePct` remains the old approved value and its change fields carry the instruction; Release accepts no tolerance fields and activates the service-calculated final value. MT707 exposes a final Tolerance outside this component boundary; an upstream adapter converts it to change.

**Tech Stack:** Angular 20/Formly, TypeScript, Express, Zod, SQLite, Jest, OpenAPI.

---

## Confirmed design

- A1/B1 ISSUE continues to accept opening `tolerancePct`; it never accepts `toleranceChangePct`.
- A2/B2 accepts `toleranceChangePct` and rejects client-supplied `tolerancePct`.
- Increase adds the magnitude; Decrease subtracts it; zero is allowed and a negative result is rejected.
- Movement persists the change magnitude and protected resulting tolerance. Contract changes only on Release.
- Current/Resulting Tolerance are Angular-only display values, not request properties.
- Fix Pending edits the magnitude and recomputes the protected result.
- Existing development data may be cleared; no historical migration compatibility is required.

## Decision log

1. Preserve both audit delta and calculated result instead of overloading one field.
2. Keep backend calculation authoritative; Angular duplicates validation only for immediate feedback.
3. Reject stale-basis Release rather than silently applying a change to a newer tolerance.
4. Use the same decimal helper for UI-equivalent rules and service validation; no binary floating point in domain calculation.

### Task 1: Domain calculation and request validation

**Files:** `microservices/balance-component/src/domain/tolerance.ts`, `microservices/balance-component/src/service/movementRequestValidator.ts`, corresponding unit tests.

1. Write failing tests for 0+10+5, decrease-to-zero, decrease-below-zero, invalid field/movement combinations.
2. Add an exact `computeResultingTolerancePct` helper and request guards.
3. Run targeted domain/validator tests.

### Task 2: Persistence and service lifecycle

**Files:** `microservices/balance-component/src/types.ts`, DB schema/migrations, movement store, `balanceService.ts`, service and HTTP tests.

1. Add failing create/edit/release tests.
2. Persist `tolerance_change_pct`; derive protected `tolerancePct` on create/edit.
3. Enforce stale-basis and activate result only on Release.
4. Run microservice tests.

### Task 3: Angular request and preview

**Files:** API model, `builder-fields.ts`, `submit-rules.ts`, Maker/Fix Pending components and specs.

1. Add failing UI/request tests.
2. Show change input plus protected Current/Resulting preview for amendments.
3. Block decrease below zero and send only `toleranceChangePct`.
4. Run Angular targeted tests.

### Task 4: Business Case Runner and contracts

**Files:** `backend/data/businessCases.js`, backend tests, both OpenAPI files, API examples and Obsidian docs.

1. Replace amendment final-tolerance inputs with sequential change magnitudes.
2. Add Import and Export cases for amount-only, tolerance-only, both, zero-result, and rejected below-zero.
3. Update contract/documentation tests.

### Task 5: Destructive development reset and acceptance

1. Resolve and verify the exact development DB paths, then use the existing Cleanup Database workflow.
2. Start/reuse the services and execute Run All Cases.
3. Run lint, typecheck, docs validation, all unit/integration tests with 90%+ branch coverage, Angular build, and WC build.
