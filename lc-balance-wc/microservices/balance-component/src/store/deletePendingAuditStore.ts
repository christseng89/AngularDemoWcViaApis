/**
 * Repository over the delete_pending_audit table (Fix Pending/Delete Pending Phase — analysis/
 * Balance-Component-FixPending-DeletePending-Proposal-zh.md §10, BA/business-directed 2026-08-27).
 * Append-only by construction — this store has no update/delete method, only insert() and read
 * methods, mirroring balanceMovementStore.ts's own "never physically deletes a row" posture but taken
 * one step further here: there is no legal action that ever mutates an existing row at all.
 */
import type { Db } from '../db';
import type { DeletePendingAuditRecord, DeletePendingAuditWithContract, InstrumentType } from '../types';

interface DeletePendingAuditRow {
  audit_id: string;
  delete_seq: number;
  movement_id: string;
  balance_contract_id: string;
  event_seq: number;
  movement_type: string;
  source_transaction_ref: string | null;
  status_before: 'PENDING' | 'REJECTED';
  cancelled_by: string;
  cancelled_at: string;
  reason_code: string | null;
  remarks: string | null;
}

interface DeletePendingAuditWithContractRow extends DeletePendingAuditRow {
  instrument_type: InstrumentType;
  lc_number: string;
  ib_number: string | null;
  sg_number: string | null;
}

function rowToRecord(row: DeletePendingAuditRow): DeletePendingAuditRecord {
  return {
    auditId: row.audit_id,
    deleteSeq: row.delete_seq,
    movementId: row.movement_id,
    balanceContractId: row.balance_contract_id,
    eventSeq: row.event_seq,
    movementType: row.movement_type,
    sourceTransactionRef: row.source_transaction_ref,
    statusBefore: row.status_before,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    reasonCode: row.reason_code,
    remarks: row.remarks,
  };
}

function rowToRecordWithContract(row: DeletePendingAuditWithContractRow): DeletePendingAuditWithContract {
  return {
    ...rowToRecord(row),
    instrumentType: row.instrument_type,
    lcNumber: row.lc_number,
    ibNumber: row.ib_number,
    sgNumber: row.sg_number,
  };
}

export class DeletePendingAuditStore {
  constructor(private readonly db: Db) {}

