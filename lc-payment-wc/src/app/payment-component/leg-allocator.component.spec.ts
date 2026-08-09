import { SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import Decimal from 'decimal.js';
import { LegAllocatorComponent } from './leg-allocator.component';
import type { FxRateService } from './fx-rate.service';
import type { CurrencyService } from './currency.service';
import type { PaymentLegInput } from './payment-component.types';

function makeComponent(overrides: Partial<{ crossRate: number | null }> = {}) {
  const mockFx = {
    rates: jest.fn(() => of({ 'USD/TWD': 32.5, 'EUR/TWD': 35.2 })),
    crossRate: jest.fn(() => (overrides.crossRate === undefined ? 2 : overrides.crossRate)),
  } as unknown as FxRateService;

  const mockCurrency = {
    codes: jest.fn(() => of(['USD', 'EUR', 'JPY', 'GBP', 'TWD'])),
    decimals: jest.fn(() => of({ USD: 2, EUR: 2, JPY: 0, GBP: 2, TWD: 0 })),
  } as unknown as CurrencyService;

  const comp = new LegAllocatorComponent(mockFx, mockCurrency);
  comp.side = 'DEBIT';
  comp.accountTypeOptions = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];
  comp.defaultAccountType = 'CUSTOMER';
  comp.defaultAccountNo = 'CUST-ACC';
  comp.initialTotalAmount = '10000';
  comp.initialCurrency = 'USD';
  comp.caseKey = 'case-1';

  const emittedLegs: PaymentLegInput[][] = [];
  const emittedValid: boolean[] = [];
  comp.legsChange.subscribe((legs) => emittedLegs.push(legs));
  comp.validChange.subscribe((valid) => emittedValid.push(valid));

  return { comp, mockFx, mockCurrency, emittedLegs, emittedValid };
}

