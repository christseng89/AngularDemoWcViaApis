import { buildSettlementEntries } from '../../../src/domain/accountEntries';
import type { PaymentLeg } from '../../../src/types';

function leg(overrides: Partial<PaymentLeg> = {}): PaymentLeg {
  return {
    accountNo: 'ACC-1',
    accountType: 'CUSTOMER',
    currency: 'USD',
    amountTxCcy: '100',
    legId: 'leg-1',
    legSide: 'DEBIT',
    accountDesc: 'IPLC03NULLNULLNULLC',
    accountCategory: 'CUSTOMER',
    ...overrides,
  };
}

describe('buildSettlementEntries', () => {
  it('produces one D entry per debit leg using amountTxCcy when amountAccountCcy is absent', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ amountTxCcy: '250' })], 'DEBIT');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.drCrIndicator).toBe('D');
    expect(entries[0]!.amount).toBe('250');
    expect(entries[0]!.glAccount).toBe('ACC-1');
    expect(entries[0]!.description).toBe('IPLC03NULLNULLNULLC');
  });

  it('produces C entries for the credit side', () => {
    const entries = buildSettlementEntries('instr-1', [leg()], 'CREDIT');
    expect(entries[0]!.drCrIndicator).toBe('C');
  });

  it('prefers amountAccountCcy over amountTxCcy when present', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ amountTxCcy: '100', amountAccountCcy: '150' })], 'DEBIT');
    expect(entries[0]!.amount).toBe('150');
  });

  it('carries custId from partyId and referenceNumber from accountNo', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ partyId: 'PARTY-9', accountNo: 'ACC-9' })], 'DEBIT');
    expect(entries[0]!.custId).toBe('PARTY-9');
    expect(entries[0]!.referenceNumber).toBe('ACC-9');
  });

  it('maps one entry per leg for multiple legs', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ accountNo: 'A' }), leg({ accountNo: 'B' })], 'DEBIT');
    expect(entries).toHaveLength(2);
  });

  it('returns an empty array for no legs', () => {
    expect(buildSettlementEntries('instr-1', [], 'DEBIT')).toEqual([]);
  });

  describe('exchangeRate1 echo-back', () => {
    it('omits exchangeRate1 for a same-currency leg carrying no rate field', () => {
      const entries = buildSettlementEntries('instr-1', [leg()], 'DEBIT');
      expect(entries[0]!.exchangeRate1).toBeUndefined();
    });

    it('a DEBIT leg uses drBuyRate', () => {
      const entries = buildSettlementEntries('instr-1', [leg({ drBuyRate: '1.083123' })], 'DEBIT');
      expect(entries[0]!.exchangeRate1).toBe('1.083123');
    });

    it('a DEBIT leg prefers drRate over drBuyRate when both are present', () => {
      const entries = buildSettlementEntries('instr-1', [leg({ drRate: '1.100000', drBuyRate: '1.083123' })], 'DEBIT');
      expect(entries[0]!.exchangeRate1).toBe('1.100000');
    });

    it('a CREDIT leg uses crBuyRate', () => {
      const entries = buildSettlementEntries('instr-1', [leg({ crBuyRate: '149.082600' })], 'CREDIT');
      expect(entries[0]!.exchangeRate1).toBe('149.082600');
    });

    it('a CREDIT leg prefers crBuyRate over sellRate when both are present', () => {
      const entries = buildSettlementEntries('instr-1', [leg({ crBuyRate: '149.082600', sellRate: '150.000000' })], 'CREDIT');
      expect(entries[0]!.exchangeRate1).toBe('149.082600');
    });

    it("a CREDIT leg's own drBuyRate is ignored (side-mismatched rate field never leaks across sides)", () => {
      const entries = buildSettlementEntries('instr-1', [leg({ drBuyRate: '1.083123' })], 'CREDIT');
      expect(entries[0]!.exchangeRate1).toBeUndefined();
    });

    it('never populates exchangeRate2 — no second rate value exists on the wire to map to it', () => {
      const entries = buildSettlementEntries('instr-1', [leg({ drBuyRate: '1.083123' })], 'DEBIT');
      expect(entries[0]!.exchangeRate2).toBeUndefined();
    });
  });
});
