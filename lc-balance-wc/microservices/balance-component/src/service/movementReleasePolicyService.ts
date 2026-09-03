import type Decimal from 'decimal.js';
import { domesticNonBusinessDayReason } from '../domain/domesticCalendar';
import { computeReopenRestoreAmount } from '../domain/reopenRestoration';
import { IllegalStateTransitionError, RequestValidationError } from '../errors';
import { parseMonetaryAmount } from '../money';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceContract, BalanceMovement } from '../types';
import { ContractLifecycleEligibilityService } from './contractLifecycleEligibilityService';
import {
  MovementRequestValidator,
  NATURAL_KEY_FIELDS_BY_INSTRUMENT,
  SECONDARY_REF_REQUIRED_MOVEMENT_TYPES,
  TENOR_TYPE_REQUIRED_PAIRS,
} from './movementRequestValidator';

/** Read-only release policies. No status or contract write may be performed here. */
export class MovementReleasePolicyService {
  constructor(
    private readonly movements: BalanceMovementStore,
    private readonly contracts: BalanceContractStore,
    private readonly validator: MovementRequestValidator,
    private readonly lifecycleEligibility: ContractLifecycleEligibilityService,
    private readonly isCreatingMovement: (movementType: string) => boolean,
  ) {}

  assertSubmitGuards(movement: BalanceMovement, contract: BalanceContract, isUtilizeFinalize: boolean): void {
    // The client-facing AMEND_EXPIRY_DATE request is always amount=0. For an EXPIRED contract the server
    // replaces it at Submit with the protected EXPIRE restoration amount and target reference, so the
    // generic "exactly 0" request guard must not reject that persisted, server-derived review record.
    if (!(movement.movementType === 'AMEND_EXPIRY_DATE' && movement.reversalOfMovementId)) {
      this.validator.assertValidAmount(movement.movementType, movement.amount);
    }
    if (SECONDARY_REF_REQUIRED_MOVEMENT_TYPES.has(movement.movementType) && !movement.sourceTransactionRef) {
      throw new RequestValidationError(`sourceTransactionRef is required for ${movement.movementType}.`);
    }

    if (this.isCreatingMovement(movement.movementType)) {
      this.validator.assertToleranceNonNegative(contract.tolerancePct);
      if (!contract.naturalKey.lcNumber) {
        throw new RequestValidationError(`naturalKey.lcNumber is required for ${movement.movementType} against ${contract.instrumentType}.`);
      }
      for (const field of NATURAL_KEY_FIELDS_BY_INSTRUMENT[contract.instrumentType] ?? []) {
        if (!contract.naturalKey[field]) {
          throw new RequestValidationError(`naturalKey.${field} is required for ${movement.movementType} against ${contract.instrumentType}.`);
        }
      }
      const pairKey = `${contract.instrumentType}:${movement.movementType}`;
      if (TENOR_TYPE_REQUIRED_PAIRS.has(pairKey)) {
        if (!contract.tenorType) {
          throw new RequestValidationError(`tenorType is required for ${movement.movementType} against ${contract.instrumentType}.`);
        }
        if (pairKey === 'IPLC_LC:ISSUE' && contract.tenorType !== 'SIGHT' && !(contract.tenorDays && contract.tenorDays > 0)) {
          throw new RequestValidationError(`tenorDays must be greater than 0 for ${contract.tenorType}.`);
        }
      }
      if (movement.movementType === 'ISSUE' && contract.expiryDate) {
        const reason = domesticNonBusinessDayReason(contract.expiryDate);
        if (reason) {
          throw new RequestValidationError(`expiryDate ${contract.expiryDate} falls on a domestic non-business day (${reason}) — pick a genuine business day.`);
        }
      }
    }

    if (isUtilizeFinalize && !movement.makerSubmittedAt) {
      throw new IllegalStateTransitionError(
        `Cannot release movement ${movement.movementId} — A4 (Sight Settlement) or A6 (Acceptance) requires ` +
          `a Maker Submit before the Checker can Release it.`,
      );
    }
  }

