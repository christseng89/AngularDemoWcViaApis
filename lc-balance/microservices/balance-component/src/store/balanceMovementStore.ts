/**
 * Repository over the balance_movements table. Thin SQL wrapper — no
 * business logic here (that lives in src/domain/). Design doc §3.2 —
 * append-only: this store never physically deletes a row, only inserts new
 * ones and updates `status`/`released_by`/`released_at`/`reason_code`/
 * `present_docs_consumed_by`/`present_docs_consumed_at` (2026-08-18, B3's own
 * Present Docs Earmark consumption by B4 — see markPresentDocsConsumed()
 * below), `acknowledged_by`/`acknowledged_at` (2026-08-20, restored for
 * A3/A3S's own Checker acknowledgment — see acknowledge() below; B3 itself
 * still uses the standard release path, not this field, since 2026-08-18),
 * and `cancelled_by`/`cancelled_at` (2026-08-20, `cancel()`'s own dedicated
 * audit pair — see updateStatus() below).
 */
import type { Db } from '../db';
import type { AccountEntry, BalanceMovement, BalanceSnapshot, ContingentAccountEntry, ExposureNature, MovementStatus, MovementWarning } from '../types';

interface MovementRow {
  movement_id: string;
  balance_contract_id: string;
  event_seq: number;
  business_event_id: string | null;
  movement_type: string;
  exposure_nature: ExposureNature;
  amount: string;
  ceiling_amount: string;
  currency: string;
  leg_ref: string | null;
  account_entries: string | null;
  contingent_account_entry: string | null;
  lmts_reservation_id: string | null;
  status: MovementStatus;
  reversal_of_movement_id: string | null;
  reason_code: string | null;
  remarks: string | null;
  new_expiry_date: string | null;
  transaction_date: string | null;
  business_date: string | null;
  value_date: string | null;
  source_module: string | null;
  source_function: string | null;
  source_transaction_ref: string | null;
  referenced_transaction_id: string | null;
  balance_before: string | null;
  balance_after: string | null;
  warnings: string | null;
  created_by: string;
  released_by: string | null;
  created_at: string;
  released_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  maker_submitted_by: string | null;
  maker_submitted_at: string | null;
  event_snapshot: string | null;
  root_event_snapshot: string | null;
  acceptance_event_snapshot: string | null;
  sg_event_snapshot: string | null;
  finalize_event_snapshot: string | null;
  finalize_acceptance_event_snapshot: string | null;
  finalize_sg_event_snapshot: string | null;
  present_docs_consumed_at: string | null;
  present_docs_consumed_by: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  amendment_approved: number | null;
  amendment_effective: string | null;
  consent_status: string | null;
  edited_by: string | null;
  edited_at: string | null;
}

function rowToMovement(row: MovementRow): BalanceMovement {
  return {
    movementId: row.movement_id,
    balanceContractId: row.balance_contract_id,
    eventSeq: row.event_seq,
    businessEventId: row.business_event_id,
    movementType: row.movement_type,
    exposureNature: row.exposure_nature,
    amount: row.amount,
    ceilingAmount: row.ceiling_amount,
    currency: row.currency,
    legRef: row.leg_ref,
    accountEntries: row.account_entries ? (JSON.parse(row.account_entries) as AccountEntry[]) : null,
    contingentAccountEntry: row.contingent_account_entry ? (JSON.parse(row.contingent_account_entry) as ContingentAccountEntry) : null,
    lmtsReservationId: row.lmts_reservation_id,
    status: row.status,
    reversalOfMovementId: row.reversal_of_movement_id,
    reasonCode: row.reason_code,
    remarks: row.remarks,
    newExpiryDate: row.new_expiry_date,
    transactionDate: row.transaction_date,
    businessDate: row.business_date,
    valueDate: row.value_date,
    sourceModule: row.source_module,
    sourceFunction: row.source_function,
    sourceTransactionRef: row.source_transaction_ref,
    referencedTransactionId: row.referenced_transaction_id,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    warnings: row.warnings ? (JSON.parse(row.warnings) as MovementWarning[]) : null,
    createdBy: row.created_by,
    releasedBy: row.released_by,
    createdAt: row.created_at,
    releasedAt: row.released_at,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    makerSubmittedBy: row.maker_submitted_by,
    makerSubmittedAt: row.maker_submitted_at,
    eventSnapshot: row.event_snapshot ? (JSON.parse(row.event_snapshot) as BalanceSnapshot) : null,
    rootEventSnapshot: row.root_event_snapshot ? (JSON.parse(row.root_event_snapshot) as BalanceSnapshot) : null,
    acceptanceEventSnapshot: row.acceptance_event_snapshot ? (JSON.parse(row.acceptance_event_snapshot) as BalanceSnapshot) : null,
    sgEventSnapshot: row.sg_event_snapshot ? (JSON.parse(row.sg_event_snapshot) as BalanceSnapshot) : null,
    finalizeEventSnapshot: row.finalize_event_snapshot ? (JSON.parse(row.finalize_event_snapshot) as BalanceSnapshot) : null,
    finalizeAcceptanceEventSnapshot: row.finalize_acceptance_event_snapshot ? (JSON.parse(row.finalize_acceptance_event_snapshot) as BalanceSnapshot) : null,
    finalizeSgEventSnapshot: row.finalize_sg_event_snapshot ? (JSON.parse(row.finalize_sg_event_snapshot) as BalanceSnapshot) : null,
    presentDocsConsumedAt: row.present_docs_consumed_at,
    presentDocsConsumedBy: row.present_docs_consumed_by,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    amendmentApproved: row.amendment_approved === null ? null : row.amendment_approved === 1,
    amendmentEffective: row.amendment_effective,
    consentStatus: row.consent_status as BalanceMovement['consentStatus'],
    editedBy: row.edited_by,
    editedAt: row.edited_at,
  };
}

