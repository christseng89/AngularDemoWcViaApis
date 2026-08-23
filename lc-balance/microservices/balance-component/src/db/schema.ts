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

/**
 * analysis/Balance-Component-DB-Optimization-Analysis.md P1 CHECK-constraint fix (2026-08-21) —
 * legal-value lists for every enum-typed column, exported so migrations.ts's own table-rebuild
 * migration (13) can reuse the EXACT same literals rather than risking drift between two hand-typed
 * copies. Two different authorities, deliberately NOT unified into one convention:
 *   - InstrumentType/ContractStatus/TenorType/MovementStatus/ExposureNature mirror src/types.ts's own
 *     union types verbatim (that file is already this app's single authority for these five — see its
 *     own top doc comment).
 *   - MovementType has NO src/types.ts union (`movementType` is typed as plain `string` there — see
 *     BalanceMovement.movementType's own comment); the real authority is
 *     BalanceService's own `movementTypeRegistry` (`buildMovementTypeRegistry()`), which
 *     `createMovement()` already enforces at runtime (`Unrecognized movementType "..."` — see that
 *     method's own doc comment). Verified against the live dev DB before adding these (2026-08-21,
 *     `SELECT DISTINCT ... GROUP BY` per column) — every value actually persisted so far is already a
 *     proper subset of the lists below; no dirty/unexpected data found, so the CHECK lists below encode
 *     the full DECLARED legal domain, not merely what happened to be exercised in the demo dataset.
 */
export const INSTRUMENT_TYPE_VALUES = [
  'IPLC_LC',
  'EPLC_LC',
  'IPLC_ACCEPTANCE',
  'EPLC_ACCEPTANCE',
  'SHGT',
  'EPLC_CONFIRMATION',
  'EPLC_DUE_FROM_ISSUING_BANK',
  'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
  'EPLC_EXPORT_BILLS_DISCOUNTED',
  'EPLC_EXAMINATION',
] as const;

export const CONTRACT_STATUS_VALUES = ['ACTIVE', 'SUPERSEDED', 'CLOSED', 'CANCELLED'] as const;

export const TENOR_TYPE_VALUES = ['SIGHT', 'BUYERS_USANCE', 'SELLERS_USANCE', 'DP', 'DA'] as const;

// Maturity-Date-Tenor-Basis-Decision-Review.md v29 §2 — kept in sync with types.ts's own TenorBasis union.
export const TENOR_BASIS_VALUES = ['AFTER_SIGHT', 'AFTER_BL_DATE', 'AFTER_INVOICE_DATE', 'AFTER_SHIPMENT_DATE', 'AFTER_ACCEPTANCE', 'FIXED_MATURITY_DATE'] as const;

// v29 §4 — kept in sync with types.ts's own MaturityDateStatus union.
export const MATURITY_DATE_STATUS_VALUES = ['PENDING_BASE_DATE', 'PENDING_APPROVAL', 'APPROVED'] as const;

export const MOVEMENT_STATUS_VALUES = ['PENDING', 'RELEASED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'] as const;

export const EXPOSURE_NATURE_VALUES = ['CONTINGENT', 'ACTUAL', 'MEMO'] as const;

/** Mirrors BalanceService's own buildMovementTypeRegistry() key set — see this module's own top doc comment. */
export const MOVEMENT_TYPE_VALUES = [
  'ISSUE',
  'CREATE',
  'AMEND_INCREASE',
  'AMEND',
  'AMEND_DECREASE',
  'UTILIZE',
  'HONOUR',
  'ACCEPT',
  'PARTIAL_REDEEM',
  'FULL_REDEEM',
  'REIMBURSE',
  'RECLASSIFY_OUT',
  'PARTIAL_SETTLE',
  'FULL_SETTLE',
  'CLOSE',
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — A2/B2 Extend Expiry
  // amendment subtype. Changes ONLY BalanceContract.expiryDate (at release, see BalanceService.release()'s
  // own AMEND_EXPIRY branch) — never Balance/ceilingAmount; amount is always exactly "0" (see
  // assertValidAmount()'s own AMEND_EXPIRY branch), and MOVEMENT_DIRECTION's own AMEND_EXPIRY: 1 entry is
  // therefore numerically inert (0 * 1 = 0), present only so signedAmount() doesn't throw.
  'AMEND_EXPIRY',
  // A6/B4 Calculated Maturity Date (2026-08-23, Maturity-Date-Business-Day-Convention-Decision-
  // Request.md, resolved) — A2/B2 amendment subtype letting the Maker update the LC/Confirmation's own
  // Standing calendar reference config (maturity_date_calendars/_combination_rule/_convention on
  // balance_contracts, see BalanceService.release()'s own branch). Same "amount always 0, numerically
  // inert" shape as AMEND_EXPIRY above — never touches Balance/ceilingAmount.
  'AMEND_MATURITY_CALENDARS',
] as const;

