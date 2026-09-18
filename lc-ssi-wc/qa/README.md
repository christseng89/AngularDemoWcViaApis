# QA message-family index

QA artifacts are isolated by SWIFT message family so active and archived
evidence from different workstreams cannot overwrite or obscure one another.

- [`mt2/`](mt2/) — MT200–MT210 implementation, fixtures, UAT, and evidence.
- `mt3/` — reserved for the MT3 workstream when testing begins.
- `mt47/` — reserved for the MT4/7 workstream when testing begins.
- `shared/` — use only for genuinely cross-family QA tooling or contracts.

Historical material is stored outside this Git repository under
`<qa-archive>/<message-family>`.

## Working rule

1. Each message family owns its specifications, fixtures, test cases, UAT
   workbook, reports, and evidence below its own directory.
2. Keep only the current controlled version and evidence required to reproduce
   it in Git.
3. Move superseded drafts and prior executions to the matching external
   archive directory.
4. Never create `qa-archived` inside the Git repository.
