# Task 3.6／BD-10 Partial TDD Evidence

## Scope

- Added the BD-09 Checker lifecycle decision table:
  - A8／B3 own Checker Release converts Pending Excess to Approved.
  - A3／A3S Acknowledge retains the LC UTILIZE and reservation as Pending.
  - A4／A6 final Release converts and finalises the referenced A3／A3S.
  - A3S once-only SG effects are selected only at Acknowledge.
- Added the BD-10 service guard: an A3S with `acknowledgedAt != null` cannot use Amount Fix／Resubmit in either `PENDING`／EARMARKED or `REJECTED` workflow state. Remarks-only remains under the existing protected-field policy.
- Added the atomic A3／A3S Acknowledge slice: Checker current-facts／policy／FX revaluation, Checker FX and decision snapshots, A3S linked SG release/once-only side effects, and LC Acknowledge commit in one SQLite transaction while the Pending Excess reservation remains Pending.
- Added A8／B3 own Checker Release: current-facts／policy／FX revaluation, typed denial with pending facts retained, atomic reservation-to-approved conversion, idempotent replay and rollback on a late Release failure.
- Completed A4／A6 final conversion. A4 targets the A3／A3S movement directly; A6 atomically releases its Acceptance finalizer and the referenced A3／A3S target in the same SQLite transaction.

## RED

1. `planCheckerExcessLifecycle` tests initially failed to compile because the policy did not exist.
2. Post-Acknowledge A3S tests initially received the older compound-sibling validation error instead of the required `ILLEGAL_STATE_TRANSITION`, proving there was no pre-mutation BD-10 guard.
3. The A3 correlation regression exposed that a caller-supplied `businessEventId` alone was incorrectly treated as A3S.
4. 4-Eyes and QA exposed that the initial Acknowledge slice lacked successful-command replay and did not release the real compound A3S SG leg atomically.

## GREEN

- A3S detection now requires a canonical linked SHGT redemption fact; an ordinary acknowledged A3 carrying a correlation-only `businessEventId` remains eligible for its existing Fix policy.
- BD-10 tests seed and compare before／after rows for Pending Excess reservation, FX snapshot, decision snapshot, SG capacity, command idempotency and Checker command-attempt audit. Policy and Currency Exchange spies remain at zero calls.
- LC UTILIZE, linked SG redemption and Fix Pending audit facts remain unchanged for both Pending and Rejected cases.
- A3/A3S Acknowledge now denies FX failure without changing the pending movement/reservation and stores only the approved command-attempt audit.
- Successful A3S Acknowledge atomically releases exactly one same-owner linked SG redemption, persists fresh Checker snapshots, acknowledges the LC UTILIZE while retaining `PENDING`, and leaves the Excess reservation pending.
- Same actor/key replay returns the first successful response without another FX call, SG release or snapshot; an injected post-SG-release snapshot failure rolls back both legs and all Checker facts.
- A current-facts A3S over-limit Checker result returns `409 EXCESS_LIMIT_EXCEEDED` without releasing the linked SG or acknowledging the LC; both legs and the original reservation remain Pending.
- Migration 33 permits the approved Checker `NOT_REQUIRED` decision when current capacity improves to fully covered.
- A8／B3 own Release now releases the exact original Maker reservation and records only the freshly revalued Checker Excess as Approved. The changed-capacity regression proves `PENDING 20 -> RELEASE 20 + APPROVED 0`, preventing either a pending residual or an over-release.
- A4/A6 perform a fresh final Checker revaluation. Eligible Release converts `PENDING_RESERVATION` to an exact `RESERVATION_RELEASE` plus fresh `APPROVED_UTILIZATION`; non-USD stale FX denies Release and retains both A6 Acceptance and referenced A3 facts Pending.
- A6 same actor/key replay returns the original response without duplicate ledger or snapshots. A3S final A4 proves the linked SG redemption remains byte-for-byte unchanged after finalization and is therefore not repeated.
- Final 4-Eyes found that historical `PENDING_RESERVATION` rows remained after conversion. Target resolution now uses the exact Decimal net `PENDING_RESERVATION - RESERVATION_RELEASE > 0`, while exact actor/key replay is resolved before outstanding-target lookup. A B3→B4 regression proves downstream B4 follows its legacy release path and cannot reconvert the historical B3 Excess.

## Verification

- Focused: 2 suites, 144 tests passed in the final QA replay.
- Latest focused A3S Checker HTTP suite: 1 suite, 23 tests passed.
- Latest A8／B3 Checker Release API suite: 1 suite, 31 tests passed.
- Latest A8／A3／A3S／B3 Checker HTTP suite: 1 suite, 35 tests passed.
- Full Balance microservice: 60 suites, 1,189 tests passed with coverage disabled for functional regression.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 22 pre-existing warnings and zero errors.
- `npm run build`: PASS.
- `openspec validate --all --strict --no-interactive`: 16 PASS／0 FAIL.
- Trade Finance BA: PASS.
- Independent 4-Eyes: PASS after idempotency, true-compound atomicity and blocked-retention fixes.
- Independent QA: PASS; no blocker after the true-compound blocked regression.
