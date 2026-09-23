import Decimal from 'decimal.js';
import { parseMonetaryAmount } from '../money';

export interface LockedAcceptanceAttributionInput {
  legalAmountOwner: string;
  coveredAmountOwner: string;
  excessAmountOwner: string;
  ownerCurrency: string;
}

export type LockedAcceptanceAttribution = Readonly<LockedAcceptanceAttributionInput>;

export type LockedAcceptanceAttributionErrorCode = 'INVALID_ATTRIBUTION_AMOUNT' | 'INVALID_ATTRIBUTION_CURRENCY' | 'LEGAL_SPLIT_MISMATCH';

export type LockedAcceptanceAttributionResult =
  Readonly<{ ok: true; attribution: LockedAcceptanceAttribution }> | Readonly<{ ok: false; code: LockedAcceptanceAttributionErrorCode }>;

export interface A6LockedAcceptancePlanInput {
  lockedAttribution: LockedAcceptanceAttributionInput;
  requestedLegalAmountOwner: string;
  requestedCurrency: string;
}

export interface A6LockedAcceptancePlan {
  legalAcceptanceAmountOwner: string;
  ownerCurrency: string;
  lockedAttribution: LockedAcceptanceAttribution;
}

export type A6LockedAcceptancePlanResult =
  | Readonly<{ ok: true; plan: Readonly<A6LockedAcceptancePlan> }>
  | Readonly<{
      ok: false;
      code:
        | LockedAcceptanceAttributionErrorCode
        | 'INVALID_ACCEPTANCE_AMOUNT'
        | 'INVALID_ACCEPTANCE_CURRENCY'
        | 'ACCEPTANCE_AMOUNT_MISMATCH'
        | 'ACCEPTANCE_CURRENCY_MISMATCH';
    }>;

export interface A7LegalSettlementPlanInput {
  lockedAttribution: LockedAcceptanceAttributionInput;
  legalOutstandingOwner: string;
  settlementAmountOwner: string;
  approvedExcessOwner: string;
}

export interface A7LegalSettlementPlan {
  legalOutstandingBeforeOwner: string;
  settlementAmountOwner: string;
  legalOutstandingAfterOwner: string;
  approvedExcessOwnerBefore: string;
  approvedExcessOwnerAfter: string;
  lockedAttribution: LockedAcceptanceAttribution;
}

export type A7LegalSettlementPlanResult =
  | Readonly<{ ok: true; plan: Readonly<A7LegalSettlementPlan> }>
  | Readonly<{
      ok: false;
      code:
        | LockedAcceptanceAttributionErrorCode
        | 'INVALID_LEGAL_OUTSTANDING'
        | 'INVALID_SETTLEMENT_AMOUNT'
        | 'INVALID_APPROVED_EXCESS'
        | 'SETTLEMENT_EXCEEDS_LEGAL_OUTSTANDING';
    }>;

function parseAmount(value: string): Decimal | null {
  try {
    return parseMonetaryAmount(value);
  } catch {
    return null;
  }
}

function canonicalCurrency(value: string): string | null {
  const canonical = value.trim().toUpperCase();
  return canonical.length === 0 ? null : canonical;
}

/** Resolves the immutable Acknowledge-time split without consulting later LC capacity. */
export function resolveLockedAcceptanceAttribution(input: LockedAcceptanceAttributionInput): LockedAcceptanceAttributionResult {
  const legal = parseAmount(input.legalAmountOwner);
  const covered = parseAmount(input.coveredAmountOwner);
  const excess = parseAmount(input.excessAmountOwner);
  if (!legal || !covered || !excess || !legal.greaterThan(0) || covered.isNegative() || excess.isNegative()) {
    return { ok: false, code: 'INVALID_ATTRIBUTION_AMOUNT' };
  }
  if (!legal.equals(covered.plus(excess))) return { ok: false, code: 'LEGAL_SPLIT_MISMATCH' };

  const ownerCurrency = canonicalCurrency(input.ownerCurrency);
  if (!ownerCurrency) return { ok: false, code: 'INVALID_ATTRIBUTION_CURRENCY' };

  return {
    ok: true,
    attribution: Object.freeze({
      legalAmountOwner: legal.toFixed(),
      coveredAmountOwner: covered.toFixed(),
      excessAmountOwner: excess.toFixed(),
      ownerCurrency,
    }),
  };
}

/** Plans A6 from the locked A3/A3S split; it never creates or recalculates a capacity-control balance. */
export function planA6LockedAcceptance(input: A6LockedAcceptancePlanInput): A6LockedAcceptancePlanResult {
  const resolved = resolveLockedAcceptanceAttribution(input.lockedAttribution);
  if (!resolved.ok) return resolved;

  const requestedAmount = parseAmount(input.requestedLegalAmountOwner);
  if (!requestedAmount?.greaterThan(0)) return { ok: false, code: 'INVALID_ACCEPTANCE_AMOUNT' };
  const requestedCurrency = canonicalCurrency(input.requestedCurrency);
  if (!requestedCurrency) return { ok: false, code: 'INVALID_ACCEPTANCE_CURRENCY' };
  if (requestedCurrency !== resolved.attribution.ownerCurrency) return { ok: false, code: 'ACCEPTANCE_CURRENCY_MISMATCH' };
  if (!requestedAmount.equals(resolved.attribution.legalAmountOwner)) return { ok: false, code: 'ACCEPTANCE_AMOUNT_MISMATCH' };

  return {
    ok: true,
    plan: Object.freeze({
      legalAcceptanceAmountOwner: resolved.attribution.legalAmountOwner,
      ownerCurrency: resolved.attribution.ownerCurrency,
      lockedAttribution: resolved.attribution,
    }),
  };
}

/** Plans A7 against Legal Outstanding only and deliberately carries attribution and Approved Excess through unchanged. */
export function planA7LegalSettlement(input: A7LegalSettlementPlanInput): A7LegalSettlementPlanResult {
  const resolved = resolveLockedAcceptanceAttribution(input.lockedAttribution);
  if (!resolved.ok) return resolved;

  const legalOutstanding = parseAmount(input.legalOutstandingOwner);
  if (!legalOutstanding || legalOutstanding.isNegative()) return { ok: false, code: 'INVALID_LEGAL_OUTSTANDING' };
  const settlement = parseAmount(input.settlementAmountOwner);
  if (!settlement?.greaterThan(0)) return { ok: false, code: 'INVALID_SETTLEMENT_AMOUNT' };
  if (settlement.greaterThan(legalOutstanding)) return { ok: false, code: 'SETTLEMENT_EXCEEDS_LEGAL_OUTSTANDING' };
  const approvedExcess = parseAmount(input.approvedExcessOwner);
  if (!approvedExcess || approvedExcess.isNegative()) return { ok: false, code: 'INVALID_APPROVED_EXCESS' };

  const approvedExcessOwner = approvedExcess.toFixed();
  return {
    ok: true,
    plan: Object.freeze({
      legalOutstandingBeforeOwner: legalOutstanding.toFixed(),
      settlementAmountOwner: settlement.toFixed(),
      legalOutstandingAfterOwner: legalOutstanding.minus(settlement).toFixed(),
      approvedExcessOwnerBefore: approvedExcessOwner,
      approvedExcessOwnerAfter: approvedExcessOwner,
      lockedAttribution: resolved.attribution,
    }),
  };
}
