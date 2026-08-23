/**
 * Maturity-Date-Tenor-Basis-Decision-Review.md v29 §2/§3.1/§3.2 (business-confirmed policy) —
 * TenorBasis/TenorType combination validation and Export settlement route resolution. Pure/anemic, same
 * convention as tenorRouting.ts's own checkAcceptanceTenorConsistency() — the service layer owns
 * resolving the contract and deciding which Error class to throw.
 */
import type { TenorBasis, TenorType } from '../types';

export type TenorBasisValidationResult = { ok: true } | { ok: false; error: string };

/**
 * v29 §3.1 — A1/B1 root ISSUE and A2/B2 tenorBasis/tenorType amendment both run this. `AFTER_SIGHT` is
 * reserved for the Buyer's-Usance/UPAS settlement pattern (Export Sight, Import financed) — combining it
 * with SELLERS_USANCE violates the approved product policy (v29 §1) and must be rejected at build time,
 * not caught later at B4 execution.
 */
export function validateTenorBasisTypeCombination(tenorBasis: TenorBasis | null | undefined, tenorType: TenorType | null | undefined): TenorBasisValidationResult {
  if (tenorBasis === 'AFTER_SIGHT' && tenorType === 'SELLERS_USANCE') {
    return {
      ok: false,
      error:
        "AFTER_SIGHT cannot be combined with SELLERS_USANCE under the approved product policy — " +
        "AFTER_SIGHT is reserved for the Buyer's-Usance/UPAS settlement pattern (Export Sight, Import financed).",
    };
  }
  if (tenorType === 'SIGHT' && tenorBasis != null) {
    return { ok: false, error: 'tenorBasis has no meaning for a SIGHT-tenor contract — it must be left null.' };
  }
  if ((tenorType === 'BUYERS_USANCE' || tenorType === 'SELLERS_USANCE') && tenorBasis == null) {
    return { ok: false, error: `tenorBasis is required for a ${tenorType} contract.` };
  }
  return { ok: true };
}

export type ExportSettlementRouteResolution = { status: 'RESOLVED'; route: 'HONOUR' | 'ACCEPTANCE' } | { status: 'MANUAL_REVIEW_REQUIRED'; reason: string };

const ACCEPTANCE_TENOR_BASES: readonly TenorBasis[] = ['AFTER_BL_DATE', 'AFTER_INVOICE_DATE', 'AFTER_SHIPMENT_DATE', 'AFTER_ACCEPTANCE', 'FIXED_MATURITY_DATE'];

/**
 * v29 §3.2 — explicit enumeration, deliberately no catch-all default: DP/DA and any unrecognized
 * tenorBasis must resolve to MANUAL_REVIEW_REQUIRED, never silently fall through to ACCEPTANCE.
 */
export function resolveExportSettlementRoute(input: { tenorBasis?: TenorBasis | null; tenorType: TenorType }): ExportSettlementRouteResolution {
  if (input.tenorType === 'SIGHT') {
    return { status: 'RESOLVED', route: 'HONOUR' };
  }
  if (input.tenorType === 'DP' || input.tenorType === 'DA') {
    return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'DP/DA settlement routing is not yet defined for this product.' };
  }
  if (input.tenorBasis === 'AFTER_SIGHT') {
    if (input.tenorType === 'SELLERS_USANCE') {
      return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'Legacy contract violates the AFTER_SIGHT/SELLERS_USANCE product policy — requires manual review.' };
    }
    return { status: 'RESOLVED', route: 'HONOUR' };
  }
  if (input.tenorBasis && ACCEPTANCE_TENOR_BASES.includes(input.tenorBasis)) {
    return { status: 'RESOLVED', route: 'ACCEPTANCE' };
  }
  return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'Unsupported or missing tenor basis.' };
}
