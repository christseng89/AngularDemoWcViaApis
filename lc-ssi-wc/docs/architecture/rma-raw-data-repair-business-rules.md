# RMA Raw-Data Repair Business Logic Specification

**Status:** Revised draft for BA／QA confirmation  
**Date:** 2026-09-16  
**Scope:** Existing RMA raw data, future Load Data, RMA Index projection, and Draft-only remediation  
**Decision gate:** No production-like data mutation until BA and QA approve this specification and its executable acceptance evidence.

## 1. Problem statement

The RMA database contains thousands of physical records while the user-facing index is a projection grouped by bank relationship and direction. Previous repair analysis incorrectly used the grouped Index API as if it were raw data and used an over-broad supported-message calculation. This can hide duplicate physical records, retain out-of-scope MT／MX values, and revise a representative row without repairing its siblings.

The repair must classify every raw record deterministically, preserve immutable history, use the governed API lifecycle, and stop at Draft for Maker／Checker review.

## 2. Goals

1. Audit 100% of raw RMA records without using an aggregated index as the repair source.
2. Produce one deterministic logical current index per canonical Own BIC + Counterparty BIC + Direction.
3. Retain only MT／MX values explicitly selectable in one versioned SSI-supported Message Type catalogue.
4. Create only reviewable Drafts; never automatically Submit, Approve, Activate, or physically delete records.
5. Make every run idempotent, restartable, and traceable to an input snapshot and parameter hash.

## 3. Non-goals

- Rewriting REVOKED／SUPERSEDED records or immutable audit events.
- Direct SQL correction of operational rows.
- Treating every MT1／2／3／4／7 message as SSI-supported merely because its family is listed.
- Inferring an unsupported MT／MX from existing seed or fixture data.
- Automatically approving generated revisions or suppressions.
- Combining records whose effective periods do not overlap the repair `asOf` date.

## 4. Terminology

- **Raw record:** One physical RMA lifecycle record returned by the governed raw-record API.
- **Logical index:** User-facing projection for one bank relationship and direction.
- **Operational status:** `ACTIVE`, `APPROVED`, `PENDING_APPROVAL`, `DRAFT`, or `WIP` according to lifecycle context.
- **Current effective row:** An `ACTIVE` row whose `validFrom <= asOf <= validTo`.
- **Canonical key:** Canonical Own BIC + Canonical Counterparty BIC + Direction.
- **Supported catalogue:** The single versioned runtime parameter snapshot containing selectable SSI-supported MT／MX values.
- **Canonical survivor:** The raw Active record selected to receive the consolidated EDIT revision for a logical group.
- **Sibling duplicate:** Another current Active raw record with the same canonical key.

## 5. Authoritative inputs

### 5.1 Raw RMA source

Repair planning must read a dedicated governed raw-record endpoint or equivalent read-only export. It must not use `listIndexPage()` or another grouped projection.

The raw response must include at least:

- `id`, `version`, `status`, `updatedAt`
- `ownBic`, `counterpartyBic`, `direction`
- `service`, `messageTypes`
- `validFrom`, `validTo`
- `source`, fixture metadata and parameter snapshot metadata
- `hasOpenRevision`, `openRevisionId`, `openRevisionStatus`
- `maker`, `checker`, `amendmentOfId`

### 5.2 Supported Message Type catalogue

One generated, versioned parameter file is the runtime authority, proposed as:

`parameters/ssi-supported-message-types.sr2026.json`

Every entry must contain:

- `standardsRelease`
- exact `messageType`
- `family`: `MT1`, `MT2`, `MT3`, `MT4`, `MT7`, or `ISO20022`
- zero or more governed `profiles[]`; each row contains `profileId`, `variant`, `field119Match` (`ABSENT`, `EXACT_STP`, `EXACT_REMIT`, or `NOT_APPLICABLE`), `allowedServiceIds[]`, optional exact ISO 20022 `bizSvc`, optional `nbOfTxs`, allowed `legClassifications[]`, allowed `{transferMethod, settlementMethod}` pairs, optional `communityId`／`mugId`, `approvalStatus`, inclusive `effectiveFrom`／`effectiveTo`, and source artifact／version／hash
- `selectable`
- `supportBasis`, as a controlled enum rather than free text
- source artifact／version／hash
- approval status
- `effectiveFrom`, `effectiveTo`
- optional `targetOf`

