# SSI-related File Maintenance Workflow — Persistent Decision Record

**Status:** Normative project memory

**Latest confirmation:** 2026-09-18

**Read before:** answering maintenance lifecycle questions or changing SSI, RMA, Entities, Nostro, SWIFT Data, shared Maker／Checker UI, API, repository, tests, fixtures, or `.env` configuration.

## API／parameter／screen consistency standard

- Governed APIs are the single entry point for Load Data, repair, and maintenance writes. Do not repair operational data by directly updating database tables.
- OAS resource contracts and governed parameter files drive page fields, data types, validation, dropdown／multi-select values, View, Checker, and Audit presentation.
- UI entry, API commands, Load Data, existing-data audit, and repair use the same validation rules and the same versioned parameter snapshot.
- A unified TypeScript audit must be able to read SSI, RMA, Nostro, and Entities through APIs, write one consolidated error log, and classify each issue as ignore-on-load, safe Draft update, governed revision required, or report-only.
- Automated repair stops at Draft. Submit and Approve remain explicit Maker／Checker actions.

## UI design review gate

- Every participant who proposes, reviews, tests, or implements an SSI-related maintenance screen must first read the applicable current files under `memory/`. This includes Maker, Engineer, BA, Independent BA, QA, and UX roles.
- Screen design review is limited to at most three review rounds. Each round records the reviewed design, applicable Memory decisions, concerns, required changes, and an explicit `PASS` or `CHANGES_REQUIRED` outcome.
- Implementation begins only after the screen design receives `PASS`. A code implementation, OAS change, Page Parameters change, or data mutation must not be used to bypass an unresolved design decision.
- If the primary BA raises a substantive concern that cannot be resolved from the applicable Memory, an Independent BA may provide a second ruling. The Independent BA must read the same Memory and review the same design version; a second BA is not a mechanism for bypassing an existing governed decision.
- If the design has not passed after the third round, stop implementation and record the unresolved questions for Product Owner decision.

## Product-wide scope and Cancel standard

- This is the common maintenance-operation standard for **all SSI-related files and functions**, not only the SSI Record page.
- It applies to SSI, RMA, Entities, Nostro, SWIFT Data and every shared maintenance component used by those functions.
- `×` or `Esc` **equals Cancel**. Do not render a separate `Cancel` button in maintenance editors, drawers, dialogs, or transaction-input screens.
- The `×` control is positioned at the upper-right of the maintenance surface and is deliberately prominent: minimum 48×48 px target, large bold glyph, high-contrast border／color, visible keyboard focus, and an accessible Close label.
- For a new record that has not acquired server state, Cancel discards local input and returns to the owning index／section.
- For an editor that acquired a server-side WIP reservation, Cancel must cancel the WIP on the server, release the lock, and then return to the owning index／section.
- For read-only View, Cancel only closes the view and must not mutate the record.
- A shared close component／handler must implement this behavior consistently; feature-specific labels or divergent close logic are prohibited.

## Canonical multi-user revision workflow

1. Selecting `Revise` on an eligible Active record must atomically create a server-side `WIP` reservation.
2. The Active record remains the effective record, but its server-derived Current Status displays `In Progress` and other users cannot start another Revise or Suppress operation.
3. Existing `WIP`, `DRAFT`, `PENDING_APPROVAL`, or `APPROVED` open revisions block another Revise. The server is authoritative; hiding a UI button is not concurrency control.
4. `WIP / In Progress` is transient work and must not appear in the Draft tab.
5. Closing the editor uses only `×` or `Esc`; do not add a separate `Cancel` button.
6. `×` or `Esc` cancels the WIP reservation on the server, releases the lock, and restores the source Active record to its normal actionable state. If server cancellation fails, fail closed and do not pretend that the lock was released.
7. `Save Draft` converts the reserved WIP into a persistent Draft. It does not create the first concurrency reservation at save time.
8. Revoke Draft is a logical Delete Draft: retain audit evidence, remove it from the operational Draft index, and release the source Active record for Revise／Suppress again.
9. Checker Reject returns the governed request to Draft. Maker may Edit and resubmit, or Revoke Draft to return the source record to normal.

## WIP expiry

- Configuration key: `REVISION_WIP_TTL_MINUTES`.
- The configured value is authoritative. When the environment key is unset, the governed default is **30 minutes**.
- After the configured inactivity period, the server must logically cancel the abandoned WIP, preserve audit evidence, and release the source record lock.
- `DRAFT` and `PENDING_APPROVAL` do not expire through the WIP timeout.

## Server-derived Current Status contract

`Current Status` is a typed read projection derived by the server from the source record's authoritative open child. It is not inferred by the browser and is not a second persisted lifecycle field.

