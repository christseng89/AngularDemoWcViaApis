import { ResponseViewerComponent } from './response-viewer.component';
import type { AccountEntry } from './payment-component.types';

function entry(voucherType: AccountEntry['voucherType'], overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    entryId: 'e1',
    instructionId: 'i1',
    voucherType,
    drCrIndicator: 'D',
    glAccount: 'ACC',
    currency: 'USD',
    amount: '100',
    ...overrides,
  };
}

describe('ResponseViewerComponent', () => {
  it('filters entries by voucherType into settlement/charge/liability buckets', () => {
    const comp = new ResponseViewerComponent();
    comp.accountEntries = [entry('SETTLEMENT', { entryId: 's1' }), entry('CHARGE', { entryId: 'c1' }), entry('LIABILITY', { entryId: 'l1' }), entry('LIABILITY', { entryId: 'l2' })];

    expect(comp.settlementEntries.map((e) => e.entryId)).toEqual(['s1']);
    expect(comp.chargeEntries.map((e) => e.entryId)).toEqual(['c1']);
    expect(comp.liabilityEntries.map((e) => e.entryId)).toEqual(['l1', 'l2']);
  });

  it('returns empty arrays when accountEntries is null', () => {
    const comp = new ResponseViewerComponent();
    expect(comp.settlementEntries).toEqual([]);
    expect(comp.chargeEntries).toEqual([]);
    expect(comp.liabilityEntries).toEqual([]);
  });

  it('returns empty arrays when accountEntries is an empty array', () => {
    const comp = new ResponseViewerComponent();
    comp.accountEntries = [];
    expect(comp.settlementEntries).toEqual([]);
  });
});
