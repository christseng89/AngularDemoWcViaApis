# Task 6.4 Partial TDD Evidence — Shared Excess Error States

Date: 2026-09-23  
Branch: `OVERDRAWN`

## Scope

This partial slice implements the shared Angular presentation policy for A8／A3／A3S／B3 error outcomes. It does not close Task 6.4: typed API wiring, Minimum Required Increase payload rendering, four-function browser acceptance and the UI／API／database matrix remain open under Tasks 5.x、6.1–6.5 and 7.12.

## RED

The focused tests first demonstrated that every HTTP 409 was incorrectly rendered as `Transaction already processed`, and that the presenter had no `FIX` context. Excess and FX failures therefore could not distinguish initial Submit zero-write from retained pending facts.

## GREEN

- `EXCESS_LIMIT_EXCEEDED` initial Submit states that no pending transaction or Excess reservation was created.
- Failed Fix states that the original pending transaction and reservation remain unchanged.
- Failed Checker action states that the pending transaction and reservation are retained.
- `FX_RATE_UNAVAILABLE` and `FX_RATE_STALE` use the same lifecycle-sensitive boundary and never introduce or display `FX_RATE_PENDING`.
- Error feedback uses only the inner alert live region; the outer result `role=status` live region is present only for non-error result announcements, preventing duplicate assistive-technology announcements.

## Verification

```text
3 suites passed / 193 tests passed
Angular application typecheck PASS
Angular lint PASS
Scoped Prettier PASS
Angular production build PASS (existing bundle-size warnings only)
```

## Review

- Independent 4-Eyes: PASS for this partial UI slice; no P0／P1／P2 findings after the complete context matrix was added.
- Independent QA: PASS for this partial UI slice. Overall UI／API completion remains open.
- Trade Finance BA cross-function review: common UI/API behavior confirmed; a new ambiguity was isolated for post-Acknowledge A3S Amount Fix and was not implemented or added to approved OpenSpec.

## Candidate Hashes

```text
2afb3f2a7ad24c661f1fbcd7a87b5f96d19df5cbe6c4c0ea553179664f544f20  src/app/shared/feedback/api-error-presenter.ts
16405a73942b77869a3a21bd96e6d6e51abdc2439f4c7c468a9612c64ea49053  src/app/shared/feedback/api-error-presenter.spec.ts
35b34aaf5f7d0473bd7e71d53fd584adae85eabe501b52585a1e92976004cebf  src/app/transaction-builder/maker-result-panel.component.ts
c400c63c0b3544feb9aa6dffaf98cf93c53653c8019288893fe00826d1322e53  src/app/transaction-builder/maker-result-panel.component.html
95dba19980328be759ded8b2d14b6d174c86a541225b3ae63d62d046a2c7e8a8  src/app/transaction-builder/maker-result-panel.component.spec.ts
40d82bb56bb294f8a3dba7bbfd38d1ffcea35eb7c86cc113ca29dc8281833581  src/app/transaction-builder/transaction-builder.component.actions.spec.ts
```
