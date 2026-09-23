import Decimal from 'decimal.js';
import { formatMonetaryAmount, parseMonetaryAmount, ZERO } from '../money';
import type { ExcessDecisionStatus } from '../types';

export interface CoveredAndExcessInput {
  transactionAmount: string;
  effectiveCapacity: string;
}

export interface CoveredAndExcessResult {
  coveredAmount: string;
  excessAmount: string;
}

export type ExcessProcessingRoute = 'LEGACY_SUFFICIENCY' | 'EXCESS_FRAMEWORK';

export interface ExcessProcessingRouteInput {
  configuredMaximumUsd: string;
  allowancePercentage: string;
}

/** BD-03: either zero disables Excess; both values must be strictly positive to enable it. */
export function selectExcessProcessingRoute(input: ExcessProcessingRouteInput): ExcessProcessingRoute {
  const configuredMaximumUsd = parseNonNegative(input.configuredMaximumUsd, 'configuredMaximumUsd');
  const allowancePercentage = parseNonNegative(input.allowancePercentage, 'allowancePercentage');
  return configuredMaximumUsd.isZero() || allowancePercentage.isZero() ? 'LEGACY_SUFFICIENCY' : 'EXCESS_FRAMEWORK';
}

/** v11.15: Covered=min(amount,max(capacity,0)); Excess=amount-Covered. */
export function computeCoveredAndExcess(input: CoveredAndExcessInput): CoveredAndExcessResult {
  const transactionAmount = parseMonetaryAmount(input.transactionAmount);
  if (transactionAmount.isNegative()) throw new Error('transactionAmount must be non-negative');

  const effectiveCapacity = parseMonetaryAmount(input.effectiveCapacity);
  const nonNegativeCapacity = effectiveCapacity.isNegative() ? ZERO : effectiveCapacity;
  const coveredAmount = DecimalMin(transactionAmount, nonNegativeCapacity);
  return {
    coveredAmount: formatMonetaryAmount(coveredAmount),
    excessAmount: formatMonetaryAmount(transactionAmount.minus(coveredAmount)),
  };
}

export interface EffectiveAllowanceLimitInput {
  approvedContractualMaximumOwner: string;
  allowancePercentage: string;
  configuredMaximumOwner: string;
  ownerCurrencyPrecision: number;
}

/** V4: all allowance operands and the result are denominated in the allowance owner's currency. */
export function computeEffectiveAllowanceLimitOwner(input: EffectiveAllowanceLimitInput): string {
  const precision = parseOwnerCurrencyPrecision(input.ownerCurrencyPrecision);
  const contractualMaximumOwner = parseNonNegative(input.approvedContractualMaximumOwner, 'approvedContractualMaximumOwner');
  const allowancePercentage = parseNonNegative(input.allowancePercentage, 'allowancePercentage');
  const configuredMaximumOwner = parseNonNegative(input.configuredMaximumOwner, 'configuredMaximumOwner');
  const percentageLimitOwner = contractualMaximumOwner.times(allowancePercentage).dividedBy(100).toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);
  const roundedConfiguredMaximumOwner = configuredMaximumOwner.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);
  return formatMonetaryAmount(DecimalMin(percentageLimitOwner, roundedConfiguredMaximumOwner), precision);
}

export interface EvaluateOwnerExcessAllowanceInput {
  effectiveLimitOwner: string;
  approvedUtilizedOwner: string;
  otherPendingReservedOwner: string;
  proposedExcessOwner: string;
  ownerCurrencyPrecision: number;
}

export interface EvaluateOwnerExcessAllowanceResult {
  decision: ExcessDecisionStatus;
  availableAllowanceOwner: string;
  remainingAllowanceOwner: string;
}

export function evaluateOwnerExcessAllowance(input: EvaluateOwnerExcessAllowanceInput): EvaluateOwnerExcessAllowanceResult {
  const precision = parseOwnerCurrencyPrecision(input.ownerCurrencyPrecision);
  const effectiveLimit = parseNonNegative(input.effectiveLimitOwner, 'effectiveLimitOwner');
  const approved = parseNonNegative(input.approvedUtilizedOwner, 'approvedUtilizedOwner');
  const pending = parseNonNegative(input.otherPendingReservedOwner, 'otherPendingReservedOwner');
  const proposed = parseNonNegative(input.proposedExcessOwner, 'proposedExcessOwner');
  const available = effectiveLimit.minus(approved).minus(pending);
  const nonNegativeAvailable = available.isNegative() ? ZERO : available;

  if (proposed.isZero()) {
    const availableWire = formatMonetaryAmount(nonNegativeAvailable, precision);
    return { decision: 'NOT_REQUIRED', availableAllowanceOwner: availableWire, remainingAllowanceOwner: availableWire };
  }
  if (proposed.greaterThan(nonNegativeAvailable)) {
    const availableWire = formatMonetaryAmount(nonNegativeAvailable, precision);
    return { decision: 'LIMIT_EXCEEDED', availableAllowanceOwner: availableWire, remainingAllowanceOwner: availableWire };
  }
  return {
    decision: 'WITHIN_ALLOWANCE',
    availableAllowanceOwner: formatMonetaryAmount(nonNegativeAvailable, precision),
    remainingAllowanceOwner: formatMonetaryAmount(nonNegativeAvailable.minus(proposed), precision),
  };
}

function parseOwnerCurrencyPrecision(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 3) throw new Error('ownerCurrencyPrecision must be an integer from 0 to 3');
  return value;
}

function parseNonNegative(value: string, field: string) {
  const parsed = parseMonetaryAmount(value);
  if (parsed.isNegative()) throw new Error(`${field} must be non-negative`);
  return parsed;
}

function DecimalMin<T extends ReturnType<typeof parseMonetaryAmount>>(left: T, right: T): T {
  return (left.lessThanOrEqualTo(right) ? left : right) as T;
}
