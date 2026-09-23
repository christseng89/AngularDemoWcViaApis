# Task 5.2 — A3 HTTP Maker Excess Partial TDD Evidence

Status: COMPLETE. This milestone connects A8, A3, A3S and B3 Maker Excess application boundaries to the existing movement routes, covers the BD-10 A3S post-Acknowledge Fix error, boots the approved non-production Virtual Currency Exchange runtime, adds A3/A3S Checker Acknowledge HTTP, A8/B3 own Checker Release HTTP, and A4/A6 final Release HTTP.

## RED

- Added `makerExcessApi.test.ts` before route implementation.
- The accepted A3 case returned legacy `409 INSUFFICIENT_AVAILABLE_BALANCE` instead of typed `201`.
- Over-limit and FX failures also returned the legacy error rather than `EXCESS_LIMIT_EXCEEDED`, `FX_RATE_UNAVAILABLE` or `FX_RATE_STALE`.
- A missing `Idempotency-Key` incorrectly entered the legacy path.
- 4-Eyes then exposed a runtime-configured covered-only／BD-03 response regression (`{kind: LEGACY_SUBMIT}` rather than the existing movement body).
- QA exposed a bypass in which an ordinary A3 carrying a correlation-only `businessEventId` entered legacy processing.

## GREEN

- When a Maker Excess runtime is configured, plain A3 commands use the Excess command boundary.
- `Idempotency-Key` is mandatory for that boundary.
- Typed `201`, `409 EXCESS_LIMIT_EXCEEDED`, `FX_RATE_UNAVAILABLE`, `FX_RATE_STALE` and `IDEMPOTENCY_CONFLICT` responses are covered.
- Rejected initial submissions preserve strict zero-write behavior for movement, reservation, FX snapshot, decision snapshot, ledger and idempotent success.
- Covered-only and BD-03 zero-policy routing preserve the existing HTTP `201` movement response, including `movementId`, and create no FX／Excess facts.
- A correlation-only `businessEventId` cannot bypass the A3 Excess boundary. Canonical linked-SG A3S is rejected from the standalone A3 method until its compound boundary is implemented.
- A8 uses its Import LC parent and B3 uses its Export Confirmation parent as the allowance owner. Eligible Excess atomically persists the new child contract, movement and reservation; over-limit rejection leaves no child contract or transaction facts.
- Post-Acknowledge A3S Amount Fix returns HTTP `409 ILLEGAL_STATE_TRANSITION` for both EARMARKED/PENDING and REJECTED while preserving both compound legs and making zero policy／FX calls.
- A3S compound Submit preserves the existing two-movement array response, computes capacity as selected Eligible SG plus residual parent Tight Available without counting the selected SG twice, persists both legs and one LC-owner reservation atomically, and keeps both legs zero-write on over-limit rejection.
- A cross-LC SG selection is rejected before policy／FX／persistence; selected SG capacity can only come from a Shipping Guarantee whose parent is the same Import LC allowance owner.
- Without an Excess runtime, existing prototype routes retain their prior behavior.
- The whole async route is inside the Express 4 error boundary so existing request validation continues to return structured `400` responses.
- The Balance server now loads the effective Excess policy and the configured Currency Exchange adapter at startup. The demo `.env` selects the non-production Virtual BOOKING endpoint in `lc-payment-wc`; production rejects `VIRTUAL`, while `PROVIDER` fails closed unless a real provider adapter is injected.
- Virtual endpoint, timeout and policy-path configuration are validated before the service accepts traffic. Each FX decision still applies the policy-specific freshness window and approved PBD authorization contract.
- A3/A3S `/acknowledge` requires an idempotency key, returns typed FX/limit failures, retains the pending reservation on success/failure, and persists fresh Checker snapshots only for a calculable result.
- True compound A3S success releases the same-owner linked SG redemption and acknowledges the LC leg atomically. Same-key replay creates no new FX/snapshot/SG facts; an injected snapshot failure rolls back both linked legs.
- True compound A3S Checker over-limit returns `409 EXCESS_LIMIT_EXCEEDED` and retains the linked SG, LC and reservation as Pending.
- A8/B3 own `/release` performs fresh Checker revaluation, converts the exact original Maker reservation to Approved utilization atomically, replays the same actor/key without duplicate facts, and retains the Pending movement/reservation on FX or limit denial.
- A changed-capacity regression proves that a Maker reservation of 20 followed by Checker `NOT_REQUIRED` produces `PENDING 20 / RESERVATION_RELEASE 20 / APPROVED_UTILIZATION 0` for both A8 and B3.
- A4 and A6 final Release resolve the correct reservation target, perform fresh revaluation and atomically convert/finalize. A6 replays without duplicate facts; non-USD stale FX retains both Acceptance and referenced A3 Pending; A3S final A4 does not repeat the linked SG effect.
- Release routing distinguishes a net outstanding reservation from historical reservation rows after conversion. Exact stored replay remains reachable, while downstream B4 uses the existing legacy release path and creates no second Excess conversion.

## Verification

- Latest focused A3S Checker HTTP suite: 1 suite / 23 tests PASS.
- Latest A8/A3/A3S/B3 HTTP suite: 1 suite / 35 tests PASS.
- Full Balance microservice functional regression (`--coverage=false`): 60 suites / 1,189 tests PASS.
- TypeScript typecheck PASS.
- ESLint PASS with 0 errors (22 pre-existing warnings).
- Balance microservice build PASS.
- OpenSpec strict validation: 16 PASS / 0 FAIL.
- Independent 4-Eyes: PASS. Independent QA: PASS.