Catalogue generation rules:

1. MT2／payment values come only from `payment-message-index.json` entries with `selectable=true`, including their exact non-empty `targetMessage`.
2. MT3／MT4／MT7 values require the intersection of:
   - manifest evidence `FIELD_PROFILE_PROVEN`; and
   - at least one scenario with `closureDisposition=IN_SCOPE_SSI_RESOLVER`; and
   - at least one mapping with `scopeStatus=SSI_SUPPORTED`, `evidenceStatus=FIELD_PROFILE_PROVEN`, and `suggestionEnabled=true`.
3. The MT1／pacs.008 business scope is already decided by `memory/swift-mt1xx-pacs008-v2.md` and `PO-SCOPE-MT1-20260916`; it is not an open Product Owner scope question. The catalogue generator must materialise the following governed Phase-1 rules from that normative source instead of hard-coding them in UI, API, seed, audit, or repair code:
   - `MT103` base and `MT103 STP` are in scope and appear as one selectable `MT103` Message Type with governed profile metadata.
   - `MT103 REMIT` is eligible only when an effective approved community／MUG／profile row exists; otherwise it returns `UNSUPPORTED_PROFILE` and does not expand the base `MT103` authorization.
   - `pacs.008.001.08` plain (`BizSvc=swift.cbprplus.04`) and STP (`BizSvc=swift.cbprplus.stp.04`) are in scope, with `NbOfTxs=1`; they appear as one selectable `pacs.008.001.08` Message Type with governed profile metadata.
   - `MT101` is `OUT_OF_SCOPE` and must never be selectable or loaded as SSI-supported.
   - `pacs.008.001.12` entered the legacy data because the earlier implementation used a generic ISO 20022 version without the governed SWIFT／CBPR+ profile source. It must not coexist as a selectable catalogue entry or be accepted by manual ADD／EDIT. Controlled Load Data／Repair converts known positive operational occurrences to `pacs.008.001.08` and records explicit `from=.001.12 → to=.001.08` evidence; immutable audit history and isolated negative／legacy fixtures are not rewritten.
4. A message type with documentation evidence but `OUT_OF_SSI_SCOPE` mapping is not selectable.
5. UI, API validation, Load Data, Audit, and Repair must verify the same catalogue version and SHA-256.
6. Runtime eligibility requires `selectable=true`, `approvalStatus=APPROVED`, the requested standards release, and `effectiveFrom <= asOf <= effectiveTo`.

Profile matching is exact and deterministic. The caller supplies one decision context containing `standardsRelease`, `asOf`, Message Type, FIN variant／field 119 or MX `bizSvc`, `serviceId`, `nbOfTxs`, `legClassification`, `transferMethod`, settlement method, and community／MUG identifiers when required. Date bounds are inclusive. `field119Match=ABSENT` means Field 119 must be absent; it is never a wildcard. `EXACT_STP` and `EXACT_REMIT` require the exact controlled value, while `NOT_APPLICABLE` is valid only for non-FIN profiles. Approved service, profile-row approval, `FI_TO_FI_SETTLEMENT` leg classification and the exact allowed context pairing are mandatory for Phase-1 resolution: `SERIAL+INDA`, `SERIAL+INGA`, or `COVER+COVE` for MT103 profiles; pacs.008 uses its approved row with `INDA`, `INGA`, or `COVE`. Missing, expired, unapproved, ambiguous, partially matching, wrong-community, wrong-MUG, wrong-service, wrong-leg-classification, wrong-variant, wrong-transfer／settlement pairing, or wrong-`bizSvc` rows return the exact Matrix A outcome; the resolver must not choose the closest row. `MT103 REMIT` is supported only when exactly one effective approved REMIT row matches the complete decision context. Base MT103 remains eligible independently of a failed REMIT match.

Matrix A A01 currently states Base MT103 as neither `119:STP` nor `119:REMIT`. This specification deliberately refines the executable Phase-1 Base profile to `field119Match=ABSENT` so unknown Field 119 values fail closed instead of being treated as Base. The refinement is not yet part of the bound Matrix A artifact and must be incorporated into the regenerated exact-SHA bundle and re-reviewed before Gate 1; it must not be represented as already equivalent to the current A01 wording.