function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(',');
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS balance_contracts (
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
  supersedes_balance_contract_id TEXT REFERENCES balance_contracts(balance_contract_id),
  superseded_by_balance_contract_id TEXT REFERENCES balance_contracts(balance_contract_id),
  currency                       TEXT NOT NULL,
  tolerance_pct                  TEXT,
  tenor_type                     TEXT CHECK (tenor_type IS NULL OR tenor_type IN (${sqlInList(TENOR_TYPE_VALUES)})),
  tenor_days                     INTEGER,
  maturity_date                  TEXT,
  -- A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §0/§1 (2026-08-23) — root-ISSUE Business Date
  -- fields. expiry_date is required at root A1/B1 ISSUE (enforced in requestSchema.ts, not here);
  -- issue_date is optional there, defaulting to today. Both plain nullable TEXT — same convention as
  -- maturity_date above (ISO date string, no CHECK constraint).
  expiry_date                    TEXT,
  issue_date                     TEXT,
  -- A6/B4 Calculated Maturity Date (2026-08-23) — captured once at A1/B1 root ISSUE (this LC/
  -- Confirmation's own Standing calendar references for the eventual /business-days/adjust call),
  -- amendable via A2/B2's own AMEND_MATURITY_CALENDARS (see balance_movements' own copy of these three
  -- columns below, and BalanceService.release()'s own branch that copies them across at Checker
  -- approval). maturity_date_calendars is JSON (MaturityDateCalendarRef[]); the other two are plain
  -- enum-shaped TEXT, no CHECK constraint (small, non-authoritative set — see standingClient.ts).
  maturity_date_calendars        TEXT,
  maturity_date_combination_rule TEXT,
  maturity_date_convention       TEXT,
  -- Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.1/§4/§5 (business-confirmed) — tenor_basis/
  -- fixed_maturity_date live on the ROOT LC/Confirmation (captured at A1/B1 alongside tenor_type/
  -- tenor_days); contractual_maturity_date/operational_payment_date/standing_calculation_id/
  -- calendar_snapshot_id/maturity_date_status live on the ACCEPTANCE's own contract (never the parent —
  -- one LC can have multiple independent Acceptances, e.g. partial shipments, each with its own
  -- non-overwriting Maturity Date). No CHECK on tenor_basis/tenor_type combination here — that's an
  -- application-layer rule (domain/tenorBasis.ts), not a schema constraint, since it depends on both
  -- columns together and node:sqlite CHECK constraints can't reference sibling-column business rules
  -- this specific (see the existing tenor_type/tenor_basis nullable pattern already used elsewhere).
  tenor_basis                     TEXT CHECK (tenor_basis IS NULL OR tenor_basis IN (${sqlInList(TENOR_BASIS_VALUES)})),
  fixed_maturity_date             TEXT,
  contractual_maturity_date       TEXT,
  operational_payment_date        TEXT,
  standing_calculation_id         TEXT,
  calendar_snapshot_id            TEXT,
  maturity_date_status            TEXT CHECK (maturity_date_status IS NULL OR maturity_date_status IN (${sqlInList(MATURITY_DATE_STATUS_VALUES)})),
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

-- §6.1 off-balance exposure lookup: find SHGT contracts hanging off a given LC. Composite, not
-- parent_logical_contract_id alone (analysis/Balance-Component-DB-Optimization-Analysis.md P2,
-- 2026-08-21) — every real caller (listShgtMovementsForParent/listExaminationMovementsForParent/
-- listAcceptanceMovementsForParent and their batch "ForParents" counterparts in
-- balanceMovementStore.ts) filters on both columns together, so the composite avoids a table-row
-- lookup just to re-check instrument_type after the index narrows on parent_logical_contract_id
-- alone. A pre-existing on-disk DB that already created this index under its old single-column
-- definition is upgraded by migration 12 (migrations.ts) — CREATE INDEX IF NOT EXISTS here only
-- takes effect for a genuinely fresh database, since SQLite's IF NOT EXISTS only checks the name.
CREATE INDEX IF NOT EXISTS idx_contracts_parent
  ON balance_contracts(parent_logical_contract_id, instrument_type);

CREATE TABLE IF NOT EXISTS balance_movements (
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
  account_entries         TEXT, -- JSON
  -- analysis/contingent-liability-ledger.html — server-derived Dr/Cr contingent-liability pair for
  -- this event, distinct from account_entries above (caller-supplied GL passthrough). JSON:
  -- {drAccount, crAccount, currency, amount}. Null when out of contingent scope.
  contingent_account_entry TEXT,
  lmts_reservation_id     TEXT,
  status                  TEXT NOT NULL CHECK (status IN (${sqlInList(MOVEMENT_STATUS_VALUES)})),
  superseded_movement_id  TEXT REFERENCES balance_movements(movement_id),
  reversal_of_movement_id TEXT REFERENCES balance_movements(movement_id),
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
  cancelled_at             TEXT,
  -- A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 (2026-08-23) — A3/A3S/B3 presentation-vs-
  -- expiry check (reasonCode: PRESENTATION_AFTER_EXPIRY). Plain nullable TEXT (ISO date string), caller-
  -- supplied on the presentation movement itself, not derived server-side.
  document_presentation_date TEXT,
  -- §0.1 (2026-08-23) — Layer 2/3 informational-only audit flag, A10/B6 CLOSE only. INTEGER 0/1/NULL; see
  -- migrations.ts migration 15's own description for why (no boolean affinity in node:sqlite).
  triggered_by_expiry     INTEGER,
  -- §2/§3 (2026-08-23) — A2/B2 AMEND_EXPIRY only: the REQUESTED new expiryDate, carried on the movement
  -- (immutable audit record) until release() copies it onto BalanceContract.expiry_date. Null for every
  -- other movementType.
  expiry_date              TEXT,
  -- A6/B4 Calculated Maturity Date (2026-08-23) — A2/B2 AMEND_MATURITY_CALENDARS only: the REQUESTED new
  -- calendar config, carried here (immutable audit record) until release() copies it onto
  -- BalanceContract's own three columns of the same name. Null for every other movementType.
  maturity_date_calendars        TEXT,
  maturity_date_combination_rule TEXT,
  maturity_date_convention       TEXT
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
