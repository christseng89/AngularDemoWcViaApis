# SSI Index Request Type / Revision Status / Submit — Independent QA read-only investigation

**Verdict:** `PASS` for factual BA traceability; `OPEN` product-clarity findings remain for BA decision.  
**Method:** Source, API-query, repository and lifecycle trace only. No code, DB, seed, fixture or runtime-data mutation.

## Column traceability

| Column | Business meaning | Data source | Visible values / condition | Sort source |
|---|---|---|---|---|
| Request Type | Classifies the request represented by the displayed row | UI `requestTypeLabel(row)`: `changeType`, then `amendmentOfId` | `SUPPRESSED` when `changeType=SUPPRESSION`; `EDIT` when `changeType=REVISION` or `amendmentOfId` exists; otherwise `ADD` | API `sortBy=REQUEST_TYPE`; repository sorts base payload `changeType`, falling back to `REVISION` or `NEW` |
| Revision Status | Shows the status of one open child revision attached to the displayed base record | Repository correlated `open_revision` subquery returns child `id/status`; response adds `hasOpenRevision`, `openRevisionId`, `openRevisionStatus` | Blank when no open child; `In progress`=`WIP`; `Drafted`=`DRAFT`; `Submitted`=`PENDING_APPROVAL`; `Approved (legacy)`=`APPROVED` | API `sortBy=REVISION_STATUS`; repository sorts the selected raw child status, blank when absent |
| Submit | Maker action that sends the displayed Draft into the Checker queue; it is not approval or activation | Presentation gate uses row status; handler `act(row,'submit')` | Button `Submit` only when `row.status=DRAFT`; blank for every non-Draft status | API `sortBy=SUBMIT`; repository sorts a boolean expression: Draft=1, all others=0 |

## Click and lifecycle behavior

`Submit` stops row-click propagation and invokes the unchanged handler:

```text
POST /api/ssis/{row.id}/submit
body = { actor: row.maker }
```

On success the UI refreshes the SSI Index. The backend remains authoritative:

- current status must be `DRAFT`;
- `actor` must equal the record Maker;
- a SUPPRESSION Draft must contain a suppression reason of at least five characters;
- successful Submit produces `PENDING_APPROVAL`, increments version and writes the `SUBMIT` transition;
- Checker Approve/Reject remains separate and the Maker cannot check their own SSI.

The independently accepted bundle `33f911a5ac10ed850ccf370ad39724e8b0967abdc9487168df6c064b113f548f` corrected the former UI-only conflict that hid Submit for SUPPRESSION Drafts. Backend/API behavior was not changed.

## Exact open-revision selection

Open child candidates are `WIP`, `DRAFT`, `PENDING_APPROVAL`, or `APPROVED`. If more than one exists, the repository selects exactly one by priority:

```text
APPROVED > PENDING_APPROVAL > DRAFT > WIP
then latest updatedAt
```

This selected child supplies only `openRevisionId` and `openRevisionStatus`; its `changeType` is not returned with the base row.

## Independent clarity findings for BA decision

1. **Confirmed semantic mismatch risk:** on an Active base row, `Request Type` is computed from the base record, while `Revision Status` is computed from its open child. Therefore the same row can display `ADD + Submitted` even when the submitted child request is actually `EDIT` or `SUPPRESSED`. These two cells are not describing the same object.
2. **Status-word collision:** `SUPPRESSED` is used as a Request Type label even though `SUPPRESSED` is also a lifecycle status elsewhere. The underlying request discriminator is `SUPPRESSION`, so the past-tense display can be read as an already-completed state.
3. **Revision Status is conditional metadata, not the row status:** it is blank on rows without an open child and does not replace the separate `Status` column. `Drafted` / `Submitted` describe the selected child revision, not necessarily the visible base row.
4. **Submit is not duplicate state:** it is an available action. It overlaps with Status/Revision Status only as a presentation of eligibility, but it has distinct operational meaning.
5. **Sort semantics are raw-field semantics:** Request Type and Revision Status sorting use repository raw values, not the translated visible labels. This is deterministic, but users may assume visible-label ordering.
6. **Identity/concurrency assurance remains outside the column UI:** the request body carries an actor string and the backend compares it to the stored Maker; no version/ETag is supplied by this click. Authentication binding and concurrent-submit policy therefore require their own security/concurrency evidence and must not be inferred from these columns.

## QA conclusion

The BA meanings and the prior SUPPRESSION Submit conflict are independently confirmed. There is no basis to call the three columns literal duplicates. However, the base-row Request Type combined with child Revision Status is demonstrably capable of presenting a misleading composite. No deletion, relabeling or redesign recommendation is approved by this investigation; that decision remains with BA/Product and requires a new exact candidate plus independent QA.
