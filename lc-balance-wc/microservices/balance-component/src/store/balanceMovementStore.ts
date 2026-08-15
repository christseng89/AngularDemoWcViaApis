/**
 * Repository over the balance_movements table. Thin SQL wrapper — no
 * business logic here (that lives in src/domain/). Design doc §3.2 —
 * append-only: this store never physically deletes a row, only inserts new
 * ones and updates `status`/`released_by`/`released_at`/`reason_code`/
 * `acknowledged_by`/`acknowledged_at` (2026-08-15, B3's own Present Docs
 * Earmark acknowledgment — see acknowledge() below).
 */
import type { Db } from '../db';
import type {
  AccountEntry,
  BalanceMovement,
  ExposureNature,
  MovementStatus,
  MovementWarning,
} from '../types';

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
  lmts_reservation_id: string | null;
  status: MovementStatus;
  superseded_movement_id: string | null;
  reversal_of_movement_id: string | null;
  reason_code: string | null;
  remarks: string | null;
  transaction_date: string | null;
  business_date: string | null;
  value_date: string | null;
  source_module: string | null;
  source_function: string | null;
  source_transaction_ref: string | null;
  balance_before: string | null;
  balance_after: string | null;
  warnings: string | null;
  created_by: string;
  released_by: string | null;
  created_at: string;
  released_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
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
    lmtsReservationId: row.lmts_reservation_id,
    status: row.status,
    supersededMovementId: row.superseded_movement_id,
    reversalOfMovementId: row.reversal_of_movement_id,
    reasonCode: row.reason_code,
    remarks: row.remarks,
    transactionDate: row.transaction_date,
    businessDate: row.business_date,
    valueDate: row.value_date,
    sourceModule: row.source_module,
    sourceFunction: row.source_function,
    sourceTransactionRef: row.source_transaction_ref,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    warnings: row.warnings ? (JSON.parse(row.warnings) as MovementWarning[]) : null,
    createdBy: row.created_by,
    releasedBy: row.released_by,
    createdAt: row.created_at,
    releasedAt: row.released_at,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
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
            lmts_reservation_id, status, superseded_movement_id, reversal_of_movement_id,
            reason_code, remarks, transaction_date, business_date, value_date,
            source_module, source_function, source_transaction_ref, balance_before,
            balance_after, warnings, created_by, released_by, created_at, released_at
          ) VALUES (
            @movementId, @balanceContractId, @eventSeq, @businessEventId, @movementType,
            @exposureNature, @amount, @ceilingAmount, @currency, @legRef, @accountEntries,
            @lmtsReservationId, @status, @supersededMovementId, @reversalOfMovementId,
            @reasonCode, @remarks, @transactionDate, @businessDate, @valueDate,
            @sourceModule, @sourceFunction, @sourceTransactionRef, @balanceBefore,
            @balanceAfter, @warnings, @createdBy, @releasedBy, @createdAt, @releasedAt
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
          lmtsReservationId: movement.lmtsReservationId ?? null,
          status: movement.status,
          supersededMovementId: movement.supersededMovementId ?? null,
          reversalOfMovementId: movement.reversalOfMovementId ?? null,
          reasonCode: movement.reasonCode ?? null,
          remarks: movement.remarks ?? null,
          transactionDate: movement.transactionDate ?? null,
          businessDate: movement.businessDate ?? null,
          valueDate: movement.valueDate ?? null,
          sourceModule: movement.sourceModule ?? null,
          sourceFunction: movement.sourceFunction ?? null,
          sourceTransactionRef: movement.sourceTransactionRef ?? null,
          balanceBefore: movement.balanceBefore ?? null,
          balanceAfter: movement.balanceAfter ?? null,
          warnings: movement.warnings ? JSON.stringify(movement.warnings) : null,
          createdBy: movement.createdBy,
          releasedBy: movement.releasedBy ?? null,
          createdAt: movement.createdAt,
          releasedAt: movement.releasedAt ?? null,
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
    const row = this.db.prepare(`SELECT * FROM balance_movements WHERE movement_id = ?`).get(movementId) as
      | MovementRow
      | undefined;
    return row ? rowToMovement(row) : undefined;
  }

  findByContractAndEventSeq(balanceContractId: string, eventSeq: number): BalanceMovement | undefined {
    const row = this.db
      .prepare(`SELECT * FROM balance_movements WHERE balance_contract_id = ? AND event_seq = ?`)
      .get(balanceContractId, eventSeq) as MovementRow | undefined;
    return row ? rowToMovement(row) : undefined;
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

  updateStatus(params: {
    movementId: string;
    status: MovementStatus;
    releasedBy?: string | null;
    releasedAt?: string | null;
    reasonCode?: string | null;
    remarks?: string | null;
    balanceBefore?: string | null;
    balanceAfter?: string | null;
  }): void {
    this.db
      .prepare(
        `UPDATE balance_movements
         SET status = @status, released_by = @releasedBy, released_at = @releasedAt,
             reason_code = @reasonCode, remarks = @remarks,
             balance_before = @balanceBefore, balance_after = @balanceAfter
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
      });
  }

  /** B3's own Checker acknowledgment (2026-08-15) — sets acknowledged_by/acknowledged_at only, never touches status. */
  acknowledge(params: { movementId: string; acknowledgedBy: string; acknowledgedAt: string }): void {
    this.db
      .prepare('UPDATE balance_movements SET acknowledged_by = @acknowledgedBy, acknowledged_at = @acknowledgedAt WHERE movement_id = @movementId')
      .run(params);
  }
}
