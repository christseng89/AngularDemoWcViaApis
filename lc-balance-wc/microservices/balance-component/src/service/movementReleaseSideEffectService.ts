import { BATCH_MAKER_ACTOR } from '../config';
import { IllegalStateTransitionError } from '../errors';
import type { BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { BalanceContract, BalanceMovement } from '../types';
import type { CreateMovementRequest, CreateMovementResult } from './balanceService';
import { ContractLifecycleEligibilityService } from './contractLifecycleEligibilityService';

export interface ReleaseSideEffectCommandPort {
  createMovement(request: CreateMovementRequest): CreateMovementResult;
  release(movementId: string, releasedBy: string): BalanceMovement;
}

/** Applies writes that are consequences of a successfully persisted RELEASED movement. */
export class MovementReleaseSideEffectService {
  constructor(
    private readonly contracts: BalanceContractStore,
    private readonly movements: BalanceMovementStore,
    private readonly lifecycleEligibility: ContractLifecycleEligibilityService,
    private readonly commands: ReleaseSideEffectCommandPort,
    private readonly nextEventSeq: () => number = () => Date.now(),
  ) {}

  applyStandard(movement: BalanceMovement, contract: BalanceContract, releasedBy: string, releasedAt: string): void {
    this.applyReferencedMovementEffect(movement, releasedBy, releasedAt);

    if (movement.movementType === 'CLOSE') {
      this.contracts.markClosed(contract.balanceContractId, releasedAt);
    }
    if (movement.movementType === 'EXPIRE') {
      this.contracts.markExpired(contract.balanceContractId, releasedAt);
    }
    if (movement.movementType === 'REOPEN') {
      const targetStatus = contract.expiryDate && contract.expiryDate > releasedAt ? 'ACTIVE' : 'EXPIRED';
      this.contracts.reactivate(contract.balanceContractId, targetStatus, releasedAt);
    }
  }

  applyExpiryAmendment(movement: BalanceMovement, contract: BalanceContract, releasedBy: string, releasedAt: string): void {
    if (movement.movementType !== 'AMEND_EXPIRY_DATE') return;

    if (contract.status !== 'ACTIVE' && contract.status !== 'EXPIRED') {
      throw new IllegalStateTransitionError(
        `Cannot release AMEND_EXPIRY_DATE movement ${movement.movementId} — contract status is now ${contract.status}, no longer ACTIVE or EXPIRED.`,
      );
    }
    const newExpiryDate = movement.newExpiryDate;
    if (!newExpiryDate) {
      throw new IllegalStateTransitionError(`AMEND_EXPIRY_DATE movement ${movement.movementId} has no newExpiryDate recorded.`);
    }
    if (newExpiryDate <= releasedAt) {
      throw new IllegalStateTransitionError(
        `Cannot release AMEND_EXPIRY_DATE movement ${movement.movementId} — newExpiryDate (${newExpiryDate}) is no longer strictly later than the Business Date (${releasedAt}).`,
      );
    }

    if (contract.status === 'EXPIRED') {
      this.assertExpiryExtensionHasNoOpenEvents(movement, contract);
      const expireMovement = this.findTrailingReleasedExpiry(movement, contract);
      if (expireMovement) {
        this.createAndReleaseReversal(expireMovement, releasedBy, movement.businessEventId ?? movement.movementId);
      }
    }
    this.contracts.reactivate(contract.balanceContractId, 'ACTIVE', releasedAt, newExpiryDate);
  }

  private applyReferencedMovementEffect(movement: BalanceMovement, releasedBy: string, releasedAt: string): void {
    if (!movement.referencedTransactionId) return;
    const referenced = this.movements.findById(movement.referencedTransactionId);
    const referencedContract = referenced ? this.contracts.findById(referenced.balanceContractId) : undefined;
    if (referenced && referencedContract?.instrumentType === 'EPLC_EXAMINATION' && referenced.movementType === 'CREATE') {
      this.movements.markPresentDocsConsumed({
        movementId: referenced.movementId,
        presentDocsConsumedBy: releasedBy,
        presentDocsConsumedAt: releasedAt,
      });
    }
    if (referenced && referencedContract?.instrumentType === 'IPLC_LC' && referenced.movementType === 'UTILIZE' && referenced.status === 'PENDING') {
      this.commands.release(referenced.movementId, releasedBy);
    }
  }

  private assertExpiryExtensionHasNoOpenEvents(movement: BalanceMovement, contract: BalanceContract): void {
    const { hasOpenEvents } = this.lifecycleEligibility.gatherEventTree(contract, movement.movementId);
    if (hasOpenEvents) {
      throw new IllegalStateTransitionError(
        `Cannot release Expiry Extension Amendment ${movement.movementId} — one or more Events under this LC are not yet fully resolved.`,
      );
    }
  }

  private findTrailingReleasedExpiry(movement: BalanceMovement, contract: BalanceContract): BalanceMovement | undefined {
    const ownMovements = this.movements.listByContract(contract.balanceContractId).filter((candidate) => candidate.movementId !== movement.movementId);
    const trailing = [...ownMovements].sort((left, right) => left.eventSeq - right.eventSeq).pop();
    return trailing?.status === 'RELEASED' && trailing.movementType === 'EXPIRE' ? trailing : undefined;
  }

  private createAndReleaseReversal(original: BalanceMovement, releasedBy: string, businessEventId: string): void {
    const originalContract = this.contracts.findById(original.balanceContractId)!;
    const result = this.commands.createMovement({
      instrumentType: originalContract.instrumentType,
      balanceContractId: original.balanceContractId,
      movementType: 'REVERSAL',
      eventSeq: this.nextEventSeq(),
      amount: original.ceilingAmount,
      currency: original.currency,
      reversalOfMovementId: original.movementId,
      businessEventId,
      createdBy: BATCH_MAKER_ACTOR,
    });
    if (!result.created) {
      throw new Error(`Unexpected idempotency conflict creating a REVERSAL for movement "${original.movementId}".`);
    }
    this.commands.release(result.movement.movementId, releasedBy);
  }
}
