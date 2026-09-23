import type { Db } from '../db';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { ExcessAccountStore } from '../store/excessAccountStore';
import { ExcessLedgerStore } from '../store/excessLedgerStore';
import { CommandIdempotencyStore } from '../store/commandIdempotencyStore';
import { FxRateSnapshotStore } from '../store/fxRateSnapshotStore';
import { ExcessDecisionSnapshotStore } from '../store/excessDecisionSnapshotStore';
import type {
  LockedExcessAllowance,
  MakerExcessAtomicTransaction,
  MakerExcessIdempotencyScope,
  MakerExcessPersistenceBundle,
  MakerExcessSubmitCommand,
} from './makerExcessSubmitService';
import type { ExcessAllowanceOwnerType } from '../config/excessPolicyConfig';

export interface UnitOfWork {
  execute<T>(operation: () => T): T;
}

/** SQLite implementation used by business commands that must update several ledgers atomically. */
export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Db) {}

  execute<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export class MakerExcessConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MakerExcessConcurrencyError';
  }
}

export interface SqliteMakerExcessUnitOfWorkDependencies {
  readFactsVersion(command: MakerExcessSubmitCommand): string;
  insertMovement(bundle: MakerExcessPersistenceBundle): void;
  now(): string;
  newId?(): string;
}

class SqliteMakerExcessTransaction implements MakerExcessAtomicTransaction {
  private readonly accounts: ExcessAccountStore;
  private readonly ledger: ExcessLedgerStore;
  private readonly idempotency: CommandIdempotencyStore;
  private readonly fxSnapshots: FxRateSnapshotStore;
  private readonly decisions: ExcessDecisionSnapshotStore;

  constructor(
    private readonly db: Db,
    private readonly dependencies: SqliteMakerExcessUnitOfWorkDependencies,
  ) {
    this.accounts = new ExcessAccountStore(db);
    this.ledger = new ExcessLedgerStore(db);
    this.idempotency = new CommandIdempotencyStore(db);
    this.fxSnapshots = new FxRateSnapshotStore(db);
    this.decisions = new ExcessDecisionSnapshotStore(db);
  }

  claimIdempotency(scope: MakerExcessIdempotencyScope) {
    const result = this.idempotency.resolve(scope);
    return result.kind === 'MISS' ? ({ kind: 'CLAIMED' } as const) : result;
  }

  assertCurrentFactsVersion(command: MakerExcessSubmitCommand, expectedFactsVersion: string): void {
    if (this.dependencies.readFactsVersion(command) !== expectedFactsVersion) {
      throw new MakerExcessConcurrencyError('Current Excess facts changed before atomic persistence.');
    }
  }

  lockAllowance(
    ownerType: ExcessAllowanceOwnerType,
    ownerId: string,
    ownerCurrency: string,
    ownerCurrencyPrecision: number,
    policyVersion: string,
  ): LockedExcessAllowance {
    let account = this.accounts.getByOwner(ownerType, ownerId);
    if (!account) {
      const now = this.dependencies.now();
      account = {
        excessAccountId: this.newId(),
        ownerType,
        ownerId,
        ownerCurrency,
        policyVersion,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.accounts.insert(account);
    }
    if (account.ownerCurrency !== ownerCurrency) throw new MakerExcessConcurrencyError('Allowance owner currency changed.');
    const aggregate = this.ledger.aggregateForAccount(account.excessAccountId, ownerCurrencyPrecision);
    return {
      excessAccountId: account.excessAccountId,
      version: account.version,
      approvedUtilizedOwner: aggregate.approvedUtilizedOwner,
      otherPendingReservedOwner: aggregate.pendingReservedOwner,
    };
  }

  persist(bundle: MakerExcessPersistenceBundle): void {
    const now = this.dependencies.now();
    this.dependencies.insertMovement(bundle);
    this.fxSnapshots.insert({
      fxSnapshotId: this.newId(),
      movementId: bundle.movementId,
      decisionPoint: 'MAKER_SUBMIT',
      quote: bundle.fxSnapshot,
      createdAt: now,
    });
    this.ledger.insert({
      excessEventId: this.newId(),
      excessAccountId: bundle.excessAccountId,
      movementId: bundle.movementId,
      eventType: 'PENDING_RESERVATION',
      ownerCurrency: bundle.ownerCurrency,
      transactionAmountOwner: new Decimal(bundle.coveredAmountOwner).plus(bundle.excessAmountOwner).toFixed(),
      coveredAmountOwner: bundle.coveredAmountOwner,
      excessAmountOwner: bundle.excessAmountOwner,
      amountOwner: bundle.excessAmountOwner,
      policyVersion: bundle.policySnapshot.policyVersion,
      sourceExcessEventId: null,
      createdBy: bundle.audit.actorContext,
      createdAt: now,
    });
    this.decisions.insert(bundle, now);
    this.idempotency.insert(
      {
        commandType: bundle.idempotency.commandType,
        ownerId: bundle.idempotency.ownerId,
        actorContext: bundle.idempotency.actorContext,
        key: bundle.idempotency.key,
        requestHash: bundle.idempotency.requestHash,
      },
      bundle.idempotency.response,
      now,
    );
    if (!this.accounts.advanceVersion(bundle.excessAccountId, bundle.expectedAccountVersion, bundle.policySnapshot.policyVersion, now)) {
      throw new MakerExcessConcurrencyError('Allowance account version changed before commit.');
    }
  }

  private newId(): string {
    return this.dependencies.newId?.() ?? randomUUID();
  }
}

export class SqliteMakerExcessUnitOfWork {
  constructor(
    private readonly db: Db,
    private readonly dependencies: SqliteMakerExcessUnitOfWorkDependencies,
  ) {}

  execute<T>(operation: (transaction: MakerExcessAtomicTransaction) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation(new SqliteMakerExcessTransaction(this.db, this.dependencies));
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
