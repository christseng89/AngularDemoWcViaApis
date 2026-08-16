/**
 * Quality-report-balance.md BAL-106: a minimal, self-contained migration runner replacing the previous
 * hand-rolled "check column, ALTER if missing" one-off in `index.ts`. Still SQLite-only (BAL-102's own
 * SQLite→PostgreSQL engine swap is a separate, deferred concern — this only replaces the *tooling* for
 * evolving the current schema, not the database engine itself) and still not a "real" migration
 * framework (no down-migrations, no CLI) — deliberately minimal for a single-process prototype, but
 * structured enough that the NEXT schema change is a new array entry instead of a fourth hand-written
 * "does this column already exist" guard.
 *
 * Tracks applied migrations in their own `schema_migrations` table (id INTEGER PRIMARY KEY, applied_at).
 * Backward-compatible with databases created before this runner existed: `up()` for migration 1 re-checks
 * column existence via `PRAGMA table_info` (the same check the old code used) before altering, so a
 * pre-existing DB file that already has `acknowledged_by`/`acknowledged_at` (either because it was
 * created after those columns were added to `SCHEMA_SQL`, or because the old hand-rolled `migrate()`
 * already added them) is correctly recorded as migrated without re-running (harmless) ALTER statements.
 */
import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  id: number;
  description: string;
  up: (db: DatabaseSync) => void;
}

/** Add a new migration to the bottom of this array — never renumber or edit a past entry once it may have run against a real DB file. */
export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    description: 'Add acknowledged_by/acknowledged_at to balance_movements (2026-08-15, Present Docs Earmark acknowledgment)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('acknowledged_by')) db.exec('ALTER TABLE balance_movements ADD COLUMN acknowledged_by TEXT');
      if (!columns.includes('acknowledged_at')) db.exec('ALTER TABLE balance_movements ADD COLUMN acknowledged_at TEXT');
    },
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL
    )
  `);
  const applied = new Set((db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    migration.up(db);
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (@id, @appliedAt)').run({
      id: migration.id,
      appliedAt: new Date().toISOString(),
    });
  }
}
