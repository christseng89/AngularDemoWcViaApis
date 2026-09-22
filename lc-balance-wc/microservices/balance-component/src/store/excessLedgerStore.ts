import Decimal from 'decimal.js';
import type { Db } from '../db';
import { formatMonetaryAmount, parseMonetaryAmount } from '../money';
import type { ExcessAllocation, ExcessAllowanceAggregate, ExcessLedgerEvent, ExcessLedgerEventType } from '../types';

interface ExcessEventRow {
  excess_event_id: string;
  excess_account_id: string;
  movement_id: string | null;
  event_type: ExcessLedgerEventType;
  transaction_currency: string;
  transaction_amount: string;
  covered_amount: string;
  excess_amount: string;
  amount_usd: string;
  policy_version: string;
  source_excess_event_id: string | null;
  created_by: string;
  created_at: string;
}

interface ExcessAllocationRow {
  excess_allocation_id: string;
  adjustment_event_id: string;
  approved_excess_event_id: string;
  transaction_amount: string;
  amount_usd: string;
  created_at: string;
}

function toEvent(row: ExcessEventRow): ExcessLedgerEvent {
  return {
    excessEventId: row.excess_event_id,
    excessAccountId: row.excess_account_id,
    movementId: row.movement_id,
    eventType: row.event_type,
    transactionCurrency: row.transaction_currency,
    transactionAmount: row.transaction_amount,
    coveredAmount: row.covered_amount,
    excessAmount: row.excess_amount,
    amountUsd: row.amount_usd,
    policyVersion: row.policy_version,
    sourceExcessEventId: row.source_excess_event_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toAllocation(row: ExcessAllocationRow): ExcessAllocation {
  return {
    excessAllocationId: row.excess_allocation_id,
    adjustmentEventId: row.adjustment_event_id,
    approvedExcessEventId: row.approved_excess_event_id,
    transactionAmount: row.transaction_amount,
    amountUsd: row.amount_usd,
    createdAt: row.created_at,
  };
}

export class ExcessLedgerStore {
  constructor(private readonly db: Db) {}

  insert(event: ExcessLedgerEvent): void {
    this.db
      .prepare(
        `INSERT INTO excess_ledger_events (
          excess_event_id, excess_account_id, movement_id, event_type, transaction_currency,
          transaction_amount, covered_amount, excess_amount, amount_usd, policy_version,
          source_excess_event_id, created_by, created_at
        ) VALUES (
          @excessEventId, @excessAccountId, @movementId, @eventType, @transactionCurrency,
          @transactionAmount, @coveredAmount, @excessAmount, @amountUsd, @policyVersion,
          @sourceExcessEventId, @createdBy, @createdAt
        )`,
      )
      .run({
        excessEventId: event.excessEventId,
        excessAccountId: event.excessAccountId,
        movementId: event.movementId,
        eventType: event.eventType,
        transactionCurrency: event.transactionCurrency,
        transactionAmount: event.transactionAmount,
        coveredAmount: event.coveredAmount,
        excessAmount: event.excessAmount,
        amountUsd: event.amountUsd,
        policyVersion: event.policyVersion,
        sourceExcessEventId: event.sourceExcessEventId,
        createdBy: event.createdBy,
        createdAt: event.createdAt,
      });
  }

  insertAllocation(allocation: ExcessAllocation): void {
    this.db
      .prepare(
        `INSERT INTO excess_allocations (
          excess_allocation_id, adjustment_event_id, approved_excess_event_id,
          transaction_amount, amount_usd, created_at
        ) VALUES (
          @excessAllocationId, @adjustmentEventId, @approvedExcessEventId,
          @transactionAmount, @amountUsd, @createdAt
        )`,
      )
      .run({
        excessAllocationId: allocation.excessAllocationId,
        adjustmentEventId: allocation.adjustmentEventId,
        approvedExcessEventId: allocation.approvedExcessEventId,
        transactionAmount: allocation.transactionAmount,
        amountUsd: allocation.amountUsd,
        createdAt: allocation.createdAt,
      });
  }

  listByAccount(excessAccountId: string): ExcessLedgerEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM excess_ledger_events WHERE excess_account_id = ? ORDER BY created_at, rowid')
      .all(excessAccountId) as unknown as ExcessEventRow[];
    return rows.map(toEvent);
  }

  listAllocationsForApprovedEvent(approvedExcessEventId: string): ExcessAllocation[] {
    const rows = this.db
      .prepare('SELECT * FROM excess_allocations WHERE approved_excess_event_id = ? ORDER BY created_at, rowid')
      .all(approvedExcessEventId) as unknown as ExcessAllocationRow[];
    return rows.map(toAllocation);
  }

  aggregateForAccount(excessAccountId: string): ExcessAllowanceAggregate {
    let pending = new Decimal(0);
    let approved = new Decimal(0);
    for (const event of this.listByAccount(excessAccountId)) {
      const amount = parseMonetaryAmount(event.amountUsd);
      if (event.eventType === 'PENDING_RESERVATION') pending = pending.plus(amount);
      if (event.eventType === 'RESERVATION_RELEASE') pending = pending.minus(amount);
      if (event.eventType === 'APPROVED_UTILIZATION') approved = approved.plus(amount);
      if (['FORMAL_INCREASE_REGULARIZATION', 'RETURN_REVERSAL', 'CANCELLATION_REVERSAL'].includes(event.eventType)) approved = approved.minus(amount);
    }
    return {
      pendingReservedUsd: formatMonetaryAmount(pending, 2),
      approvedUtilizedUsd: formatMonetaryAmount(approved, 2),
    };
  }
}