The final-document bundle may still carry `productOwner=PENDING` or `implementationAuthorized=false`. That gate controls authorization to implement the complete exact-SHA bundle; it does not reopen or invalidate the already recorded MT103／pacs.008 Phase-1 scope. Engineering must report the bundle gate separately from catalogue scope and must not translate it into an empty MT1 catalogue. Before authorization, a candidate catalogue may be generated only as review evidence; it must not be published or consumed as the runtime catalogue.

Every consumer receives the same complete decision context and exposes／records `catalogueVersion`, catalogue SHA-256, standards release, `asOf`, resolved Message Type set, and profile-decision metadata. Missing or unequal version, hash, release, context, set, or metadata fails closed. This parity rule covers UI, API validation, Load Data, QA fixtures, Audit, and Repair.

### 5.3 Controlled MT1／pacs.008 test fixtures

Test fixtures are governed validation evidence, not operational SSI or RMA records. Every fixture must contain:

- stable `fixtureId`, Matrix A rule ID and expected outcome;
- the exact catalogue version／SHA and source-memory SHA;
- complete profile decision context, including Field 119 semantics or `BizSvc`, service ID, transaction count, leg classification, transfer method, settlement method and community／MUG where applicable;
- `usageScope=QA_POSITIVE`, `QA_NEGATIVE`, or `QA_BOUNDARY`;
- expected classification／outcome and whether SSI Resolution may proceed;
- an explicit `operationalEligible=false` control.

The minimum controlled fixture set is:

| Fixture family                          | Required cases                                                                                                                                                                                                           | Expected outcome                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| A01 — MT103 Base                        | Field 119 absent; approved FIN service; `FI_TO_FI_SETTLEMENT`; each exact pair `SERIAL+INDA`, `SERIAL+INGA`, `COVER+COVE`                                                                                                | Profile passes to Matrix B／Cover Matrix                                                        |
| A02 — MT103 STP                         | Exact `119:STP`; approved STP service; `FI_TO_FI_SETTLEMENT`; the same three exact context pairs                                                                                                                         | Profile passes to Matrix B／Cover Matrix                                                        |
| A03 — MT103 REMIT                       | Exact `119:REMIT`; exactly one effective approved REMIT service／community／MUG／profile row; `FI_TO_FI_SETTLEMENT`; the same three exact context pairs                                                                  | Profile passes                                                                                  |
| A04 — pacs.008 plain                    | `pacs.008.001.08`; exact `swift.cbprplus.04`; `NbOfTxs=1`; one effective approved CBPR+ row; `FI_TO_FI_SETTLEMENT`; each of `INDA`, `INGA`, `COVE`                                                                       | Profile passes                                                                                  |
| A05 — pacs.008 STP                      | `pacs.008.001.08`; exact `swift.cbprplus.stp.04`; `NbOfTxs=1`; one effective approved STP row; `FI_TO_FI_SETTLEMENT`; each of `INDA`, `INGA`, `COVE`                                                                     | Profile passes                                                                                  |
| A06／A08 — unsupported profile          | `CLRG`; unknown version; wrong／missing `BizSvc`; wrong transaction count; unapproved／expired／future／ambiguous service or profile row; wrong community／MUG; unexpected Field 119; wrong transfer／settlement pairing | `UNSUPPORTED_PROFILE`; no SSI lookup                                                            |
| A07A／A07B — deferred or non-settlement | Future MT102／104／107 profile, or FI-to-FI MT104 Request without a current settlement leg                                                                                                                               | `UNSUPPORTED_PROFILE` or `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE`, as defined by Matrix A |
| A09／A10 — wrong leg classification     | Otherwise supported profile with a non-bank leg or FI-to-FI non-settlement leg                                                                                                                                           | `NON_BANK_LEG_OUT_OF_SCOPE` or `BANK_TO_BANK_NON_SETTLEMENT_LEG_OUT_OF_SCOPE`; no SSI lookup    |
| A11／A12 — MT101                        | Customer／corporate-to-bank initiation or FI-to-FI non-settlement request                                                                                                                                                | Corresponding out-of-scope outcome; no SSI lookup                                               |