export class BalanceMovementStore {
  constructor(private readonly db: Db) {}

  /**
   * Design doc §8 — idempotent on (balanceContractId, eventSeq). Returns
   * `{created: true}` on a fresh insert, `{created: false, existing}` when
   * the UNIQUE constraint caught a resubmission (caller should respond 200
   * with the existing record rather than erroring).
   */
  insert(movement: BalanceMovement): { created: true } | { created: false; existing: BalanceMovement } {
    try {
      this.db
        .prepare(
          `INSERT INTO balance_movements (
            movement_id, balance_contract_id, event_seq, business_event_id, movement_type,
            exposure_nature, amount, ceiling_amount, currency, leg_ref, account_entries,
            contingent_account_entry,
            lmts_reservation_id, status, reversal_of_movement_id,
            reason_code, remarks, new_expiry_date, transaction_date, business_date, value_date,
            source_module, source_function, source_transaction_ref, referenced_transaction_id,
            balance_before,
            balance_after, warnings, created_by, released_by, created_at, released_at,
            event_snapshot, root_event_snapshot, acceptance_event_snapshot, sg_event_snapshot,
            amendment_approved, amendment_effective, consent_status
          ) VALUES (
            @movementId, @balanceContractId, @eventSeq, @businessEventId, @movementType,
            @exposureNature, @amount, @ceilingAmount, @currency, @legRef, @accountEntries,
            @contingentAccountEntry,
            @lmtsReservationId, @status, @reversalOfMovementId,
            @reasonCode, @remarks, @newExpiryDate, @transactionDate, @businessDate, @valueDate,
            @sourceModule, @sourceFunction, @sourceTransactionRef, @referencedTransactionId,
            @balanceBefore,
            @balanceAfter, @warnings, @createdBy, @releasedBy, @createdAt, @releasedAt,
            @eventSnapshot, @rootEventSnapshot, @acceptanceEventSnapshot, @sgEventSnapshot,
            @amendmentApproved, @amendmentEffective, @consentStatus
          )`,
        )
        .run({
          movementId: movement.movementId,
          balanceContractId: movement.balanceContractId,
          eventSeq: movement.eventSeq,
          businessEventId: movement.businessEventId ?? null,
          movementType: movement.movementType,
          exposureNature: movement.exposureNature,
          amount: movement.amount,
          ceilingAmount: movement.ceilingAmount,
          currency: movement.currency,
          legRef: movement.legRef ?? null,
          accountEntries: movement.accountEntries ? JSON.stringify(movement.accountEntries) : null,
          contingentAccountEntry: movement.contingentAccountEntry ? JSON.stringify(movement.contingentAccountEntry) : null,
          lmtsReservationId: movement.lmtsReservationId ?? null,
          status: movement.status,
          reversalOfMovementId: movement.reversalOfMovementId ?? null,
          reasonCode: movement.reasonCode ?? null,
          remarks: movement.remarks ?? null,
          newExpiryDate: movement.newExpiryDate ?? null,
          transactionDate: movement.transactionDate ?? null,
          businessDate: movement.businessDate ?? null,
          valueDate: movement.valueDate ?? null,
          sourceModule: movement.sourceModule ?? null,
          sourceFunction: movement.sourceFunction ?? null,
          sourceTransactionRef: movement.sourceTransactionRef ?? null,
          referencedTransactionId: movement.referencedTransactionId ?? null,
          balanceBefore: movement.balanceBefore ?? null,
          balanceAfter: movement.balanceAfter ?? null,
          warnings: movement.warnings ? JSON.stringify(movement.warnings) : null,
          createdBy: movement.createdBy,
          releasedBy: movement.releasedBy ?? null,
          createdAt: movement.createdAt,
          releasedAt: movement.releasedAt ?? null,
          eventSnapshot: movement.eventSnapshot ? JSON.stringify(movement.eventSnapshot) : null,
          rootEventSnapshot: movement.rootEventSnapshot ? JSON.stringify(movement.rootEventSnapshot) : null,
          acceptanceEventSnapshot: movement.acceptanceEventSnapshot ? JSON.stringify(movement.acceptanceEventSnapshot) : null,
          sgEventSnapshot: movement.sgEventSnapshot ? JSON.stringify(movement.sgEventSnapshot) : null,
          amendmentApproved: movement.amendmentApproved === null || movement.amendmentApproved === undefined ? null : movement.amendmentApproved ? 1 : 0,
          amendmentEffective: movement.amendmentEffective ?? null,
          consentStatus: movement.consentStatus ?? null,
        });
      return { created: true };
    } catch (err) {
      // This table has exactly one UNIQUE index (balance_contract_id, event_seq — Design
      // doc §8's idempotency key), so any UNIQUE violation here means a resubmission.
      //
      // Deliberately NOT `err instanceof Error` — node:sqlite's thrown
      // errors (code ERR_SQLITE_ERROR) fail that check under ts-jest (a
      // cross-realm/VM-context quirk: the native binding's Error and this
      // module's global Error are not the same constructor reference in
      // that environment), even though the object is a real Error with a
      // proper `.message`/`.stack`. Checking for a string `.message` is
      // both sufficient and portable across that difference.
      const message = (err as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && /UNIQUE constraint failed/.test(message)) {
        const existing = this.findByContractAndEventSeq(movement.balanceContractId, movement.eventSeq);
        if (existing) return { created: false, existing };
      }
      throw err;
    }
  }

