# BA Confirmation — Nostro Data Quality Register

Date: 2026-09-12  
Reviewed source: `qa/reports/claude-independent-20260912/DQ-NOSTRO-REGISTER.md`

## Confirmed counts

- 12 scoped groups contain more than one distinct, nonblank, effective ACTIVE `accountReference` when grouped by entity, servicer, currency and purpose.
- 45 scoped duplicate-record groups are reproducible.
- 69 effective ACTIVE rows have a NULL or blank `accountReference`.

The earlier count of 42 grouped duplicates globally by `accountReference`. The scoped count is 45 because three account references occur under two different Receiver scopes and were previously collapsed.

## Required corrections

The 12 groups are candidate scopes for the MT202 multiple-direct-account rule, not an unconditional statement that every generic MT202 in those scopes requires 53B. The rule applies only when the transaction selects one eligible direct account for reimbursement and the records represent genuine direct relationships after booking-entity, applicability, purpose and fixture-isolation checks.

The 45 groups must be labelled `ACTIVE duplicate-record groups pending fixture-manifest classification`, not automatically treated as 45 master-data defects. Declared ranking fixtures, isolated negative fixtures and genuine canonical-data defects must be recorded separately.

## Transaction behavior

- A NULL or blank `accountReference` fails closed only when the row is selected as the required reimbursement account.
- `maskedAccountRef` must never replace the operational `accountReference` in MT 53B/58A or an MX account field.
- A1 and A2 are executable because each is pinned by `nostroId + version` to one effective ACTIVE row with a nonblank account reference.
- A1/A2 remain UAT failures until they render:

```text
A1 53B=/DEMO-NOSTRO-001-PRIMARY
A2 53B=/DEMO-NOSTRO-001-EXPCOLL
```

## Snapshot identity correction

`79952A31...6771A` identifies the SQLite main-file bytes only; it is not by itself the WAL-aware logical snapshot. Reproducible evidence must record logical snapshot `fd6a4c06...78A6`, or a manifest covering the DB, WAL and SHM files.

## Classification rule

- Positive/canonical fixtures must satisfy normal master-data invariants.
- Declared ranking fixtures may use duplicate operational accounts but count as one MRG direct relationship.
- Negative fixtures must be isolated in a named overlay with expected HTTP status and reason code and must not be selectable by positive flows.
- Unclassified synthetic rows remain `DQ-REVIEW` until the manifest identifies their role.

## BA decision

- 12 scopes: count accepted; unconditional 53B wording rejected and replaced by the conditional rule above.
- 45 groups: scoped count accepted; blanket defect classification rejected pending fixture classification.
- 69 NULL/blank rows: count accepted; fail closed applies when selected.
- A1/A2: executable fixtures; PASS requires correct 53B output.
- `maskedAccountRef` fallback: prohibited.
