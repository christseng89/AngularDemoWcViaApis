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
  {
    id: 2,
    description: 'Add contingent_account_entry to balance_movements (2026-08-16, analysis/contingent-liability-ledger.html account-entry generation)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('contingent_account_entry')) db.exec('ALTER TABLE balance_movements ADD COLUMN contingent_account_entry TEXT');
    },
  },
  {
    id: 3,
    description:
      'Add referenced_transaction_id to balance_movements (2026-08-16, A6/B4 Checker-release cross-session fix — see types.ts BalanceMovement.referencedTransactionId)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('referenced_transaction_id')) db.exec('ALTER TABLE balance_movements ADD COLUMN referenced_transaction_id TEXT');
    },
  },
  {
    id: 4,
    description:
      'Add maker_submitted_by/maker_submitted_at to balance_movements (2026-08-16, A4 real Maker Submit step — see types.ts BalanceMovement.makerSubmittedAt)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('maker_submitted_by')) db.exec('ALTER TABLE balance_movements ADD COLUMN maker_submitted_by TEXT');
      if (!columns.includes('maker_submitted_at')) db.exec('ALTER TABLE balance_movements ADD COLUMN maker_submitted_at TEXT');
    },
  },
  {
    id: 5,
    description:
      'Add event_snapshot to balance_movements (2026-08-17, persisted Event Snapshot captured at createMovement()/release() — see types.ts BalanceMovement.eventSnapshot)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN event_snapshot TEXT');
    },
  },
  {
    id: 6,
    description:
      'Add root_event_snapshot to balance_movements (2026-08-17, Inquire Events Balance Tabs — the parent LC/Confirmation\'s own plain balance for a child-ledger movement — see types.ts BalanceMovement.rootEventSnapshot)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('root_event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN root_event_snapshot TEXT');
    },
  },
  {
    id: 7,
    description:
      'Add acceptance_event_snapshot/sg_event_snapshot to balance_movements (2026-08-17, "就是交易當時LC所有的BALANCE的拍照存檔" — the one unambiguous sibling Acceptance\'s/SG\'s own plain balance — see types.ts BalanceMovement.acceptanceEventSnapshot/sgEventSnapshot)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('acceptance_event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN acceptance_event_snapshot TEXT');
      if (!columns.includes('sg_event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN sg_event_snapshot TEXT');
    },
  },
  {
    id: 8,
    description:
      'Add finalize_event_snapshot to balance_movements (2026-08-18, "A4 Sight Payment" Inquire Events fix — preserves A3\'s own original Create-time eventSnapshot unchanged once A4 later finalizes it, instead of release() overwriting it — see types.ts BalanceMovement.finalizeEventSnapshot)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('finalize_event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN finalize_event_snapshot TEXT');
    },
  },
  {
    id: 9,
    description:
      'Add finalize_acceptance_event_snapshot/finalize_sg_event_snapshot to balance_movements (2026-08-18, "SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變" — same freeze-at-transaction-time fix as migration 8, extended to the sibling snapshot fields — see types.ts BalanceMovement.finalizeAcceptanceEventSnapshot/finalizeSgEventSnapshot)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('finalize_acceptance_event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN finalize_acceptance_event_snapshot TEXT');
      if (!columns.includes('finalize_sg_event_snapshot')) db.exec('ALTER TABLE balance_movements ADD COLUMN finalize_sg_event_snapshot TEXT');
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
