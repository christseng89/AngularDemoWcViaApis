# Governed Load Data Audit and Repair

This procedure covers SSI, RMA, Nostro, and Booking／Legal Entities. It uses the public BFF APIs and preserves governed lifecycle history.

## 1. Dry run and write the consolidated log

```powershell
npm run demo:audit:governed-data -- --output=artifacts/governed-data-audit.json
```

The command is GET-only. The JSON log contains the record counts, issue counts, record IDs, current/proposed values, disposition, and the exact Draft-only repair plan.

Disposition meanings:

- `IGNORE_ON_LOAD`: input is outside the governed SSI scope and must not be written.
- `DRAFT_CAN_UPDATE`: an unambiguous existing Draft can be updated.
- `REVISION_REQUIRED`: an Active record requires a governed revision; never update it in place.
- `REPORT_ONLY`: the data is ambiguous, historical, or a QA fixture and must not be guessed.

## 2. Review the plan

Confirm all of the following before apply:

- RMA identity is distinct by Own BIC + Counterparty BIC + INBOUND／OUTBOUND.
- The retained Message Types come from the governed SSI-scope parameters.
- The removed values are shown as `IGNORED_OUT_OF_SSI_SCOPE`.
- No repair has an empty retained Message Type set.
- SSI, Nostro, and Entity values are not inferred when reference data is ambiguous.

## 3. Apply safe Draft-only repairs

```powershell
npm run demo:repair:governed-data -- --output=artifacts/governed-data-repair.json
```

This command may POST `revise` and PUT the resulting Draft. It does not Submit or Approve. Each record is isolated: one failure is logged and does not stop the remaining repairs.

## 4. Verify after apply

Run the dry audit again. The operational RMA records remain effective until a separate Checker approves the corresponding Drafts. Checker must compare the original and revised Message Type sets before approval.

## Safety boundaries

- Never directly edit SQLite tables for this repair.
- Never rewrite immutable audit events or REVOKED／SUPERSEDED history.
- Never auto-approve a generated repair Draft.
- Never convert an opaque `counterpartyId` such as `CP-BOFAUS3N` into a BIC. The bank BIC belongs in `route.counterpartyBic`.