Every controlled fixture, including `QA_POSITIVE`, `QA_NEGATIVE`, and `QA_BOUNDARY`, must have `operationalEligible=false`. Operational consumers fail closed when the flag is missing or not exactly `false`. No controlled fixture may be returned by an Operational picker, accepted by operational API／Load Data, loaded into the Operational dataset, included in an Operational index／repair source, used to create or revise a record, or counted as an authorised RMA relationship. Fixture validation must prove this isolation before Gate 2.

## 6. Canonical identity rules

### 6.1 BIC normalization

- Trim and uppercase.
- Validate ISO 9362 syntax.
- Convert BIC8 to canonical BIC11 by appending `XXX` for comparison only.
- Preserve the originally approved display value in the raw record unless a separate correction is approved.
- `CITIUS33` and `CITIUS33XXX` therefore belong to the same logical relationship.

### 6.2 Logical index key

```text
canonicalOwnBic + canonicalCounterpartyBic + direction
```

- `direction` must be exactly `INBOUND` or `OUTBOUND`.
- FIN／FINPLUS, Message Type family, service, fixture family, and individual Message Type are not index-key dimensions.
- Effective dates determine whether a raw row participates in the current `asOf` repair set; they do not create another visible current index.

## 7. Input classification

Each raw row receives one mutually exclusive `primaryClassification` plus zero or more `issues[]`. The primary classification controls whether automation is permitted; issues preserve every detected data-quality condition.

Primary-classification precedence is:

1. `HISTORY_IMMUTABLE`
2. `INVALID_IDENTITY`
3. `QA_FIXTURE_ISOLATED`
4. `NOT_EFFECTIVE_AT_SNAPSHOT`
5. `OPEN_WORKFLOW`
6. `NO_SUPPORTED_TYPE`
7. group-level `CURRENT_DUPLICATE`
8. `CURRENT_NEEDS_EDIT`
9. `CURRENT_VALID`

| Classification              | Meaning                                                | Automated mutation                         |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `HISTORY_IMMUTABLE`         | REVOKED／SUPERSEDED historical evidence                | None                                       |
| `NOT_EFFECTIVE_AT_SNAPSHOT` | Outside the `asOf` effective interval                  | None                                       |
| `QA_FIXTURE_ISOLATED`       | Controlled fixture not allowed in operational index    | None; report for fixture cleanup           |
| `INVALID_IDENTITY`          | Invalid／missing BIC or direction                      | None; manual review                        |
| `OPEN_WORKFLOW`             | WIP／Draft／Pending Approval／Approved revision exists | None; skip and report                      |
| `NO_SUPPORTED_TYPE`         | All MT／MX values are outside the catalogue            | Manual Suppression review                  |
| `CURRENT_VALID`             | One correct current Active record for its group        | None                                       |
| `CURRENT_NEEDS_EDIT`        | Supported values or derived service differ             | Create EDIT Draft only                     |
| `CURRENT_DUPLICATE`         | Multiple current Active siblings share the key         | Consolidation and later Suppression review |

If any eligible sibling in a canonical group has an open WIP／Draft／Pending Approval／Approved workflow, the complete group is skipped. The tool must not repair other siblings around an in-flight business decision.

Unsupported input values are logged individually as `IGNORED_OUT_OF_SSI_SCOPE`. They are not written into a new or revised Message Type set.

## 8. Group-level repair algorithm

For each canonical key at the chosen `asOf` timestamp:

1. Select current effective raw `ACTIVE` rows.
2. Exclude and report isolated QA fixtures according to governed source／usage-group policy.
3. Normalize and deduplicate every Message Type.
4. Intersect each row with the supported catalogue.
   - Retain `MT103` when its governed Message Type entry is effective; profile eligibility remains transaction-context validation and is not inferred from an RMA row.
   - Retain `pacs.008.001.08` when its governed Message Type entry is effective.
   - Convert known positive operational／Draft `pacs.008.001.12` occurrences to `pacs.008.001.08` according to the governed legacy-conversion parameter, recording the conversion count and provenance.
   - Do not apply that conversion to immutable history or isolated negative／legacy fixtures. Unknown fixture eligibility, source, lifecycle, or conversion scope fails closed and requires manual review.
