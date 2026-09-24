# SSI SUPPRESSION Draft Submit — Independent QA oracle

**Status:** `PASS` — frozen bundle `33f911a5ac10ed850ccf370ad39724e8b0967abdc9487168df6c064b113f548f` independently verified.  
**Scope:** Fix the SSI Index UI predicate so a `DRAFT` with `changeType=SUPPRESSION` exposes the existing Submit action.  
**Data policy:** No shared DB POST, seed, fixture, RMA, or runtime-data mutation by QA.

## Acceptance matrix

| Gate | Required result | Status |
|---|---|---|
| SUPPRESSION Draft | Submit button visible and enabled | `PASS` |
| Existing API | Click uses the unchanged existing SSI submit API and Maker actor | `PASS` |
| Transition | Backend remains authoritative for `DRAFT -> PENDING_APPROVAL` | `PASS` |
| Non-Draft | WIP, PENDING_APPROVAL, APPROVED, ACTIVE, SUPPRESSED, SUPERSEDED and REVOKED do not expose Submit | `PASS` |
| ADD Draft | Existing Submit behavior unchanged | `PASS` |
| EDIT/REVISION Draft | Existing Submit behavior unchanged | `PASS` |
| Four-eyes | Maker/Checker separation and backend validation unchanged | `PASS` |
| Other actions | Edit, Revise, Suppress and Revoke Draft predicates/handlers unchanged | `PASS` |
| Scope | No DB, seed, fixture, RMA, API contract, or unrelated UI change | `PASS` |
| Regression | Focused tests, full portal, typecheck, lint, format and build pass | `PASS` |

## Final verdict

`PASS` — the candidate removes only the incorrect `SUPPRESSION` exclusion from the existing `DRAFT` Submit presentation gate.

## Independent evidence

- Base Git HEAD: `7cccbeeda78554bbe37a31e6021ddd981cdaced7`; presentation baseline: independently accepted `13EACD354EF3B2C4167EA03005140898EF806F55DB0A13E5DB7597C047EF8794`.
- Canonical LF file SHA-256:
  - `app.component.html`: `c96b394648892900d9995acb6202cbae7c2e4c841758daf6bf3a74f3d0413b0a`.
  - `ssi-suppression-draft-submit.spec.ts`: `a5e819ab8b7205e245ff66acaa370f30db044105b63eefbda25b97b689a4f862`.
- The ordered 233-byte file/SHA manifest independently hashes to `33f911a5ac10ed850ccf370ad39724e8b0967abdc9487168df6c064b113f548f`.
- Reconstructing the removed predicate in memory produced the exact approved baseline HTML: 98,653 bytes, SHA-256 `5E45471318E225365A9F46CC00BCA5A7D01F1655A0FEDC535E42E7D190D76617`; therefore the only HTML delta atop the approved UI candidate is the authorized predicate removal.
- Independent no-cache focused test: 1 suite, 2/2 PASS.
- Independent no-cache full portal: 42 suites, 352/352 PASS.
- Portal no-cache typecheck and build, ESLint, Prettier and diff-check: PASS.
- Source trace confirms the unchanged handler posts to `/api/ssis/{id}/submit` with `{ actor: row.maker }`; backend still requires status `DRAFT`, exact Maker identity, a valid suppression reason, and transitions to `PENDING_APPROVAL`. Checker self-approval prohibition remains unchanged.
- Read-only UI showed the approved SSI Index layout and existing action predicates. The shared DB contained no Draft row, so QA intentionally did not create one; live click-to-POST was not executed. The focused contract and existing portal/service regression provide the executable evidence without shared DB mutation.
- No TypeScript, backend, API contract, RMA, DB, seed, fixture, or runtime data was changed. QA issued no POST/approve/reject.

## Residual governance gate

This defect verdict is `PASS`. Project/release acceptance remains separately gated because current portal coverage is below the Memory global close threshold and the operating-model/manifest SHA mismatch remains unresolved.
