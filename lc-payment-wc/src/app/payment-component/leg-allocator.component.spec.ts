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
  } as unknown as CurrencyService;

  const comp = new LegAllocatorComponent(mockFx, mockCurrency);
  comp.side = 'DEBIT';
  comp.accountTypeOptions = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];
  comp.defaultAccountType = 'CUSTOMER';
  comp.defaultAccountNo = 'CUST-ACC';
  comp.initialTotalAmount = '10000';
  comp.initialCurrency = 'USD';

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
        initialTotalAmount: new SimpleChange(undefined, '10000', true),
        initialCurrency: new SimpleChange(undefined, 'USD', true),
      });

      expect(comp.rows[0]!.id).toBe(rowIdBefore);
    });

    it('resets on a later change to initialTotalAmount (parent switched business cases)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;
      comp.initialTotalAmount = '5000';

      comp.ngOnChanges({
        initialTotalAmount: new SimpleChange('10000', '5000', false),
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
});