5. Partition siblings by exact effective period and compatible governed metadata (`source`, fixture policy, parameter snapshot and usage group). Only siblings with identical periods and compatible metadata may be automatically consolidated.
6. Union the retained values across eligible siblings within one compatible partition. Different periods or incompatible metadata produce `MANUAL_CONSOLIDATION_REVIEW_REQUIRED` and no mutation.
7. If the union is empty, create no EDIT Draft; emit `MANUAL_SUPPRESSION_REVIEW_REQUIRED`.
8. Derive service from the retained union:
   - MT only → `FIN`
   - MX only → `FINPLUS`
   - MT + MX → `FIN / FINPLUS`
9. Select a canonical survivor using this deterministic order:
   - already contains the complete retained union and correct derived service;
   - otherwise, within the same amendment lineage only, highest approved lifecycle version;
   - across different lineages, latest checker decision timestamp;
   - otherwise lexicographically smallest immutable record ID.
10. If the survivor differs from the target union／service, create one EDIT revision Draft.
11. Do not create sibling Suppression Drafts until the canonical EDIT is approved and Active.
12. After canonical activation, create separate SUPPRESSION Draft proposals for remaining current Active siblings only if lifecycle approval did not already supersede them.
13. Never suppress the final effective record for a key without explicit Checker confirmation that the relationship should be unauthorised.

For legacy `.001.12` data, the deterministic repair outcomes are:

- `.001.12` plus other supported values: remove `.001.12`, retain the supported values, derive service again, and propose an EDIT Draft only when Gate 2 permits Apply.
- `.001.12` plus an already governed `.001.08`: retain `.001.08`, remove `.001.12`, and never count this as converting `.12` into `.08`.
- `.001.12` as the only value: retained union is empty; create no replacement `.001.08` and route the record to manual Suppression review.

This is a two-phase governed workflow, not one database transaction:

```text
Phase A: Consolidate → EDIT Draft → Checker decision → canonical Active
Phase B: Duplicate cleanup → SUPPRESSION Draft(s) → Checker decision
```

## 9. ADD／EDIT／SUPPRESSION semantics

- **ADD:** Valid only when no Active or open workflow exists for the canonical key. It may contain multiple supported Message Types.
- **EDIT:** Retains the approved original set and calculates `UNCHANGED`, `ADDED`, and `SUPPRESSED` values. It may add and suppress multiple values atomically.
- **SUPPRESSION:** Original business fields are read-only. Suppression reason is required, editable, and at least five characters. It clearly identifies the target and reason.
- An unsupported value in manual ADD／EDIT is a validation error; unlike Load Data, manual maintenance must not silently ignore it.
- Load Data filters unsupported values and records accepted／ignored evidence before deciding whether a row can be created.

## 10. Concurrency and preflight

Immediately before every mutation, the tool must confirm:

- raw `id`, `version`, `status`, and `updatedAt` still match the audited snapshot;
- no `hasOpenRevision` or open WIP／Draft／Pending Approval exists;
- the supported catalogue version and hash have not changed;
- the canonical key still resolves to the same raw group;
- the proposed retained set is non-empty.

Failure of any check returns `STALE_PLAN_SKIPPED`; the tool must not recalculate and mutate silently in the same run.

## 11. Draft-only API workflow

For an Active canonical survivor:

1. `POST /rma-authorisations/{id}/revise`
2. Confirm returned status is WIP and capture the revision ID.
3. `PUT /rma-authorisations/{revisionId}` with the filtered Message Types and derived service.
4. Confirm returned status is Draft.
5. Stop.

The repair tool must never call `/submit`, `/approve`, `/activate`, or DELETE.

If revise succeeds but PUT fails, the tool must call the governed cancel-revision endpoint for the created revision. If cancellation also fails, emit `WIP_RELEASE_FAILED`, stop processing that canonical key, and raise an operational alert.

## 12. Idempotency and restart

- Every repair plan has a deterministic `planId` derived from raw snapshot hash + catalogue hash + `asOf`.
- Every item has an idempotency key derived from `planId + canonicalKey + action`.
- Re-running Dry Run over unchanged data produces the identical plan.
- Re-running Apply skips already-created matching Drafts.
- A partial run may resume from the result log without repeating successful mutations.

