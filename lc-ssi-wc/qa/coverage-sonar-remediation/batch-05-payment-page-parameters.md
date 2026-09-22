# Batch 05 — Payment page-parameter conditionals

Status: PASS locally and confirmed by Sonar rescan.

## Current scope

- `apps/ssi-service/src/app/page-parameters/payment-governed-applicability.service.ts`
- `apps/ssi-service/src/app/page-parameters/payment-resolution-page-definition.source.ts`
- `apps/ssi-service/src/test/app/page-parameters/payment-governed-applicability.service.spec.ts`

The candidate eligibility expression now uses a fail-closed guard clause, and payment validation
context selection uses explicit MT205/COV guards. Existing repository calls, snapshot stability,
route fallback values, candidate output, and field ordering remain unchanged. The currently
governed `pacs.009.001.08` RMA scope is explicitly characterized and intentionally deferred to a
later stage rather than changed in this Sonar-only batch.

## Sonar issues in scope

- Nested conditional in `PaymentGovernedApplicabilityService.atomicCandidates()`.
- Nested conditional in payment `validationContextFields()`.

## Evidence

- Payment applicability focused characterization: 18/18 PASS.
- Payment page-definition focused characterization: 55/55 PASS.
- Full `ssi-service` regression: 86 suites / 1263 tests PASS.
- Full project CI tests: all 8 Nx projects PASS.
- ESLint for the two production files and their focused specs: PASS.
- `ssi-service:typecheck`: PASS.
- `payment-governed-applicability.service.ts`: Statements 100%, Branches 97.19%, Functions 100%, Lines 100%.
- `payment-resolution-page-definition.source.ts`: Statements 98.28%, Branches 94.61%, Functions 100%, Lines 98.79%.

All four per-file metrics are strictly above 92%.

Sonar analysis `d9dc7cb9-d93a-4d5b-8a04-867f06c4b2db` reports no open issue for either
production file in this batch. Project code smells decreased from 56 to 54, and Major severity
issues decreased from 19 to 17. Overall coverage increased from 90.9% to 91.0%; new-code
coverage is 100.0% and duplicated-line density remains 0.9%.