describe('LegAllocatorComponent', () => {
  describe('initial reset (ngOnInit)', () => {
    it('starts with a single 100% remainder row matching the inputs', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();

      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]!.pct.toNumber()).toBe(100);
      expect(comp.rows[0]!.isRemainder).toBe(true);
      expect(comp.rows[0]!.accountType).toBe('CUSTOMER');
      expect(comp.rows[0]!.accountNo).toBe('CUST-ACC');
      expect(comp.rows[0]!.currency).toBe('USD');
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(10000);

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit).toEqual([{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10000.00' }]);
    });

    it('seeds the RTGS indicator from defaultRtgsIndicator when the default account type is NOSTRO', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.defaultRtgsIndicator = true;
      comp.ngOnInit();

      expect(comp.rows[0]!.rtgsIndicator).toBe(true);
      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBe(true);
    });
  });

  describe('remainder rounding (regression: total=0.35, 30/70 split must sum to exactly 0.35)', () => {
    it('derives the remainder amount as total-minus-fixed, not an independently rounded percentage', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '0.35';
      comp.ngOnInit();

      comp.onPctInput(comp.rows[0]!, 30);

      expect(comp.rows).toHaveLength(2);
      const [fixedRow, remainderRow] = comp.rows;
      expect(fixedRow!.pct.toNumber()).toBe(30);
      expect(fixedRow!.amountTxCcy.toNumber()).toBe(0.11); // 0.35 * 30% = 0.105 -> rounds to 0.11
      expect(remainderRow!.isRemainder).toBe(true);
      // NOT 0.25 (0.35 * 70% independently rounded) — must be 0.35 - 0.11 = 0.24 exactly.
      expect(remainderRow!.amountTxCcy.toNumber()).toBe(0.24);

      const sum = fixedRow!.amountTxCcy.plus(remainderRow!.amountTxCcy);
      expect(sum.toNumber()).toBe(0.35);
    });

    it('with TWO independently-fixed rows — one same-currency-different-account, one foreign-currency — the remainder is Total - SUM(Trx Equivalent) - Other Trx Amount, exact to the cent (both terms Decimal-summed, one final rounding pass — not two separately-rounded subtractions)', () => {
      const { comp } = makeComponent({ crossRate: 2 });
      comp.ngOnInit(); // rows[0]: 100% remainder, USD, total=10000

      // "Add Row" freezes the CURRENT remainder as fixed without creating a new one (nothing left
      // over yet) — the documented "manual multi-row control" escape hatch (see addRow's own tests)
      // that lets a SECOND row be fixed afterward without fixRow's swap-fallback promoting rows[0]
      // back to remainder out from under it.
      comp.addRow(); // rows[0] fixed @ 100% / 10000.00, no remainder anywhere

      // Row 1: "Other Trx Amount (Same Currency, different account)" — same currency as the
      // transaction (USD), a genuinely different account, fixed directly via onAmountInput.
      comp.onAmountInput(comp.rows[0]!, 333.33);
      expect(comp.rows).toHaveLength(2);
      const otherSameCcyRow = comp.rows[0]!;
      const remainderAfterRow0 = comp.rows[1]!;
      expect(remainderAfterRow0.isRemainder).toBe(true);
      expect(remainderAfterRow0.amountTxCcy.toNumber()).toBe(9666.67); // 10000 - 333.33

      // Freeze THIS remainder too, so fixing the next (foreign-currency) row doesn't swap
      // otherSameCcyRow back to remainder.
      comp.addRow(); // rows[1] fixed @ its current 9666.67, still no remainder anywhere

      // Row 2 (the just-frozen rows[1]): "SUM(Trx Equivalent)" — foreign currency, amount typed
      // in its OWN currency ("this leg pays EUR 250"), converted via onAccountAmountInput.
      const foreignRow = comp.rows[1]!;
      comp.onRowCurrencyChange(foreignRow, 'EUR');
      comp.onAccountAmountInput(foreignRow, 250); // amountTxCcy = money(250 / rate) = money(250/2) = 125.00
      expect(foreignRow.amountTxCcy.toNumber()).toBe(125);

      expect(comp.rows).toHaveLength(3);
      const finalRemainder = comp.rows[2]!;
      expect(finalRemainder.isRemainder).toBe(true);
      expect(finalRemainder.currency).toBe('USD');
      // Total(10000) - SUM(Trx Equivalent)(125.00) - Other Trx Amount(333.33) = 9541.67, exactly.
      expect(finalRemainder.amountTxCcy.toNumber()).toBe(9541.67);

      // otherSameCcyRow's own fixed value must be untouched by fixing the foreign row afterward.
      expect(otherSameCcyRow.amountTxCcy.toNumber()).toBe(333.33);

      const total = otherSameCcyRow.amountTxCcy.plus(foreignRow.amountTxCcy).plus(finalRemainder.amountTxCcy);
      expect(total.toNumber()).toBe(10000);
    });
  });

  describe('row array stability (regression: *ngFor DOM-relocation/focus-loss bug)', () => {
    it('never reorders existing rows in the array when editing the fixed row', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();

      comp.onPctInput(comp.rows[0]!, 30); // creates rows[1] as the new remainder
      const [firstId, secondId] = comp.rows.map((r) => r.id);

      // Editing the first (now-fixed) row again must NOT move it in the array,
      // and must not move the remainder row either.
      comp.onPctInput(comp.rows[0]!, 45);
      expect(comp.rows.map((r) => r.id)).toEqual([firstId, secondId]);
      expect(comp.rows[1]!.pct.toNumber()).toBe(55);
    });

    it('editing the remainder row itself swaps fixed/remainder roles in place, without reordering or appending', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // rows = [row0 30% fixed, row1 70% remainder]
      const [firstId, secondId] = comp.rows.map((r) => r.id);

      // Editing rows[1] (the current remainder) fixes IT at the typed value;
      // since it was the sole remainder, fixRow()'s fallback promotes rows[0]
      // back to remainder rather than appending a third row — array positions
      // must stay exactly as they were.
      comp.onPctInput(comp.rows[1]!, 20);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[0]!.id).toBe(firstId);
      expect(comp.rows[1]!.id).toBe(secondId);
      expect(comp.rows[0]!.isRemainder).toBe(true);
      expect(comp.rows[0]!.pct.toNumber()).toBe(80);
      expect(comp.rows[1]!.isRemainder).toBe(false);
      expect(comp.rows[1]!.pct.toNumber()).toBe(20);
    });
  });

  describe('RTGS indicator threading', () => {
    it('includes rtgsIndicator:true on the emitted leg only for a NOSTRO row with the flag set', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.ngOnInit();
      comp.rows[0]!.rtgsIndicator = true;
      comp.onFieldChange();

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBe(true);
    });

    it('omits rtgsIndicator entirely (not false) when unset', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.ngOnInit();

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBeUndefined();
    });

    it('onAccountTypeChange resets rtgsIndicator to false when switching away from NOSTRO', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.defaultRtgsIndicator = true;
      comp.ngOnInit();
      expect(comp.rows[0]!.rtgsIndicator).toBe(true);

      comp.onAccountTypeChange(comp.rows[0]!, 'CUSTOMER');

      expect(comp.rows[0]!.rtgsIndicator).toBe(false);
      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBeUndefined();
    });

    it('makeRow forces rtgsIndicator false for a non-NOSTRO row even if a truthy default was passed', () => {
      const { comp } = makeComponent();
      comp.defaultAccountType = 'CUSTOMER';
      comp.defaultRtgsIndicator = true; // meaningless for CUSTOMER — must not leak through
      comp.ngOnInit();

      expect(comp.rows[0]!.rtgsIndicator).toBe(false);
    });
  });

  describe('onTotalChange', () => {
    it('rescales every row amount to match its existing percentage', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40%, rows[1]=60% remainder

      comp.onTotalChange(2000);

      expect(comp.totalAmount.toNumber()).toBe(2000);
      expect(comp.rows[0]!.pct.toNumber()).toBe(40);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(800);
      expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(1200);
    });

    it('regression (B-Tree driver XOR): a SAME-currency row driven by a directly-typed Amount (onAmountInput) keeps that amount EXACT — not rescaled by its derived % — when the total later changes for an unrelated reason', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // total = 10000, USD
      comp.onAmountInput(comp.rows[0]!, 500); // user types "USD 500" directly — Amount-driven, pct(5%) is DERIVED, not the source of truth
      const fixedRow = comp.rows.find((r) => !r.isRemainder)!;
      expect(fixedRow.driver).toBe('amount');

      comp.onTotalChange(20000); // e.g. a Suspense entry reseeds the total — totally unrelated to this row

      expect(fixedRow.amountTxCcy.toNumber()).toBe(500); // unchanged — NOT rescaled to 5% of 20000 (=1000)
      const remainderRow = comp.rows.find((r) => r.isRemainder)!;
      expect(remainderRow.amountTxCcy.toNumber()).toBe(19500); // EXACT: 20000 - 500
    });

    it('a Percentage-driven row (onPctInput) still rescales normally — the XOR default, unaffected by the amount-driven fix above', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 5); // Percentage-driven — 5% is the source of truth
      expect(comp.rows[0]!.driver).toBe('pct');

      comp.onTotalChange(20000);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(1000); // DOES rescale: 5% of 20000
    });

    it('regression: a fixed foreign-currency row keeps its own-currency amount EXACT — not rescaled by % — when the seeded total later changes for an unrelated reason (e.g. a Suspense entry)', () => {
      const { comp } = makeComponent({ crossRate: 1 }); // rate=1 so accountCcyAmount === amountTxCcy, isolating this test from FX-conversion arithmetic
      comp.ngOnInit(); // total = 10000, USD
      comp.onPctInput(comp.rows[0]!, 99.56); // rows[0]=99.56% fixed, rows[1]=0.44% remainder appears

      const eurRow = comp.rows.find((r) => r.isRemainder)!;
      comp.onRowCurrencyChange(eurRow, 'EUR');
      comp.onAccountAmountInput(eurRow, 40); // user types "EUR 40" — rows[0] (USD) is promoted back to remainder

      comp.onTotalChange(10110); // e.g. a Suspense Debit entry reseeds the total from 10000 to 10110

      expect(comp.accountCcyAmount(eurRow)).toBe(40); // unchanged — NOT rescaled to a stale-%-based drift
      const usdRow = comp.rows.find((r) => r.currency === 'USD')!;
      expect(usdRow.amountTxCcy.toNumber()).toBe(10070); // EXACT: 10110 - 40 (EUR row's own amountTxCcy), not a %-rescale
    });

    it('a foreign-currency row\'s pct is refreshed to 0 (not NaN/Infinity) when the new total is 0', () => {
      const { comp } = makeComponent({ crossRate: 1.5 });
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 99.56);
      const eurRow = comp.rows.find((r) => r.isRemainder)!;
      comp.onRowCurrencyChange(eurRow, 'EUR');
      comp.onAccountAmountInput(eurRow, 40);

      comp.onTotalChange(0);

      expect(eurRow.pct.toNumber()).toBe(0);
    });
  });

  describe('onCurrencyChange', () => {
    it('updates rows that do not have their own differing currency, and fetches FX rates for rows that do', () => {
      const { comp, mockFx } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR'; // now differs from transactionCurrency (USD)

      comp.onCurrencyChange('GBP');

      expect(comp.transactionCurrency).toBe('GBP');
      expect(comp.rows[0]!.currency).toBe('EUR'); // untouched — still needs its own rate
      expect(mockFx.rates).toHaveBeenCalled();
    });

    it('syncs a row currency that matched the old transaction currency to the new one', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // rows[0].currency === 'USD' === transactionCurrency

      comp.onCurrencyChange('GBP');

      expect(comp.rows[0]!.currency).toBe('GBP');
    });
  });

  describe('onRowCurrencyChange', () => {
    it('applies a fetched FX rate when the row currency now differs from the transaction currency', () => {
      const { comp, mockFx } = makeComponent({ crossRate: 1.5 });
      comp.ngOnInit();

      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');

      expect(comp.rows[0]!.currency).toBe('EUR');
      expect(mockFx.rates).toHaveBeenCalled();
      expect(comp.rows[0]!.rate.toNumber()).toBe(1.5);
      expect(comp.rows[0]!.exchangeAccountNo).toBe('FX Exchange USD');
    });

    it('leaves the existing rate untouched when the backend has no rate for the pair', () => {
      const { comp } = makeComponent({ crossRate: null });
      comp.ngOnInit();
      comp.rows[0]!.rate = new Decimal(3);

      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');

      expect(comp.rows[0]!.rate.toNumber()).toBe(3);
    });

    it('resets rate to 1 and clears exchangeAccountNo when set back to the transaction currency', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.rate = new Decimal(1.5);
      comp.rows[0]!.exchangeAccountNo = 'FX Exchange USD';

      comp.onRowCurrencyChange(comp.rows[0]!, 'USD');

      expect(comp.rows[0]!.rate.toNumber()).toBe(1);
      expect(comp.rows[0]!.exchangeAccountNo).toBe('');
    });
  });

  describe('addRow / removeRow', () => {
    it('converts the sole 100% remainder into a plain fixed row, with no new row yet (nothing left to leave a remainder for)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();

      comp.addRow();

      // No row is left marked remainder — this is the "manual multi-row control"
      // escape hatch: the auto-balance-to-100% safety net (fixRow's fallback
      // promotion) only re-engages once some OTHER row is the sole remainder.
      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]!.isRemainder).toBe(false);
      expect(comp.rows[0]!.pct.toNumber()).toBe(100);
    });

    it('a subsequent edit to the now-unmarked row creates a new row for the leftover, since nothing absorbs it automatically', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow(); // rows[0] is now fixed at 100%, no remainder marked anywhere

      comp.onPctInput(comp.rows[0]!, 60);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.pct.toNumber()).toBe(40);
    });

    it('addRow lets the user deliberately construct an over-allocated state across independently-fixed rows', () => {
      const { comp, emittedValid } = makeComponent();
      comp.ngOnInit();
      comp.addRow(); // rows[0] fixed 100%, no remainder
      comp.onPctInput(comp.rows[0]!, 50); // rows[0] fixed 50%, rows[1] 50% remainder (auto-created)
      comp.addRow(); // rows[1] converted to fixed too — neither row is remainder now

      comp.onPctInput(comp.rows[1]!, 80); // no remainder exists to absorb this -> total 130%

      expect(comp.totalPct).toBe(130);
      expect(comp.isOverAllocated).toBe(true);
      expect(emittedValid[emittedValid.length - 1]).toBe(false);
    });

    it('removeRow removes the given row and rebalances the remainder', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // rows[0]=30% fixed, rows[1]=70% remainder
      const secondRowId = comp.rows[1]!.id;

      comp.removeRow(comp.rows[0]!);

      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]!.id).toBe(secondRowId);
      expect(comp.rows[0]!.pct.toNumber()).toBe(100);
    });

    it('removeRow is a no-op when only one row remains', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const onlyRow = comp.rows[0]!;

      comp.removeRow(onlyRow);

      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]).toBe(onlyRow);
    });
  });

  describe('fxPairs', () => {
    it('is empty when every row shares the transaction currency', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.fxPairs).toEqual([]);
    });

    it('produces a Trx-Ccy-site and Other-Ccy-site pair for a mismatched-currency row, direction per side', () => {
      const { comp } = makeComponent();
      comp.side = 'DEBIT';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.1);

      const pairs = comp.fxPairs;

      expect(pairs).toHaveLength(2);
      expect(pairs[0]).toMatchObject({ drCr: 'D', site: 'Trx Ccy', currency: 'USD', account: 'FX Exchange EUR' });
      expect(pairs[1]).toMatchObject({ drCr: 'C', site: 'Other Ccy', currency: 'EUR', account: 'FX Exchange USD' });
    });

    it('flips direction for the CREDIT side', () => {
      const { comp } = makeComponent();
      comp.side = 'CREDIT';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';

      const pairs = comp.fxPairs;

      expect(pairs[0]!.drCr).toBe('C');
      expect(pairs[1]!.drCr).toBe('D');
    });
  });

  describe('validChange', () => {
    it('is false when a row has no account number', () => {
      const { comp, emittedValid } = makeComponent();
      comp.defaultAccountNo = '';
      comp.ngOnInit();
      expect(emittedValid[emittedValid.length - 1]).toBe(false);
    });

    it('is false when over-allocated', () => {
      const { comp, emittedValid } = makeComponent();
      comp.ngOnInit();
      comp.addRow(); // rows[0] fixed 100%, no remainder
      comp.onPctInput(comp.rows[0]!, 50); // rows[0] fixed 50%, rows[1] 50% remainder
      comp.addRow(); // rows[1] converted to fixed too
      comp.onPctInput(comp.rows[1]!, 80); // no remainder to absorb this -> 130%

      expect(comp.isOverAllocated).toBe(true);
      expect(emittedValid[emittedValid.length - 1]).toBe(false);
    });

    it('is true for a single fully-allocated row with a positive amount and account number', () => {
      const { comp, emittedValid } = makeComponent();
      comp.ngOnInit();
      expect(emittedValid[emittedValid.length - 1]).toBe(true);
    });
  });

  describe('ngOnChanges', () => {
    it('does not reset on the very first binding (ngOnInit already did)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;

      comp.ngOnChanges({
        caseKey: new SimpleChange(undefined, 'case-1', true),
      });

      expect(comp.rows[0]!.id).toBe(rowIdBefore);
    });

    it('resets on a later change to caseKey (parent switched business cases)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;
      comp.initialTotalAmount = '5000';
      comp.caseKey = 'case-2';

      comp.ngOnChanges({
        caseKey: new SimpleChange('case-1', 'case-2', false),
      });

      expect(comp.rows[0]!.id).not.toBe(rowIdBefore);
      expect(comp.totalAmount.toNumber()).toBe(5000);
    });

    it('ignores unrelated input changes', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;

      comp.ngOnChanges({
        defaultAccountNo: new SimpleChange('CUST-ACC', 'CUST-ACC-2', false),
      });

      expect(comp.rows[0]!.id).toBe(rowIdBefore);
    });

    it('treats a blank/invalid same-case initialTotalAmount as 0 (not NaN) when rescaling', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.initialTotalAmount = '';

      comp.ngOnChanges({
        initialTotalAmount: new SimpleChange('10000', '', false),
      });

      expect(comp.totalAmount.toNumber()).toBe(0);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('regression: a same-case initialTotalAmount change (e.g. a Suspense entry reseed) rescales the existing split in place instead of reset()ing it — must not revert an in-progress per-row currency edit', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40% fixed, rows[1]=60% remainder
      comp.onRowCurrencyChange(comp.rows[1]!, 'EUR'); // user gives the second leg its own currency
      const rowIdsBefore = comp.rows.map((r) => r.id);
      comp.initialTotalAmount = '12000'; // e.g. Suspense entries changed the live seed total

      comp.ngOnChanges({
        initialTotalAmount: new SimpleChange('10000', '12000', false),
      });

      expect(comp.rows.map((r) => r.id)).toEqual(rowIdsBefore); // no reset — same rows
      expect(comp.rows[0]!.pct.toNumber()).toBe(40);
      expect(comp.rows[1]!.currency).toBe('EUR'); // the user's currency edit survives
      expect(comp.totalAmount.toNumber()).toBe(12000);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(4800); // rescaled to the new total, same %
    });

    it('regression: a same-case initialCurrency change resyncs non-diverged rows without reset()ing the split', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40% fixed, rows[1]=60% remainder, both USD
      const rowIdsBefore = comp.rows.map((r) => r.id);
      comp.initialCurrency = 'GBP';

      comp.ngOnChanges({
        initialCurrency: new SimpleChange('USD', 'GBP', false),
      });

      expect(comp.rows.map((r) => r.id)).toEqual(rowIdsBefore); // no reset — same rows
      expect(comp.rows[0]!.currency).toBe('GBP');
      expect(comp.rows[1]!.currency).toBe('GBP');
    });
  });

  describe('needsRate / accountCcyAmount / isSplit', () => {
    it('needsRate is false when the row currency matches the transaction currency', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.needsRate(comp.rows[0]!)).toBe(false);
    });

    it('isSplit reflects whether there is more than one row', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.isSplit).toBe(false);
      comp.onPctInput(comp.rows[0]!, 30);
      expect(comp.isSplit).toBe(true);
    });

    it('accountCcyAmount multiplies amountTxCcy by rate, rounded to 2dp', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.amountTxCcy = new Decimal(100);
      comp.rows[0]!.rate = new Decimal(1.234);
      expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(123.4);
    });
  });

  describe('onAmountInput', () => {
    it('derives pct from the typed amount against the total', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // total = 10000

      comp.onPctInput(comp.rows[0]!, 100); // no-op split-wise, just to reach a stable single-row state
      comp.onAmountInput(comp.rows[0]!, 2500);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(2500);
      expect(comp.rows[0]!.pct.toNumber()).toBe(25);
    });

    it('clamps a negative typed amount to 0', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, -500);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('sets pct to 0 (not NaN/Infinity) when totalAmount is 0', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '0';
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 500);
      expect(comp.rows[0]!.pct.toNumber()).toBe(0);
    });

    it('creates a remainder row for the leftover, same as onPctInput', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // total = 10000
      comp.onAmountInput(comp.rows[0]!, 4000);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(6000);
    });
  });

  describe('onAccountAmountInput', () => {
    it('derives amountTxCcy by dividing the typed account-currency amount by the row rate', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, 30); // EUR 30 / 1.5 = USD 20

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(20);
      expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(30);
    });

    it('derives pct from the resulting amountTxCcy against the total', () => {
      const { comp } = makeComponent(); // total = 10000
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(2);

      comp.onAccountAmountInput(comp.rows[0]!, 5000); // EUR 5000 / 2 = USD 2500 = 25%

      expect(comp.rows[0]!.pct.toNumber()).toBe(25);
    });

    it('sets pct to 0 (not NaN/Infinity) when totalAmount is 0', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '0';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, 30);

      expect(comp.rows[0]!.pct.toNumber()).toBe(0);
    });

    it('clamps a negative typed account amount to 0', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, -30);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('treats a falsy typed account amount (0) as 0, not NaN', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, 0);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('treats a zero rate as amountTxCcy 0 rather than dividing by zero', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(0);

      comp.onAccountAmountInput(comp.rows[0]!, 30);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('creates a remainder row for the leftover, same as onAmountInput', () => {
      const { comp } = makeComponent(); // total = 10000
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1);

      comp.onAccountAmountInput(comp.rows[0]!, 4000);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(6000);
    });
  });

  describe('emit — transaction-currency leg ordering (regression)', () => {
    it('a transaction-currency-matching leg is always emitted FIRST, even when the user recolors the SOLE row to a foreign currency directly (instead of splitting off a new row first)', () => {
      const { comp, emittedLegs } = makeComponent({ crossRate: 1 });
      comp.ngOnInit(); // rows[0] = sole 100% row, USD (this.transactionCurrency stays 'USD' — onRowCurrencyChange never touches it)

      // User recolors the ONLY existing row to EUR directly (Leg Currency dropdown on that
      // row), rather than adding a second row for the foreign leg. Per the row-array-stability
      // invariant, this row keeps array position 0 for the rest of its life.
      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');
      comp.onAccountAmountInput(comp.rows[0]!, 100); // types "EUR 100" — this has no OTHER row to
      // promote as remainder yet, so ensureRemainderRow() appends a FRESH USD row at index 1.

      expect(comp.rows[0]!.currency).toBe('EUR'); // internal array order is untouched — EUR is still rows[0]
      expect(comp.rows[1]!.currency).toBe('USD');

      const emitted = emittedLegs[emittedLegs.length - 1]!;
      // The EMITTED order must NOT mirror internal array order here: server-side
      // (confirmPaymentInstruction.ts) defines "transaction currency" as debitLegs[0].currency —
      // if EUR were emitted first, the server would treat EUR as the transaction currency and
      // Suspense netting/FX decisions downstream would be silently wrong.
      expect(emitted[0]!.currency).toBe('USD');
      expect(emitted[1]!.currency).toBe('EUR');
    });

    it('a same-currency leg stays first when the transaction currency has no foreign row at all', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // both rows stay USD — no reordering should occur

      const emitted = emittedLegs[emittedLegs.length - 1]!;
      expect(emitted.map((l) => l.currency)).toEqual(['USD', 'USD']);
    });

    it('regression, full pipeline: after the SOLE row is recolored to EUR and a Suspense-driven total reseed follows, the transaction-currency leg both stays first AND lands on the exact netted amount', () => {
      const { comp, emittedLegs } = makeComponent({ crossRate: 1 }); // rate=1 isolates the ordering/exact-subtraction fix from FX-conversion arithmetic (covered elsewhere)
      comp.ngOnInit(); // total = 10000, USD

      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');
      comp.onAccountAmountInput(comp.rows[0]!, 100); // "EUR 100" — creates a fresh USD remainder row at index 1

      // Suspense Debit = EUR 100 (gross) reseeds the total: 10000 + 100 (rate=1) = 10100
      comp.initialTotalAmount = '10100';
      comp.ngOnChanges({ initialTotalAmount: new SimpleChange('10000', '10100', false) });

      const eurRow = comp.rows.find((r) => r.currency === 'EUR')!;
      const usdRow = comp.rows.find((r) => r.currency === 'USD')!;
      expect(comp.accountCcyAmount(eurRow)).toBe(100); // EUR leg unchanged — matches gross Suspense exactly (Net = 0)
      expect(usdRow.amountTxCcy.toNumber()).toBe(10000); // EXACT: 10100 - 100, not a %-rescale artifact

      const emitted = emittedLegs[emittedLegs.length - 1]!;
      expect(emitted[0]!).toMatchObject({ currency: 'USD', amountTxCcy: '10000.00' });
      expect(emitted[1]!).toMatchObject({ currency: 'EUR', amountAccountCcy: '100.00' });
    });
  });

  describe('onRateInput', () => {
    it('sets the row rate from the typed value', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR'; // needsRate -> rate/drBuyRate actually gets emitted

      comp.onRateInput(comp.rows[0]!, 1.25);

      expect(comp.rows[0]!.rate.toNumber()).toBe(1.25);
      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.drBuyRate).toBe('1.250000');
    });

    it('clamps a negative typed rate to 0', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onRateInput(comp.rows[0]!, -2);
      expect(comp.rows[0]!.rate.toNumber()).toBe(0);
    });

    it('emits crBuyRate (not drBuyRate) for the CREDIT side', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.side = 'CREDIT';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';

      comp.onRateInput(comp.rows[0]!, 1.5);

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.crBuyRate).toBe('1.500000');
      expect(lastEmit[0]!.drBuyRate).toBeUndefined();
    });
  });

  describe('label / toNum / trackById', () => {
    it('label reflects the side', () => {
      const { comp } = makeComponent();
      comp.side = 'DEBIT';
      expect(comp.label).toBe('Debit');
      comp.side = 'CREDIT';
      expect(comp.label).toBe('Credit');
    });

    it('toNum converts a Decimal to a plain number', () => {
      const { comp } = makeComponent();
      expect(comp.toNum(new Decimal('12.5'))).toBe(12.5);
    });

    it('trackById returns the row id', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.trackById(0, comp.rows[0]!)).toBe(comp.rows[0]!.id);
    });
  });

  describe('amountScaleErrors (H-2: leg amount over-precision vs Currency API decimals)', () => {
    it('flags an Amount (Tx Ccy) typed with more decimals than the transaction currency allows (USD = 2)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 9999.112);
      expect(comp.amountScaleErrors).toHaveLength(1);
      expect(comp.amountScaleErrors[0]).toContain('DEBIT leg amount 9999.112');
      expect(comp.amountScaleErrors[0]).toContain('USD allows at most 2');
    });

    it('emits the scale errors via scaleErrorsChange so the parent can block', () => {
      const { comp } = makeComponent();
      const emitted: string[][] = [];
      comp.scaleErrorsChange.subscribe((e) => emitted.push(e));
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.123);
      expect(emitted[emitted.length - 1]).toEqual([expect.stringContaining('USD allows at most 2')]);
    });

    it('does not flag an amount that fits the currency (2dp for USD)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.12);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('flags ANY decimals for a 0-dp transaction currency (JPY)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onCurrencyChange('JPY');
      comp.onAmountInput(comp.rows[0]!, 10.5);
      expect(comp.amountScaleErrors[0]).toContain('JPY allows at most 0');
    });

    it('flags an over-precise Account Ccy Equiv. against the ROW currency (EUR = 2)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR'); // row becomes foreign -> needsRate, account-ccy input editable
      comp.onAccountAmountInput(comp.rows[0]!, 12.123);
      expect(comp.amountScaleErrors[0]).toContain('EUR allows at most 2');
    });

    it('clears a row error once its amount is re-driven by a clean % edit', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.123);
      expect(comp.amountScaleErrors).toHaveLength(1);
      comp.onPctInput(comp.rows[0]!, 50);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('SKIPS a currency absent from the Currency master (source of truth) — no false rejection', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onRowCurrencyChange(comp.rows[0]!, 'BHD'); // not in the decimals map
      comp.onAccountAmountInput(comp.rows[0]!, 1.234);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('clears stale errors when the transaction currency changes', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.123);
      expect(comp.amountScaleErrors).toHaveLength(1);
      comp.onCurrencyChange('EUR');
      expect(comp.amountScaleErrors).toEqual([]);
    });
  });
});