## 13. Evidence and audit log

The consolidated log must record:

- plan ID, generation timestamp, `asOf`
- raw record count and SHA-256 snapshot hash
- catalogue version and SHA-256
- canonical key and every contributing raw record ID／version
- accepted, ignored, added, unchanged, and suppressed Message Types
- survivor-selection reason
- requested API calls and responses
- final status: success, skipped, failed, or manual review
- WIP cancellation result when applicable

The primary audit display uses the governed RMA View screen; raw JSON remains downloadable diagnostic evidence.

## 14. User stories

- As a BA, I want one documented decision for every raw-record condition so that data correction does not invent policy.
- As a Maker, I want generated revisions to stop at Draft so that I can verify the proposed Message Type delta.
- As a Checker, I want the original set, revised set, and contributing duplicate records so that I can make an informed decision.
- As QA, I want a reproducible snapshot, parameter hash, and idempotent plan so that the repair can be independently verified.
- As Operations, I want failed revisions to release WIP automatically so that batch repair cannot leave locked records.

## 15. P0 acceptance criteria

1. Given raw duplicate FIN and FINPLUS records for the same BIC pair and direction, when Dry Run executes, then exactly one canonical logical group is produced with a union of supported types.
2. Given BIC8 and equivalent BIC11 values, when grouping executes, then they resolve to one canonical key.
3. Given supported and unsupported values in one row, when Load Data executes, then supported values are retained and unsupported values are logged but not stored.
4. Given all values are unsupported, when Load Data executes, then no RMA is created.
5. Given an existing open revision, when Apply executes, then the group is skipped without mutation.
6. Given revise succeeds and PUT fails, when cleanup executes, then the WIP is cancelled and the result is logged.
7. Given a valid repair, when Apply completes, then the new record status is Draft and no Submit／Approve／Activate endpoint was called.
8. Given unchanged raw data and catalogue, when Dry Run runs twice, then plan IDs, plan items, deterministic ordering, and content are identical.
9. Given REVOKED／SUPERSEDED history, when repair runs, then no historical record or audit event changes.
10. Given UI, API, Load Data, Audit, and Repair, when their supported sets are queried, then values and catalogue hashes are identical.
11. Given a multi-page raw dataset, when Dry Run executes, then it uses only the raw endpoint, obtains a stable snapshot token or fails closed on change, classifies every physical ID exactly once, and records the raw count and hash.
12. Given any preflight input changes (`version`, status, `updatedAt`, catalogue hash, group membership, or retained set), when Apply begins, then it emits `STALE_PLAN_SKIPPED` and makes zero mutations.
13. Given effective-period boundaries, when `validFrom == asOf` or `validTo == asOf`, then the row is included; non-overlapping siblings are never unioned.
14. Given every survivor tie-break condition, when Dry Run repeats, then it selects the same immutable raw ID.
15. Given the same Apply item is retried, a matching Draft exists, or execution resumes after a crash, then no duplicate Draft or API mutation is created.
16. Given revise succeeds and PUT and cancellation both fail, then it emits `WIP_RELEASE_FAILED`, raises an alert with plan／item／revision IDs, and stops that canonical key.
17. Given duplicate siblings, Phase A creates exactly one EDIT Draft and zero Suppression Drafts; Phase B is unavailable until the canonical revision is Active.
18. Given manual ADD／EDIT contains an unsupported value, then API validation fails; given Load Data contains it, the value is filtered and evidenced.
19. Given Draft creation succeeds, then post-write readback proves the new status is Draft and the original Active record is byte-for-byte unchanged.
20. HTTP and persistence spies prove zero calls to Submit, Approve, Activate, DELETE, or direct SQL writes.
21. Deterministic canonical JSON serialization is used for raw snapshot hashes, catalogue hashes, plan IDs, and item idempotency keys.
22. Counters and per-item evidence cover every classification, skip, failure, cancellation attempt, cancellation outcome, accepted value, ignored value, and lifecycle result.
23. Given the governed MT1／pacs.008 memory, when the candidate catalogue and profile fixtures are validated, then every Matrix A row A01–A12 has traceable positive, negative or boundary evidence for approved service／profile row, leg classification and exact context pairing. `MT103` base／STP share exactly one selectable `MT103` Message Type without mixing profile metadata; Base requires Field 119 `ABSENT`, STP requires exact `119:STP`, `SERIAL+INDA`, `SERIAL+INGA`, and `COVER+COVE` pass, and unexpected／missing／wrong Field 119, wrong／unapproved service, wrong leg classification, wrong context pairing, or `CLRG` produces the exact Matrix A failure outcome. `pacs.008.001.08` plain／STP share exactly one selectable Message Type with exact approved row, `BizSvc` and `NbOfTxs=1` metadata.
24. Given `MT101`, separate executable tests prove that UI does not offer it, manual API ADD／EDIT rejects it, Load Data logs `IGNORED_OUT_OF_SSI_SCOPE` without storing it, Audit classifies it unsupported, and Repair removes it from the retained set and never writes it back.
25. Given positive legacy operational data containing `pacs.008.001.12`, executable tests prove that the catalogue／UI offers only `.001.08`, manual ADD／EDIT rejects `.001.12`, and controlled Load Data／Repair produces `.001.08` with explicit conversion evidence. Immutable history and isolated negative／legacy fixtures retain their original value and remain operationally ineligible.
26. Given `MT103 REMIT`, profile tests cover one exact effective approved match, inclusive `effectiveFrom`／`effectiveTo` boundaries, missing approval, expired and future rows, community mismatch, MUG mismatch, variant mismatch, and multiple matching rows. Only exactly one complete match is supported; every other case returns `UNSUPPORTED_PROFILE`, while base `MT103` eligibility remains unchanged.
27. Given `pacs.008.001.08`, profile tests prove plain `swift.cbprplus.04` and STP `swift.cbprplus.stp.04` with `NbOfTxs=1` and `INDA`／`INGA`／`COVE` are accepted; wrong or missing `BizSvc`, `NbOfTxs != 1`, and `CLRG` return `UNSUPPORTED_PROFILE`.
28. Given UI, API validation, Load Data, QA fixtures, Audit, and Repair resolve MT103／pacs.008 scope using the same `standardsRelease`, `asOf`, and profile-decision context, then all consumers expose or evidence the same catalogue version, SHA-256, Message Type set, and profile metadata; any version, hash, release, context, set, or metadata mismatch fails closed before display, validation, load, fixture generation, audit classification, or mutation.
29. Given the frozen Scope but an absent, invalidated, or unapproved exact-SHA bundle, when candidate generation or read-only Dry Run executes, then review evidence may be produced but no runtime catalogue is published and no MT1／pacs.008-dependent implementation, TDD, OAS, Page Parameter, API, DB, repair mutation, or release action proceeds.
30. Given eligible positive operational／Draft data containing `.001.12` and other supported values, when Dry Run plans repair, then it converts `.001.12` to governed `.001.08`, retains the other supported values, recalculates service, and records conversion provenance.
31. Given eligible positive operational／Draft data containing both `.001.12` and governed `.001.08`, when Dry Run plans repair, then the target contains one deduplicated `.001.08`; evidence records the `.12 → .08` conversion and deduplication.
32. Given eligible positive operational／Draft data whose only value is `.001.12`, when Dry Run plans repair, then the target contains governed `.001.08` with explicit conversion evidence. Given immutable history, isolated negative／legacy fixture, or unknown eligibility, no conversion or mutation is planned.
33. Given any controlled fixture in `QA_POSITIVE`, `QA_NEGATIVE`, or `QA_BOUNDARY`, when `operationalEligible=false`, then Operational UI, API, Load Data, index, authorised counts and repair sources fail closed: the fixture is absent and cannot create, revise or authorize an operational record. A missing or non-`false` `operationalEligible` value is invalid fixture metadata and is also rejected from every Operational consumer.

