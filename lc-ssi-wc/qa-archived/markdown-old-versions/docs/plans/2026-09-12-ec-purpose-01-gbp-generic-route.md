# EC-PURPOSE-01 — GBP Generic Interbank Route

## Understanding summary

- Browser UAT must cover all governed positive and negative payment journeys.
- `No SSI Record` currencies are the negative `SSI_NOT_FOUND` fixtures.
- BARCGB22/GBP must resolve through a purpose-built generic interbank SSI.
- Export LC SSI-DEMO-003 and Import Collection SSI-DEMO-022 remain purpose-specific.
- Technical identifiers and timestamps are never valid discriminators.
- Existing controlled snapshots and evidence remain immutable.
- Automated QA and browser UAT use the same physical controlled overlay,
  resolver build, logical snapshot hash, and snapshot identity method.

## Decision

Eligibility uses the exact business-purpose tuple `(consumer, product,
businessFunction, paymentLeg, direction)` under rule `EC-PURPOSE-01`. Remove
the generic Central Payment applicability rows from SSI-DEMO-003 and
SSI-DEMO-022. Add a new BARCGB22/GBP generic interbank SSI using
`DEMO-NOSTRO-002-PRIMARY`.

## Alternatives considered

1. Change priority on SSI-DEMO-003 or SSI-DEMO-022 — rejected because both are
   specialist trade-finance SSIs and priority would conceal a purpose mismatch.
2. Use `ssiTags`, version, UUID, creation time, row order, or SSI code — rejected
   as non-business and non-controlled discriminators.
3. Add an exact-purpose generic SSI — accepted because its selection is explicit,
   auditable, and does not repurpose a specialist account.

## Non-functional requirements

- Fail closed when no exact-purpose route exists.
- Preserve the existing resolver latency class; tuple filtering is in-memory over
  the already-loaded applicability set.
- Never overwrite an approved baseline. Produce one versioned WAL-aware unified
  QA/UAT overlay with a manifest and SHA-256; do not maintain separate QA and
  UAT data copies.
- Preserve source provenance and ensure the chosen SSI currency equals the request.

## Acceptance criteria

- BARCGB22/GBP Central Payment resolves to the new generic SSI and
  `DEMO-NOSTRO-002-PRIMARY`.
- BARCGB22 Export LC resolves only through SSI-DEMO-003.
- BARCGB22 Import Collection resolves only through SSI-DEMO-022.
- EUR, SGD, JPY, HKD, AUD, CAD, CHF, and CNY negative browser cases return
  `SSI_NOT_FOUND` HTTP 422 without fallback or payload.
- A controlled QA/UAT tied fixture still returns `SSI_AMBIGUOUS` HTTP 422.
- API QA and browser UAT report the same physical DB path, logical snapshot
  hash, snapshot identity method, and resolver build identity.
- Full unit, integration, conformance, API UAT, browser UAT, lint, typecheck, and
  security audit complete with fresh evidence.

## Decision log

- 2026-09-12: User approved DB fixture changes and browser execution of all UAT.
- 2026-09-12: BA confirmed existing 003/022 applicability cannot legally break
  the tie and recommended a purpose-built generic route.
- 2026-09-12: User accepted generic positive, No-SSI negative, and QA-only tie
  separation.
- 2026-09-12: User required QA and UAT to share exactly one controlled data
  source so failures can be attributed to behavior rather than data drift. The
  tie fixture classification is therefore `PROPOSED_QA_UAT_ONLY`.
- 2026-09-12: BA full-impact ruling superseded all 26 current generic
  applicability rows attached to specialist SSI records and approved one
  purpose-built primary generic route for each of the 12 formal UAT groups.
- 2026-09-12: SSI-DEMO-035 remains EURO1/scheme-specific; SSI-DEMO-041/042
  remain limited negative-only records and are excluded from the formal
  positive denominator.
- 2026-09-12: Ambiguity controls move to isolated `QATIGB2L/GBP` QA-only data.
  The formal ledger becomes 48 RESOLVED, plus four separate 422 tie controls.
- 2026-09-12: A specialist SSI carrying generic applicability is quarantined
  before ranking. The affected request returns
  `INCORRECT_SSI_CONFIGURATION` with no route or payload; the UI presents
  `Incorrect SSI` and directs remediation to configuration governance.
- 2026-09-12: HTTP 503 was rejected because RFC 9110 reserves it for likely
  temporary overload or maintenance. The product owner classifies malformed or
  missing critical SSI master fields as server-side data corruption; the API
  therefore returns controlled HTTP 409 in development/demo and HTTP 500 in
  other environments, with `retryable=false` and a stable
  domain code, and structured remediation instead of allowing a runtime crash.
