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
import {
  CONTRACT_STATUS_VALUES,
  EXPOSURE_NATURE_VALUES,
  INSTRUMENT_TYPE_VALUES,
  MOVEMENT_STATUS_VALUES,
  MOVEMENT_TYPE_VALUES,
  TENOR_TYPE_VALUES,
} from './schema';

function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(',');
}

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
  {
    id: 10,
    description:
      'Add present_docs_consumed_at/present_docs_consumed_by to balance_movements (2026-08-18, "所有交易要RELEASE過後 才能根據流程走下一個交易" — B3 now genuinely RELEASEs on its own; this is what Present Docs Earmark Approved reads instead of the now-historical acknowledged_at — see types.ts BalanceMovement.presentDocsConsumedAt)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('present_docs_consumed_at')) db.exec('ALTER TABLE balance_movements ADD COLUMN present_docs_consumed_at TEXT');
      if (!columns.includes('present_docs_consumed_by')) db.exec('ALTER TABLE balance_movements ADD COLUMN present_docs_consumed_by TEXT');
    },
  },
  {
    id: 11,
    description:
      'Add cancelled_by/cancelled_at to balance_movements (2026-08-20, "SUBMIT/EC/APPROVE DATETIME/USER" — cancel() no longer reuses released_by/released_at — see types.ts BalanceMovement.cancelledAt)',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('cancelled_by')) db.exec('ALTER TABLE balance_movements ADD COLUMN cancelled_by TEXT');
      if (!columns.includes('cancelled_at')) db.exec('ALTER TABLE balance_movements ADD COLUMN cancelled_at TEXT');
    },
  },
  {
    id: 12,
    description:
      'Upgrade idx_contracts_parent from a single-column (parent_logical_contract_id) to a composite (parent_logical_contract_id, instrument_type) index (2026-08-21, analysis/Balance-Component-DB-Optimization-Analysis.md P2 N+1/index-gap fix) — every real caller filters on both columns together. schema.ts already creates the composite version for a brand-new database (CREATE INDEX IF NOT EXISTS is a no-op there since it only checks the index name), so DROP+CREATE here only does real work against a pre-existing on-disk DB whose idx_contracts_parent still has the old single-column definition; harmless to re-run against an already-composite index (drops and recreates the identical thing).',
    up: (db) => {
      db.exec('DROP INDEX IF EXISTS idx_contracts_parent');
      db.exec('CREATE INDEX idx_contracts_parent ON balance_contracts(parent_logical_contract_id, instrument_type)');
    },
  },
  {
    id: 13,
    description:
      'Add CHECK constraints on every enum-typed column (instrument_type/status/tenor_type on balance_contracts; movement_type/exposure_nature/status on balance_movements) and real FK REFERENCES on the 4 self-referencing columns (supersedes_balance_contract_id/superseded_by_balance_contract_id on balance_contracts; superseded_movement_id/reversal_of_movement_id on balance_movements) — 2026-08-21, analysis/Balance-Component-DB-Optimization-Analysis.md P1. SQLite ALTER TABLE can only ADD COLUMN, never add a CHECK or REFERENCES to an existing column, so this rebuilds both tables via the official SQLite "12-step" procedure (PRAGMA foreign_keys=OFF, create the new table with the constraints already in place, copy every row across with an explicit column list — never SELECT *, so a column-order mismatch fails loudly instead of silently misaligning data — drop the old table, rename the new one into place, recreate every index, PRAGMA foreign_keys=ON), inside one explicit transaction so a failure partway through never leaves the database in a half-rebuilt state. schema.ts already creates both tables with these same constraints for a brand-new database (CREATE TABLE IF NOT EXISTS is a no-op there since it only checks the table name) — this migration is what actually applies them to a pre-existing on-disk DB file. Verified against the live dev DB (2026-08-21, SELECT DISTINCT ... GROUP BY per column) before writing this: every value already persisted in every affected column is already a legal member of its own CHECK list, so this migration is expected to succeed against real data, not just an empty database — if it ever throws against a real deployment\'s DB, that is a genuine pre-existing bad value, not a false positive to relax the CHECK for (see this file\'s own import from schema.ts for the exact legal-value lists and their own authority — types.ts for 5 of the 6 enum columns, BalanceService\'s own movementTypeRegistry for movement_type, which has no types.ts union).',
    up: (db) => {
      db.exec('PRAGMA foreign_keys = OFF');
      try {
        db.exec('BEGIN IMMEDIATE');

        db.exec(`
          CREATE TABLE balance_contracts_new (
            balance_contract_id            TEXT PRIMARY KEY,
            logical_contract_id            TEXT NOT NULL,
            contract_version               INTEGER NOT NULL,
            instrument_type                TEXT NOT NULL CHECK (instrument_type IN (${sqlInList(INSTRUMENT_TYPE_VALUES)})),
            lc_number                      TEXT NOT NULL,
            ib_number                      TEXT,
            sg_number                      TEXT,
            leg_seq                        TEXT,
            parent_logical_contract_id     TEXT,
            status                         TEXT NOT NULL CHECK (status IN (${sqlInList(CONTRACT_STATUS_VALUES)})),
            supersedes_balance_contract_id TEXT REFERENCES balance_contracts_new(balance_contract_id),
            superseded_by_balance_contract_id TEXT REFERENCES balance_contracts_new(balance_contract_id),
            currency                       TEXT NOT NULL,
            tolerance_pct                  TEXT,
            tenor_type                     TEXT CHECK (tenor_type IS NULL OR tenor_type IN (${sqlInList(TENOR_TYPE_VALUES)})),
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
        db.exec(`
          INSERT INTO balance_contracts_new (
            balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status,
            supersedes_balance_contract_id, superseded_by_balance_contract_id, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, opening_balance, source_amendment_no, effective_from,
            effective_to, created_by, created_at
          )
          SELECT
            balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status,
            supersedes_balance_contract_id, superseded_by_balance_contract_id, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, opening_balance, source_amendment_no, effective_from,
            effective_to, created_by, created_at
          FROM balance_contracts
        `);
        db.exec('DROP TABLE balance_contracts');
        db.exec('ALTER TABLE balance_contracts_new RENAME TO balance_contracts');
        db.exec(`
          CREATE UNIQUE INDEX idx_contracts_logical_version ON balance_contracts(logical_contract_id, contract_version);
          CREATE UNIQUE INDEX idx_contracts_one_active ON balance_contracts(logical_contract_id) WHERE status = 'ACTIVE';
          CREATE INDEX idx_contracts_naturalkey ON balance_contracts(instrument_type, lc_number, ib_number, sg_number, leg_seq);
          CREATE INDEX idx_contracts_catalog ON balance_contracts(instrument_type, status);
          CREATE INDEX idx_contracts_parent ON balance_contracts(parent_logical_contract_id, instrument_type);
        `);

        db.exec(`
          CREATE TABLE balance_movements_new (
            movement_id             TEXT PRIMARY KEY,
            balance_contract_id     TEXT NOT NULL REFERENCES balance_contracts(balance_contract_id),
            event_seq               INTEGER NOT NULL,
            business_event_id       TEXT,
            movement_type           TEXT NOT NULL CHECK (movement_type IN (${sqlInList(MOVEMENT_TYPE_VALUES)})),
            exposure_nature         TEXT NOT NULL CHECK (exposure_nature IN (${sqlInList(EXPOSURE_NATURE_VALUES)})),
            amount                  TEXT NOT NULL,
            ceiling_amount          TEXT NOT NULL,
            currency                TEXT NOT NULL,
            leg_ref                 TEXT,
            account_entries         TEXT,
            contingent_account_entry TEXT,
            lmts_reservation_id     TEXT,
            status                  TEXT NOT NULL CHECK (status IN (${sqlInList(MOVEMENT_STATUS_VALUES)})),
            superseded_movement_id  TEXT REFERENCES balance_movements_new(movement_id),
            reversal_of_movement_id TEXT REFERENCES balance_movements_new(movement_id),
            reason_code             TEXT,
            remarks                 TEXT,
            transaction_date        TEXT,
            business_date           TEXT,
            value_date              TEXT,
            source_module           TEXT,
            source_function         TEXT,
            source_transaction_ref  TEXT,
            referenced_transaction_id TEXT,
            balance_before          TEXT,
            balance_after           TEXT,
            warnings                TEXT,
            created_by              TEXT NOT NULL,
            released_by             TEXT,
            created_at              TEXT NOT NULL,
            released_at             TEXT,
            acknowledged_by         TEXT,
            acknowledged_at         TEXT,
            maker_submitted_by      TEXT,
            maker_submitted_at      TEXT,
            event_snapshot          TEXT,
            root_event_snapshot     TEXT,
            acceptance_event_snapshot TEXT,
            sg_event_snapshot        TEXT,
            finalize_event_snapshot TEXT,
            finalize_acceptance_event_snapshot TEXT,
            finalize_sg_event_snapshot TEXT,
            present_docs_consumed_at TEXT,
            present_docs_consumed_by TEXT,
            cancelled_by             TEXT,
            cancelled_at             TEXT
          )
        `);
        db.exec(`
          INSERT INTO balance_movements_new (
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry, lmts_reservation_id, status, superseded_movement_id,
            reversal_of_movement_id, reason_code, remarks, transaction_date, business_date, value_date,
            source_module, source_function, source_transaction_ref, referenced_transaction_id,
            balance_before, balance_after, warnings, created_by, released_by, created_at, released_at,
            acknowledged_by, acknowledged_at, maker_submitted_by, maker_submitted_at, event_snapshot,
            root_event_snapshot, acceptance_event_snapshot, sg_event_snapshot, finalize_event_snapshot,
            finalize_acceptance_event_snapshot, finalize_sg_event_snapshot, present_docs_consumed_at,
            present_docs_consumed_by, cancelled_by, cancelled_at
          )
          SELECT
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry, lmts_reservation_id, status, superseded_movement_id,
            reversal_of_movement_id, reason_code, remarks, transaction_date, business_date, value_date,
            source_module, source_function, source_transaction_ref, referenced_transaction_id,
            balance_before, balance_after, warnings, created_by, released_by, created_at, released_at,
            acknowledged_by, acknowledged_at, maker_submitted_by, maker_submitted_at, event_snapshot,
            root_event_snapshot, acceptance_event_snapshot, sg_event_snapshot, finalize_event_snapshot,
            finalize_acceptance_event_snapshot, finalize_sg_event_snapshot, present_docs_consumed_at,
            present_docs_consumed_by, cancelled_by, cancelled_at
          FROM balance_movements
        `);
        db.exec('DROP TABLE balance_movements');
        db.exec('ALTER TABLE balance_movements_new RENAME TO balance_movements');
        db.exec(`
          CREATE UNIQUE INDEX idx_movements_idempotency ON balance_movements(balance_contract_id, event_seq);
          CREATE INDEX idx_movements_contract_status ON balance_movements(balance_contract_id, status);
          CREATE INDEX idx_movements_business_event ON balance_movements(business_event_id);
        `);

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        db.exec('PRAGMA foreign_keys = ON');
      }
    },
  },
  {
    id: 14,
    description:
      'Add expiry_date/mail_float_grace_days to balance_contracts (2026-08-25, F1 external BA review — AUTO EXPIRY) — see types.ts BalanceContract.expiryDate/mailFloatGraceDays doc comments. Simple ALTER TABLE ADD COLUMN, no CHECK constraint involved (both nullable, no enum).',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_contracts)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('expiry_date')) db.exec('ALTER TABLE balance_contracts ADD COLUMN expiry_date TEXT');
      if (!columns.includes('mail_float_grace_days')) db.exec('ALTER TABLE balance_contracts ADD COLUMN mail_float_grace_days INTEGER');
    },
  },
  {
    id: 15,
    description:
      'Rebuild balance_contracts/balance_movements to widen the status/movement_type CHECK constraints to include EXPIRED and EXPIRE/AMEND_EXPIRY_DATE/REVERSAL/REOPEN (2026-08-25, F1 external BA review) — same 12-step rebuild procedure as migration 13, since SQLite cannot ALTER an existing CHECK constraint. Includes migration 14\'s two new columns in the rebuilt balance_contracts (a fresh DB never needs this — schema.ts already declares both with the widened CHECK lists via CREATE TABLE IF NOT EXISTS; this only matters for a pre-existing on-disk DB file that ran migrations 1-14 under the old CHECK lists).',
    up: (db) => {
      db.exec('PRAGMA foreign_keys = OFF');
      try {
        db.exec('BEGIN IMMEDIATE');

        db.exec(`
          CREATE TABLE balance_contracts_new (
            balance_contract_id            TEXT PRIMARY KEY,
            logical_contract_id            TEXT NOT NULL,
            contract_version               INTEGER NOT NULL,
            instrument_type                TEXT NOT NULL CHECK (instrument_type IN (${sqlInList(INSTRUMENT_TYPE_VALUES)})),
            lc_number                      TEXT NOT NULL,
            ib_number                      TEXT,
            sg_number                      TEXT,
            leg_seq                        TEXT,
            parent_logical_contract_id     TEXT,
            status                         TEXT NOT NULL CHECK (status IN (${sqlInList(CONTRACT_STATUS_VALUES)})),
            supersedes_balance_contract_id TEXT REFERENCES balance_contracts_new(balance_contract_id),
            superseded_by_balance_contract_id TEXT REFERENCES balance_contracts_new(balance_contract_id),
            currency                       TEXT NOT NULL,
            tolerance_pct                  TEXT,
            tenor_type                     TEXT CHECK (tenor_type IS NULL OR tenor_type IN (${sqlInList(TENOR_TYPE_VALUES)})),
            tenor_days                     INTEGER,
            maturity_date                  TEXT,
            expiry_date                    TEXT,
            mail_float_grace_days          INTEGER,
            opening_balance                TEXT NOT NULL,
            source_amendment_no            INTEGER,
            effective_from                 TEXT NOT NULL,
            effective_to                   TEXT,
            created_by                     TEXT NOT NULL,
            created_at                     TEXT NOT NULL
          )
        `);
        db.exec(`
          INSERT INTO balance_contracts_new (
            balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status,
            supersedes_balance_contract_id, superseded_by_balance_contract_id, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, expiry_date, mail_float_grace_days, opening_balance,
            source_amendment_no, effective_from, effective_to, created_by, created_at
          )
          SELECT
            balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status,
            supersedes_balance_contract_id, superseded_by_balance_contract_id, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, expiry_date, mail_float_grace_days, opening_balance,
            source_amendment_no, effective_from, effective_to, created_by, created_at
          FROM balance_contracts
        `);
        db.exec('DROP TABLE balance_contracts');
        db.exec('ALTER TABLE balance_contracts_new RENAME TO balance_contracts');
        db.exec(`
          CREATE UNIQUE INDEX idx_contracts_logical_version ON balance_contracts(logical_contract_id, contract_version);
          CREATE UNIQUE INDEX idx_contracts_one_active ON balance_contracts(logical_contract_id) WHERE status = 'ACTIVE';
          CREATE INDEX idx_contracts_naturalkey ON balance_contracts(instrument_type, lc_number, ib_number, sg_number, leg_seq);
          CREATE INDEX idx_contracts_catalog ON balance_contracts(instrument_type, status);
          CREATE INDEX idx_contracts_parent ON balance_contracts(parent_logical_contract_id, instrument_type);
        `);

        db.exec(`
          CREATE TABLE balance_movements_new (
            movement_id             TEXT PRIMARY KEY,
            balance_contract_id     TEXT NOT NULL REFERENCES balance_contracts(balance_contract_id),
            event_seq               INTEGER NOT NULL,
            business_event_id       TEXT,
            movement_type           TEXT NOT NULL CHECK (movement_type IN (${sqlInList(MOVEMENT_TYPE_VALUES)})),
            exposure_nature         TEXT NOT NULL CHECK (exposure_nature IN (${sqlInList(EXPOSURE_NATURE_VALUES)})),
            amount                  TEXT NOT NULL,
            ceiling_amount          TEXT NOT NULL,
            currency                TEXT NOT NULL,
            leg_ref                 TEXT,
            account_entries         TEXT,
            contingent_account_entry TEXT,
            lmts_reservation_id     TEXT,
            status                  TEXT NOT NULL CHECK (status IN (${sqlInList(MOVEMENT_STATUS_VALUES)})),
            superseded_movement_id  TEXT REFERENCES balance_movements_new(movement_id),
            reversal_of_movement_id TEXT REFERENCES balance_movements_new(movement_id),
            reason_code             TEXT,
            remarks                 TEXT,
            transaction_date        TEXT,
            business_date           TEXT,
            value_date              TEXT,
            source_module           TEXT,
            source_function         TEXT,
            source_transaction_ref  TEXT,
            referenced_transaction_id TEXT,
            balance_before          TEXT,
            balance_after           TEXT,
            warnings                TEXT,
            created_by              TEXT NOT NULL,
            released_by             TEXT,
            created_at              TEXT NOT NULL,
            released_at             TEXT,
            acknowledged_by         TEXT,
            acknowledged_at         TEXT,
            maker_submitted_by      TEXT,
            maker_submitted_at      TEXT,
            event_snapshot          TEXT,
            root_event_snapshot     TEXT,
            acceptance_event_snapshot TEXT,
            sg_event_snapshot        TEXT,
            finalize_event_snapshot TEXT,
            finalize_acceptance_event_snapshot TEXT,
            finalize_sg_event_snapshot TEXT,
            present_docs_consumed_at TEXT,
            present_docs_consumed_by TEXT,
            cancelled_by             TEXT,
            cancelled_at             TEXT
          )
        `);
        db.exec(`
          INSERT INTO balance_movements_new (
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry, lmts_reservation_id, status, superseded_movement_id,
            reversal_of_movement_id, reason_code, remarks, transaction_date, business_date, value_date,
            source_module, source_function, source_transaction_ref, referenced_transaction_id,
            balance_before, balance_after, warnings, created_by, released_by, created_at, released_at,
            acknowledged_by, acknowledged_at, maker_submitted_by, maker_submitted_at, event_snapshot,
            root_event_snapshot, acceptance_event_snapshot, sg_event_snapshot, finalize_event_snapshot,
            finalize_acceptance_event_snapshot, finalize_sg_event_snapshot, present_docs_consumed_at,
            present_docs_consumed_by, cancelled_by, cancelled_at
          )
          SELECT
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry, lmts_reservation_id, status, superseded_movement_id,
            reversal_of_movement_id, reason_code, remarks, transaction_date, business_date, value_date,
            source_module, source_function, source_transaction_ref, referenced_transaction_id,
            balance_before, balance_after, warnings, created_by, released_by, created_at, released_at,
            acknowledged_by, acknowledged_at, maker_submitted_by, maker_submitted_at, event_snapshot,
            root_event_snapshot, acceptance_event_snapshot, sg_event_snapshot, finalize_event_snapshot,
            finalize_acceptance_event_snapshot, finalize_sg_event_snapshot, present_docs_consumed_at,
            present_docs_consumed_by, cancelled_by, cancelled_at
          FROM balance_movements
        `);
        db.exec('DROP TABLE balance_movements');
        db.exec('ALTER TABLE balance_movements_new RENAME TO balance_movements');
        db.exec(`
          CREATE UNIQUE INDEX idx_movements_idempotency ON balance_movements(balance_contract_id, event_seq);
          CREATE INDEX idx_movements_contract_status ON balance_movements(balance_contract_id, status);
          CREATE INDEX idx_movements_business_event ON balance_movements(business_event_id);
        `);

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        db.exec('PRAGMA foreign_keys = ON');
      }
    },
  },
  {
    id: 16,
    description:
      'Add new_expiry_date to balance_movements (2026-08-25, F1 external BA review — AMEND_EXPIRY_DATE) — see schema.ts\'s own column comment. Runs AFTER migration 15\'s rebuild (must — 15\'s CREATE TABLE balance_movements_new has a hardcoded column list that predates this column; adding it before 15 would have it silently dropped by that rebuild). Simple ALTER TABLE ADD COLUMN, no CHECK constraint involved.',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('new_expiry_date')) db.exec('ALTER TABLE balance_movements ADD COLUMN new_expiry_date TEXT');
    },
  },
  {
    id: 17,
    description:
      'Add amendment_approved/amendment_effective/consent_status to balance_movements (2026-08-25, F1 proposal §13.1 item 2, BA-ratified — AMEND_EXPIRY_DATE/REOPEN upstream consent passthrough; this component accepts and shape-validates these, never judges them) — see schema.ts\'s own column comment. Simple ALTER TABLE ADD COLUMN, no CHECK constraint (consent_status is bounded at the zod layer, same posture as the pre-existing reason_code column).',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('amendment_approved')) db.exec('ALTER TABLE balance_movements ADD COLUMN amendment_approved INTEGER');
      if (!columns.includes('amendment_effective')) db.exec('ALTER TABLE balance_movements ADD COLUMN amendment_effective TEXT');
      if (!columns.includes('consent_status')) db.exec('ALTER TABLE balance_movements ADD COLUMN consent_status TEXT');
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
