# Migration 31 Existing-index Collision — TDD Evidence

Date: 2026-09-23

- Symptom: service startup failed with `index idx_excess_decisions_movement_time already exists` at Migration 31.
- Root cause: `SCHEMA_SQL` creates the index on a pre-v31 table before migrations run; SQLite retains the global index name when that table is renamed to the legacy table.
- RED: migration test recreated the v30 table with the startup-created index and reproduced the exact error.
- GREEN: Migration 31 executes `DROP INDEX IF EXISTS idx_excess_decisions_movement_time` inside its transaction before table rename, then recreates the index on the new canonical table.
- Verification: migration suite 5／5 PASS; full service regression 61 suites／1,219 tests PASS; typecheck、lint and build PASS.
