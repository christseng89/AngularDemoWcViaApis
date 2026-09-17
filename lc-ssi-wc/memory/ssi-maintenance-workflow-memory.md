# SSI-related File Maintenance Workflow — Persistent Decision Record

**Status:** Normative project memory  
**Latest confirmation:** 2026-09-16  
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
2. The Active record remains the effective record, but its Revision Status displays `In Progress` and other users cannot start another Revise or Suppress operation.
3. Existing `WIP`, `DRAFT`, `PENDING_APPROVAL`, or `APPROVED` open revisions block another Revise. The server is authoritative; hiding a UI button is not concurrency control.
4. `WIP / In Progress` is transient work and must not appear in the Draft tab.
5. Closing the editor uses only `×` or `Esc`; do not add a separate `Cancel` button.
6. `×` or `Esc` cancels the WIP reservation on the server, releases the lock, and restores the source Active record to its normal actionable state. If server cancellation fails, fail closed and do not pretend that the lock was released.
7. `Save Draft` converts the reserved WIP into a persistent Draft. It does not create the first concurrency reservation at save time.
8. Revoke Draft is a logical Delete Draft: retain audit evidence, remove it from the operational Draft index, and release the source Active record for Revise／Suppress again.
9. Checker Reject returns the governed request to Draft. Maker may Edit and resubmit, or Revoke Draft to return the source record to normal.

## WIP expiry

- Configuration key: `REVISION_WIP_TTL_MINUTES`.
- Current environment decision: **5 minutes**. This supersedes the earlier 30-minute decision.
- After the configured inactivity period, the server must logically cancel the abandoned WIP, preserve audit evidence, and release the source record lock.
- `DRAFT` and `PENDING_APPROVAL` do not expire through the WIP timeout.

## State summary

```text
ACTIVE (no open revision)
  └─ Revise → WIP / In Progress (server lock acquired)
       ├─ Save Draft → DRAFT
       ├─ × / Esc → WIP cancelled → ACTIVE unlocked
       └─ 5-minute inactivity → WIP expired → ACTIVE unlocked

DRAFT
  ├─ Edit → Save Draft → DRAFT
  ├─ Submit → PENDING_APPROVAL
  └─ Revoke Draft → logically deleted → source ACTIVE unlocked

PENDING_APPROVAL
  ├─ Approve → ACTIVE (new version)
  └─ Reject → DRAFT
```

## Historical decisions that must not be reinterpreted

- “多用戶處理 REVISE…選到成功註記，取消時把註記取消。”
- “一個是已經存到 DRAFT，一個是正在被處理 (WIP)。都不能 REVISE。”
- “In Progress 不出現在 DRAFT，因為 In Progress 是選了還沒做完。”
- A report that `Revise → close` incorrectly leaves `In Progress` means close failed to cancel the WIP. It does **not** mean Revise should wait until Save Draft to create WIP.
