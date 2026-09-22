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
  contractualMaximumUsd: string;
  allowancePercentage: string;
  configuredMaximumUsd: string;
}

/** v11.15: Effective Limit = min(Contractual Maximum USD × Allowance %, configured USD cap). */
export function computeEffectiveAllowanceLimitUsd(input: EffectiveAllowanceLimitInput): string {
  const contractualMaximumUsd = parseNonNegative(input.contractualMaximumUsd, 'contractualMaximumUsd');
  const allowancePercentage = parseNonNegative(input.allowancePercentage, 'allowancePercentage');
  const configuredMaximumUsd = parseNonNegative(input.configuredMaximumUsd, 'configuredMaximumUsd');
  const percentageLimit = contractualMaximumUsd.times(allowancePercentage).dividedBy(100);
  return formatMonetaryAmount(DecimalMin(percentageLimit, configuredMaximumUsd), 2);
}

export interface EvaluateExcessAllowanceInput {
  effectiveLimitUsd: string;
  approvedUtilizedUsd: string;
  otherPendingReservedUsd: string;
  proposedExcessUsd: string;
}

export interface EvaluateExcessAllowanceResult {
  decision: ExcessDecisionStatus;
  availableAllowanceUsd: string;
  remainingAllowanceUsd: string;
}

export function evaluateExcessAllowance(input: EvaluateExcessAllowanceInput): EvaluateExcessAllowanceResult {
  const effectiveLimit = parseNonNegative(input.effectiveLimitUsd, 'effectiveLimitUsd');
  const approved = parseNonNegative(input.approvedUtilizedUsd, 'approvedUtilizedUsd');
  const pending = parseNonNegative(input.otherPendingReservedUsd, 'otherPendingReservedUsd');
  const proposed = parseNonNegative(input.proposedExcessUsd, 'proposedExcessUsd');
  const available = effectiveLimit.minus(approved).minus(pending);
  const nonNegativeAvailable = available.isNegative() ? ZERO : available;

  if (proposed.isZero()) {
    const availableWire = formatMonetaryAmount(nonNegativeAvailable, 2);
    return { decision: 'NOT_REQUIRED', availableAllowanceUsd: availableWire, remainingAllowanceUsd: availableWire };
  }
  if (proposed.greaterThan(nonNegativeAvailable)) {
    const availableWire = formatMonetaryAmount(nonNegativeAvailable, 2);
    return { decision: 'LIMIT_EXCEEDED', availableAllowanceUsd: availableWire, remainingAllowanceUsd: availableWire };
  }
  return {
    decision: 'WITHIN_ALLOWANCE',
    availableAllowanceUsd: formatMonetaryAmount(nonNegativeAvailable, 2),
    remainingAllowanceUsd: formatMonetaryAmount(nonNegativeAvailable.minus(proposed), 2),
  };
}

function parseNonNegative(value: string, field: string) {
  const parsed = parseMonetaryAmount(value);
  if (parsed.isNegative()) throw new Error(`${field} must be non-negative`);
  return parsed;
}

function DecimalMin<T extends ReturnType<typeof parseMonetaryAmount>>(left: T, right: T): T {
  return (left.lessThanOrEqualTo(right) ? left : right) as T;
}