| Open child state／type                                                        | `currentStatus` | Exact UI label |
| ----------------------------------------------------------------------------- | --------------- | -------------- |
| No open child                                                                 | `EMPTY`         | Empty cell     |
| Ordinary or suppression reservation in `WIP`                                  | `IN_PROGRESS`   | `In Progress`  |
| Ordinary `REVISION` in `DRAFT`, `PENDING_APPROVAL`, or legacy-open `APPROVED` | `DRAFTED`       | `Drafted`      |
| `SUPPRESSION` in `DRAFT`, `PENDING_APPROVAL`, or legacy-open `APPROVED`       | `SUPPRESSED`    | `Suppressed`   |

- The projection applies identically to RMA, Entity, Nostro, and SSI list responses. A custom grouped index must derive the projection from the grouped source member's actual open child, including that child's `changeType`.
- An Active row exposes `Revise` and `Suppress` only when `currentStatus=EMPTY`. Missing, unknown, or non-empty Current Status fails closed with zero mutation actions.
- First `Revise` atomically reserves WIP. A competing `Revise` or `Suppress` must be rejected by the server even when two requests race before either browser refreshes.
- `×`／`Esc` before Save Draft releases the server WIP; Save Draft converts WIP to `DRAFT`; the configured TTL logically expires abandoned WIP. Refresh and list APIs must immediately reflect the resulting Current Status.

## State summary

```text
ACTIVE (no open revision)
  └─ Revise → WIP / In Progress (server lock acquired)
       ├─ Save Draft → DRAFT
       ├─ × / Esc → WIP cancelled → ACTIVE unlocked
       └─ configured inactivity TTL (default 30 minutes) → WIP expired → ACTIVE unlocked

DRAFT
  ├─ Edit → Save Draft → DRAFT
  ├─ Submit → PENDING_APPROVAL
  └─ Revoke Draft → logically deleted → source ACTIVE unlocked

PENDING_APPROVAL
  ├─ Approve → ACTIVE (new version)
  └─ Reject → DRAFT
```

## Product Owner index action matrix

This matrix is the final Product Owner ruling for record-level actions in SSI-related maintenance indexes. It is presentation guidance only; server-side lifecycle and concurrency checks remain authoritative.

| Record state／revision condition           | Visible record actions                  |
| ------------------------------------------ | --------------------------------------- |
| `ACTIVE` with no open revision             | `Revise`, `Suppress`                    |
| `ACTIVE` with any non-empty Current Status | None                                    |
| Ordinary `DRAFT` (`ADD`／`REVISION`)       | `Submit`, `Edit`, `Revoke Draft`        |
| `SUPPRESSION` `DRAFT`                      | `Submit`, `Revoke Draft`; **no `Edit`** |
| `SUPPRESSED`                               | None                                    |
| `ALL` tab                                  | None                                    |

- In every tab, clicking a row or pressing `Enter`／`Space` opens **View Record**.
- Header／global `Add`, `Export`, `Import`, and `Dry-run` controls are outside this record-action matrix.
- Checker actions are outside this record-action matrix.

## Historical decisions that must not be reinterpreted

- “多用戶處理 REVISE…選到成功註記，取消時把註記取消。”
- “一個是已經存到 DRAFT，一個是正在被處理 (WIP)。都不能 REVISE。”
- “In Progress 不出現在 DRAFT，因為 In Progress 是選了還沒做完。”
- A report that `Revise → close` incorrectly leaves `In Progress` means close failed to cancel the WIP. It does **not** mean Revise should wait until Save Draft to create WIP.

## Settings／Development Test Data Reload — Latest confirmed decisions

- Opening Settings performs no canonical-seed inspection and displays no Fixture ID or Seed SHA.
- `Reload Test Data` calls governed APIs in this order: authorize password, list/select dataset, optionally upload a local JSON, confirm reload. The latest server export is default; an older export or another compliant uploaded file remains selectable.
- Browser code never reads a server path, writes a DB, executes SQL, performs backup, or restores data. BFF forwards typed requests; SSI Service owns all state changes.
- Upload content supplies records only. Its declared schema must exactly match the active server-governed schema, and no uploaded SQL／DDL／command may be executed.
- Reload backs up the active DB, builds and validates a new shadow DB, activates it only after complete verification, and restores the original DB on every failure.
- Success and failure both create persistent audit evidence without passwords. The evidence records actor, environment, dataset and seed identity, previous/new logical snapshots, imported row counts, timestamp, outcome and safe error code.
- Active MT1／MT2 reload data is under `data/reload-test-data/`. Superseded v15.x paths, deleted historical reports, build/scanner output and manual governance SHA sidecars are not active validation dependencies.
- This simplification does not waive security, backup/restore, audit, DBA, `npm run verify`, SonarQube, Browser UAT, Proposal regression or Independent BA／QA review of the same exact candidate commit.
