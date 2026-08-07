import { previewClassification } from '../../../src/domain/classifyPreview';
import type { PaymentLegInput } from '../../../src/types';

function leg(accountType: PaymentLegInput['accountType'], amountTxCcy: string, accountNo = 'ACC'): PaymentLegInput {
  return { accountNo, accountType, currency: 'USD', amountTxCcy };
}

describe('previewClassification', () => {
  it('reports balanced=true and difference 0 when totals match', () => {
    const result = previewClassification([leg('CUSTOMER', '100')], [leg('NOSTRO', '100')]);
    expect(result.balance.balanced).toBe(true);
    expect(result.balance.difference).toBe('0');
    expect(result.balance.debitTotal).toBe('100');
    expect(result.balance.creditTotal).toBe('100');
  });

  it('reports balanced=false with the correct signed difference when totals mismatch, and never throws', () => {
    const result = previewClassification([leg('CUSTOMER', '100')], [leg('NOSTRO', '80')]);
    expect(result.balance.balanced).toBe(false);
    expect(result.balance.difference).toBe('20');
  });

  it('within a custom tolerance, a nonzero difference still reports balanced=true', () => {
    const result = previewClassification([leg('CUSTOMER', '100')], [leg('NOSTRO', '99.5')], '1');
    expect(result.balance.balanced).toBe(true);
  });

  it('embeds a real classification result matching classify()', () => {
    const result = previewClassification([leg('CUSTOMER', '100')], [leg('NOSTRO', '100')]);
    expect(result.classification.paymentComponentRelated).toBe(true);
    expect(result.classification.customerXor).toBe(true);
    expect(result.classification.nostroXor).toBe(true);
  });

  it('generates a previewId clearly namespaced as non-persisted', () => {
    const result = previewClassification([leg('CUSTOMER', '100')], [leg('CUSTOMER', '100')]);
    expect(result.classification.instructionId).toMatch(/^preview-/);
  });

  it('generates a distinct previewId on each call', () => {
    const a = previewClassification([leg('CUSTOMER', '1')], [leg('CUSTOMER', '1')]);
    const b = previewClassification([leg('CUSTOMER', '1')], [leg('CUSTOMER', '1')]);
    expect(a.classification.instructionId).not.toBe(b.classification.instructionId);
  });

  describe('accountEntries (Settlement stream)', () => {
    it('produces one SETTLEMENT entry per leg, both sides, with correct Dr/Cr and amounts', () => {
      const result = previewClassification(
        [leg('NOSTRO', '500', 'RTGS-ACC')],
        [leg('INTERNAL', '500', 'INTERNAL-ACC')],
      );
      expect(result.accountEntries).toHaveLength(2);
      const [debitEntry, creditEntry] = result.accountEntries;
      expect(debitEntry!.voucherType).toBe('SETTLEMENT');
      expect(debitEntry!.drCrIndicator).toBe('D');
      expect(debitEntry!.glAccount).toBe('RTGS-ACC');
      expect(debitEntry!.amount).toBe('500');
      expect(creditEntry!.drCrIndicator).toBe('C');
      expect(creditEntry!.glAccount).toBe('INTERNAL-ACC');
    });

    it('description explicitly states no voucher prefix exists, rather than fabricating one', () => {
      const result = previewClassification([leg('NOSTRO', '100')], [leg('CUSTOMER', '100')]);
      expect(result.accountEntries[0]!.description).toMatch(/no Payment Component voucher code prefix/);
    });

    it('produces entries even when the legs are unbalanced (never throws)', () => {
      const result = previewClassification([leg('NOSTRO', '100')], [leg('CUSTOMER', '50')]);
      expect(result.accountEntries).toHaveLength(2);
    });

    it('aggregates entries across multiple legs on the same side', () => {
      const result = previewClassification(
        [leg('NOSTRO', '60', 'A'), leg('NOSTRO', '40', 'B')],
        [leg('CUSTOMER', '100', 'C')],
      );
      expect(result.accountEntries).toHaveLength(3);
    });

    it('never persists — accountEntries carry the same non-persisted previewId as the classification', () => {
      const result = previewClassification([leg('NOSTRO', '100')], [leg('CUSTOMER', '100')]);
      expect(result.accountEntries[0]!.instructionId).toBe(result.classification.instructionId);
      expect(result.accountEntries[0]!.instructionId).toMatch(/^preview-/);
    });
  });
});
