import Decimal from 'decimal.js';
import { formatMonetaryAmount, parseMonetaryAmount } from '../money';
import { computeCoveredAndExcess, computeEffectiveAllowanceLimitOwner, evaluateOwnerExcessAllowance } from './excessPolicy';

export interface MinimumRequiredIncreaseFxEvidence {
  rateOrigin: string;
  bookingRate: string;
  providerRateId: string;
  providerRateVersion: string;
  rateTimestamp: string;
}

export interface MinimumRequiredIncreaseInput {
  transactionAmountOwner: string;
  effectiveCapacityOwner: string;
  approvedContractualMaximumOwner: string;
  allowancePercentage: string;
  configuredMaximumOwner: string;
  approvedUtilizedOwner: string;
  otherPendingReservedOwner: string;
  ownerCurrencyPrecision: number;
  /** Owner-currency capacity gained per one owner-currency contractual increase. */
  capacityGainPerIncrease: string;
  snapshotTime: string;
  fxEvidence?: MinimumRequiredIncreaseFxEvidence;
}

export interface MinimumRequiredIncreaseEvidence {
  transactionAmountOwner: string;
  effectiveCapacityOwner: string;
  proposedExcessOwner: string;
  approvedContractualMaximumOwner: string;
  allowancePercentage: string;
  configuredMaximumOwner: string;
  approvedUtilizedOwner: string;
  otherPendingReservedOwner: string;
  capacityGainPerIncrease: string;
}

export type MinimumRequiredIncreaseResult =
  | Readonly<{
      outcome: 'FINITE';
      minimumRequiredIncreaseOwner: string;
      snapshotTime: string;
      fxContribution: boolean;
      fxEvidence: MinimumRequiredIncreaseFxEvidence | null;
      evidence: MinimumRequiredIncreaseEvidence;
    }>
  | Readonly<{
      outcome: 'INCREASE_ALONE_CANNOT_RESOLVE';
      snapshotTime: string;
      fxContribution: boolean;
      fxEvidence: MinimumRequiredIncreaseFxEvidence | null;
      evidence: MinimumRequiredIncreaseEvidence;
    }>;

/**
 * Finds the first owner-currency minor unit satisfying the exact same rounded
 * capacity and allowance predicate as authoritative Maker validation. The
 * function emits guidance only; it has no persistence or A2/B2 side effects.
 */
