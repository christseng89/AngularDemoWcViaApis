# SSI Checker 11-record approval defect — Independent QA oracle

**Role:** Independent QA Checker (`/root/ssi_checker_approval_qa`)  
**Environment:** Development Demo (`http://localhost:4600`, BFF `http://localhost:3100`)  
**Mutation policy:** Read-only until a Maker candidate is handed over. No production-code, DB, seed, or fixture changes by QA.  
**Initial verdict:** `FAIL` (defect reproduced by state/API evidence)  
**Frozen candidate verdict:** `PASS` for this defect; project/release acceptance remains gated by the governance SHA mismatch recorded below.

## Governance identity

| Artifact | Declared version / SHA | Observed SHA | Result |
|---|---|---|---|
| `memory/lc-ssi-wc-operating-model-zh-v2.md` | `v2.8.21` / `EA77F1C77441928E02AFB18221C9AB71CAE266B4FB384AE73B8C1D0404EB6626` | `5727E09B9C0D0F481A20A56096C34586B32D881A349A75D46B94D7A63684B9CC` | `MISMATCH` |

The governance SHA mismatch is an independent acceptance blocker. It does not alter the defect root-cause evidence below.

## Frozen denominator

Read-only GET:

`GET /api/ssis?status=PENDING_APPROVAL&page=1&pageSize=100&sortBy=STATUS&sortDirection=ASC`

Observed `totalItems=11`. UI Checker badge also shows `11`; SSI Checker Index shows `11 records` across two UI pages.

| # | Pending approval identity | SSI name / identity | Maker | Pending status | Applicability | Active applicability | Pre-fix expectation |
|---:|---|---|---|---|---:|---:|---|
| 1 | `SSI-MT12-V1-09E928E1-F3D1-4C9B-A10C-51707A303E4B` | `CP-ANY-HKD` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 2 | `SSI-MT12-V1-5547DF35-B8E3-4375-A54A-E569FC4E69FA` | `CP-ANY-USD` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 3 | `SSI-MT12-V1-71C01B10-581D-4892-84E5-92BD247727DA` | `CP-ANY-AUD` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 4 | `SSI-MT12-V1-867B9600-5A93-45A3-A4C8-EC5B008FE8CF` | `CP-ANY` / CHASUS33 | `maker.datafix` | `PENDING_APPROVAL` | 2 `DRAFT` | 0 | Approval rejected |
| 5 | `SSI-MT12-V1-8DE05200-E796-42CC-8806-F6E7437A20B2` | `CP-ANY-SGD` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 6 | `SSI-MT12-V1-AE2A71AE-A2A1-427C-8701-B519DBBF12B1` | `CP-ANY-CNY` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 7 | `SSI-MT12-V1-B6436323-B43E-42C6-AFD1-764A5A264E11` | `ANY` / DEUTDEFF | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 8 | `SSI-MT12-V1-BFBEEC3D-E9A5-458D-8036-7419A45C6866` | `CP-ANY-CAD` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 9 | `SSI-MT12-V1-CD321EEF-6C2F-40A2-82C6-E835745D002E` | `CP-ANY-CHF` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 10 | `SSI-MT12-V1-D20BA710-2EF3-4F3D-8222-ACAFF54C4441` | `ANY` / BOTKJPJT | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |
| 11 | `SSI-MT12-V1-E73224F3-5B8B-4702-AD97-A88C87CDC3A6` | `CP-ANY-GBP` | `maker.datafix` | `PENDING_APPROVAL` | 6 `DRAFT` | 0 | Approval rejected |

## Reproduction and root-cause oracle

1. Checker badge and SSI Checker Index correctly discover all 11 records.
2. Selecting a row opens the original read-only SSI input view.
3. `Approve` is visible and enabled; the defect is not a missing-button problem.
4. `maker.datafix != checker.demo`, so Maker/Checker separation is satisfied.
5. Each pending record contains applicability rows, but every row is `DRAFT`.
6. `SsiApplicationService.transition(..., "APPROVE", ...)` requires at least one applicability row with `status === "ACTIVE"` before it can approve.
7. Therefore every record deterministically reaches `ACTIVE_SSI_APPLICABILITY_REQUIRED`; the current approval path never promotes pending applicability to Active.

## Candidate acceptance matrix