  findById(movementId: string): BalanceMovement | undefined {
    const row = this.db.prepare(`SELECT * FROM balance_movements WHERE movement_id = ?`).get(movementId) as MovementRow | undefined;
    return row ? rowToMovement(row) : undefined;
  }

  findByContractAndEventSeq(balanceContractId: string, eventSeq: number): BalanceMovement | undefined {
    const row = this.db.prepare(`SELECT * FROM balance_movements WHERE balance_contract_id = ? AND event_seq = ?`).get(balanceContractId, eventSeq) as
      MovementRow | undefined;
    return row ? rowToMovement(row) : undefined;
  }

  /**
   * Bug fixed 2026-08-16, reviewer-reported ("A1 -> A8 -> A3S -> A4, the related SG entries was not
   * shown"): the Checker's own compound release for a linked-movement submission (A3S's SG redemption
   * + LC UTILIZE, B5's Acceptance FULL_SETTLE/PARTIAL_SETTLE + Reimbursement Receivable REIMBURSE) used
   * to resolve the linked leg's own movementId purely from the Maker's own in-memory component state —
   * correct only when the SAME browser session that submitted also does the release, never true for a
   * genuinely separate Checker session (the whole point of Maker/Checker 4-eyes separation). Cross-
   * contract (the SG's own balance_contract_id differs from the LC's), so this can't be a listByContract
   * filter — businessEventId is the only correlation the two linked legs actually share.
   */
  findByBusinessEventId(businessEventId: string): BalanceMovement[] {
    const rows = this.db
      .prepare(`SELECT * FROM balance_movements WHERE business_event_id = ? ORDER BY created_at ASC`)
      .all(businessEventId) as unknown as MovementRow[];
    return rows.map(rowToMovement);
  }

