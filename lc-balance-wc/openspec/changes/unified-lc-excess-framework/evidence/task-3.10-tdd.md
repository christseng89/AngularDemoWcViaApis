# Task 3.10 TDD Evidence — No Return or Partial Cancellation

Date: 2026-09-23  
Branch: `OVERDRAWN`

## RED

- Added an A8 HTTP test that submits an accepted Pending Excess transaction and then sends Delete Pending with an `amount` field.
- The test failed because the route silently ignored `amount` and returned `200`, deleting the whole transaction. This ambiguous behavior could be mistaken for partial cancellation.
- Added negative route tests for the obsolete `return-documents` and `partial-cancel` commands, preserving the original movement and Pending Excess Reservation.

## GREEN

- Excess Delete Pending now rejects any request containing `amount` with HTTP `400`; it remains exclusively a whole-transaction withdrawal.
- Rejection preserves the Pending movement amount and status, complete Pending Excess Reservation, ledger row count and deletion-audit count.
- No Import／Export Return Documents or partial-cancel endpoint is exposed; both return HTTP `404` with zero mutation.

## Validation

- Focused Maker Excess HTTP regression: 1 suite／61 tests PASS.
- Full Balance regression: 61 suites／1,224 tests PASS.
- TypeScript typecheck: PASS.
- ESLint: 0 errors; 22 pre-existing warnings.
