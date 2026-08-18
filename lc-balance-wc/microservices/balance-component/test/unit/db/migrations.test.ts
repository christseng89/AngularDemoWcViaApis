/**
 * Direct unit tests for the migration runner (Quality-report-balance.md BAL-106) — separate from
 * db/index.test.ts's own createDb()-level coverage, which only exercises runMigrations() indirectly.
 * These construct a bare DatabaseSync + the real balance_movements table directly (not via createDb(),
 * so the schema_migrations tracking table genuinely doesn't exist yet at the start of each test).
 */
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, MIGRATIONS } from '../../../src/db/migrations';

function bareDbWithBalanceMovementsTable(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  // Minimal subset of SCHEMA_SQL's own balance_movements table, deliberately WITHOUT acknowledged_by/
  // acknowledged_at — simulates a pre-existing DB file created before those columns were added, the one
  // scenario migration 1's own ALTER TABLE branches are for.
  db.exec(`
    CREATE TABLE balance_movements (
      movement_id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    )
  `);
  return db;
}

describe('runMigrations (src/db/migrations.ts)', () => {
  test('creates the schema_migrations tracking table and records migration 1 as applied on a fresh run', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      runMigrations(db);
      const rows = db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: number }[];
      expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));

      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      expect(columns).toEqual(
        expect.arrayContaining([
          'acknowledged_by',
          'acknowledged_at',
          'maker_submitted_by',
          'maker_submitted_at',
          'event_snapshot',
          'root_event_snapshot',
          'acceptance_event_snapshot',
          'sg_event_snapshot',
          'finalize_event_snapshot',
          'finalize_acceptance_event_snapshot',
          'finalize_sg_event_snapshot',
          'present_docs_consumed_at',
          'present_docs_consumed_by',
        ]),
      );
    } finally {
      db.close();
    }
  });

  test('a second run against the same db is a no-op — does not re-attempt the (now-failing, column-already-exists) ALTER TABLE', () => {
    const db = bareDbWithBalanceMovementsTable();
    try {
      runMigrations(db);
      // If runMigrations() failed to skip an already-applied migration, this second call would throw
      // ("duplicate column name") since ALTER TABLE ADD COLUMN isn't idempotent on its own.
      expect(() => runMigrations(db)).not.toThrow();
      const rows = db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[];
      expect(rows).toHaveLength(MIGRATIONS.length);
    } finally {
      db.close();
    }
  });

  test('backward compatibility: a db that already has acknowledged_by/acknowledged_at (e.g. from the old hand-rolled migrate(), before schema_migrations existed) is recorded as migrated without erroring', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE balance_movements (
          movement_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          acknowledged_by TEXT,
          acknowledged_at TEXT
        )
      `);
      expect(() => runMigrations(db)).not.toThrow();
      const rows = db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[];
      expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    } finally {
      db.close();
    }
  });
});