## 16. Success metrics

- 100% raw records classified.
- Zero direct database mutations.
- Zero automated Submit／Approve／Activate calls.
- Zero unsupported MT／MX values in newly written Drafts.
- Zero residual WIP locks caused by repair failures.
- Zero duplicate current logical indexes after both Checker-approved phases complete.
- 100% replay reproducibility for unchanged snapshots.

## 17. Resolved decisions and remaining authorization gates

1. **Resolved decision — fidelity confirmation only, not a reopened scope decision:** MT103 base／STP and `pacs.008.001.08` plain／STP are Phase-1 in scope; MT103 REMIT is conditional on an effective approved profile row; MT101 is out of scope. This decision must be materialised in the versioned runtime catalogue and must not be replaced by `.001.12` fixture data. Exact-SHA bundle implementation authorization remains a separate release gate, not a reason to keep MT1 empty.
2. **Product Owner decision required:** approve the governed rule that distinguishes operational records from QA fixtures using `source + fixtureFamily + usageGroup`.
3. **BA conditionally approved:** canonical-survivor tie-breaking is permitted only within identical effective periods and compatible governed metadata; version comparison is lineage-local.
4. **BA approved:** BIC8／BIC11 are equivalent for the comparison key; display values remain unchanged.
5. **Product Owner decision required:** confirm two-phase consolidation followed by sibling suppression and whether current automatic supersede behavior must change.
6. **BA approved:** an all-unsupported group requires manual Suppression review; it never creates an empty EDIT or automatic Suppression Draft.
7. **Current release blocker:** the final bundle binds governed-memory SHA `A3DA4D790F4E2F7A18E7865A37E59EB169C4288C6D6C53A527AECDF4538FECF4`, while the reviewed working memory currently hashes to `AA4287E19FFF3D2EB2DD826F83CC73B4AAE1BAA7F05910960FE6C8E5E6F28886`. Under the bundle invalidation rule, existing same-SHA verdicts do not authorize the current artifact. The bundle must be regenerated against all current artifact SHAs, independently re-reviewed, approved by Product Owner, and set to `implementationAuthorized=true` before implementation or publication.
8. **`TEST-COVERAGE-GATE`:** closure requires traceable Matrix A A01–A12 → Test Case → Fixture → Expected Outcome coverage for every service, profile approval, leg classification and allowed／disallowed context pair in Section 5.3, catalogue／memory／Matrix SHA evidence, controlled review of the A01 `ABSENT` refinement, and proof that no controlled fixture can enter Operational data.
9. **`RUNTIME-APPLY-GATE`:** closure requires the two sequential gates in Section 18. Product approval of the exact design permits implementation and fixture work; it does not itself authorize runtime publication or data mutation.

