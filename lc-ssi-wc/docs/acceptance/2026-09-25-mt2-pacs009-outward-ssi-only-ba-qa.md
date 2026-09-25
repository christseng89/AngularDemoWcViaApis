# MT2XX / pacs.009 Outward SSI-Only — BA / QA Acceptance Evidence

- **Review date:** 2026-09-25
- **Scope:** DEMO PROTOTYPE — `OUTWARD_SSI_ONLY`
- **Product type:** `SSI_RESOLUTION_ONLY`
- **Candidate commit:** `4d0f6861bbb9193f3ea390bda578cdf3af3b6644`
- **Candidate tree:** `166c288ab9249061f5a725d36c0bd6fcefd48fdb`
- **Proposal SHA-256:** `6695FC370886ACE8600536226B42762A39CE8A06686253AA3D2E8E723B68ABDE`
- **Case catalogue SHA-256:** `8A4D591811CAC71EA3B1692AF1C184259301E393B8810194049888DBA3599FF3`
- **Maker:** Codex `/root`
- **Independent BA:** `/root/mt1_ba_review` — PASS
- **Independent QA:** `/root/mt1_ssi_qa_review` — PASS

## Accepted correction

The shared payment resolution submission adapter now binds the governed
scenario fixture as `upstreamAttestation` for MT202COV, MT205 and MT205COV.
The attestation contains exactly:

- `attestationId = scenario.fixture.bindingId`
- `attestationVersion = scenario.fixture.fixtureVersion`
- `evidenceSha256 = scenario.fixture.sourceSha256`
- `validity = VALID`
- `scope = sourceMessageType`
- `stale = false`
- `hashMatches = true`

Plain MT202 is outside this attestation requirement and its request behavior is
unchanged. The correction does not read attestation identity from UI values,
raw FIN fields or customer data, and does not weaken Resolver validation.

## Independent BA result

**Outcome:** PASS — no blocker.

- MT202COV: 3 operational scenarios reviewed.
- MT205: 2 operational scenarios reviewed.
- MT205COV: 1 operational scenario reviewed.
- All six scenarios have governed fixture bindings.
- Fixture source SHA matched the controlled physical fixture artifact.
- Focused adapter tests: 51 / 51 PASS.
- Operational route acceptance: 8 / 8 PASS.
- MT205COV provenance: 3 / 3 PASS.
- Full SSI service regression: 99 suites / 1,385 tests PASS.
- Active Proposal gate: 57 / 57 PASS.
- `npm run verify`: PASS.

## Independent QA result

**Outcome:** PASS — no blocker and no same-issue second failure.

Browser/API operational submission smoke: 9 / 9 PASS.

- MT202: Direct, Book, Credit-57A.
- MT202COV: Book, Credit-57A, Standard.
- MT205: Initial MT200/201 Equivalence, Standard Domestic Onward.
- MT205COV: Continuation.

No applicable submission returned `INVALID_UPSTREAM_CONTEXT`. Focused
exact-candidate regression completed with 3 suites / 115 tests PASS. Plain
MT202 received no upstream attestation and all three MT202 regression
submissions passed.

## Engineering and scanner evidence

- Full `npm run verify`: PASS.
- SSI service coverage: statements 95.35%, branches 89.04%, functions 98.16%,
  lines 96.10%.
- ARM64 Sonar analysis ID: `337ab6d6-5cd3-4d54-ac61-22b4f2c5c574`.
- Sonar Quality Gate: `OK`.
- Sonar open issues: 0.
- Sonar duplicated lines density: 0.8%.

## Approval boundary

This evidence approves only the exact candidate above and only the DEMO
PROTOTYPE outward SSI resolution behavior. It does not authorize payment
execution, message entry, full FIN validation, payload generation, transport or
production deployment. Any relevant repository, fixture, logical snapshot,
build or scanner change invalidates this acceptance and requires re-check.

`qa-archived/` was not accessed, searched, compared or referenced by either
independent reviewer.
