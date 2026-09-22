# Batch 03 — SSI list query dispatch

Status: PASS locally; Sonar rescan pending aggregation with the next completed batch.

## Scope

- `apps/ssi-service/src/app/ssi.controller.ts`
- `apps/ssi-bff/src/main.ts`
- Direct-call characterization tests updated only for the new query-object method shape;
  HTTP query names and API behavior are unchanged.

## Sonar issues addressed

- `typescript:S107` in the service controller (`list` had eight parameters).
- `typescript:S107` in the BFF controller (`list` had eight parameters).
- `typescript:S4624` in the BFF controller (nested template literal).

## Evidence

- Service controller focused tests: 7/7 PASS.
- BFF focused tests: 96/96 PASS.
- ESLint: PASS.
- Both project typechecks: PASS.
- `ssi.controller.ts` coverage: Statements 100%, Branches 96.66%, Functions 100%, Lines 100%.
- `ssi-bff/src/main.ts` coverage: Statements 95.42%, Branches 99%, Functions 92.39%, Lines 95.03%.

The HTTP contract remains query-string based. Nest now binds the same query fields into
one typed query object, and the BFF continues to forward only non-empty values using the
existing `listQuery` encoder.
