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
});