  /**
   * Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-
   * Proposal-zh.md §2.1) — the Maker Queue's own "My Pending/My Rejected" worklist. Cross-contract.
   *
   * Business-confirmed 2026-08-27 ("EARMARKED 等同 APPROVED 不要出現在 MAKER QUEUE 上") — a still-PENDING
   * A3/A3S UTILIZE that has already been Checker-acknowledged (`acknowledged_at` set) but not yet
   * Maker-Submitted into A4 (`maker_submitted_at` still null) displays as EARMARKED — the unified
   * Earmarking model's own business-equivalent of APPROVED (see `balance-component.model.ts`'s
   * `isEarmarkFunction()`), not a Maker-actionable PENDING item. Excluded here at the SQL level (not a
   * client-side post-filter) so `total` stays consistent with what's actually returned.
   *
   * Business-confirmed 2026-08-27 ("A6 · Acceptance (Usance) ... 應該是一個 U01 B01" — a duplicate row) —
   * a SECOND exclusion, for A6's own referenced A3/A3S UTILIZE specifically: once A6 sets
   * `maker_submitted_at` on it (`BalanceService.applyCreateSideEffects()`), the row above no longer
   * excludes it (it's genuinely PENDING+Maker-Submitted now) — but A6's own separate `IPLC_ACCEPTANCE/
   * CREATE` movement ALSO now appears in this same Maker's queue, both resolving to "A6" (one via
   * `referencedTransactionId`, one directly) — the exact same business event shown twice. Excludes any
   * movement that is itself the TARGET of another non-CANCELLED movement's own `referenced_transaction_id`
   * — the referencing movement (A6's own CREATE, or B4's own HONOUR/ACCEPT, or B5's own SETTLE) is what
   * the Maker now acts on; the referenced source (A3/A3S's UTILIZE, or B3's own CREATE) is superseded by
   * it in this worklist specifically. Safe for B3/B4/B5 too even though they never reach this dual-PENDING
   * shape in practice (B3 always releases before B4/B5 ever exist, so B3 itself is never PENDING/REJECTED
   * by the time a referencing movement exists) — this is the general, always-correct invariant, not an
   * A6-specific patch.
   *
   * This is the ONLY caller of this method (dedicated to the Maker Queue), so both exclusions are
   * unconditional rather than an opt-in flag.
   *
   * User-directed 2026-08-28 ("Maker Queue Index 預設依以下順序排序: Order by Function ASC → LC Number
   * ASC → Secondary Reference Number ASC" / "Search 後的結果必須維持與 Maker Queue 相同的排序規則") —
   * `page`/`pageSize`/`LIMIT`/`OFFSET` REMOVED outright: "Function" has no column of its own (it's an
   * Angular-side concept resolved from instrumentType+movementType+makerSubmittedAt — see
   * `MakerQueueService.functionFor()`), so a true Function-first sort can only be applied client-side,
   * AFTER every matching row is loaded — the same "Function is not a server-side concern" boundary
   * `DeletePendingAuditStore.search()`'s own doc comment already draws (it filters client-side on a
   * fetched page for the identical reason). Returns every matching row unpaginated; `MakerQueueService`
   * now owns the actual page window (`PagedListState`, same "windowing an already-loaded array"
   * convention `InquireEventsService.pagedEvents` already established) — as a side effect, this also
   * resolves `groupCompoundRows()`'s own former "grouping is client-side, over only the CURRENT page's
   * own fetched items" known limitation, since the full matching set is now always loaded at once.
   *
   * `q` (renamed from the prior exact-match `lcNumber` filter, "支援 LIKE / Partial Match") — substring
   * LIKE, same `%@q%`/`q` naming convention `BalanceContractStore.listCatalog()`'s own `q` filter and
   * `listWithDeletePendingHistory()`'s own `q` filter already use, rather than the DIFFERENT exact-match
   * `lcNumber` convention `DeletePendingAuditStore.search()` uses (that one was never LIKE, so it kept
   * its own name) — the two conventions in this codebase are conditioned on match type, not by caller.
   *
   * Requires a JOIN against `balance_contracts` for both the sort key and the filter — every previously-
   * bare column reference in the exclusion subqueries now needs an explicit `bm.` alias, since
   * `balance_contracts` has its own, different-meaning `status` column (`ContractStatus`) that would
   * otherwise silently collide with `balance_movements.status` the instant the JOIN is introduced.
   */
  listByCreatedByAndStatus(params: { createdBy: string; statuses: MovementStatus[]; q?: string }): {
    items: BalanceMovement[];
  } {
    const { createdBy, statuses, q } = params;
    const placeholders = statuses.map(() => '?').join(', ');
    const notYetActionableEarmark = `(bm.status = 'PENDING' AND bm.acknowledged_at IS NOT NULL AND bm.maker_submitted_at IS NULL)`;
    const supersededByAReferencingMovement = `EXISTS (SELECT 1 FROM balance_movements ref WHERE ref.referenced_transaction_id = bm.movement_id AND ref.status != 'CANCELLED')`;
    const qClause = q ? `AND bc.lc_number LIKE ?` : '';
    const exclusion = `AND NOT ${notYetActionableEarmark} AND NOT ${supersededByAReferencingMovement} ${qClause}`;
    const queryParams = q ? [createdBy, ...statuses, `%${q}%`] : [createdBy, ...statuses];
    const rows = this.db
      .prepare(
        `SELECT bm.* FROM balance_movements bm JOIN balance_contracts bc ON bc.balance_contract_id = bm.balance_contract_id
         WHERE bm.created_by = ? AND bm.status IN (${placeholders}) ${exclusion}
         ORDER BY bc.lc_number ASC, bm.created_at DESC`,
      )
      .all(...queryParams) as unknown as MovementRow[];
    return { items: rows.map(rowToMovement) };
  }

  /** Design doc §3.3 — everything needed to derive Confirmed/Available Balance for one contract version. */
  listByContract(balanceContractId: string): BalanceMovement[] {
    const rows = this.db
      .prepare(`SELECT * FROM balance_movements WHERE balance_contract_id = ? ORDER BY event_seq ASC`)
      .all(balanceContractId) as unknown as MovementRow[];
    return rows.map(rowToMovement);
  }

  /**
   * Design doc §6.1 — SHGT movements (PENDING+RELEASED only, filtering is
   * the caller's job via domain/offBalanceExposure.ts) for every SHGT
   * logical contract whose parentLogicalContractId matches the given LC.
   */
  listShgtMovementsForParent(parentLogicalContractId: string): BalanceMovement[] {
    const rows = this.db
      .prepare(
        `SELECT bm.* FROM balance_movements bm
         JOIN balance_contracts bc ON bc.balance_contract_id = bm.balance_contract_id
         WHERE bc.instrument_type = 'SHGT' AND bc.parent_logical_contract_id = ?`,
      )
      .all(parentLogicalContractId) as unknown as MovementRow[];
    return rows.map(rowToMovement);
  }

  /**
   * Business-reported gap 2026-08-15 ("S001 都超 Present Docs — E01-E04 應該有一個 Present Earmark
   * Amount 控制 B3＋，B4－") — same shape as listShgtMovementsForParent above, for EPLC_EXAMINATION
   * (Present Docs) contracts under the given Confirmation. See domain/offBalanceExposure.ts's
   * computePresentDocsEarmark for what this feeds.
   */
  listExaminationMovementsForParent(parentLogicalContractId: string): BalanceMovement[] {
    const rows = this.db
      .prepare(
        `SELECT bm.* FROM balance_movements bm
         JOIN balance_contracts bc ON bc.balance_contract_id = bm.balance_contract_id
         WHERE bc.instrument_type = 'EPLC_EXAMINATION' AND bc.parent_logical_contract_id = ?`,
      )
      .all(parentLogicalContractId) as unknown as MovementRow[];
    return rows.map(rowToMovement);
  }