  /**
   * The next `delete_seq` value for one natural key (instrumentType/lcNumber/ibNumber/sgNumber) —
   * NOT balanceContractId, since A1/B1's own LC-reuse fix gives every Resubmit-after-Delete-Pending a
   * brand new balanceContractId while the natural key stays the same (see schema.ts's own doc comment
   * on this column). `ibNumber`/`sgNumber` are compared via COALESCE(..., '') so two NULLs (e.g. a plain
   * IPLC_LC/EPLC_LC contract, which has neither) are treated as equal, not as "unknown, never matches"
   * (SQL's normal NULL semantics would otherwise make every such comparison false).
   */
  nextDeleteSeq(instrumentType: string, lcNumber: string, ibNumber: string | null, sgNumber: string | null): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(d.delete_seq), 0) AS maxSeq
         FROM delete_pending_audit d
         JOIN balance_contracts c ON c.balance_contract_id = d.balance_contract_id
         WHERE c.instrument_type = @instrumentType
           AND c.lc_number = @lcNumber
           AND COALESCE(c.ib_number, '') = COALESCE(@ibNumber, '')
           AND COALESCE(c.sg_number, '') = COALESCE(@sgNumber, '')`,
      )
      .get({ instrumentType, lcNumber, ibNumber, sgNumber }) as { maxSeq: number };
    return row.maxSeq + 1;
  }

  insert(record: DeletePendingAuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO delete_pending_audit (
          audit_id, delete_seq, movement_id, balance_contract_id, event_seq, movement_type, source_transaction_ref,
          status_before, cancelled_by, cancelled_at, reason_code, remarks
        ) VALUES (
          @auditId, @deleteSeq, @movementId, @balanceContractId, @eventSeq, @movementType, @sourceTransactionRef,
          @statusBefore, @cancelledBy, @cancelledAt, @reasonCode, @remarks
        )`,
      )
      .run({
        auditId: record.auditId,
        deleteSeq: record.deleteSeq,
        movementId: record.movementId,
        balanceContractId: record.balanceContractId,
        eventSeq: record.eventSeq,
        movementType: record.movementType,
        sourceTransactionRef: record.sourceTransactionRef ?? null,
        statusBefore: record.statusBefore,
        cancelledBy: record.cancelledBy,
        cancelledAt: record.cancelledAt,
        reasonCode: record.reasonCode ?? null,
        remarks: record.remarks ?? null,
      });
  }

  /** Every Delete Pending event ever recorded against one specific movement — a compound function's own leg is cancelled at most once (CANCELLED is terminal, statusTransition.ts), so this is normally 0 or 1 row, but the store itself makes no such assumption. */
  listByMovement(movementId: string): DeletePendingAuditRecord[] {
    const rows = this.db.prepare(`SELECT * FROM delete_pending_audit WHERE movement_id = ? ORDER BY cancelled_at ASC`).all(movementId) as unknown as DeletePendingAuditRow[];
    return rows.map(rowToRecord);
  }

  /** Every Delete Pending event across every movement/version under one contract — the "full Delete Pending history for this LC" query. */
  listByContract(balanceContractId: string): DeletePendingAuditRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM delete_pending_audit WHERE balance_contract_id = ? ORDER BY cancelled_at ASC`)
      .all(balanceContractId) as unknown as DeletePendingAuditRow[];
    return rows.map(rowToRecord);
  }

  /**
   * Inquire Delete Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11) —
   * paginated, filtered query joined with each row's own contract natural key, for the dedicated
   * "Inquire Delete Pending" audit screen (independent of Inquire Events). Filters are optional and
   * built up dynamically (node:sqlite rejects a bound object containing a named parameter the query text
   * never references — same convention as BalanceContractStore.listCatalog()). Function is deliberately
   * NOT a filter param — it has no column of its own; the Angular client filters client-side on the
   * fetched page, same convention as CatalogPickerService (§11.2(c), business-confirmed).
   *
   * Fixed sort order (business-specified, §11 of the proposal doc): lc_number, then the contract's own
   * secondary natural key (ib_number or sg_number — COALESCE'd together since a contract only ever has
   * one of the two, or neither), then cancelled_at, then audit_id — so repeated Delete Pending cycles
   * against the same LC/IB/SG display consecutively.
   */
  search(filter: { lcNumber?: string; deletedBy?: string; from?: string; to?: string; page?: number; pageSize?: number }): {
    items: DeletePendingAuditWithContract[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const clauses: string[] = [];
    const whereParams: Record<string, string> = {};
    if (filter.lcNumber) {
      clauses.push('c.lc_number = @lcNumber');
      whereParams.lcNumber = filter.lcNumber;
    }
    if (filter.deletedBy) {
      clauses.push('d.cancelled_by = @deletedBy');
      whereParams.deletedBy = filter.deletedBy;
    }
    if (filter.from) {
      clauses.push('d.cancelled_at >= @from');
      whereParams.from = filter.from;
    }
    if (filter.to) {
      clauses.push('d.cancelled_at <= @to');
      whereParams.to = filter.to;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM delete_pending_audit d JOIN balance_contracts c ON c.balance_contract_id = d.balance_contract_id ${where}`)
      .get(whereParams) as { n: number } | undefined;
    const total = totalRow?.n ?? 0;

    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const pageSize = filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 10;
    const offset = (page - 1) * pageSize;

    const rows = this.db
      .prepare(
        `SELECT d.*, c.instrument_type, c.lc_number, c.ib_number, c.sg_number
         FROM delete_pending_audit d
         JOIN balance_contracts c ON c.balance_contract_id = d.balance_contract_id
         ${where}
         ORDER BY c.lc_number ASC, COALESCE(c.ib_number, c.sg_number, '') ASC, d.cancelled_at ASC, d.audit_id ASC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...whereParams, limit: pageSize, offset }) as unknown as DeletePendingAuditWithContractRow[];

    return { items: rows.map(rowToRecordWithContract), total, page, pageSize };
  }
}
