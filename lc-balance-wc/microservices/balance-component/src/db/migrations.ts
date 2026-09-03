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
      'Add CHECK constraints on every enum-typed column (instrument_type/status/tenor_type on balance_contracts; movement_type/exposure_nature/status on balance_movements) and a real FK REFERENCES on reversal_of_movement_id (balance_movements) — 2026-08-21, analysis/Balance-Component-DB-Optimization-Analysis.md P1. SQLite ALTER TABLE can only ADD COLUMN, never add a CHECK or REFERENCES to an existing column, so this rebuilds both tables via the official SQLite "12-step" procedure (PRAGMA foreign_keys=OFF, create the new table with the constraints already in place, copy every row across with an explicit column list — never SELECT *, so a column-order mismatch fails loudly instead of silently misaligning data — drop the old table, rename the new one into place, recreate every index, PRAGMA foreign_keys=ON), inside one explicit transaction so a failure partway through never leaves the database in a half-rebuilt state. schema.ts already creates both tables with these same constraints for a brand-new database (CREATE TABLE IF NOT EXISTS is a no-op there since it only checks the table name) — this migration is what actually applies them to a pre-existing on-disk DB file. Verified against the live dev DB (2026-08-21, SELECT DISTINCT ... GROUP BY per column) before writing this: every value already persisted in every affected column is already a legal member of its own CHECK list, so this migration is expected to succeed against real data, not just an empty database — if it ever throws against a real deployment\'s DB, that is a genuine pre-existing bad value, not a false positive to relax the CHECK for (see this file\'s own import from schema.ts for the exact legal-value lists and their own authority — types.ts for 5 of the 6 enum columns, BalanceService\'s own movementTypeRegistry for movement_type, which has no types.ts union). 2026-08-29 (broadened dead-code cleanup) — this rebuild ALSO drops supersedes_balance_contract_id/superseded_by_balance_contract_id (balance_contracts) and superseded_movement_id (balance_movements) here, not merely narrows their CHECK: schema.ts\'s own fresh CREATE TABLE no longer declares any of the three (the reserved, zero-call-site contract-versioning mechanism they backed — markSuperseded() — was removed the same day), and this migration is the first rebuild in the chain — carrying them forward into a later migration first would break a brand-new install, which never had the columns to select from in the first place.',
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
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, opening_balance, source_amendment_no, effective_from,
            effective_to, created_by, created_at
          )
          SELECT
            balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, opening_balance, source_amendment_no, effective_from,
            effective_to, created_by, created_at
          FROM balance_contracts
          WHERE status != 'SUPERSEDED'
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
            contingent_account_entry, lmts_reservation_id, status,
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
            contingent_account_entry, lmts_reservation_id, status,
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
      'Rebuild balance_contracts/balance_movements to widen the status/movement_type CHECK constraints to include EXPIRED and EXPIRE/AMEND_EXPIRY_DATE/REVERSAL/REOPEN (2026-08-25, F1 external BA review) — same 12-step rebuild procedure as migration 13, since SQLite cannot ALTER an existing CHECK constraint. Includes migration 14\'s two new columns in the rebuilt balance_contracts (a fresh DB never needs this — schema.ts already declares both with the widened CHECK lists via CREATE TABLE IF NOT EXISTS; this only matters for a pre-existing on-disk DB file that ran migrations 1-14 under the old CHECK lists). 2026-08-29 — matches migration 13\'s own supersedes_balance_contract_id/superseded_by_balance_contract_id/superseded_movement_id removal (already dropped by 13\'s own rebuild by the time this one runs; omitted here too so this migration\'s own column list stays consistent with what actually exists).',
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
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status, currency, tolerance_pct,
            tenor_type, tenor_days, maturity_date, expiry_date, mail_float_grace_days, opening_balance,
            source_amendment_no, effective_from, effective_to, created_by, created_at
          )
          SELECT
            balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
            ib_number, sg_number, leg_seq, parent_logical_contract_id, status, currency, tolerance_pct,
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
            contingent_account_entry, lmts_reservation_id, status,
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
            contingent_account_entry, lmts_reservation_id, status,
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
  {
    id: 18,
    description:
      'Add delete_pending_audit table (2026-08-27, Fix Pending/Delete Pending Phase — BA/business-directed dedicated audit trail for every Delete Pending action across all A1-A11/B1-B7 functions) — see schema.ts\'s own doc comment on this table for the full rationale. CREATE TABLE IF NOT EXISTS is safe to run unconditionally (idempotent), same as every other fresh-table addition in this codebase to date.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS delete_pending_audit (
          audit_id                TEXT PRIMARY KEY,
          delete_seq               INTEGER NOT NULL,
          movement_id             TEXT NOT NULL REFERENCES balance_movements(movement_id),
          balance_contract_id     TEXT NOT NULL REFERENCES balance_contracts(balance_contract_id),
          event_seq               INTEGER NOT NULL,
          movement_type           TEXT NOT NULL,
          source_transaction_ref  TEXT,
          status_before           TEXT NOT NULL CHECK (status_before IN ('PENDING', 'REJECTED')),
          cancelled_by            TEXT NOT NULL,
          cancelled_at            TEXT NOT NULL,
          reason_code             TEXT,
          remarks                 TEXT
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_delete_pending_audit_movement ON delete_pending_audit(movement_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_delete_pending_audit_contract ON delete_pending_audit(balance_contract_id)');
    },
  },
  {
    id: 19,
    description:
      'Add superseded_by_movement_id/edited_by/edited_at to balance_movements (2026-08-27, Fix Pending §2.2/§15/§19 — see schema.ts\'s own column comment). Simple ALTER TABLE ADD COLUMN, no CHECK/REFERENCES constraint (§6.4/§15.3(d) — deliberately kept out at this stage, same posture as fresh schema.ts).',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('superseded_by_movement_id')) db.exec('ALTER TABLE balance_movements ADD COLUMN superseded_by_movement_id TEXT');
      if (!columns.includes('edited_by')) db.exec('ALTER TABLE balance_movements ADD COLUMN edited_by TEXT');
      if (!columns.includes('edited_at')) db.exec('ALTER TABLE balance_movements ADD COLUMN edited_at TEXT');
    },
  },
  {
    id: 20,
    description:
      'Widen idx_movements_idempotency to a partial unique index excluding SUPERSEDED (2026-08-27, Fix Pending §19 — see schema.ts\'s own index comment for the full rationale: Fix Pending\'s replacement record reuses its predecessor\'s eventSeq, which a plain unconditional UNIQUE index would reject). Pure index swap, no table rebuild needed (same technique as migration 12) — must run AFTER migration 19 so the column referenced by the partial predicate already exists on every pre-existing on-disk DB (harmless either way here since the predicate is on the pre-existing status column, not a new one, but kept in this order for readability).',
    up: (db) => {
      db.exec('DROP INDEX IF EXISTS idx_movements_idempotency');
      db.exec("CREATE UNIQUE INDEX idx_movements_idempotency ON balance_movements(balance_contract_id, event_seq) WHERE status != 'SUPERSEDED'");
    },
  },
  {
    id: 21,
    description:
      'Add fix_pending_audit table (Fix Pending §19, redesigned 2026-08-29 — editPending() now corrects a movement\'s row IN PLACE rather than retiring it and inserting a replacement; this table is the only place the pre-edit content survives) — see schema.ts\'s own doc comment on this table for the full shape/rationale. CREATE TABLE IF NOT EXISTS is safe to run unconditionally, same as migration 18\'s delete_pending_audit addition.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fix_pending_audit (
          audit_id                TEXT PRIMARY KEY,
          edit_seq                 INTEGER NOT NULL,
          movement_id              TEXT NOT NULL REFERENCES balance_movements(movement_id),
          balance_contract_id      TEXT NOT NULL REFERENCES balance_contracts(balance_contract_id),
          event_seq                INTEGER NOT NULL,
          original_created_by      TEXT NOT NULL,
          original_created_at      TEXT NOT NULL,
          status_before            TEXT NOT NULL CHECK (status_before IN ('PENDING', 'REJECTED')),
          before_snapshot          TEXT NOT NULL,
          after_snapshot           TEXT NOT NULL,
          edited_by                TEXT NOT NULL,
          edited_at                TEXT NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_fix_pending_audit_movement ON fix_pending_audit(movement_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fix_pending_audit_contract ON fix_pending_audit(balance_contract_id)');
    },
  },
  {
    id: 22,
    description:
      'Fix Pending §19 redesigned to correct a movement\'s row IN PLACE instead of retiring it and inserting a replacement (2026-08-29 — see fixPendingAuditStore.ts/balanceService.ts editPending() for the new mechanism, fix_pending_audit above for where the pre-edit content now lives). No pre-existing on-disk DB has ever run the pre-redesign two-row mechanism (confirmed with the user — no SIT/production deployment exists yet), so this migration does not backfill anything; it only excludes any such row from the rebuild as a defensive no-op (WHERE clause below), same posture as migrations 13/15\'s own equivalent exclusion. Rebuilds balance_movements via the same 12-step procedure as migrations 13/15/17 to narrow the status CHECK (the old retired-row marker is no longer a legal value — MOVEMENT_STATUS_VALUES already reflects this) and drop superseded_by_movement_id (migration 19\'s own addition, no longer needed). A separate, pre-existing, never-written reserved column predating Fix Pending, and balance_contracts\' own unrelated (already-removed-by-2026-08-29, confirmed-zero-call-site) contract-versioning mechanism, were dropped earlier in the chain instead, at migrations 13/15/17\'s own rebuilds — those migrations already unconditionally rebuild both tables on every install including a brand-new one (schema.ts\'s own fresh CREATE TABLE no longer declares any of these columns), so carrying them any further forward before dropping them would make a fresh install fail copying a column that was never there. idx_movements_idempotency reverts to a plain unconditional UNIQUE index — there is only ever one row per (contract, eventSeq) now.',
    up: (db) => {
      db.exec('PRAGMA foreign_keys = OFF');
      try {
        db.exec('BEGIN IMMEDIATE');

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
            reversal_of_movement_id TEXT REFERENCES balance_movements_new(movement_id),
            reason_code             TEXT,
            remarks                 TEXT,
            new_expiry_date         TEXT,
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
            cancelled_at             TEXT,
            edited_by                TEXT,
            edited_at                TEXT,
            amendment_approved       INTEGER,
            amendment_effective      TEXT,
            consent_status           TEXT
          )
        `);
        db.exec(`
          INSERT INTO balance_movements_new (
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry, lmts_reservation_id, status,
            reversal_of_movement_id, reason_code, remarks, new_expiry_date, transaction_date,
            business_date, value_date, source_module, source_function, source_transaction_ref,
            referenced_transaction_id, balance_before, balance_after, warnings, created_by,
            released_by, created_at, released_at, acknowledged_by, acknowledged_at,
            maker_submitted_by, maker_submitted_at, event_snapshot, root_event_snapshot,
            acceptance_event_snapshot, sg_event_snapshot, finalize_event_snapshot,
            finalize_acceptance_event_snapshot, finalize_sg_event_snapshot, present_docs_consumed_at,
            present_docs_consumed_by, cancelled_by, cancelled_at, edited_by, edited_at,
            amendment_approved, amendment_effective, consent_status
          )
          SELECT
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry, lmts_reservation_id, status,
            reversal_of_movement_id, reason_code, remarks, new_expiry_date, transaction_date,
            business_date, value_date, source_module, source_function, source_transaction_ref,
            referenced_transaction_id, balance_before, balance_after, warnings, created_by,
            released_by, created_at, released_at, acknowledged_by, acknowledged_at,
            maker_submitted_by, maker_submitted_at, event_snapshot, root_event_snapshot,
            acceptance_event_snapshot, sg_event_snapshot, finalize_event_snapshot,
            finalize_acceptance_event_snapshot, finalize_sg_event_snapshot, present_docs_consumed_at,
            present_docs_consumed_by, cancelled_by, cancelled_at, edited_by, edited_at,
            amendment_approved, amendment_effective, consent_status
          FROM balance_movements
          WHERE status != 'SUPERSEDED'
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
    id: 23,
    description: 'Add database-backed two-account maintenance mappings for each fixed Balance accounting risk route.',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS balance_account_mappings (
        mapping_key TEXT PRIMARY KEY,
        instrument_type TEXT NOT NULL CHECK (instrument_type IN (${sqlInList(INSTRUMENT_TYPE_VALUES)})),
        risk_class TEXT NOT NULL CHECK (risk_class IN ('SIGHT','BUYERS_USANCE','SELLERS_USANCE','USANCE')),
        account_a_number TEXT NOT NULL,
        account_a_description TEXT NOT NULL,
        account_b_number TEXT NOT NULL,
        account_b_description TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (instrument_type, risk_class)
      )`);
    },
  },
  {
    id: 24,
    description:
      'Capture the tolerance proposed by each ISSUE/monetary amendment on balance_movements so Checker Release can atomically make the latest tolerance effective and stale pending amendments can be revalidated.',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('tolerance_pct')) db.exec('ALTER TABLE balance_movements ADD COLUMN tolerance_pct TEXT');
    },
  },
  {
    id: 25,
    description: 'Persist amendment-only tolerance change magnitude and direction alongside the protected resulting tolerance.',
    up: (db) => {
      const columns = (db.prepare('PRAGMA table_info(balance_movements)').all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes('tolerance_change_pct')) db.exec('ALTER TABLE balance_movements ADD COLUMN tolerance_change_pct TEXT');
      if (!columns.includes('tolerance_change_direction')) db.exec("ALTER TABLE balance_movements ADD COLUMN tolerance_change_direction TEXT CHECK (tolerance_change_direction IS NULL OR tolerance_change_direction IN ('INCREASE','DECREASE'))");
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
