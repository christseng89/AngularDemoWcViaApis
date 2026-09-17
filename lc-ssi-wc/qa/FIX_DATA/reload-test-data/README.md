# Reload Test Data v15.8

This folder is the active source for **Reload Test Data**.

- `publish.ts` copies the current development database, consolidates RMA by
  canonical `Own BIC + Counterparty BIC + Direction`, and applies the shared
  parameter-driven MT/MX scope and legacy conversions.
- The live database is never modified by the publisher.
- The two configured development-reference-gap keys (four synthetic records)
  are reported and left untouched.
- Existing active RMA rows are retained as `SUPERSEDED`; one canonical `ACTIVE`
  revision is created for every eligible BIC/direction group.
- `fixture-isolation.ts` removes controlled `PROPOSED_QA_ONLY`, `QA_*`, and
  explicitly non-operational rows from the active seed copy. Those fixtures
  remain available in their controlled QA overlays and archives.
- The canonical JSON seed is exported from the repaired offline database and is
  rebuilt into a temporary database before publication is accepted.

The previous v15.3 original, v15.4 repaired, rejected v15.5／v15.6, and v15.7
candidate are retained under `qa/QA_ARCHIVE/reload-test-data/`. v15.8 is
derived from the verified WAL-safe development backup and adds the governed
plain `pacs.009.001.12` → `pacs.009.001.08` conversion. Non-target Entity,
history, Audit and outbox rows are preserved. Profile-specific `.12.COV` is
not converted by this rule.

## Commands

```text
npm run demo:publish:reload-test-data
npm run demo:dry-run:reload-test-data
python scripts/rebuild-demo-database.py export \
  --source tmp/ssi-demo.v15.8.pacs009.repaired-isolated.sqlite \
  --source-label qa/FIX_DATA/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.sqlite
python scripts/rebuild-demo-database.py rebuild \
  --target tmp/ssi-demo.v15.8.pacs009.reload-verification.sqlite
```

`demo:dry-run:reload-test-data` sends Entity, Nostro, RMA and SSI seed payloads
to the governed `/api/swift-data/imports` endpoint with `dryRun: true`. It writes
no business data, verifies the database snapshot SHA before and after the run,
and writes the complete row-level rejection list to
`tmp/reload-test-data-api-dry-run.json`.