  /**
   * A10/B6 Close (domain/closeEligibility.ts) — same shape as listShgtMovementsForParent/
   * listExaminationMovementsForParent above, covering BOTH IPLC_ACCEPTANCE (Import) and EPLC_ACCEPTANCE
   * (Export) in one query since a given parent only ever has children of the one type its own root
   * instrumentType produces — the OR costs nothing and avoids the caller needing to know which side it's
   * on (unlike ACCEPTANCE_TYPE_BY_ROOT in service/balanceService.ts, which resolves that distinction for
   * the single-sibling snapshot lookups; this method is a full aggregate, not a "just the one" lookup).
   */
  listAcceptanceMovementsForParent(parentLogicalContractId: string): BalanceMovement[] {
    const rows = this.db
      .prepare(
        `SELECT bm.* FROM balance_movements bm
         JOIN balance_contracts bc ON bc.balance_contract_id = bm.balance_contract_id
         WHERE bc.instrument_type IN ('IPLC_ACCEPTANCE', 'EPLC_ACCEPTANCE') AND bc.parent_logical_contract_id = ?`,
      )
      .all(parentLogicalContractId) as unknown as MovementRow[];
    return rows.map(rowToMovement);
  }

  /**
   * analysis/Balance-Component-DB-Optimization-Analysis.md P2 N+1 fix (2026-08-21) — batch counterpart of
   * listByContract() for BalanceService.listCloseEligibleContracts()'s own Step-1 picker: one query for
   * every candidate contract in the batch instead of one query per candidate. Returns a Map keyed by
   * balanceContractId; a candidate with zero movements simply has no entry (callers default to `[]`).
   * Same row shape/ordering guarantee as listByContract() (ORDER BY event_seq ASC within each contract).
   */
  listByContractIds(balanceContractIds: string[]): Map<string, BalanceMovement[]> {
    const map = new Map<string, BalanceMovement[]>();
    if (balanceContractIds.length === 0) return map;
    const placeholders = balanceContractIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM balance_movements WHERE balance_contract_id IN (${placeholders}) ORDER BY balance_contract_id, event_seq ASC`)
      .all(...balanceContractIds) as unknown as MovementRow[];
    for (const row of rows) {
      const movement = rowToMovement(row);
      const list = map.get(movement.balanceContractId);
      if (list) list.push(movement);
      else map.set(movement.balanceContractId, [movement]);
    }
    return map;
  }

  /** Batch counterpart of listShgtMovementsForParent() — same N+1 fix, same convention as listByContractIds() above. Map keyed by parentLogicalContractId. */
  listShgtMovementsForParents(parentLogicalContractIds: string[]): Map<string, BalanceMovement[]> {
    return this.listMovementsForParentsByInstrumentTypes(parentLogicalContractIds, [`'SHGT'`]);
  }

  /** Batch counterpart of listExaminationMovementsForParent() — same N+1 fix, same convention as listByContractIds() above. Map keyed by parentLogicalContractId. */
  listExaminationMovementsForParents(parentLogicalContractIds: string[]): Map<string, BalanceMovement[]> {
    return this.listMovementsForParentsByInstrumentTypes(parentLogicalContractIds, [`'EPLC_EXAMINATION'`]);
  }

  /** Batch counterpart of listAcceptanceMovementsForParent() — same N+1 fix, same convention as listByContractIds() above. Map keyed by parentLogicalContractId. */
  listAcceptanceMovementsForParents(parentLogicalContractIds: string[]): Map<string, BalanceMovement[]> {
    return this.listMovementsForParentsByInstrumentTypes(parentLogicalContractIds, [`'IPLC_ACCEPTANCE'`, `'EPLC_ACCEPTANCE'`]);
  }

  /**
   * Shared implementation behind the three batch "ForParents" methods above — `instrumentTypeLiterals` are
   * pre-quoted SQL string literals (not bound params; this internal helper is only ever called with the
   * fixed literal sets above, never caller-supplied input), matching this store's own existing single-
   * candidate JOIN shape (listShgtMovementsForParent() etc.) but grouped over an IN-list of parents instead
   * of one `= ?`. `bc.parent_logical_contract_id` is selected alongside `bm.*` purely to know which
   * caller-supplied parent each row belongs to — rowToMovement() ignores the extra column.
   */
  private listMovementsForParentsByInstrumentTypes(parentLogicalContractIds: string[], instrumentTypeLiterals: string[]): Map<string, BalanceMovement[]> {
    const map = new Map<string, BalanceMovement[]>();
    if (parentLogicalContractIds.length === 0) return map;
    const placeholders = parentLogicalContractIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT bm.*, bc.parent_logical_contract_id AS __parent_logical_contract_id FROM balance_movements bm
         JOIN balance_contracts bc ON bc.balance_contract_id = bm.balance_contract_id
         WHERE bc.instrument_type IN (${instrumentTypeLiterals.join(', ')}) AND bc.parent_logical_contract_id IN (${placeholders})`,
      )
      .all(...parentLogicalContractIds) as unknown as (MovementRow & { __parent_logical_contract_id: string })[];
    for (const row of rows) {
      const movement = rowToMovement(row);
      const list = map.get(row.__parent_logical_contract_id);
      if (list) list.push(movement);
      else map.set(row.__parent_logical_contract_id, [movement]);
    }
    return map;
  }

  updateStatus(params: {
    movementId: string;
    status: MovementStatus;
    /**
     * Bug fix (BA code-review finding ahead of Balance-Component-DeletePending-TestPlan-zh.md §8 step 3,
     * defect registered under that document's own §0.3 Test Governance Rule) — COALESCE(@releasedBy,
     * released_by) / COALESCE(@releasedAt, released_at), same "don't touch unless the caller actually
     * passes it" posture as reasonCode below. `reject()` writes its own Checker-rejection audit pair into
     * these SAME two columns (there is no separate `rejected_by`/`rejected_at` pair — see reject()'s own
     * call site); `cancel()` never supplies either (Delete Pending has its own dedicated
     * cancelled_by/cancelled_at pair below), so a plain overwrite here silently erased the REJECTED audit
     * trail's own actor/timestamp on every REJECTED -> Delete Pending -> CANCELLED transition (§0.2 P0:
     * the three-point Acknowledge -> Reject -> Delete audit trail must all remain independently
     * queryable — this call was the one already-shipped gap in reaching that). `release()` still writes
     * its own real, non-null values here as before, unaffected by the change.
     */
    releasedBy?: string | null;
    releasedAt?: string | null;
    /**
     * Bug fix (reviewer-reported 2026-08-26, "Reason Code not shown in Inquire Events for Close/Reopen") —
     * COALESCE(@reasonCode, reason_code), same "don't touch unless the caller actually passes it" posture
     * as eventSnapshot/rootEventSnapshot below. release() never supplies this (CLOSE/REOPEN's mandatory
     * reasonCode — F1 §13.1 — is captured at createMovement() time, not at Release), so a plain overwrite
     * here silently nulled it out on every single Release; reject()/cancel() are unaffected by the change
     * since both always pass a real, non-null reasonCode of their own at the point they call this.
     */
    reasonCode?: string | null;
    remarks?: string | null;
    balanceBefore?: string | null;
    balanceAfter?: string | null;
    /**
     * 2026-08-17 — passed by release() only (the RELEASED-state Event Snapshot, JSON string). Omitted
     * by reject(), which leaves event_snapshot untouched (out of scope — see types.ts's
     * BalanceMovement.eventSnapshot doc comment). Omitted/undefined and explicit null are
     * indistinguishable once bound as a SQL param — both fall through the COALESCE below and preserve
     * the existing column value, which is exactly the "don't touch it" behavior every non-release
     * caller needs.
     */
    eventSnapshot?: string | null;
    /** 2026-08-17 — same "don't touch unless release() passes it" COALESCE posture as eventSnapshot above. */
    rootEventSnapshot?: string | null;
    /**
     * 2026-08-17 ("就是交易當時LC所有的BALANCE的拍照存檔") — unlike eventSnapshot/rootEventSnapshot
     * above, release() ALWAYS recomputes these (captureSiblingSnapshots() runs unconditionally), and a
     * freshly-recomputed value can legitimately BE null (e.g. a second SG was issued between Create and
     * Release, making the candidate count ambiguous) — so a plain COALESCE(@param, column) would
     * incorrectly preserve a now-stale non-null value from Create. These two therefore use an explicit
     * "was this key provided at all" flag (`in params`, distinct from the value itself being null) rather
     * than COALESCE, so release()'s own null IS written, while reject()/cancel() (which omit the key
     * entirely, out of scope) still leave the column untouched.
     */
    acceptanceEventSnapshot?: string | null;
    sgEventSnapshot?: string | null;
    /**
     * 2026-08-18 ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變") — passed by release()
     * ONLY for a Sight-tenor IPLC_LC/UTILIZE (A4's own finalize target), and ONLY then — every other
     * release() call omits this key entirely, same COALESCE-preserves-existing-null posture as
     * eventSnapshot/rootEventSnapshot above (this column never needs to be explicitly written back to
     * null the way acceptance/sgEventSnapshot sometimes do, since a movement is only ever released once
     * — RELEASED is terminal — so there is no "second release()" that could need to null it back out).
     */
    finalizeEventSnapshot?: string | null;
    /**
     * 2026-08-18 ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變") — same
     * "release() passes it ONLY for isSightUtilizeFinalize, plain COALESCE" posture as
     * finalizeEventSnapshot above. The COMPANION fix on this same date is what release() now does with
     * `acceptanceEventSnapshot`/`sgEventSnapshot` above for that same case: it OMITS those two keys
     * entirely (not merely passes null) — `hasAcceptanceEventSnapshot`/`hasSgEventSnapshot` below
     * correctly compute to 0, leaving `acceptance_event_snapshot`/`sg_event_snapshot` frozen at whatever
     * createMovement() originally captured — while these two new columns receive the freshly-recomputed
     * release-time sibling figures instead.
     */
    finalizeAcceptanceEventSnapshot?: string | null;
    finalizeSgEventSnapshot?: string | null;
    /**
     * 2026-08-20 ("SUBMIT/EC/APPROVE DATETIME/USER") — passed by `cancel()` only; every other caller
     * (`release()`/`reject()`) omits both, so they stay null for a RELEASED/REJECTED movement (a
     * movement is only ever transitioned once — status is terminal — so a plain write here, not a
     * COALESCE, is safe: there's no second call on the same row that could clobber a real value).
     */
    cancelledBy?: string | null;
    cancelledAt?: string | null;
  }): void {
    this.db
      .prepare(
        `UPDATE balance_movements
         SET status = @status,
             released_by = COALESCE(@releasedBy, released_by), released_at = COALESCE(@releasedAt, released_at),
             reason_code = COALESCE(@reasonCode, reason_code), remarks = @remarks,
             balance_before = @balanceBefore, balance_after = @balanceAfter,
             event_snapshot = COALESCE(@eventSnapshot, event_snapshot),
             root_event_snapshot = COALESCE(@rootEventSnapshot, root_event_snapshot),
             acceptance_event_snapshot = CASE WHEN @hasAcceptanceEventSnapshot = 1 THEN @acceptanceEventSnapshot ELSE acceptance_event_snapshot END,
             sg_event_snapshot = CASE WHEN @hasSgEventSnapshot = 1 THEN @sgEventSnapshot ELSE sg_event_snapshot END,
             finalize_event_snapshot = COALESCE(@finalizeEventSnapshot, finalize_event_snapshot),
             finalize_acceptance_event_snapshot = COALESCE(@finalizeAcceptanceEventSnapshot, finalize_acceptance_event_snapshot),
             finalize_sg_event_snapshot = COALESCE(@finalizeSgEventSnapshot, finalize_sg_event_snapshot),
             cancelled_by = @cancelledBy, cancelled_at = @cancelledAt
         WHERE movement_id = @movementId`,
      )
      .run({
        movementId: params.movementId,
        status: params.status,
        releasedBy: params.releasedBy ?? null,
        releasedAt: params.releasedAt ?? null,
        reasonCode: params.reasonCode ?? null,
        remarks: params.remarks ?? null,
        balanceBefore: params.balanceBefore ?? null,
        balanceAfter: params.balanceAfter ?? null,
        eventSnapshot: params.eventSnapshot ?? null,
        rootEventSnapshot: params.rootEventSnapshot ?? null,
        acceptanceEventSnapshot: params.acceptanceEventSnapshot ?? null,
        sgEventSnapshot: params.sgEventSnapshot ?? null,
        hasAcceptanceEventSnapshot: 'acceptanceEventSnapshot' in params ? 1 : 0,
        hasSgEventSnapshot: 'sgEventSnapshot' in params ? 1 : 0,
        finalizeEventSnapshot: params.finalizeEventSnapshot ?? null,
        finalizeAcceptanceEventSnapshot: params.finalizeAcceptanceEventSnapshot ?? null,
        finalizeSgEventSnapshot: params.finalizeSgEventSnapshot ?? null,
        cancelledBy: params.cancelledBy ?? null,
        cancelledAt: params.cancelledAt ?? null,
      });
  }

  /**
   * 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — marks an EPLC_EXAMINATION CREATE
   * (B3's own Present Docs earmark) as consumed by B4, as a side effect of `release()` on the
   * Confirmation's own linked HONOUR/ACCEPT movement — see `BalanceService.release()`'s own doc comment
   * for when this is called, and `domain/offBalanceExposure.ts`'s own doc comment for what reading
   * `present_docs_consumed_at` actually controls. Sets present_docs_consumed_by/present_docs_consumed_at
   * only, never touches status (this movement's own status already reached RELEASED independently, via
   * its own earlier, real Checker Release — this call only marks WHEN it stopped occupying Present Docs
   * Earmark capacity). Supersedes acknowledge() (removed) — same shape, different column pair, different
   * trigger (this is a `release()`-driven side effect on a DIFFERENT movement, not its own direct
   * Checker action).
   */
  markPresentDocsConsumed(params: { movementId: string; presentDocsConsumedBy: string; presentDocsConsumedAt: string }): void {
    this.db
      .prepare(
        'UPDATE balance_movements SET present_docs_consumed_by = @presentDocsConsumedBy, present_docs_consumed_at = @presentDocsConsumedAt WHERE movement_id = @movementId',
      )
      .run(params);
  }

  /**
   * Fix Pending §19 (redesigned 2026-08-29) — A3S's own compound cascade is the only Fix Pending shape
   * whose `movementType` can genuinely change (FULL_REDEEM <-> PARTIAL_REDEEM, as the corrected Bill
   * Amount changes how much of the SG's own outstanding it clears) — a narrow, dedicated companion to
   * `applyFixPendingCorrection()` below, called just before it in the same transaction.
   */
  setMovementType(movementId: string, movementType: string): void {
    this.db.prepare('UPDATE balance_movements SET movement_type = @movementType WHERE movement_id = @movementId').run({ movementId, movementType });
  }

  /**
   * Fix Pending §19 (redesigned 2026-08-29) — `editPending()`'s own IN-PLACE correction of a
   * PENDING/REJECTED row: every field a Fix Pending Save can change is overwritten, `status` lands back
   * at `'PENDING'`, and `created_by`/`created_at` are updated to the editor/edit-time (same "the live
   * row's own author/time reflect its CURRENT content" behavior the pre-redesign replacement row already
   * had) — `movement_id`/`balance_contract_id`/`event_seq` never change, this is a same-identity
   * correction, not a replacement. The pre-edit content is captured separately by the caller via
   * `FixPendingAuditStore.insert()` BEFORE calling this. A dedicated method, not folded into
   * `updateStatus()` above, on purpose — see that method's own large RELEASE/REJECT/CANCEL-shaped
   * parameter surface vs. EDIT's genuinely different, simpler shape.
   */
  applyFixPendingCorrection(params: {
    movementId: string;
    businessEventId: string | null;
    exposureNature: ExposureNature;
    amount: string;
    ceilingAmount: string;
    legRef: string | null;
    accountEntries: AccountEntry[] | null;
    contingentAccountEntry: ContingentAccountEntry | null;
    reasonCode: string | null;
    warnings: MovementWarning[] | null;
    newExpiryDate: string | null;
    transactionDate: string | null;
    businessDate: string | null;
    valueDate: string | null;
    sourceModule: string | null;
    sourceFunction: string | null;
    referencedTransactionId: string | null;
    amendmentApproved: boolean | null;
    amendmentEffective: string | null;
    consentStatus: string | null;
    createdBy: string;
    createdAt: string;
    editedBy: string;
    editedAt: string;
  }): void {
    this.db
      .prepare(
        `UPDATE balance_movements
         SET business_event_id = @businessEventId, exposure_nature = @exposureNature, amount = @amount,
             ceiling_amount = @ceilingAmount, leg_ref = @legRef, account_entries = @accountEntries,
             contingent_account_entry = @contingentAccountEntry, status = 'PENDING',
             reason_code = @reasonCode, warnings = @warnings, new_expiry_date = @newExpiryDate,
             transaction_date = @transactionDate, business_date = @businessDate, value_date = @valueDate,
             source_module = @sourceModule, source_function = @sourceFunction,
             referenced_transaction_id = @referencedTransactionId, amendment_approved = @amendmentApproved,
             amendment_effective = @amendmentEffective, consent_status = @consentStatus,
             created_by = @createdBy, created_at = @createdAt, edited_by = @editedBy, edited_at = @editedAt
         WHERE movement_id = @movementId`,
      )
      .run({
        movementId: params.movementId,
        businessEventId: params.businessEventId,
        exposureNature: params.exposureNature,
        amount: params.amount,
        ceilingAmount: params.ceilingAmount,
        legRef: params.legRef,
        accountEntries: params.accountEntries ? JSON.stringify(params.accountEntries) : null,
        contingentAccountEntry: params.contingentAccountEntry ? JSON.stringify(params.contingentAccountEntry) : null,
        reasonCode: params.reasonCode,
        warnings: params.warnings ? JSON.stringify(params.warnings) : null,
        newExpiryDate: params.newExpiryDate,
        transactionDate: params.transactionDate,
        businessDate: params.businessDate,
        valueDate: params.valueDate,
        sourceModule: params.sourceModule,
        sourceFunction: params.sourceFunction,
        referencedTransactionId: params.referencedTransactionId,
        amendmentApproved: params.amendmentApproved === null ? null : params.amendmentApproved ? 1 : 0,
        amendmentEffective: params.amendmentEffective,
        consentStatus: params.consentStatus,
        createdBy: params.createdBy,
        createdAt: params.createdAt,
        editedBy: params.editedBy,
        editedAt: params.editedAt,
      });
  }

  /** A4's own real Maker Submit (2026-08-16) — sets maker_submitted_by/maker_submitted_at only, never touches status. Mirrors markPresentDocsConsumed() above, on the Maker side. */
  submitByMaker(params: { movementId: string; makerSubmittedBy: string; makerSubmittedAt: string }): void {
    this.db
      .prepare('UPDATE balance_movements SET maker_submitted_by = @makerSubmittedBy, maker_submitted_at = @makerSubmittedAt WHERE movement_id = @movementId')
      .run(params);
  }

  /**
   * Business-confirmed 2026-08-27 — the inverse of submitByMaker() above, A4's own Delete Pending. Nulls
   * both columns back to their pre-Submit state; never touches acknowledged_at. `revertToPending` (true
   * when the caller found this movement REJECTED) additionally flips status back to PENDING — "revert to
   * before A4 Submit" must hold whether A4's own Checker rejected it or never decided — so a rejected A4
   * attempt isn't stuck forever (submitByMaker() only ever accepts a PENDING movement); released_by/
   * released_at (reject()'s own columns) are deliberately left as-is, same permanent-historical-fact
   * posture as acknowledged_at.
   */
  withdrawMakerSubmit(movementId: string, revertToPending: boolean): void {
    const statusClause = revertToPending ? `, status = 'PENDING'` : '';
    this.db.prepare(`UPDATE balance_movements SET maker_submitted_by = NULL, maker_submitted_at = NULL${statusClause} WHERE movement_id = @movementId`).run({ movementId });
  }

  /**
   * Restored 2026-08-20 (business instruction, "A3 A3S 交易 Approve 過後 不要再顯示") — A3/A3S's own
   * Checker acknowledgment on the LC's own UTILIZE (deferSettlement, status stays PENDING; A4/A6 finalizes
   * for real later) now persists again, so the Checker Queue can filter an already-approved item out
   * instead of it reappearing forever. Distinct from B3's own former acknowledge() (removed 2026-08-18) —
   * that one was superseded by a genuine release; this one covers a movement that genuinely never releases
   * at this step.
   */
  acknowledge(params: { movementId: string; acknowledgedBy: string; acknowledgedAt: string }): void {
    this.db
      .prepare('UPDATE balance_movements SET acknowledged_by = @acknowledgedBy, acknowledged_at = @acknowledgedAt WHERE movement_id = @movementId')
      .run(params);
  }
}