export function calculateMinimumRequiredIncrease(input: MinimumRequiredIncreaseInput): MinimumRequiredIncreaseResult {
  const scale = input.ownerCurrencyPrecision;
  if (!Number.isInteger(scale) || scale < 0 || scale > 3) throw new Error('ownerCurrencyPrecision must be an integer from 0 to 3');
  const amount = nonNegative(input.transactionAmountOwner, 'transactionAmountOwner');
  const capacity = nonNegative(input.effectiveCapacityOwner, 'effectiveCapacityOwner');
  const contractualMaximum = nonNegative(input.approvedContractualMaximumOwner, 'approvedContractualMaximumOwner');
  const percentage = nonNegative(input.allowancePercentage, 'allowancePercentage');
  const configuredMaximum = nonNegative(input.configuredMaximumOwner, 'configuredMaximumOwner');
  const approved = nonNegative(input.approvedUtilizedOwner, 'approvedUtilizedOwner');
  const pending = nonNegative(input.otherPendingReservedOwner, 'otherPendingReservedOwner');
  const capacityGain = nonNegative(input.capacityGainPerIncrease, 'capacityGainPerIncrease');
  if (percentage.isZero()) throw new Error('allowancePercentage must be positive for Excess guidance');

  const currentSplit = computeCoveredAndExcess({ transactionAmount: amount.toFixed(), effectiveCapacity: capacity.toFixed() });
  const evidence: MinimumRequiredIncreaseEvidence = {
    transactionAmountOwner: formatMonetaryAmount(amount, scale),
    effectiveCapacityOwner: formatMonetaryAmount(capacity, scale),
    proposedExcessOwner: formatMonetaryAmount(parseMonetaryAmount(currentSplit.excessAmount), scale),
    approvedContractualMaximumOwner: formatMonetaryAmount(contractualMaximum, scale),
    allowancePercentage: percentage.toFixed(),
    configuredMaximumOwner: formatMonetaryAmount(configuredMaximum, scale),
    approvedUtilizedOwner: formatMonetaryAmount(approved, scale),
    otherPendingReservedOwner: formatMonetaryAmount(pending, scale),
    capacityGainPerIncrease: capacityGain.toFixed(),
  };

  const qualifies = (increase: Decimal): boolean => {
    const split = computeCoveredAndExcess({
      transactionAmount: amount.toFixed(),
      effectiveCapacity: capacity.plus(increase.times(capacityGain)).toFixed(),
    });
    const effectiveLimitOwner = computeEffectiveAllowanceLimitOwner({
      approvedContractualMaximumOwner: contractualMaximum.plus(increase).toFixed(),
      allowancePercentage: percentage.toFixed(),
      configuredMaximumOwner: configuredMaximum.toFixed(),
      ownerCurrencyPrecision: scale,
    });
    return (
      evaluateOwnerExcessAllowance({
        effectiveLimitOwner,
        approvedUtilizedOwner: approved.toFixed(),
        otherPendingReservedOwner: pending.toFixed(),
        proposedExcessOwner: split.excessAmount,
        ownerCurrencyPrecision: scale,
      }).decision !== 'LIMIT_EXCEEDED'
    );
  };

  if (qualifies(new Decimal(0))) {
    throw new Error('Minimum Required Increase is only calculated for a current LIMIT_EXCEEDED result');
  }

  const factor = new Decimal(10).pow(scale);
  const toMinorUnitsCeiling = (value: Decimal) => Decimal.max(0, value.times(factor).ceil());
  const capacityCoveringIncrease = capacityGain.greaterThan(0)
    ? Decimal.max(0, amount.minus(capacity)).dividedBy(capacityGain)
    : new Decimal(0);
  const allowanceSaturationIncrease = Decimal.max(0, configuredMaximum.times(100).dividedBy(percentage).minus(contractualMaximum));
  let highUnits = toMinorUnitsCeiling(Decimal.max(capacityCoveringIncrease, allowanceSaturationIncrease));
  if (!qualifies(highUnits.dividedBy(factor))) {
    const percentageLimitAtSaturation = contractualMaximum
      .plus(highUnits.dividedBy(factor))
      .times(percentage)
      .dividedBy(100)
      .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
    return {
      outcome: 'INCREASE_ALONE_CANNOT_RESOLVE',
      snapshotTime: input.snapshotTime,
      fxContribution: Boolean(input.fxEvidence) && configuredMaximum.lessThanOrEqualTo(percentageLimitAtSaturation),
      fxEvidence: input.fxEvidence ?? null,
      evidence,
    };
  }

  let lowUnits = new Decimal(0);
  while (lowUnits.lessThan(highUnits)) {
    const midUnits = lowUnits.plus(highUnits).dividedBy(2).floor();
    if (qualifies(midUnits.dividedBy(factor))) highUnits = midUnits;
    else lowUnits = midUnits.plus(1);
  }
  const minimum = lowUnits.dividedBy(factor);
  const percentageLimitAtMinimum = contractualMaximum.plus(minimum).times(percentage).dividedBy(100).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const fxContribution = Boolean(input.fxEvidence) && configuredMaximum.lessThanOrEqualTo(percentageLimitAtMinimum);
  return {
    outcome: 'FINITE',
    minimumRequiredIncreaseOwner: formatMonetaryAmount(minimum, scale),
    snapshotTime: input.snapshotTime,
    fxContribution,
    fxEvidence: input.fxEvidence ?? null,
    evidence,
  };
}

function nonNegative(value: string, field: string): Decimal {
  const parsed = parseMonetaryAmount(value);
  if (parsed.isNegative()) throw new Error(`${field} must be non-negative`);
  return parsed;
}
