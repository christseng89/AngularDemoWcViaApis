import Decimal from 'decimal.js';
import type { Db } from '../db';
import { formatMonetaryAmount, parseMonetaryAmount } from '../money';
import type {
  ExcessAllowanceAggregate,
  ExcessLedgerEvent,
  ExcessLedgerEventType,
  LegacyExcessAllocation,
  LegacyExcessReversalEvent,
  LegacyFormalIncreaseEvent,
} from '../types';

const LEGACY_REVERSAL_EVENT_TYPES = ['RETURN_REVERSAL', 'CANCELLATION_REVERSAL'] as const;

function isLegacyReversalEventType(eventType: string): eventType is LegacyExcessReversalEvent['eventType'] {
  return (LEGACY_REVERSAL_EVENT_TYPES as readonly string[]).includes(eventType);
}

interface ExcessEventRow {
  excess_event_id: string;
  excess_account_id: string;
  movement_id: string | null;
  event_type: string;
  owner_currency: string;
  transaction_amount_owner: string;
  covered_amount_owner: string;
  excess_amount_owner: string;
  allowance_amount_owner: string;
  policy_version: string;
  source_excess_event_id: string | null;
  created_by: string;
  created_at: string;
}

interface LegacyExcessEventRow {
  excess_event_id: string;
  excess_account_id: string;
  movement_id: string | null;
  event_type: string;
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
  if (row.event_type === 'FORMAL_INCREASE_REGULARIZATION' || isLegacyReversalEventType(row.event_type)) {
    throw new Error(`Legacy ${row.event_type} event cannot enter the active ledger API.`);
  }
  return {
    excessEventId: row.excess_event_id,
    excessAccountId: row.excess_account_id,
    movementId: row.movement_id,
    eventType: row.event_type as ExcessLedgerEventType,
    ownerCurrency: row.owner_currency,
    transactionAmountOwner: row.transaction_amount_owner,
    coveredAmountOwner: row.covered_amount_owner,
    excessAmountOwner: row.excess_amount_owner,
    amountOwner: row.allowance_amount_owner,
    policyVersion: row.policy_version,
    sourceExcessEventId: row.source_excess_event_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toLegacyReversalEvent(row: LegacyExcessEventRow): LegacyExcessReversalEvent {
  if (!isLegacyReversalEventType(row.event_type)) throw new Error('Expected a legacy Excess reversal event.');
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

function toLegacyFormalIncreaseEvent(row: LegacyExcessEventRow): LegacyFormalIncreaseEvent {
  if (row.event_type !== 'FORMAL_INCREASE_REGULARIZATION') throw new Error('Expected a legacy Formal Increase event.');
  return {
    excessEventId: row.excess_event_id,
    excessAccountId: row.excess_account_id,
    movementId: row.movement_id,
    eventType: 'FORMAL_INCREASE_REGULARIZATION',
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

function toLegacyAllocation(row: ExcessAllocationRow): LegacyExcessAllocation {
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
    const eventType = event.eventType as string;
    if (isLegacyReversalEventType(eventType)) throw new Error(`${eventType} disabled by BD-07.`);
    this.db
      .prepare(
        `INSERT INTO excess_ledger_events (
          excess_event_id, excess_account_id, movement_id, event_type, owner_currency,
          transaction_amount_owner, covered_amount_owner, excess_amount_owner, allowance_amount_owner, policy_version,
          source_excess_event_id, created_by, created_at
        ) VALUES (
          @excessEventId, @excessAccountId, @movementId, @eventType, @ownerCurrency,
          @transactionAmountOwner, @coveredAmountOwner, @excessAmountOwner, @amountOwner, @policyVersion,
          @sourceExcessEventId, @createdBy, @createdAt
        )`,
      )
      .run({
        excessEventId: event.excessEventId,
        excessAccountId: event.excessAccountId,
        movementId: event.movementId,
        eventType: event.eventType,
        ownerCurrency: event.ownerCurrency,
        transactionAmountOwner: event.transactionAmountOwner,
        coveredAmountOwner: event.coveredAmountOwner,
        excessAmountOwner: event.excessAmountOwner,
        amountOwner: event.amountOwner,
        policyVersion: event.policyVersion,
        sourceExcessEventId: event.sourceExcessEventId,
        createdBy: event.createdBy,
        createdAt: event.createdAt,
      });
  }

  listByAccount(excessAccountId: string): ExcessLedgerEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM excess_ledger_events
         WHERE excess_account_id = ?
           AND event_type NOT IN ('FORMAL_INCREASE_REGULARIZATION', 'RETURN_REVERSAL', 'CANCELLATION_REVERSAL')
         ORDER BY created_at, rowid`,
      )
      .all(excessAccountId) as unknown as ExcessEventRow[];
    return rows.map(toEvent);
  }

  /**
   * Returns the immutable reservation facts for one movement that have not yet
   * been paired with a RESERVATION_RELEASE. Fix Pending may leave historical
   * reservation/release pairs, so callers must resolve by source event id rather
   * than assuming the first PENDING_RESERVATION row is still active.
   */
  listOutstandingReservationsByMovement(movementId: string): ExcessLedgerEvent[] {
    const rows = this.db
      .prepare(
        `SELECT pending.*
         FROM excess_ledger_events pending
         WHERE pending.movement_id = ?
           AND pending.event_type = 'PENDING_RESERVATION'
           AND NOT EXISTS (
             SELECT 1
             FROM excess_ledger_events release
             WHERE release.event_type = 'RESERVATION_RELEASE'
               AND release.source_excess_event_id = pending.excess_event_id
           )
         ORDER BY pending.created_at, pending.rowid`,
      )
      .all(movementId) as unknown as ExcessEventRow[];
    return rows.map(toEvent);
  }

  findApprovedUtilizationByMovement(movementId: string): ExcessLedgerEvent | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM excess_ledger_events
         WHERE movement_id = ? AND event_type = 'APPROVED_UTILIZATION'
         ORDER BY rowid DESC LIMIT 1`,
      )
      .get(movementId) as ExcessEventRow | undefined;
    return row ? toEvent(row) : undefined;
  }

  listLegacyFormalIncreaseEventsByAccount(excessAccountId: string): LegacyFormalIncreaseEvent[] {
    if (!this.legacyLedgerExists()) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM legacy_pre_v4_excess_ledger_events
         WHERE excess_account_id = ? AND event_type = 'FORMAL_INCREASE_REGULARIZATION'
         ORDER BY created_at, rowid`,
      )
      .all(excessAccountId) as unknown as LegacyExcessEventRow[];
    return rows.map(toLegacyFormalIncreaseEvent);
  }

  listLegacyReversalEventsByAccount(excessAccountId: string): LegacyExcessReversalEvent[] {
    if (!this.legacyLedgerExists()) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM legacy_pre_v4_excess_ledger_events
         WHERE excess_account_id = ? AND event_type IN ('RETURN_REVERSAL', 'CANCELLATION_REVERSAL')
         ORDER BY created_at, rowid`,
      )
      .all(excessAccountId) as unknown as LegacyExcessEventRow[];
    return rows.map(toLegacyReversalEvent);
  }

  listLegacyAllocationsForApprovedEvent(approvedExcessEventId: string): LegacyExcessAllocation[] {
    const legacyTable = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legacy_excess_allocations'").get();
    if (!legacyTable) return [];
    const rows = this.db
      .prepare('SELECT * FROM legacy_excess_allocations WHERE approved_excess_event_id = ? ORDER BY created_at, rowid')
      .all(approvedExcessEventId) as unknown as ExcessAllocationRow[];
    return rows.map(toLegacyAllocation);
  }

  aggregateForAccount(excessAccountId: string, ownerCurrencyPrecision: number): ExcessAllowanceAggregate {
    return this.aggregateEvents(this.listByAccount(excessAccountId), ownerCurrencyPrecision);
  }

  aggregateForAccountExcludingMovement(excessAccountId: string, movementId: string, ownerCurrencyPrecision: number): ExcessAllowanceAggregate {
    return this.aggregateEvents(
      this.listByAccount(excessAccountId).filter((event) => event.movementId !== movementId),
      ownerCurrencyPrecision,
    );
  }

  private aggregateEvents(events: readonly ExcessLedgerEvent[], ownerCurrencyPrecision: number): ExcessAllowanceAggregate {
    let pending = new Decimal(0);
    let approved = new Decimal(0);
    for (const event of events) {
      const amount = parseMonetaryAmount(event.amountOwner);
      if (event.eventType === 'PENDING_RESERVATION') pending = pending.plus(amount);
      if (event.eventType === 'RESERVATION_RELEASE') pending = pending.minus(amount);
      if (event.eventType === 'APPROVED_UTILIZATION') approved = approved.plus(amount);
    }
    return {
      pendingReservedOwner: formatMonetaryAmount(pending, ownerCurrencyPrecision),
      approvedUtilizedOwner: formatMonetaryAmount(approved, ownerCurrencyPrecision),
    };
  }

  private legacyLedgerExists(): boolean {
    return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legacy_pre_v4_excess_ledger_events'").get();
  }
}
