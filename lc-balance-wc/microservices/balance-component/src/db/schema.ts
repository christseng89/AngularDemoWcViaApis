/**
 * SQLite schema for the Balance Component prototype persistence layer.
 *
 * Known limitation (documented, not silently glossed over): SQLite locks at
 * the whole-database-file level (even under WAL, only one writer at a time)
 * — it has no row-level lock / SELECT...FOR UPDATE. Design doc §6 requires
 * "同一張 LC 底下的多筆同時申請會被正確序列化，但不同 LC 之間完全不互相阻塞"
 * (same-LC requests serialize, different-LC requests never block each
 * other). SQLite structurally cannot demonstrate the second half of that
 * requirement — every write serializes globally, regardless of which
 * logicalContractId it touches. This is safe (over-conservative, not
 * incorrect) for a single-process prototype, but a production deployment
 * MUST move to a database with real row-level locking (PostgreSQL —
 * SELECT...FOR UPDATE scoped to balance_contract_id — or MySQL/InnoDB)
 * before the per-instrument-concurrency requirement can be considered
 * actually validated.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS balance_contracts (
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
);

-- Design doc §3.1 — one version per (logicalContractId, contractVersion).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_logical_version
  ON balance_contracts(logical_contract_id, contract_version);

-- Design doc §3.1 — at most one ACTIVE version per logicalContractId.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_one_active
  ON balance_contracts(logical_contract_id)
  WHERE status = 'ACTIVE';

-- Natural-key resolution (GET /balance-contracts) and the LC Number Catalog
-- (§ catalog endpoint — list by instrumentType, filterable by status).
CREATE INDEX IF NOT EXISTS idx_contracts_naturalkey
  ON balance_contracts(instrument_type, lc_number, ib_number, sg_number, leg_seq);

CREATE INDEX IF NOT EXISTS idx_contracts_catalog
  ON balance_contracts(instrument_type, status);

-- §6.1 off-balance exposure lookup: find SHGT contracts hanging off a given LC.
CREATE INDEX IF NOT EXISTS idx_contracts_parent
  ON balance_contracts(parent_logical_contract_id);

CREATE TABLE IF NOT EXISTS balance_movements (
  movement_id             TEXT PRIMARY KEY,
  balance_contract_id     TEXT NOT NULL REFERENCES balance_contracts(balance_contract_id),
  event_seq               INTEGER NOT NULL,
  business_event_id       TEXT,
  movement_type           TEXT NOT NULL,
  exposure_nature         TEXT NOT NULL,
  amount                  TEXT NOT NULL,
  ceiling_amount          TEXT NOT NULL,
  currency                TEXT NOT NULL,
  leg_ref                 TEXT,
  account_entries         TEXT, -- JSON
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
  warnings                TEXT, -- JSON
  created_by              TEXT NOT NULL,
  released_by             TEXT,
  created_at              TEXT NOT NULL,
  released_at             TEXT,
  -- Business instruction 2026-08-15 ("Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
  -- 來控制") — a Checker's B3 "Release" acknowledges a still-PENDING Present Docs earmark WITHOUT
  -- finalizing it (status stays PENDING — B4 still needs to find and consume it later). Distinct
  -- from released_by/released_at, which mark the real PENDING->RELEASED/REJECTED transition.
  acknowledged_by         TEXT,
  acknowledged_at         TEXT
);

-- Design doc §8 — idempotency key: (balanceContractId, eventSeq).
CREATE UNIQUE INDEX IF NOT EXISTS idx_movements_idempotency
  ON balance_movements(balance_contract_id, event_seq);

-- Confirmed/Available Balance derivation reads by (contract, status).
CREATE INDEX IF NOT EXISTS idx_movements_contract_status
  ON balance_movements(balance_contract_id, status);

CREATE INDEX IF NOT EXISTS idx_movements_business_event
  ON balance_movements(business_event_id);
`;
