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

  it('debitFxPairs/creditFxPairs default to [] until the parent binds them', () => {
    const comp = new ResponseViewerComponent();
    expect(comp.debitFxPairs).toEqual([]);
    expect(comp.creditFxPairs).toEqual([]);
  });

  describe('groupedSettlementEntries (v1.8.1 — display-only audit ordering)', () => {
    function fx(overrides: Partial<AccountEntry>): AccountEntry {
      return entry('SETTLEMENT', overrides);
    }

    it('returns [] when there are no settlement entries', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [];
      expect(comp.groupedSettlementEntries).toEqual([]);
    });

    it('with only normal legs (no FX/Suspense), produces just the two normal-leg sections', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'c1', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'USD', amount: '1000' }),
      ];
      expect(comp.groupedSettlementEntries.map((s) => s.label)).toEqual(['Customer / Debit Legs', 'Settlement / Credit Legs']);
    });

    it("reproduces the reported scenario exactly, from RAW WIRE ORDER (debitLegs-then-creditLegs, unsorted) into the user's requested grouped/labeled order", () => {
      const comp = new ResponseViewerComponent();
      // Wire order exactly as confirmPaymentInstruction.ts/expandSuspenseBridge actually produce it —
      // NOT pre-grouped — to genuinely exercise the reordering logic.
      comp.accountEntries = [
        fx({ entryId: 'd-cust2', drCrIndicator: 'D', glAccount: 'CUST-ACC2', currency: 'USD', amount: '9891.69' }),
        fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'EUR', amount: '200.00' }),
        fx({ entryId: 'd-susp-D-other', drCrIndicator: 'D', glAccount: 'FX Exchange USD - Suspense', currency: 'EUR', amount: '100.00' }),
        fx({ entryId: 'd-leg-D-trx', drCrIndicator: 'D', glAccount: 'FX Exchange EUR', currency: 'USD', amount: '216.62' }),
        fx({ entryId: 'd-susp-C-other', drCrIndicator: 'D', glAccount: 'FX Exchange USD - Suspense', currency: 'EUR', amount: '200.00' }),
        fx({ entryId: 'd-leg-C-other', drCrIndicator: 'D', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '100.00' }),
        fx({ entryId: 'c-susp-D-trx', drCrIndicator: 'C', glAccount: 'FX Exchange EUR - Suspense', currency: 'USD', amount: '108.31' }),
        fx({ entryId: 'c-leg-D-other', drCrIndicator: 'C', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '200.00' }),
        fx({ entryId: 'c-susp-C-trx', drCrIndicator: 'C', glAccount: 'FX Exchange EUR - Suspense', currency: 'USD', amount: '216.62' }),
        fx({ entryId: 'c-leg-C-trx', drCrIndicator: 'C', glAccount: 'FX Exchange EUR', currency: 'USD', amount: '108.31' }),
        fx({ entryId: 'c-nostro2', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC2', currency: 'USD', amount: '9675.07' }),
        fx({ entryId: 'c-nostro', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'EUR', amount: '100.00' }),
        fx({ entryId: 'c-susp-debit', drCrIndicator: 'C', glAccount: 'Suspense - Debit', currency: 'EUR', amount: '100.00' }),
        fx({ entryId: 'c-susp-credit', drCrIndicator: 'C', glAccount: 'Suspense - Credit', currency: 'EUR', amount: '200.00' }),
      ];

      const sections = comp.groupedSettlementEntries;
      expect(sections.map((s) => s.label)).toEqual([
        'Customer / Debit Legs',
        'FX Debit Leg Pair',
        'FX Debit Suspense Pair',
        'FX Credit Suspense Pair',
        'FX Credit Leg Pair',
        'Settlement / Credit Legs',
        'Suspense Clearing',
      ]);

      expect(sections.find((s) => s.label === 'Customer / Debit Legs')!.entries.map((e) => e.entryId)).toEqual(['d-cust2', 'd-cust']);
      expect(sections.find((s) => s.label === 'FX Debit Leg Pair')!.entries.map((e) => e.entryId)).toEqual(['d-leg-D-trx', 'c-leg-D-other']);
      expect(sections.find((s) => s.label === 'FX Debit Suspense Pair')!.entries.map((e) => e.entryId)).toEqual(['d-susp-D-other', 'c-susp-D-trx']);
      expect(sections.find((s) => s.label === 'FX Credit Suspense Pair')!.entries.map((e) => e.entryId)).toEqual(['d-susp-C-other', 'c-susp-C-trx']);
      expect(sections.find((s) => s.label === 'FX Credit Leg Pair')!.entries.map((e) => e.entryId)).toEqual(['d-leg-C-other', 'c-leg-C-trx']);
      expect(sections.find((s) => s.label === 'Settlement / Credit Legs')!.entries.map((e) => e.entryId)).toEqual(['c-nostro2', 'c-nostro']);
      expect(sections.find((s) => s.label === 'Suspense Clearing')!.entries.map((e) => e.entryId)).toEqual(['c-susp-debit', 'c-susp-credit']);
    });

    it("pairs correctly even when a pair's CREDIT leg appears before its DEBIT partner in the entries array (order-independent matching)", () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'trx-credit', drCrIndicator: 'C', glAccount: 'FX Exchange EUR', currency: 'USD', amount: '55' }),
        fx({ entryId: 'other-debit', drCrIndicator: 'D', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '50' }),
      ];
      const sections = comp.groupedSettlementEntries;
      const legPair = sections.find((s) => s.label === 'FX Credit Leg Pair');
      expect(legPair?.entries.map((e) => e.entryId)).toEqual(['other-debit', 'trx-credit']);
    });

    it('an FX entry with no matching partner is defensively dropped rather than crashing (malformed/unexpected server output)', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'orphan', drCrIndicator: 'D', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '50' }),
      ];
      expect(() => comp.groupedSettlementEntries).not.toThrow();
      const allEntryIds = comp.groupedSettlementEntries.flatMap((s) => s.entries.map((e) => e.entryId));
      expect(allEntryIds).not.toContain('orphan');
    });

    it('a Suspense pair with no Suspense-Debit/Suspense-Credit clearing match (e.g. same-currency-as-transaction Suspense entries never generate an FX pair at all) attributes to Credit by default rather than throwing', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'susp-other', drCrIndicator: 'D', glAccount: 'FX Exchange USD - Suspense', currency: 'EUR', amount: '50' }),
        fx({ entryId: 'susp-trx', drCrIndicator: 'C', glAccount: 'FX Exchange EUR - Suspense', currency: 'USD', amount: '55' }),
      ];
      expect(() => comp.groupedSettlementEntries).not.toThrow();
      expect(comp.groupedSettlementEntries.map((s) => s.label)).toContain('FX Credit Suspense Pair');
    });
  });
});
