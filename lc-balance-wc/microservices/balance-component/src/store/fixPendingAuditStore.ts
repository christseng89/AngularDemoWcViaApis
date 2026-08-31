/**
 * Repository over the fix_pending_audit table (Fix Pending §19, redesigned 2026-08-29 — same shape as
 * deletePendingAuditStore.ts's own DeletePendingAuditStore, see that file's own doc comment). Append-only
 * by construction — no update/delete method, only insert() and read methods.
 */
import type { Db } from '../db';
import type { FixPendingAuditRecord } from '../types';

interface FixPendingAuditRow {
  audit_id: string;
  edit_seq: number;
  movement_id: string;
  balance_contract_id: string;
  event_seq: number;
  original_created_by: string;
  original_created_at: string;
  status_before: 'PENDING' | 'REJECTED';
  before_snapshot: string;
  after_snapshot: string;
  edited_by: string;
  edited_at: string;
}

function rowToRecord(row: FixPendingAuditRow): FixPendingAuditRecord {
  return {
    auditId: row.audit_id,
    editSeq: row.edit_seq,
    movementId: row.movement_id,
    balanceContractId: row.balance_contract_id,
    eventSeq: row.event_seq,
    originalCreatedBy: row.original_created_by,
    originalCreatedAt: row.original_created_at,
    statusBefore: row.status_before,
    beforeSnapshot: JSON.parse(row.before_snapshot) as Record<string, unknown>,
    afterSnapshot: JSON.parse(row.after_snapshot) as Record<string, unknown>,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
  };
}

export class FixPendingAuditStore {
  constructor(private readonly db: Db) {}

  /** The next `edit_seq` value for one movement — a movement may be Fix-Pending-edited more than once. */
  nextEditSeq(movementId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(edit_seq), 0) AS maxSeq FROM fix_pending_audit WHERE movement_id = ?`).get(movementId) as { maxSeq: number };
    return row.maxSeq + 1;
  }

  insert(record: FixPendingAuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO fix_pending_audit (
          audit_id, edit_seq, movement_id, balance_contract_id, event_seq,
          original_created_by, original_created_at, status_before,
          before_snapshot, after_snapshot, edited_by, edited_at
        ) VALUES (
          @auditId, @editSeq, @movementId, @balanceContractId, @eventSeq,
          @originalCreatedBy, @originalCreatedAt, @statusBefore,
          @beforeSnapshot, @afterSnapshot, @editedBy, @editedAt
        )`,
      )
      .run({
        auditId: record.auditId,
        editSeq: record.editSeq,
        movementId: record.movementId,
        balanceContractId: record.balanceContractId,
        eventSeq: record.eventSeq,
        originalCreatedBy: record.originalCreatedBy,
        originalCreatedAt: record.originalCreatedAt,
        statusBefore: record.statusBefore,
        beforeSnapshot: JSON.stringify(record.beforeSnapshot),
        afterSnapshot: JSON.stringify(record.afterSnapshot),
        editedBy: record.editedBy,
        editedAt: record.editedAt,
      });
  }

  /** Every Fix Pending Save ever recorded against one specific movement, oldest first. */
  listByMovement(movementId: string): FixPendingAuditRecord[] {
    const rows = this.db.prepare(`SELECT * FROM fix_pending_audit WHERE movement_id = ? ORDER BY edited_at ASC`).all(movementId) as unknown as FixPendingAuditRow[];
    return rows.map(rowToRecord);
  }

  /** Every Fix Pending Save across every movement under one contract — the "full Fix Pending history for this LC" query. */
  listByContract(balanceContractId: string): FixPendingAuditRecord[] {
    const rows = this.db.prepare(`SELECT * FROM fix_pending_audit WHERE balance_contract_id = ? ORDER BY edited_at ASC`).all(balanceContractId) as unknown as FixPendingAuditRow[];
    return rows.map(rowToRecord);
  }
}
