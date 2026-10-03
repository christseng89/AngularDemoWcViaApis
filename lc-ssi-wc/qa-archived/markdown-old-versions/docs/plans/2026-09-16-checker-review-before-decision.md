# Checker review-before-decision

## Understanding

- Checker decisions apply to RMA, Entities, Nostro and SSI.
- An index row only opens the governed record; the index never approves or rejects directly.
- The review page reuses the original parameter-driven input screen in read-only mode.
- Approve and Reject become available only after the full record is visible.
- Reject requires a reason of at least five characters; Approve does not require a reason.
- The existing maker/checker independence and server-authoritative lifecycle checks remain mandatory.

## Assumptions and non-functional requirements

- One shared OAS-driven CRUD review implementation owns RMA, Entities and Nostro behavior; SSI follows the same interaction contract.
- Decision state is server-authoritative and must remain auditable.
- Index paging and loading stay server-side and no additional eager data loading is introduced.
- The reason control is a reusable, vertically resizable textarea with a seven-rem minimum height.

## Decision log

1. Reuse the accepted SSI full-screen read-only review pattern instead of creating resource-specific checker pages.
2. Remove direct Approve and Revoke actions from Checker indexes to enforce review-before-decision.
3. Label the negative checker decision `Reject`; persist its reason through the existing governed logical-revocation endpoint and audit evidence.
4. Require at least five trimmed characters for Reject; keep Approve reason-free.
5. Keep `×` and Escape aligned with the shared Cancel behavior.