  assertEligibility(movement: BalanceMovement, contract: BalanceContract, before: Decimal): void {
    this.assertContractStatus(movement, contract);
    this.assertReferencedSource(movement, contract);

    if (movement.movementType === 'CLOSE') {
      const eligibility = this.lifecycleEligibility.evaluateClose(contract, movement.movementId);
      if (!eligibility.eligible) {
        throw new IllegalStateTransitionError(
          `Cannot release CLOSE movement ${movement.movementId} — eligibility no longer holds: ${eligibility.reasons.join(' ')} Cancel this CLOSE request and re-submit.`,
        );
      }
      this.assertFrozenBalance('CLOSE', movement, before);
    }

    if (movement.movementType === 'EXPIRE') {
      const eligibility = this.lifecycleEligibility.evaluateExpiry(contract, movement.movementId);
      if (!eligibility.eligible) {
        throw new IllegalStateTransitionError(
          `Cannot release EXPIRE movement ${movement.movementId} — eligibility no longer holds: ${eligibility.reasons.join(' ')} Cancel this EXPIRE request and re-submit.`,
        );
      }
      this.assertFrozenBalance('EXPIRE', movement, before);
    }

    if (movement.movementType === 'REOPEN') {
      this.assertReopenEligibility(movement, contract);
    }

    if (movement.movementType === 'AMEND_EXPIRY_DATE' && contract.status === 'EXPIRED') {
      this.assertExpiryExtensionRestoration(movement, contract);
    }

    if (contract.instrumentType === 'SHGT' && movement.movementType === 'PARTIAL_REDEEM' && !movement.businessEventId) {
      throw new IllegalStateTransitionError(
        `Cannot release movement ${movement.movementId} — A9 (Shipping Guarantee Redemption) must be Full Redeem only; ` +
          `a standalone Partial Redeem (no businessEventId) is not a legal release target.`,
      );
    }
  }

  private assertContractStatus(movement: BalanceMovement, contract: BalanceContract): void {
    const lifecycleExceptions = new Set(['CLOSE', 'EXPIRE', 'REOPEN', 'REVERSAL', 'AMEND_EXPIRY_DATE']);
    if (!lifecycleExceptions.has(movement.movementType) && contract.status !== 'ACTIVE') {
      throw new IllegalStateTransitionError(
        `Cannot release movement ${movement.movementId} — contract status is now ${contract.status}, no longer ACTIVE. Refresh the Transaction Index.`,
      );
    }
  }

  private assertExpiryExtensionRestoration(movement: BalanceMovement, contract: BalanceContract): void {
    const { hasOpenEvents } = this.lifecycleEligibility.gatherEventTree(contract, movement.movementId);
    if (hasOpenEvents) {
      throw new IllegalStateTransitionError(
        `Cannot release Expiry Extension Amendment ${movement.movementId} — one or more Events under this LC are not yet fully resolved.`,
      );
    }
    const own = this.movements
      .listByContract(contract.balanceContractId)
      .filter((candidate) => candidate.movementId !== movement.movementId && candidate.status === 'RELEASED');
    // Match Submit's balance-history rule: cancelled/rejected attempts cannot replace the RELEASED
    // EXPIRE restoration basis while this transaction waits for Checker review.
    const trailing = [...own].sort((left, right) => left.eventSeq - right.eventSeq).pop();
    const expire = trailing?.status === 'RELEASED' && trailing.movementType === 'EXPIRE' ? trailing : undefined;
    if (!expire) {
      if (movement.reversalOfMovementId || !parseMonetaryAmount(movement.ceilingAmount).isZero()) {
        throw new IllegalStateTransitionError(
          `Cannot release Expiry Extension Amendment ${movement.movementId} — the EXPIRE restoration basis has changed since Submit. Cancel it and re-submit.`,
        );
      }
      return;
    }
    if (movement.reversalOfMovementId !== expire.movementId || !parseMonetaryAmount(movement.ceilingAmount).equals(parseMonetaryAmount(expire.ceilingAmount))) {
      throw new IllegalStateTransitionError(
        `Cannot release Expiry Extension Amendment ${movement.movementId} — the EXPIRE restoration basis has changed since Submit. Cancel it and re-submit.`,
      );
    }
  }

