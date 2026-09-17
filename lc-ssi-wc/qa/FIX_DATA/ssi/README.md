# SSI FIX_DATA Package

**Current status:** `MT347-DEMO-CLOSURE-V1.1` / QA final PASS / mismatchCount=0.
Gate 1 Engineering (TDD, Generator development and zero-write dry run) is
authorized. Fixture Runtime Apply, SSI ACTIVE mutation and DB Apply remain on
HOLD.

This folder is the controlled location for SSI ACTIVE-data remediation business
artifacts. The current MT347 Demo closure package is:

- `mt347-demo-closure.v1.1.json` — 18 category templates, 208 exact group rows,
  3,120 deterministic variant contexts, six individual decisions, the prior
  29-row blocked inventory and machine-readable reconciliation.
- `mt347-demo-closure.v1.1.schema.json` — JSON Schema 2020-12 contract.
- `MT347_DEMO_CLOSURE_V1_1.md` — QA hand-off and acceptance checks.
- `mt347-demo-closure.v1.1.bundle.sha256` — exact artifact identities; each
  controlled file also has its own `.sha256` sidecar.

## Closure recorded by the artifact

- Total: 208.
- `BA_CONFIRMED`: 172.
- `OUT_OF_SCOPE_CLOSED`: 36.
- `DRAFT` / `BLOCKED`: 0 / 0.
- Direction: `OUTBOUND` under `DEMO_POLICY_V1`.
- Nostro and Account: `CONTROLLED_VIRTUAL_STUB_ONLY`.
- Dataset boundary: the 208 rows are `QA_NEGATIVE_OVERLAY`; none is visible in
  the Operational Picker.
- Exact matrix: 208 × 15 = 3,120 contexts; 172 × 15 = 2,580 SSI-owned
  negative contexts; 36 × 15 = 540 full-FIN evidence-only contexts.
- Every row has an explicit all-zero `sideEffects` object and a single
  `demoHttpStatus` assertion under `DEMO_POLICY_V1` (null only where execution
  is out of scope).
- All 172 SSI-owned rows require
  `resolverOutcome=FAIL_CLOSED_NO_SSI_OUTPUT`.
- All 36 OOS rows require `ssiLookup=NOT_PERFORMED` and zero SSI route rows and
  candidates.

The 36 closed groups consist of 35 exact fixture rows whose ownership contract
assigns the 86a/full-message dependency to the full FIN validator, plus
`MT742-010`. They are evidence-only with
`FIN_VALIDATION=NOT_EVALUATED`; SSI Resolver execution is not expected.

## Authorization boundary

- This package records the completed BA Demo closure and the QA-final-PASS
  current artifact at JSON SHA
  `A4A24EDDC0C7E55DCDB3F60CBBDFE189408370D372EE1886F0D5BD9EE4F4D382`.
- It does not alter the source fixture, database or production generator.
- Route Derivation Table approval, fixture regeneration, ACTIVE SSI mutation,
  runtime publication and DB apply remain separately gated.
- The historical 5,385-row baseline remains immutable; moving data out of the
  Operational dataset is not deletion.
- Any byte change to the JSON, schema or report creates a new SHA and
  invalidates previous QA approval.
- The Gate 1 dry-run command is `npm run demo:dry-run:ssi-mt347`; deterministic
  generated data and its comparison report are written under `generated/`.
- Generated output is now the pinned SSI Reload Test Data input reference. It
  is not an executable database seed; mapping and apply remain separately
  gated.
- `reload-test-data-source.v1.1.json` is now the pinned SSI Reload Test Data
  source reference. It binds the Oracle, generated dataset, Gate 1 report and
  unchanged source fixture by SHA. Its current status is
  `SOURCE_PINNED_MAPPING_NOT_AUTHORIZED`; therefore it cannot trigger mapping,
  reload or DB mutation.
- Run `npm run demo:preflight:ssi-reload-source` to verify all four pinned
  artifacts before any later mapping/apply proposal.
- Superseded versions are retained under the repository-standard
  `qa/QA_ARCHIVE/ssi/` directory. See
  `qa/QA_ARCHIVE/ssi/archive-index.json` for immutable identities, supersession
  reason and QA history. No superseded V1 artifact remains in this current
  directory.
