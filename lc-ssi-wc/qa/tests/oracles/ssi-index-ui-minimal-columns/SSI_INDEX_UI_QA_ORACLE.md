# SSI Index minimal-column UI — Independent QA oracle

**Status:** `PASS` — replacement candidate `13EACD354EF3B2C4167EA03005140898EF806F55DB0A13E5DB7597C047EF8794` independently verified.  
**Environment:** Development Demo.  
**Data policy:** Read-only UI/API verification only; no shared DB POST, approval, seed, fixture, or runtime-data mutation.

## Authorized presentation-only delta

The replacement candidate may implement exactly these SSI Index presentation changes:

1. Hide the SSI UUID secondary line.
2. Hide the duplicate Booking / Legal Entity secondary line.
3. Remove the Account Ref column.
4. Remove the Route Class / Priority column.
5. Rename `Booking／Legal Entity` to `Account Owner`, preserving the cell's current primary value and underlying field/sort behavior.
6. Rename `Account Owner／Servicer` to `Servicer`; remove the repeated Account Owner primary value from that cell and retain only the Servicer value.

No other product or interaction change is authorized.

## No-change invariants

| Area | Required result |
|---|---|
| Remaining columns | Same fields, order, values, labels, sorting, wrapping, alignment, and responsive behavior except for the six authorized presentation deltas |
| Buttons | All existing buttons remain present under the same lifecycle predicates, labels, enabled/disabled states, handlers, and order |
| Row behavior | Row click/keyboard/detail behavior remains unchanged |
| Status filters | Active, Draft, Suppressed, and All remain unchanged |
| Pagination/count | Record denominator, page count, Previous/Next state, and page transitions remain unchanged |
| Search/sort | Same search domain and sort semantics |
| Lifecycle | No status, revision, Maker/Checker, submit, revise, suppress, or revoke logic change |
| API/data | No request contract, response mapping, DB, seed, fixture, or runtime-data change |
| RMA | Zero RMA UI, behavior, predicate, handler, or data change |

## Independent test matrix

| Gate | Expected result | Status |
|---|---|---|
| Exact candidate identity | Maker patch hash and every changed-file SHA match handoff | `PASS` |
| Diff scope | Only SSI Index presentation implementation/tests change | `PASS` |
| UUID secondary line | Not rendered in SSI Index rows | `PASS` |
| Duplicate booking subline | Not rendered in SSI Index rows | `PASS` |
| Account Ref column | Header and cells absent | `PASS` |
| Route/Priority column | Header and cells absent | `PASS` |
| Account Owner presentation | Renamed header, current primary value retained, original sort/field binding unchanged | `PASS` |
| Servicer presentation | Renamed header and only Servicer value displayed, original sort/field binding unchanged | `PASS` |
| Other fields/buttons | Exact no-change invariants pass | `PASS` |
| Predicate/handler regression | Existing action visibility and handlers pass automated tests | `PASS` |
| Filter/count/pagination | Read-only UI and automated regression pass | `PASS` |
| RMA non-regression | RMA DOM/behavior tests and read-only UI unchanged | `PASS` |
| Portal regression | Focused tests, full suite, typecheck, lint, format, build pass | `PASS` |

## Final verdict

`PASS` — the replacement candidate implements only the six approved presentation deltas and preserves all tested interaction and business invariants.

## Replacement candidate evidence

- Base: `7cccbeeda78554bbe37a31e6021ddd981cdaced7`.
- Canonical patch: 8,904 UTF-8 bytes, SHA-256 `13EACD354EF3B2C4167EA03005140898EF806F55DB0A13E5DB7597C047EF8794` (independently reconstructed from tracked HTML diff followed by the new-file diff).
- Canonical LF file SHA-256:
  - `app.component.html`: `5E45471318E225365A9F46CC00BCA5A7D01F1655A0FEDC535E42E7D190D76617`.
  - `ssi-index-approved-visibility.spec.ts`: `5EDCA7D92BDB3042CEE78F31E546A3E8B1B54D47A5641E85BF457BBDFFB321BB`.
- Independent no-cache focused test: 1 suite, 5/5 PASS.
- Independent no-cache full portal: 41 suites, 350/350 PASS.
- Portal typecheck, build, Prettier and diff-check: PASS. Full repository `npm run verify`: PASS.
- Read-only live UI at `http://localhost:4600/`:
  - Headers are `SSI ID`, `ACCOUNT OWNER`, `SERVICER`, `CURRENCY`, `EFFECTIVE PERIOD`, `STATUS`, `VERSION`, `REQUEST TYPE`, `REVISION STATUS`, `SUBMIT`, `EDIT / REVISE`, `SUPPRESS`, `REVOKE DRAFT`.
  - No SSI UUID secondary line, Booking duplicate subline, Account Ref, or Route/Priority is rendered.
  - Account Owner retains the current primary value; Servicer displays one BIC value only.
  - Existing action predicates remain observable: rows with open revisions do not show Revise/Suppress; eligible Active rows do.
  - Count/pagination remained `11 records`, `Page 1 / 2`, with Previous disabled and Next enabled.
- Template diff is confined to the SSI ownership table and the new contract spec. RMA markup, TypeScript business/API logic, DB, seed, fixture, and runtime data are unchanged.
- QA made no POST/approve/reject and no shared Development DB mutation.

## Superseded evidence (not reusable)

- Candidate `20E30F29A5358DE475C10BC36BB0AA7B353F88C61CDD24C2946C354B48A252C8`: focused 4/4 and portal 349/349 passed independently, but the candidate was superseded by a later explicit display requirement before final acceptance.
- These results do not constitute a verdict and must not be carried forward to the replacement candidate.
