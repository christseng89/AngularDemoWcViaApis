import { classify } from '../../../src/domain/classification';
import type { AccountType, PaymentLegInput } from '../../../src/types';

function leg(accountType: AccountType, rtgsIndicator?: boolean): PaymentLegInput {
  return { accountNo: 'ACC', accountType, currency: 'USD', amountTxCcy: '100', rtgsIndicator };
}

describe('classify', () => {
  it('customerXor fires when only the debit side has CUSTOMER', () => {
    const result = classify('id-1', [leg('CUSTOMER')], [leg('NOSTRO')]);
    expect(result.customerXor).toBe(true);
    expect(result.nostroXor).toBe(true);
    expect(result.vostroXor).toBe(false);
    expect(result.paymentComponentRelated).toBe(true);
  });

  it('no term fires when both sides are CUSTOMER', () => {
    const result = classify('id-2', [leg('CUSTOMER')], [leg('CUSTOMER')]);
    expect(result.customerXor).toBe(false);
    expect(result.nostroXor).toBe(false);
    expect(result.vostroXor).toBe(false);
    expect(result.paymentComponentRelated).toBe(false);
  });

  it('nostroXor is false when both sides have NOSTRO', () => {
    const result = classify('id-3', [leg('NOSTRO')], [leg('NOSTRO')]);
    expect(result.nostroXor).toBe(false);
    expect(result.paymentComponentRelated).toBe(false);
  });

  it('vostroXor fires independently of customerXor/nostroXor', () => {
    const result = classify('id-4', [leg('VOSTRO')], [leg('CUSTOMER')]);
    expect(result.vostroXor).toBe(true);
    expect(result.customerXor).toBe(true);
    expect(result.nostroXor).toBe(false);
    expect(result.paymentComponentRelated).toBe(true);
  });

  it('SUSPENSE and INTERNAL never participate in any XOR term', () => {
    const result = classify('id-5', [leg('SUSPENSE')], [leg('INTERNAL')]);
    expect(result.customerXor).toBe(false);
    expect(result.nostroXor).toBe(false);
    expect(result.vostroXor).toBe(false);
    expect(result.paymentComponentRelated).toBe(false);
  });

  it('a NOSTRO leg with rtgsIndicator still folds into nostroXor like plain NOSTRO', () => {
    const result = classify('id-6', [leg('NOSTRO', true)], [leg('CUSTOMER')]);
    expect(result.nostroXor).toBe(true);
    expect(result.debitTypes).toEqual(['NOSTRO']);
  });

  it('rtgsIndicator does not create a second independent bucket (Dr NOSTRO+rtgs vs Cr plain NOSTRO cancels out)', () => {
    const result = classify('id-7', [leg('NOSTRO', true)], [leg('NOSTRO')]);
    expect(result.nostroXor).toBe(false);
    expect(result.paymentComponentRelated).toBe(false);
  });

  it('debitTypes/creditTypes dedupe distinct account types across multiple legs on the same side', () => {
    const result = classify('id-8', [leg('CUSTOMER'), leg('CUSTOMER'), leg('NOSTRO')], [leg('VOSTRO')]);
    expect(result.debitTypes.sort()).toEqual(['CUSTOMER', 'NOSTRO']);
    expect(result.creditTypes).toEqual(['VOSTRO']);
  });

  it('carries the instructionId through unchanged', () => {
    const result = classify('some-id-123', [leg('CUSTOMER')], [leg('CUSTOMER')]);
    expect(result.instructionId).toBe('some-id-123');
  });

  it('multiple distinct types on one side can trigger multiple XOR terms at once', () => {
    // Debit has both CUSTOMER and VOSTRO; Credit has neither -> both customerXor and vostroXor fire.
    const result = classify('id-9', [leg('CUSTOMER'), leg('VOSTRO')], [leg('SUSPENSE')]);
    expect(result.customerXor).toBe(true);
    expect(result.vostroXor).toBe(true);
    expect(result.paymentComponentRelated).toBe(true);
  });
});
