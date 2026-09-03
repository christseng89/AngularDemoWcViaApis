# Amount Shorthand Input Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow every editable Transaction Builder Amount field to accept exact, additive `h/H`, `k/K`, and `m/M` shorthand while preserving the existing decimal-string API contract and currency validation.

**Architecture:** A pure parser converts shorthand into a canonical unsigned decimal string using `BigInt`-backed decimal arithmetic, never binary floating point. The shared Formly Amount configuration validates the raw shorthand and normalizes it on blur; protected/system-carried Amount fields remain unchanged.

**Tech Stack:** Angular 20, ngx-formly 6, TypeScript 5.8, Jest.

---

## Confirmed design

- `h/H` means 100; `k/K` means 1,000; `m/M` means 1,000,000; `t/T` is unsupported.
- Segments are additive: `40k2k = 42000` and `1.5m2.5k = 1502500`.
- Hundred segments follow the same exact grammar: `20.5h = 2050`, `1m2k3h = 1002300`, and `1h.25 = 100.25`.
- A final unsuffixed base-unit segment is accepted: `1m500 = 1000500`.
- A suffix may be followed by a fractional base-unit tail: `1k.25 = 1000.25`.
- Large coefficients are valid: `15000m = 15000000000`.
- Pure decimals remain valid. Negative values, commas, scientific notation, whitespace, missing coefficients, unsupported suffixes, and malformed decimal points are rejected.
- On successful blur normalization, only the canonical decimal string reaches existing validation, tolerance calculations, balance warnings, and API payload assembly.
- Currency minor-unit and rounding behavior remains the existing downstream behavior; this feature does not alter API or database schemas.

## Non-functional assumptions

- Parsing is local and synchronous; input size is bounded to avoid pathological `BigInt` work.
- No sensitive data is introduced or persisted by the parser.
- One pure parser and one shared Formly configuration own the behavior for maintainability.
- Invalid shorthand is visible at the field and cannot be submitted.

## Decision log

1. Use blur normalization rather than submit-only conversion so users see the exact expanded amount before submission.
2. Use exact decimal-string arithmetic rather than `Number` multiplication to avoid floating-point drift.
3. Integrate through the existing shared Amount field configuration rather than per-function handlers, ensuring all A/B functions remain consistent.
4. Keep protected monetary fields unchanged because their values are system-carried and not user input.
5. Reject `t/T` explicitly; `h/H`, `k/K`, and `m/M` are the only suffixes.
6. Extend the existing shared parser rather than adding field-level preprocessing, so blur normalization,
   Submit-before-blur normalization, validation, and every A/B Function continue to share one grammar.

### Task 1: Exact amount-shorthand parser

**Files:**
- Create: `src/app/transaction-builder/amount-shorthand.ts`
- Create: `src/app/transaction-builder/amount-shorthand.spec.ts`

**Step 1: Write failing parser tests**

Cover plain decimals, case-insensitive suffixes, additive segments, decimal segments, base-unit tails, large coefficients, canonical zero/leading-zero handling, and every invalid grammar branch.

**Step 2: Run the parser spec and verify it fails**

Run: `npx jest --runInBand --coverage=false src/app/transaction-builder/amount-shorthand.spec.ts`

Expected: FAIL because the parser module is not implemented.

**Step 3: Implement minimal exact parser**

Tokenize the entire input, represent every term as a `BigInt` coefficient plus decimal scale, align scales, sum, and return a canonical decimal string. Do not use `parseFloat` or floating-point multiplication.

**Step 4: Run the parser spec**

Run: `npx jest --runInBand --coverage=false src/app/transaction-builder/amount-shorthand.spec.ts`

Expected: PASS.

### Task 2: Shared Formly Amount integration

**Files:**
- Modify: `src/app/transaction-builder/builder-fields.ts`
- Modify: `src/app/transaction-builder/builder-fields.spec.ts`

**Step 1: Write failing field tests**

Assert that an editable Amount uses text/decimal input attributes, validates shorthand, expands it on blur, displays an actionable validation message for `t`/malformed input, and leaves protected Amount fields as `protected-monetary`.

**Step 2: Run the field spec and verify it fails**

Run: `npx jest --runInBand --coverage=false src/app/transaction-builder/builder-fields.spec.ts`

Expected: FAIL on the new shorthand expectations.

**Step 3: Implement shared field behavior**

Use the pure parser in the one shared Amount field configuration. Keep existing `required`, `min`, currency decimal-place, lock, and protected-field derivations intact.

**Step 4: Run field and submit-rule specs**

Run: `npx jest --runInBand --coverage=false src/app/transaction-builder/builder-fields.spec.ts src/app/transaction-builder/submit-rules.spec.ts`

Expected: PASS.

### Task 3: Documentation and full validation

**Files:**
- Modify: `docs/history/implementation-log.md`

**Step 1: Record the accepted grammar and unchanged API boundary**

Document examples, invalid forms, exact arithmetic, and the fact that API/OAS contracts are unchanged.

**Step 2: Run quality gates**

Run:

```text
npm run lint
npm run typecheck:wc
npm test -- --runInBand
npm audit --audit-level=high
npm run build
```

Expected: lint/typecheck/tests pass, global branch coverage remains at least 90%, audit has no high-severity finding introduced by this source-only change, and Angular build succeeds outside any host filesystem restriction.