| Gate | Required result |
|---|---|
| Denominator | Exactly the same 11 identities are covered; no invented or omitted record |
| Button | `Approve` remains visible, keyboard reachable, and enabled for an eligible independent Checker |
| Four-eyes positive | `maker.datafix` with `checker.demo` is accepted |
| Four-eyes negative | Same Maker actor is rejected with zero data/audit side effects |
| State transition | Pending SSI revision becomes `ACTIVE` directly on Checker approval |
| Applicability lifecycle | All intended applicability rows for the approved revision become `ACTIVE` atomically; none remain `DRAFT` |
| Previous version | Referenced prior Active SSI becomes `SUPERSEDED` exactly once |
| API success | Approval returns success with the approved SSI identity, `status=ACTIVE`, and independent checker |
| API failure safety | Any validation/concurrency failure leaves SSI, applicability, predecessor, audit, and outbox logically unchanged |
| Audit | Checker, approval action, new Active revision, and superseded predecessor are traceable |
| UI refresh | Detail closes; Checker count/list removes only the approved identity; remaining count decrements by one |
| Pagination | Page 1/2 remains coherent as 11 decreases; no skipped/duplicated row |
| Reject regression | Reason shorter than 5 remains blocked; valid Reject returns the record to `DRAFT` |
| Existing lifecycle regression | Revise/WIP/Save Draft/Submit/Suppress/Revoke rules remain unchanged |
| Tests | New Red test proves the pre-fix defect; Green unit/integration/UI tests pass without weakening assertions |
| Shared DB | QA does not mutate the shared Development DB before explicit execution authorization |

## Final evidence placeholders

- Maker candidate identity: base `7cccbeeda78554bbe37a31e6021ddd981cdaced7`; Maker binary-diff SHA `561943f73c4c0e36d251dee59cb9c2c6dfb8b542`.
- Exact changed production/test files independently matched the Maker handoff SHA-256 values:
  - `ssi-application.service.ts`: `D6F1E57ED47F72151C11FD7F84F631DF5A5AC185BA4AFB5EB15889D8D0E78ECF`
  - `ssi-application.service.spec.ts`: `0C7A7FC1D8DD3FB2B83C53A3101AE06FC89F3649B515299ACD6B410E63CFD367`
  - `sqlite-ssi.repository.ts`: `DC63B5AB044ADB107124CDBECB57984D89B07F05BFE8334F11085E9B384F9393`
  - `sqlite-repositories.spec.ts`: `12910792825F01245D2F1491A956F5F8E889F30409582332D77F4C8D13238B6E`
- Independent focused execution, Nx cache disabled: `2 suites / 68 tests PASS`.
- Independent full SSI service CI suite, Nx cache disabled: `67 suites / 1016 tests PASS`.
- Coverage observed: statements `91.01%`, branches `83.17%`, functions `93.79%`, lines `92.16%` (below the separate governance close-gate target of >95%).
- Independent typecheck: `PASS`.
- Independent build: `PASS`.
- Independent ESLint of four candidate files: `PASS`.
- Independent Prettier check of four candidate files: `PASS`.
- QA-only isolated temporary-DB test: `qa/ssi-checker-approval/ssi-checker-11-approval.qa.spec.ts`; `1/1 PASS` covering the exact 11 identities, 62 applicability rows, same-Maker rollback, independent Checker approval, Active applicability, predecessor supersession, and three required audit events per identity.
- Shared Development DB: QA made no POST and did not click Approve. Runtime changed externally between `2026-09-17 19:30:43` and `19:31:50`; mutation authority is `UNKNOWN`. Read-only audit shows all 11 received `APPLICABILITY_APPROVED`, predecessor `SUPERSEDED`, and `APPROVE` by `checker.demo`. A subsequent SGD revision was approved at `19:34:14`, so the original SGD approved revision is now legitimately `SUPERSEDED`; the other ten remain `ACTIVE`.
- Read-only post-state: 11/11 original predecessors are `SUPERSEDED`; 11/11 approval and applicability-approval audit events exist; all 62 approved applicability rows are `ACTIVE`.
- UI observation: Approve was visible/enabled before repair. Current independent browser session remained stale until navigation/full refresh; that is tracked as a separate submit-to-Checker visibility defect and is not merged into this candidate verdict.
- Final QA verdict for SSI Checker approval candidate: `PASS`.
- Final project/release verdict: `NOT_ACCEPTED` until the operating-model document and manifest are restored to one reviewed SHA and the separate coverage gate is resolved or explicitly ruled.
