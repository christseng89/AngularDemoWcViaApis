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

  describe('settlementEntries excludes zero-amount entries', () => {
    it("does not include a real zero-amount leg — e.g. onConfirm() (unlike the live preview) doesn't gate on leg validity, so a Suspense Credit bridge entry that fully offsets a real Cr \"Suspense - Credit\" leg can reach the server as a real 0.00 leg", () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        entry('SETTLEMENT', { entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '150.00' }),
        entry('SETTLEMENT', { entryId: 'c1', drCrIndicator: 'C', glAccount: 'Suspense - Credit', currency: 'USD', amount: '0.00' }),
        entry('SETTLEMENT', { entryId: 'c2', drCrIndicator: 'C', glAccount: 'Suspense - Credit', currency: 'USD', amount: '150.00' }),
      ];

      expect(comp.settlementEntries.map((e) => e.entryId)).toEqual(['d1', 'c2']);
    });

    it('the excluded zero-amount leg therefore never appears in groupedSettlementEntries (e.g. never surfaces as a false "Suspense Clearing" line) or currencyGroups', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        entry('SETTLEMENT', { entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '150.00' }),
        entry('SETTLEMENT', { entryId: 'c1', drCrIndicator: 'C', glAccount: 'Suspense - Credit', currency: 'USD', amount: '0.00' }),
        entry('SETTLEMENT', { entryId: 'c2', drCrIndicator: 'C', glAccount: 'Suspense - Credit', currency: 'USD', amount: '150.00' }),
      ];

      const allGroupedIds = comp.groupedSettlementEntries.flatMap((s) => s.entries.map((e) => e.entryId));
      expect(allGroupedIds).not.toContain('c1');
      expect(allGroupedIds).toContain('c2');

      const allCurrencyViewAccounts = comp.currencyGroups.flatMap((g) => g.entries.map((e) => e.glAccount));
      expect(allCurrencyViewAccounts.filter((a) => a === 'Suspense - Credit')).toHaveLength(1);
    });

    it('does not affect the authoritative `balance` Input (the server\'s own V8 result over the full ledger) — only the enumerated entries display is filtered', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [entry('SETTLEMENT', { entryId: 'c1', drCrIndicator: 'C', glAccount: 'Suspense - Credit', amount: '0.00' })];
      comp.balance = { debitTotal: '150.00', creditTotal: '150.00', difference: '0.00', balanced: true };

      expect(comp.settlementEntries).toEqual([]);
      expect(comp.balance).toEqual({ debitTotal: '150.00', creditTotal: '150.00', difference: '0.00', balanced: true });
    });
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

  describe('Settlement Vouchers — Posting View / Currency View tabs', () => {
    it('defaults activeSettlementView to Posting View', () => {
      const comp = new ResponseViewerComponent();
      expect(comp.activeSettlementView).toBe('posting');
    });
  });

  describe('currencyGroups (Currency View)', () => {
    function fx(overrides: Partial<AccountEntry>): AccountEntry {
      return entry('SETTLEMENT', overrides);
    }

    it('returns [] when there are no settlement entries', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [];
      expect(comp.currencyGroups).toEqual([]);
    });

    it('groups entries by currency, sorted by currency code, without generating or recalculating any accounting entry', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'c-nostro', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'EUR', amount: '900' }),
        fx({ entryId: 'c-nostro2', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC2', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'd-cust2', drCrIndicator: 'D', glAccount: 'CUST-ACC2', currency: 'EUR', amount: '900' }),
      ];

      const groups = comp.currencyGroups;
      expect(groups.map((g) => g.currency)).toEqual(['EUR', 'USD']);
      expect(groups.find((g) => g.currency === 'USD')!.entries.map((e) => e.glAccount)).toEqual(['CUST-ACC', 'NOSTRO-ACC2']);
      expect(groups.find((g) => g.currency === 'EUR')!.entries.map((e) => e.glAccount)).toEqual(['CUST-ACC2', 'NOSTRO-ACC']);
      // Same underlying entries the Posting View renders — not a second, independently-computed set.
      const allGroupedAccounts = comp.groupedSettlementEntries.flatMap((s) => s.entries.map((e) => e.glAccount));
      const allCurrencyViewAccounts = groups.flatMap((g) => g.entries.map((e) => e.glAccount));
      expect([...allCurrencyViewAccounts].sort()).toEqual([...allGroupedAccounts].sort());
    });

    it('orders Debit rows before Credit rows within a currency (business-requirement-confirmed) — a stable sort applied explicitly by currencyGroups, not relied on as an emergent property of section order', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '316.62' }),
        fx({ entryId: 'd-fx-other', drCrIndicator: 'D', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '200.00' }),
        fx({ entryId: 'c-fx-trx', drCrIndicator: 'C', glAccount: 'FX Exchange EUR', currency: 'USD', amount: '216.62' }),
        fx({ entryId: 'c-nostro', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'EUR', amount: '200.00' }),
      ];

      const groups = comp.currencyGroups;
      const eur = groups.find((g) => g.currency === 'EUR')!;

      expect(eur.entries.map((e) => ({ drCrIndicator: e.drCrIndicator, glAccount: e.glAccount }))).toEqual([
        { drCrIndicator: 'D', glAccount: 'FX Exchange USD' },
        { drCrIndicator: 'C', glAccount: 'NOSTRO-ACC' },
      ]);
      expect(eur).toMatchObject({ totalDebit: '200.00', totalCredit: '200.00', difference: '0.00', balanced: true });
    });

    it('never sums amounts across currencies — each group totals only its own currency', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '100' }),
        fx({ entryId: 'c1', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'USD', amount: '100' }),
        fx({ entryId: 'd2', drCrIndicator: 'D', glAccount: 'CUST-ACC2', currency: 'EUR', amount: '100' }),
        fx({ entryId: 'c2', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC2', currency: 'EUR', amount: '100' }),
      ];

      const groups = comp.currencyGroups;
      expect(groups.find((g) => g.currency === 'USD')).toMatchObject({ totalDebit: '100.00', totalCredit: '100.00', difference: '0.00', balanced: true });
      expect(groups.find((g) => g.currency === 'EUR')).toMatchObject({ totalDebit: '100.00', totalCredit: '100.00', difference: '0.00', balanced: true });
    });

    it('flags a currency as Unbalanced when its own debit/credit totals differ, independent of other currencies balancing', () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '100' }),
        fx({ entryId: 'c1', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'USD', amount: '90' }),
      ];

      const [group] = comp.currencyGroups;
      expect(group).toMatchObject({ currency: 'USD', totalDebit: '100.00', totalCredit: '90.00', difference: '10.00', balanced: false });
    });

    it('respects the currencyDecimals input for a zero-decimal currency (e.g. JPY) when deciding Balanced', () => {
      const comp = new ResponseViewerComponent();
      comp.currencyDecimals = { JPY: 0 };
      comp.accountEntries = [
        fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'JPY', amount: '1000' }),
        fx({ entryId: 'c1', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'JPY', amount: '1000' }),
      ];

      const [group] = comp.currencyGroups;
      expect(group.totalDebit).toBe('1000');
      expect(group.totalCredit).toBe('1000');
      expect(group.balanced).toBe(true);
    });

    it('falls back to 2 decimal places when a currency is missing from currencyDecimals', () => {
      const comp = new ResponseViewerComponent();
      comp.currencyDecimals = {};
      comp.accountEntries = [fx({ entryId: 'd1', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'GBP', amount: '10' })];

      expect(comp.currencyGroups[0]!.totalDebit).toBe('10.00');
    });

    it("tags each row with entryType so both legs of an FX pair split across currencies remain traceable to each other", () => {
      const comp = new ResponseViewerComponent();
      comp.accountEntries = [
        fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
        fx({ entryId: 'trx-credit', drCrIndicator: 'C', glAccount: 'FX Exchange EUR', currency: 'USD', amount: '55' }),
        fx({ entryId: 'other-debit', drCrIndicator: 'D', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '50' }),
      ];

      const groups = comp.currencyGroups;
      const usdRow = groups.find((g) => g.currency === 'USD')!.entries.find((e) => e.glAccount === 'FX Exchange EUR')!;
      const eurRow = groups.find((g) => g.currency === 'EUR')!.entries.find((e) => e.glAccount === 'FX Exchange USD')!;
      expect(usdRow.entryType).toBe('FX Credit Leg Pair');
      expect(eurRow.entryType).toBe('FX Credit Leg Pair');
    });

    describe('debitFxPairs/creditFxPairs inclusion (fixes false UNBALANCED when a real leg\'s own currency differs from the transaction currency)', () => {
      it('the exact reported scenario: a plain EUR debit leg + USD credit leg (no suspenseBridge at all) — without the FX overlay each currency would show only one side; with it, both EUR and USD balance', () => {
        const comp = new ResponseViewerComponent();
        comp.accountEntries = [
          fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'EUR', amount: '9232.95' }),
          fx({ entryId: 'c-nostro', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'USD', amount: '10000.00' }),
        ];
        comp.debitFxPairs = [
          { drCr: 'D', account: 'FX Exchange EUR', currency: 'USD', amount: 10000, site: 'Trx Ccy' },
          { drCr: 'C', account: 'FX Exchange USD', currency: 'EUR', amount: 9232.95, site: 'Other Ccy' },
        ];

        const groups = comp.currencyGroups;
        const eur = groups.find((g) => g.currency === 'EUR')!;
        const usd = groups.find((g) => g.currency === 'USD')!;

        expect(eur).toMatchObject({ totalDebit: '9232.95', totalCredit: '9232.95', difference: '0.00', balanced: true });
        expect(usd).toMatchObject({ totalDebit: '10000.00', totalCredit: '10000.00', difference: '0.00', balanced: true });

        expect(eur.entries.map((e) => ({ drCrIndicator: e.drCrIndicator, glAccount: e.glAccount, amount: e.amount, entryType: e.entryType }))).toEqual([
          { drCrIndicator: 'D', glAccount: 'CUST-ACC', amount: '9232.95', entryType: 'Customer / Debit Legs' },
          { drCrIndicator: 'C', glAccount: 'FX Exchange USD', amount: '9232.95', entryType: 'Debit FX Conversion Pair' },
        ]);
        // 2026-08-13: Debit rows always sort before Credit rows within a currency group — the
        // 'D' FX overlay entry (pushed after 'Settlement / Credit Legs' by insertion order) now
        // sorts ahead of the 'C' NOSTRO-ACC entry.
        expect(usd.entries.map((e) => ({ drCrIndicator: e.drCrIndicator, glAccount: e.glAccount, amount: e.amount, entryType: e.entryType }))).toEqual([
          { drCrIndicator: 'D', glAccount: 'FX Exchange EUR', amount: '10000', entryType: 'Debit FX Conversion Pair' },
          { drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', amount: '10000.00', entryType: 'Settlement / Credit Legs' },
        ]);
      });

      it("without debitFxPairs/creditFxPairs bound (old behavior), the same scenario falsely shows both currencies as Unbalanced — pinning down the bug this fix closes", () => {
        const comp = new ResponseViewerComponent();
        comp.accountEntries = [
          fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'EUR', amount: '9232.95' }),
          fx({ entryId: 'c-nostro', drCrIndicator: 'C', glAccount: 'NOSTRO-ACC', currency: 'USD', amount: '10000.00' }),
        ];
        // debitFxPairs/creditFxPairs left at their default []

        const groups = comp.currencyGroups;
        expect(groups.find((g) => g.currency === 'EUR')).toMatchObject({ totalDebit: '9232.95', totalCredit: '0.00', balanced: false });
        expect(groups.find((g) => g.currency === 'USD')).toMatchObject({ totalDebit: '0.00', totalCredit: '10000.00', balanced: false });
      });

      it('creditFxPairs entries are similarly included, tagged "Credit FX Conversion Pair"', () => {
        const comp = new ResponseViewerComponent();
        comp.accountEntries = [
          fx({ entryId: 'd-nostro', drCrIndicator: 'D', glAccount: 'NOSTRO-ACC', currency: 'USD', amount: '10000.00' }),
          fx({ entryId: 'c-cust', drCrIndicator: 'C', glAccount: 'CUST-ACC', currency: 'EUR', amount: '9232.95' }),
        ];
        comp.creditFxPairs = [
          { drCr: 'C', account: 'FX Exchange EUR', currency: 'USD', amount: 10000, site: 'Trx Ccy' },
          { drCr: 'D', account: 'FX Exchange USD', currency: 'EUR', amount: 9232.95, site: 'Other Ccy' },
        ];

        const groups = comp.currencyGroups;
        expect(groups.find((g) => g.currency === 'EUR')).toMatchObject({ totalDebit: '9232.95', totalCredit: '9232.95', balanced: true });
        expect(groups.find((g) => g.currency === 'USD')).toMatchObject({ totalDebit: '10000.00', totalCredit: '10000.00', balanced: true });
        const eurFxRow = groups.find((g) => g.currency === 'EUR')!.entries.find((e) => e.glAccount === 'FX Exchange USD')!;
        expect(eurFxRow.entryType).toBe('Credit FX Conversion Pair');
      });

      it('never double-counts a currency that already has a real server-generated FX Exchange leg pair in groupedSettlementEntries — Currency View sums each currency\'s entries exactly once regardless of source', () => {
        const comp = new ResponseViewerComponent();
        comp.accountEntries = [
          fx({ entryId: 'd-cust', drCrIndicator: 'D', glAccount: 'CUST-ACC', currency: 'USD', amount: '1000' }),
          fx({ entryId: 'trx-credit', drCrIndicator: 'C', glAccount: 'FX Exchange EUR', currency: 'USD', amount: '55' }),
          fx({ entryId: 'other-debit', drCrIndicator: 'D', glAccount: 'FX Exchange USD', currency: 'EUR', amount: '50' }),
        ];
        // In practice the parent filters debitFxPairs/creditFxPairs via filterFxPairsNettedBySuspense so a
        // currency already covered by a real generated FX leg pair never also arrives here — simulated by
        // simply not populating debitFxPairs/creditFxPairs for this scenario.

        const groups = comp.currencyGroups;
        expect(groups.find((g) => g.currency === 'USD')!.entries).toHaveLength(2);
        expect(groups.find((g) => g.currency === 'EUR')!.entries).toHaveLength(1);
      });
    });
  });
});
