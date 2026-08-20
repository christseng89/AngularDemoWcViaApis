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
  -- analysis/contingent-liability-ledger.html — server-derived Dr/Cr contingent-liability pair for
  -- this event, distinct from account_entries above (caller-supplied GL passthrough). JSON:
  -- {drAccount, crAccount, currency, amount}. Null when out of contingent scope.
  contingent_account_entry TEXT,
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
  -- Bug fixed 2026-08-16 ("A6/B4 也修一下") — see types.ts's BalanceMovement.referencedTransactionId
  -- doc comment for the full rule: the movementId of a pre-existing record (created by an earlier,
  -- separate submission) this movement converts/finalizes.
  referenced_transaction_id TEXT,
  balance_before          TEXT,
  balance_after           TEXT,
  warnings                TEXT, -- JSON
  created_by              TEXT NOT NULL,
  released_by             TEXT,
  created_at              TEXT NOT NULL,
  released_at             TEXT,
  -- Business instruction 2026-08-15 ("Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
  -- 來控制"). HISTORICAL — superseded 2026-08-18: B3's own Checker action is now a genuine
  -- PENDING->RELEASED transition via released_by/released_at (see present_docs_consumed_at below for
  -- what replaced this column's own role in the Present Docs Earmark computation); no longer written.
  acknowledged_by         TEXT,
  acknowledged_at         TEXT,
  -- Business instruction 2026-08-16 ("Add real Maker Submit, then have Checker to Release it.
  -- Exactly the same as A1.") — A4 (Sight Settlement) only. A4 has no movement of its own to
  -- create (it settles the PRE-EXISTING UTILIZE A3/A3S already earmarked), so this is the genuine,
  -- backend-persisted Maker action standing in for A1's own createMovement()-as-Submit step. Mirrors
  -- acknowledged_by/acknowledged_at's own shape (a second, non-finalizing actor action recorded on
  -- the SAME movement) but on the MAKER side — status stays PENDING either way.
  maker_submitted_by      TEXT,
  maker_submitted_at      TEXT,
  -- Business instruction 2026-08-17 ("PENDING XOR APPROVED... 只存PENDING 或 APPROVED 其中一個") — the
  -- BalanceSnapshot captured once at createMovement() (PENDING) and overwritten at release() (RELEASED),
  -- so Inquire Events can fetch it directly instead of recomputing on-demand. JSON. See types.ts's
  -- BalanceMovement.eventSnapshot doc comment.
  event_snapshot          TEXT,
  -- 2026-08-17 ("REFER TO DB S01", then "...SAVED TO DB == EVENT BALANCE SNAPSHOT") — the PARENT LC/
  -- Confirmation's own plain balance, captured at the same moment as event_snapshot above, for a
  -- child-ledger movement only (SHGT/Acceptance/EPLC_EXAMINATION). JSON. See types.ts's
  -- BalanceMovement.rootEventSnapshot doc comment.
  root_event_snapshot     TEXT,
  -- 2026-08-17 ("就是交易當時LC所有的BALANCE的拍照存檔") — the ONE Acceptance's / ONE Shipping
  -- Guarantee's own plain balance, captured alongside the fields above whenever exactly one candidate
  -- of that type exists under this movement's own root LC/Confirmation. JSON. See types.ts's
  -- BalanceMovement.acceptanceEventSnapshot/sgEventSnapshot doc comments.
  acceptance_event_snapshot TEXT,
  sg_event_snapshot        TEXT,
  -- 2026-08-18 ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變") — the release-time
  -- counterpart to event_snapshot's own new exception (see that column's comment above and types.ts's
  -- BalanceMovement.eventSnapshot doc comment): set ONLY when release() finalizes a Sight-tenor
  -- IPLC_LC/UTILIZE (A4), so event_snapshot itself can stay frozen at whatever createMovement()
  -- originally captured (A3's own submission) instead of being overwritten. JSON. Null for every other
  -- movement. See types.ts's BalanceMovement.finalizeEventSnapshot doc comment.
  finalize_event_snapshot TEXT,
  -- 2026-08-18 ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變") — same
  -- freeze-at-transaction-time fix as finalize_event_snapshot above, extended to the sibling snapshot
  -- columns: acceptance_event_snapshot/sg_event_snapshot must also stay frozen at whatever
  -- createMovement() originally captured for a Sight-tenor IPLC_LC/UTILIZE (A3's own transaction time,
  -- possibly before the sibling even existed yet), never overwritten by A4's own later Release. JSON.
  -- Null for every other movement. See types.ts's BalanceMovement.finalizeAcceptanceEventSnapshot/
  -- finalizeSgEventSnapshot doc comments.
  finalize_acceptance_event_snapshot TEXT,
  finalize_sg_event_snapshot TEXT,
  -- 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易" — B3 now genuinely RELEASEs on its own;
  -- acknowledged_by/acknowledged_at above are now historical-only, no longer written). Set as a side
  -- effect of release() on the Confirmation's own linked HONOUR/ACCEPT movement (via that movement's own
  -- referenced_transaction_id pointing back at this EPLC_EXAMINATION CREATE) — i.e. the moment B4
  -- actually consumes this presentation, not when B3 itself is Released. See types.ts's
  -- BalanceMovement.presentDocsConsumedAt doc comment and domain/offBalanceExposure.ts's own basis-change
  -- note for why this, not status alone, now gates Present Docs Earmark occupancy.
  present_docs_consumed_at TEXT,
  present_docs_consumed_by TEXT,
  -- 2026-08-20 ("SUBMIT/EC/APPROVE DATETIME/USER") — cancel()'s own actor/time, split out from
  -- released_by/released_at (see types.ts BalanceMovement.cancelledAt for why).
  cancelled_by             TEXT,
  cancelled_at             TEXT
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
