/**
 * analysis/Balance-Component-DB-Optimization-Analysis.md P1 CHECK/FK fix (2026-08-21, migration 13) —
 * shared "bare, day-one" table builder for db/migrations.test.ts and db/index.test.ts: the ORIGINAL
 * column set both tables had before ANY migration ever ran, not the current full set. This matters for
 * two reasons at once, not just one:
 *   - balance_movements DELIBERATELY omits the 17 columns migrations 1-11 themselves add (acknowledged_by/
 *     acknowledged_at, contingent_account_entry, referenced_transaction_id, maker_submitted_by/at,
 *     event_snapshot, root_event_snapshot, acceptance_event_snapshot, sg_event_snapshot,
 *     finalize_event_snapshot, finalize_acceptance_event_snapshot, finalize_sg_event_snapshot,
 *     present_docs_consumed_at/by, cancelled_by/at) — a "full" mock (every column already present) would
 *     make every one of those migrations' own `if (!columns.includes(...))` ALTER TABLE branches
 *     permanently unreachable, silently erasing this file's own coverage of the ADD-COLUMN code paths
 *     migrations.test.ts exists to test in the first place.
 *   - balance_contracts, by contrast, has its FULL column set from day one — no migration has ever added a
 *     column to that table (migrations 12/13 change its indexes/constraints, not its columns).
 *   - Running the real migration sequence (1 through 13, in order, exactly like runMigrations() always
 *     does) still ends with every column present before migration 13's own rebuild needs them — 1-11 add
 *     the missing 17 first, so this fixture works for migration-13-focused tests too, not only 1-11's own.
 */
import type { DatabaseSync } from 'node:sqlite';

/** Full, unconstrained balance_contracts — every column migration 13's own INSERT INTO ... SELECT needs. */
export function createLegacyBalanceContractsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE balance_contracts (
      balance_contract_id            TEXT PRIMARY KEY,
      logical_contract_id            TEXT NOT NULL,
      contract_version               INTEGER NOT NULL,
      instrument_type                TEXT NOT NULL,
      lc_number                      TEXT NOT NULL,
      ib_number                      TEXT,
      sg_number                      TEXT,
      leg_seq                        TEXT,
      parent_logical_contract_id     TEXT,
      status                         TEXT NOT NULL,
      supersedes_balance_contract_id TEXT,
      superseded_by_balance_contract_id TEXT,
      currency                       TEXT NOT NULL,
      tolerance_pct                  TEXT,
      tenor_type                     TEXT,
      tenor_days                     INTEGER,
      maturity_date                  TEXT,
      opening_balance                TEXT NOT NULL,
      source_amendment_no            INTEGER,
      effective_from                 TEXT NOT NULL,
      effective_to                   TEXT,
      created_by                     TEXT NOT NULL,
      created_at                     TEXT NOT NULL
    )
  `);
}

/**
 * Day-one balance_movements — deliberately WITHOUT the 17 columns migrations 1-11 themselves add (see
 * this module's own top doc comment for why). Running the real migration sequence still ends with every
 * column migration 13 needs present, since 1-11 add them first.
 */
export function createLegacyBalanceMovementsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE balance_movements (
      movement_id             TEXT PRIMARY KEY,
      balance_contract_id     TEXT NOT NULL,
      event_seq               INTEGER NOT NULL,
      business_event_id       TEXT,
      movement_type           TEXT NOT NULL,
      exposure_nature         TEXT NOT NULL,
      amount                  TEXT NOT NULL,
      ceiling_amount          TEXT NOT NULL,
      currency                TEXT NOT NULL,
      leg_ref                 TEXT,
      account_entries         TEXT,
      lmts_reservation_id     TEXT,
      status                  TEXT NOT NULL,
      superseded_movement_id  TEXT,
      reversal_of_movement_id TEXT,
      reason_code             TEXT,
      remarks                 TEXT,
      transaction_date        TEXT,
      business_date           TEXT,
      value_date              TEXT,
      source_module           TEXT,
      source_function         TEXT,
      source_transaction_ref  TEXT,
      balance_before          TEXT,
      balance_after           TEXT,
      warnings                TEXT,
      created_by              TEXT NOT NULL,
      released_by             TEXT,
      created_at              TEXT NOT NULL,
      released_at             TEXT
    )
  `);
}
