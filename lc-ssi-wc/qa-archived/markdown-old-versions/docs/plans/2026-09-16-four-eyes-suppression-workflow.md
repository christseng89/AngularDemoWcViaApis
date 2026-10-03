# Four-Eyes Suppression Workflow

## Understanding summary

- Active records must not be revoked directly from an index.
- The user-facing action is **Suppress** and it creates governed work.
- Suppression follows the same Maker → Submit → Checker decision flow as other governed changes.
- The Maker and Checker must be different authenticated actors.
- The current Active version remains operational until Checker approval.
- Checker approval produces a latest `SUPPRESSED` version; the previous Active version becomes `SUPERSEDED`.
- RMA, Entities, Nostro and SSI must share the same lifecycle implementation and presentation.

## State model

```text
ACTIVE
  └─ Maker: Suppress
       └─ SUPPRESSION DRAFT
            ├─ Maker: Submit → PENDING_APPROVAL
            │                    ├─ Checker: Reject(reason) → DRAFT
            │                    └─ Checker: Approve
            │                         ├─ new version → SUPPRESSED
            │                         └─ prior ACTIVE → SUPERSEDED
            └─ Maker: Cancel → request cancelled; ACTIVE unchanged
```

`SUPPRESSION` is the change type. `SUPPRESSED` is the terminal record status.

## Four-eyes and concurrency rules

- `maker !== checker` is enforced by the service, not only by the UI.
- Suppression reason is mandatory before Submit.
- Only one open WIP, DRAFT or PENDING_APPROVAL change may exist for an Active record.
- Every command re-reads the current database state inside an atomic transaction.
- Stale or duplicate commands return HTTP 409 and the UI refreshes the affected index and Checker counter.
- A WIP reservation expires after the configured `.env` timeout; DRAFT and PENDING_APPROVAL do not expire automatically.
- Resolution queries select only `ACTIVE` records. SUPPRESSED and SUPERSEDED versions remain available to Audit.

## UI contract

- Active index action column: `Suppress`.
- Draft index: `Request Type` identifies `NEW`, `EDIT`, or `SUPPRESS`; a `SUPPRESS` Draft exposes only `Submit` and `Revoke Draft`, never `Edit`.
- Checker index repeats the sortable `Request Type`, and the decision row shows a green `EDIT` or red `SUPPRESS` badge beside Reject reason.
- `Revoke Draft` means logical Delete Draft: the Draft becomes `REVOKED` for audit, disappears from the operational Draft index, and its source Active record becomes available for Revise／Suppress again.
- A Checker-rejected ordinary `EDIT` returns to Draft and may be edited, resubmitted, or revoked. A rejected `SUPPRESS` request remains non-editable and may only be resubmitted or revoked.
- Active source row shows `Drafted`, `Submitted`, or `In progress` in `Revision Status` while an open suppression request exists.
- Checker must open the read-only detail screen before Approve or Reject.
- Reject requires a reason; entering a valid reason replaces the Approve action with Reject.
- Successful decisions refresh the index, summary metrics and Checker badge together.

## Non-functional assumptions

- Server-side filtering, sorting and pagination remain mandatory; no full-table transfer to the browser.
- State transitions and outbox/audit writes are committed atomically.
- All state-changing endpoints require authenticated actor identity in production; demo actors are prototype-only.
- Lifecycle behavior is implemented once in the shared governed service/repository layer.
- Existing legacy `REVOKED` data remains readable in Audit but is not exposed as an Active-record action.

## Approaches considered

1. **Versioned suppression request (selected):** reuses the governed revision lifecycle, preserves the Active record until approval, and gives complete audit history.
2. Pending-suppression fields on the Active row: rejected because it mixes operational and workflow state and increases race-condition risk.
3. Immediate suppression followed by retrospective approval: rejected because it violates four-eyes control and can interrupt settlement before approval.

## Decision log

| Decision | Outcome | Reason |
| --- | --- | --- |
| Active action name | Suppress | Revoke implies immediate/destructive removal. |
| Change type | SUPPRESSION | Distinguishes workflow intent from terminal status. |
| Final status | SUPPRESSED | Explicit, auditable terminal state. |
| Approval path | Maker Draft → Submit → Checker | Same controlled workflow as governed maintenance. |
| Operational timing | Active remains effective until approval | Prevents unapproved service interruption. |
| Persistence model | New governed version | Preserves immutable history and supports shared lifecycle logic. |
| Concurrency | Atomic server-side current-state check | UI checks alone cannot protect multi-user operations. |
