import { CurrencyMismatchError } from '../errors';
import { formatMonetaryAmount, parseMonetaryAmount, ZERO } from '../money';
import type { ExcessFunctionCode } from '../types';
import { computeCoveredAndExcess } from './excessPolicy';

interface ExcessFunctionCapacityBase {
  functionCode: ExcessFunctionCode;
  transactionCurrency: string;
  ownerCurrency: string;
}

export interface A3CapacityInput extends ExcessFunctionCapacityBase {
  functionCode: 'A3';
  importLcTightAvailableOwner: string;
}

export interface A3SCapacityInput extends ExcessFunctionCapacityBase {
  functionCode: 'A3S';
  /** Parent Tight normalized to exclude this A3S event's own SG redemption and LC UTILIZE legs. */
  baseParentTightAvailableOwner: string;
  /** Redemption amount produced by the existing main A3S Shipping Guarantee flow. */
  currentSgRedemptionAmountOwner: string;
}

export interface B3CapacityInput extends ExcessFunctionCapacityBase {
  functionCode: 'B3';
  confirmationTightAvailableOwner: string;
}

export type ExcessFunctionCapacityInput = A3CapacityInput | A3SCapacityInput | B3CapacityInput;
export type ExcessFunctionSplitInput = ExcessFunctionCapacityInput & { transactionAmountOwner: string };

export interface ExcessFunctionCapacityResult {
  functionCode: ExcessFunctionCode;
  ownerCurrency: string;
  authoritativeCoveredCapacityOwner: string;
}

export interface ExcessFunctionSplitResult extends ExcessFunctionCapacityResult {
  coveredAmountOwner: string;
  proposedExcessOwner: string;
}

/**
 * V2 precondition. Call this before policy routing, Currency Exchange, or persistence.
 * The Excess-enabled functions are single-currency owner movements; no transaction→owner FX leg exists.
 */
export function assertExcessOwnerCurrencyInvariant(input: ExcessFunctionCapacityInput): void {
  if (input.transactionCurrency === input.ownerCurrency) return;
  const ownerLabel = input.functionCode === 'B3' ? 'Export Confirmation' : 'Import LC';
  throw new CurrencyMismatchError(
    `${input.functionCode} transaction currency ${input.transactionCurrency} must equal ${ownerLabel} owner currency ${input.ownerCurrency}`,
  );
}

/** Resolves only function-specific covered capacity; shared Covered／Excess and allowance math stays centralized. */
export function deriveExcessFunctionCapacity(input: ExcessFunctionCapacityInput): ExcessFunctionCapacityResult {
  assertExcessOwnerCurrencyInvariant(input);

  let capacity;
  switch (input.functionCode) {
    case 'A3':
      capacity = parseMonetaryAmount(input.importLcTightAvailableOwner);
      break;
    case 'A3S': {
      const baseParentTight = nonNegativeFloor(input.baseParentTightAvailableOwner);
      const currentSgRedemption = nonNegativeFloor(input.currentSgRedemptionAmountOwner);
      capacity = baseParentTight.plus(currentSgRedemption);
      break;
    }
    case 'B3':
      capacity = parseMonetaryAmount(input.confirmationTightAvailableOwner);
      break;
  }

  return {
    functionCode: input.functionCode,
    ownerCurrency: input.ownerCurrency,
    authoritativeCoveredCapacityOwner: formatMonetaryAmount(capacity),
  };
}

/** Produces the pre-FX owner-currency split. A successful return is safe to pass to the later FX gate. */
export function prepareExcessFunctionSplit(input: ExcessFunctionSplitInput): ExcessFunctionSplitResult {
  const capacity = deriveExcessFunctionCapacity(input);
  const split = computeCoveredAndExcess({
    transactionAmount: input.transactionAmountOwner,
    effectiveCapacity: capacity.authoritativeCoveredCapacityOwner,
  });
  return {
    ...capacity,
    coveredAmountOwner: split.coveredAmount,
    proposedExcessOwner: split.excessAmount,
  };
}

function nonNegativeFloor(value: string) {
  const amount = parseMonetaryAmount(value);
  return amount.isNegative() ? ZERO : amount;
}
