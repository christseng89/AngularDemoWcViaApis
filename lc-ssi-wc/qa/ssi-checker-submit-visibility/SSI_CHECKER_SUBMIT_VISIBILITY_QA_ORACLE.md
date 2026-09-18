# SSI Submit-to-Checker immediate visibility — Independent QA oracle

**Defect scope:** After Maker revises, saves, and submits an SSI, a previously visited Checker view must show the new `PENDING_APPROVAL` record on the next navigation without a browser/full-page reload.  
**Environment:** Development Demo.  
**Data policy:** No DB, seed, fixture, or business-lifecycle mutation by QA.  
**Candidate:** base `7cccbeeda78554bbe37a31e6021ddd981cdaced7`; Maker patch SHA `b7f15e5840559c2eb3ae0a1cfabb2763b425e07d`.

## Root-cause oracle

The Checker view was incorrectly retained in the one-time feature-data cache. `act(..., "submit")` refreshed rows using the Maker/Dashboard filter, but returning to Checker was short-circuited by the cache. The new pending item therefore became visible only after a full-page reload.

## Acceptance matrix

| Gate | Required result |
|---|---|
| Authoritative reload | Every navigation into Checker starts a new Checker data load after the previous load has completed |
| SSI pending source | Checker navigation executes an SSI `PENDING_APPROVAL` query through `refresh()` |
| Other governed pending source | Checker navigation also executes `loadGovernedPending()` |
| No full reload | No `window.location.reload`, route reload, or equivalent workaround |
| In-flight dedupe | Concurrent/repeated navigation while one Checker load is pending reuses the same promise and does not duplicate GETs |
| Post-submit visibility | Maker submit followed by navigation to Checker shows the submitted identity immediately |
| Filter | Checker remains restricted to `PENDING_APPROVAL`; Active/Draft/Suppressed rows do not leak in |
| Count | Badge/count reflects SSI pending plus governed pending with no duplicate counting |
| Pagination | Current page and total pages remain valid when the pending denominator changes |
| Existing lazy loading | Dashboard/Maker/Resolution/Audit caches and load boundaries remain unchanged |
| Business behavior | No action, button, lifecycle, status transition, API write, or data rule changes |
| Persistence | No DB, seed, fixture, or runtime-data modification |

## Evidence status

- Exact candidate file SHA verification: `PASS`
  - `app.component.ts`: `6B8DE93FE3EF2C693A4FC5BD4E43E5185D01C10C1A07F42FECF119EEA7B28F2D`
  - `component-behavior.spec.ts`: `E027350B440DEDE9AE70658D44782A026393ACECC08164F71FD6E3210FD4492B`
  - Binary patch identity: `b7f15e5840559c2eb3ae0a1cfabb2763b425e07d`
- Focused behavior tests: `PASS` — 1 suite, 38/38 tests, no cache.
- Full portal regression: `PASS` — 40 suites, 345/345 tests, no cache.
- Typecheck/build/lint/format: `PASS`
  - `nx typecheck ssi-portal --skip-nx-cache`
  - `nx build ssi-portal --skip-nx-cache`
  - ESLint on both changed files
  - Prettier check on both changed files
  - `git diff --check`
- Independent navigation/in-flight test: `PASS`
  - Checker is excluded from `loadedFeatureData` but remains protected by `featureDataLoads` while a request is in flight.
  - After Maker submit and return navigation, the test requires a second `loadGovernedPending()` and a Checker `refresh()`.
- UI/API read-only verification: `PASS`
  - Navigation `SSI Maintenance -> Checker` remained at `http://localhost:4600/`, visibly entered `Loading SWIFT Data Service...`, and completed without a full-page reload.
  - Checker SSI displayed `0 records`, `Page 1 / 1`, disabled Previous/Next, consistent with the read-only current pending denominator of zero.
  - QA issued no POST/approve/reject and made no DB, seed, fixture, or runtime-data change.
- Final defect verdict: `PASS`

## Scope and residual gates

- Candidate changes only Checker cache/reload orchestration and its behavior test. No button, predicate, lifecycle, status transition, API write contract, DB, seed, or fixture change was found.
- Live post-submit identity creation was intentionally not executed because it would mutate the shared Development DB. The submit-to-return behavior is independently covered by the focused test; the live UI check is read-only corroboration.
- Project/release acceptance remains `NOT_ACCEPTED` independently of this defect verdict because the controlled operating-model SHA differs from the manifest declaration and the separate global coverage gate remains unresolved.

Project/release acceptance remains separately gated by the controlled operating-model/manifest SHA mismatch.