## 18. Release gate

Until the exact-SHA authorization gate is valid, work is limited to specification, design, and read-only analysis. A candidate catalogue or Dry Run may be produced solely as review evidence. No MT1／pacs.008-dependent implementation, TDD, OAS, Page Parameters, API behavior, DB change, runtime catalogue publication, repair mutation, or release is authorized.

### Gate 1 — Implementation／TDD authorization

Implementation, TDD, controlled fixture generation and fixture validation may begin only when:

- a regenerated final bundle matches the current SHA of every bound artifact;
- BA Maker, Independent BA Checker, and QA Checker pass that exact bundle;
- Product Owner approves it and the bundle records `implementationAuthorized=true`; and
- the bundle invalidation check passes immediately before implementation begins.

Gate 1 permits code implementation, TDD, candidate parameter generation and controlled QA fixture work. It does not permit runtime configuration publication, DB migration, Operational SSI／RMA insertion, repair Apply, Submit, Approve, or Activate.

### Gate 2 — Runtime publication／Apply authorization

Runtime-catalogue publication, Apply-engine execution and all data mutation may proceed only after Gate 1 and all of the following:

- BA approves Sections 5–9 and all remaining blocking business decisions;
- QA approves the complete P0 acceptance evidence and `TEST-COVERAGE-GATE`;
- fixture-isolation evidence proves all `QA_POSITIVE`／`QA_NEGATIVE`／`QA_BOUNDARY` controlled data and any fixture with missing／invalid operational eligibility cannot reach Operational UI, API, Load Data, indexes, authorised counts or repair sources;
- Engineering provides and verifies the raw-record API, parameter parity／hash checks, preflight, idempotency, WIP cleanup and zero direct SQL writes;
- a new reviewed Dry Run replaces the invalid 42-item proposal and reports the exact DB delta;
- the catalogue／fixture／raw snapshot hashes still match their approved evidence; and
- the user explicitly authorizes applying that exact reviewed Draft-only plan.