  private assertReferencedSource(movement: BalanceMovement, contract: BalanceContract): void {
    if (!movement.referencedTransactionId) return;
    const source = this.movements.findById(movement.referencedTransactionId);
    if (!source) {
      throw new IllegalStateTransitionError(`Cannot release movement ${movement.movementId} — referenced source transaction no longer exists.`);
    }

    const sourceContract = this.contracts.findById(source.balanceContractId);
    if (contract.instrumentType === 'IPLC_ACCEPTANCE' && movement.movementType === 'CREATE') {
      const sameLc = contract.parentLogicalContractId === sourceContract?.logicalContractId;
      const eligible =
        sameLc &&
        sourceContract?.instrumentType === 'IPLC_LC' &&
        source.movementType === 'UTILIZE' &&
        Boolean(source.acknowledgedAt) &&
        Boolean(source.makerSubmittedAt) &&
        (source.status === 'PENDING' || source.status === 'RELEASED');
      if (!eligible) {
        throw new IllegalStateTransitionError(
          `Cannot release movement ${movement.movementId} — the referenced A3/A3S source is no longer the acknowledged transaction selected for this LC.`,
        );
      }
    }

    if (contract.instrumentType === 'EPLC_CONFIRMATION' && (movement.movementType === 'HONOUR' || movement.movementType === 'ACCEPT')) {
      const sameConfirmation = sourceContract?.parentLogicalContractId === contract.logicalContractId;
      const eligible =
        sameConfirmation &&
        sourceContract?.instrumentType === 'EPLC_EXAMINATION' &&
        source.movementType === 'CREATE' &&
        source.status === 'RELEASED' &&
        !source.presentDocsConsumedAt;
      if (!eligible) {
        throw new IllegalStateTransitionError(
          `Cannot release movement ${movement.movementId} — the referenced B3 source is no longer a RELEASED, unconsumed transaction for this Confirmation.`,
        );
      }
    }
  }

  private assertFrozenBalance(movementType: 'CLOSE' | 'EXPIRE', movement: BalanceMovement, before: Decimal): void {
    if (!parseMonetaryAmount(movement.ceilingAmount).equals(before)) {
      throw new IllegalStateTransitionError(
        `Cannot release ${movementType} movement ${movement.movementId} — Confirmed Balance has changed since Submit ` +
          `(was ${movement.ceilingAmount}, now ${before.toFixed()}). Cancel this ${movementType} request and re-submit with the current figure.`,
      );
    }
  }

  private assertReopenEligibility(movement: BalanceMovement, contract: BalanceContract): void {
    if (contract.status !== 'CLOSED') {
      throw new IllegalStateTransitionError(
        `Cannot release REOPEN movement ${movement.movementId} — contract status is now ${contract.status}, no longer CLOSED.`,
      );
    }
    const { hasOpenEvents } = this.lifecycleEligibility.gatherEventTree(contract, movement.movementId);
    if (hasOpenEvents) {
      throw new IllegalStateTransitionError(
        `Cannot release REOPEN movement ${movement.movementId} — one or more Events under this LC are not yet fully resolved.`,
      );
    }
    const currentRestoreAmount = computeReopenRestoreAmount(
      this.movements.listByContract(contract.balanceContractId).filter((candidate) => candidate.movementId !== movement.movementId),
    );
    if (!parseMonetaryAmount(movement.ceilingAmount).equals(currentRestoreAmount)) {
      throw new IllegalStateTransitionError(
        `Cannot release REOPEN movement ${movement.movementId} — the amount to restore has changed since Submit ` +
          `(was ${movement.ceilingAmount}, now ${currentRestoreAmount.toFixed()}). Cancel this Reopen request and re-submit with the current figure.`,
      );
    }
  }
}
