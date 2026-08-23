/**
 * domain/tenorBasis.ts — Maturity-Date-Tenor-Basis-Decision-Review.md v29 §2/§3.1/§3.2 (business-confirmed).
 * Pure functions, no DB/service dependency — same testing convention as tenorRouting.test.ts.
 */
import { validateTenorBasisTypeCombination, resolveExportSettlementRoute } from '../../../src/domain/tenorBasis';

describe('validateTenorBasisTypeCombination', () => {
  test('rejects AFTER_SIGHT + SELLERS_USANCE (the approved product policy)', () => {
    const result = validateTenorBasisTypeCombination('AFTER_SIGHT', 'SELLERS_USANCE');
    expect(result).toEqual({ ok: false, error: expect.stringContaining('AFTER_SIGHT cannot be combined with SELLERS_USANCE') });
  });

  test('accepts AFTER_SIGHT + BUYERS_USANCE (the approved Buyer\'s-Usance/UPAS pattern)', () => {
    expect(validateTenorBasisTypeCombination('AFTER_SIGHT', 'BUYERS_USANCE')).toEqual({ ok: true });
  });

  test('rejects a non-null tenorBasis on a SIGHT-tenor contract', () => {
    const result = validateTenorBasisTypeCombination('AFTER_BL_DATE', 'SIGHT');
    expect(result).toEqual({ ok: false, error: expect.stringContaining('has no meaning for a SIGHT-tenor contract') });
  });

  test('accepts SIGHT with a null/undefined tenorBasis', () => {
    expect(validateTenorBasisTypeCombination(null, 'SIGHT')).toEqual({ ok: true });
    expect(validateTenorBasisTypeCombination(undefined, 'SIGHT')).toEqual({ ok: true });
  });

  test('rejects a missing tenorBasis for BUYERS_USANCE/SELLERS_USANCE', () => {
    expect(validateTenorBasisTypeCombination(null, 'BUYERS_USANCE')).toEqual({ ok: false, error: expect.stringContaining('tenorBasis is required for a BUYERS_USANCE contract') });
    expect(validateTenorBasisTypeCombination(undefined, 'SELLERS_USANCE')).toEqual({ ok: false, error: expect.stringContaining('tenorBasis is required for a SELLERS_USANCE contract') });
  });

  test('accepts every other tenorBasis/tenorType combination', () => {
    expect(validateTenorBasisTypeCombination('FIXED_MATURITY_DATE', 'SELLERS_USANCE')).toEqual({ ok: true });
    expect(validateTenorBasisTypeCombination('AFTER_BL_DATE', 'BUYERS_USANCE')).toEqual({ ok: true });
    expect(validateTenorBasisTypeCombination('AFTER_ACCEPTANCE', 'SELLERS_USANCE')).toEqual({ ok: true });
  });

  test('is a no-op for DP/DA (tenorBasis has no defined relationship to these tenorTypes yet)', () => {
    expect(validateTenorBasisTypeCombination(null, 'DP')).toEqual({ ok: true });
    expect(validateTenorBasisTypeCombination(null, 'DA')).toEqual({ ok: true });
  });
});

describe('resolveExportSettlementRoute', () => {
  test('SIGHT always resolves to HONOUR, regardless of tenorBasis', () => {
    expect(resolveExportSettlementRoute({ tenorType: 'SIGHT' })).toEqual({ status: 'RESOLVED', route: 'HONOUR' });
    expect(resolveExportSettlementRoute({ tenorType: 'SIGHT', tenorBasis: 'AFTER_BL_DATE' })).toEqual({ status: 'RESOLVED', route: 'HONOUR' });
  });

  test('DP/DA always resolve to MANUAL_REVIEW_REQUIRED — never silently defaulted to ACCEPTANCE', () => {
    expect(resolveExportSettlementRoute({ tenorType: 'DP' })).toEqual({ status: 'MANUAL_REVIEW_REQUIRED', reason: expect.stringContaining('DP/DA') });
    expect(resolveExportSettlementRoute({ tenorType: 'DA' })).toEqual({ status: 'MANUAL_REVIEW_REQUIRED', reason: expect.stringContaining('DP/DA') });
  });

  test('AFTER_SIGHT + BUYERS_USANCE resolves to HONOUR (Export Sight, Import financed)', () => {
    expect(resolveExportSettlementRoute({ tenorType: 'BUYERS_USANCE', tenorBasis: 'AFTER_SIGHT' })).toEqual({ status: 'RESOLVED', route: 'HONOUR' });
  });

  test('AFTER_SIGHT + SELLERS_USANCE (a legacy/pre-policy contract) resolves to MANUAL_REVIEW_REQUIRED, not a hard crash', () => {
    expect(resolveExportSettlementRoute({ tenorType: 'SELLERS_USANCE', tenorBasis: 'AFTER_SIGHT' })).toEqual({
      status: 'MANUAL_REVIEW_REQUIRED',
      reason: expect.stringContaining('Legacy contract violates the AFTER_SIGHT/SELLERS_USANCE product policy'),
    });
  });

  test('every ACCEPTANCE-shaped tenorBasis resolves to ACCEPTANCE', () => {
    for (const tenorBasis of ['AFTER_BL_DATE', 'AFTER_INVOICE_DATE', 'AFTER_SHIPMENT_DATE', 'AFTER_ACCEPTANCE', 'FIXED_MATURITY_DATE'] as const) {
      expect(resolveExportSettlementRoute({ tenorType: 'SELLERS_USANCE', tenorBasis })).toEqual({ status: 'RESOLVED', route: 'ACCEPTANCE' });
    }
  });

  test('a missing or unrecognized tenorBasis on a Usance contract resolves to MANUAL_REVIEW_REQUIRED, no silent catch-all default', () => {
    expect(resolveExportSettlementRoute({ tenorType: 'SELLERS_USANCE' })).toEqual({ status: 'MANUAL_REVIEW_REQUIRED', reason: expect.stringContaining('Unsupported or missing') });
    expect(resolveExportSettlementRoute({ tenorType: 'SELLERS_USANCE', tenorBasis: null })).toEqual({ status: 'MANUAL_REVIEW_REQUIRED', reason: expect.stringContaining('Unsupported or missing') });
  });
});
