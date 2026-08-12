import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BusinessCaseRunnerComponent } from './business-case-runner.component';
import { LegAllocatorComponent } from './leg-allocator.component';
import { MODULE_GROUPS } from './business-case-registry';
import { PaymentComponentApiError, type PaymentComponentApiService } from './payment-component-api.service';
import type { CurrencyService } from './currency.service';
import type { FxRateService } from './fx-rate.service';
import type { BusinessCaseConfig, LegSpec } from './business-case.model';
import type { PaymentLegInput } from './payment-component.types';
import type { SuspenseEntry } from './suspense-entries.component';
import type { FxPairEntry } from './leg-allocator.component';

function leg(overrides: Partial<LegSpec> = {}): LegSpec {
  return {
    side: 'DEBIT',
    label: 'Debit',
    defaultAccountNo: 'CUST-ACC',
    defaultAccountType: 'CUSTOMER',
    accountTypeOptions: ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'],
    defaultCurrency: 'USD',
    defaultAmountTxCcy: '1000',
    ...overrides,
  };
}

function passConfig(overrides: Partial<BusinessCaseConfig> = {}): BusinessCaseConfig {
  return {
    id: 'case-1',
    module: 'IPLC',
    functionLabel: 'Pay/Accept',
    verdict: 'PASS',
    citation: 'test citation',
    note: 'test note',
    sourceFunctionCode: 'PayAccept',
    legs: [
      leg({ side: 'DEBIT', defaultAccountNo: 'CUST-ACC', defaultAccountType: 'CUSTOMER', defaultCurrency: 'USD', defaultAmountTxCcy: '1000' }),
      leg({ side: 'CREDIT', defaultAccountNo: 'NOSTRO-ACC', defaultAccountType: 'NOSTRO', defaultCurrency: 'USD', defaultAmountTxCcy: '1000' }),
    ],
    ...overrides,
  };
}

function gapConfig(overrides: Partial<BusinessCaseConfig> = {}): BusinessCaseConfig {
  return {
    id: 'gap-1',
    module: 'RPFM',
    functionLabel: 'Process Grantor',
    verdict: 'GAP',
    citation: 'gap citation',
    note: 'gap note',
    legs: [],
    ...overrides,
  };
}

function naConfig(overrides: Partial<BusinessCaseConfig> = {}): BusinessCaseConfig {
  return {
    id: 'na-1',
    module: 'CFNC',
    functionLabel: 'All CFNC Confirm Functions',
    verdict: 'N_A',
    citation: 'na citation',
    note: 'na note',
    legs: [],
    moduleStats: 'non-user',
    ...overrides,
  };
}

function debitLeg(overrides: Partial<PaymentLegInput> = {}): PaymentLegInput {
  return { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '1000', ...overrides };
}
function creditLeg(overrides: Partial<PaymentLegInput> = {}): PaymentLegInput {
  return { accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '1000', ...overrides };
}
function entry(amount: string, currency: string, sourceComponent: SuspenseEntry['sourceComponent'] = 'CHARGE'): SuspenseEntry {
  return { amount, currency, sourceComponent };
}

function makeComponent(overrides: { crossRate?: number | null; decimals?: Record<string, number> } = {}) {
  const mockApi = {
    confirm: jest.fn(),
    classify: jest.fn(),
  } as unknown as PaymentComponentApiService;

  const mockCurrency = {
    options: jest.fn(() =>
      of([
        { label: 'USD', value: 'USD' },
        { label: 'EUR', value: 'EUR' },
      ]),
    ),
    codes: jest.fn(() => of(['USD', 'EUR'])),
    decimals: jest.fn(() => of(overrides.decimals ?? {})),
  } as unknown as CurrencyService;

  const mockFx = {
    rates: jest.fn(() => of({ 'USD/TWD': 32.5, 'EUR/TWD': 35.2 })),
    crossRate: jest.fn((_rates: unknown, from: string, to: string) => {
      if (from === to) return 1;
      return overrides.crossRate === undefined ? 2 : overrides.crossRate;
    }),
  } as unknown as FxRateService;

  const comp = new BusinessCaseRunnerComponent(mockApi, mockCurrency, mockFx);
  return { comp, mockApi, mockCurrency, mockFx };
}

describe('BusinessCaseRunnerComponent', () => {
  describe('transactionCurrency / baseTotalAmount', () => {
    it('default to USD / 0 when no case is selected', () => {
      const { comp } = makeComponent();
      expect(comp.transactionCurrency).toBe('USD');
      expect(comp.baseTotalAmount).toBe(0);
    });

    it('derive from the DEBIT-side leg defaults of the selected case', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultCurrency: 'EUR', defaultAmountTxCcy: '2500' }), leg({ side: 'CREDIT', defaultCurrency: 'EUR', defaultAmountTxCcy: '2500' })] }));
      expect(comp.transactionCurrency).toBe('EUR');
      expect(comp.baseTotalAmount).toBe(2500);
    });

    it('sums multiple DEBIT legs for baseTotalAmount', () => {
      const { comp } = makeComponent();
      comp.selectCase(
        passConfig({
          legs: [
            leg({ side: 'DEBIT', defaultAmountTxCcy: '600' }),
            leg({ side: 'DEBIT', defaultAmountTxCcy: '400' }),
            leg({ side: 'CREDIT', defaultAmountTxCcy: '1000' }),
          ],
        }),
      );
      expect(comp.baseTotalAmount).toBe(1000);
    });

    it('treats a malformed/empty defaultAmountTxCcy as 0 rather than NaN', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '1000' })] }));
      expect(comp.baseTotalAmount).toBe(0);
    });
  });

  describe('transactionCurrencyOverride / transactionAmountOverride (Single Transaction Currency and Amount as Input Fields)', () => {
    it('onTransactionCurrencyInput/onTransactionAmountInput override transactionCurrency/baseTotalAmount, taking priority over the selected case\'s own registry legs', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultCurrency: 'USD', defaultAmountTxCcy: '1000' }), leg({ side: 'CREDIT', defaultCurrency: 'USD', defaultAmountTxCcy: '1000' })] }));

      comp.onTransactionCurrencyInput('EUR');
      comp.onTransactionAmountInput(250);

      expect(comp.transactionCurrency).toBe('EUR');
      expect(comp.baseTotalAmount).toBe(250);
      expect(comp.transactionCurrencyOverride).toBe('EUR');
      expect(comp.transactionAmountOverride).toBe('250');
    });

    it('a single override drives BOTH sides\' sideDefaults() equally (debitDefaults/creditDefaults), matching how every registry case already keeps both sides symmetric', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultCurrency: 'USD', defaultAmountTxCcy: '1000' }), leg({ side: 'CREDIT', defaultCurrency: 'USD', defaultAmountTxCcy: '1000' })] }));

      comp.onTransactionCurrencyInput('GBP');
      comp.onTransactionAmountInput(500);

      expect(comp.debitDefaults.currency).toBe('GBP');
      expect(comp.debitDefaults.totalAmount).toBe('500');
      expect(comp.creditDefaults.currency).toBe('GBP');
      expect(comp.creditDefaults.totalAmount).toBe('500');
    });

    it('onTransactionCurrencyInput(\'\') clears the override, reverting to the case\'s own derivation', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultCurrency: 'EUR', defaultAmountTxCcy: '2500' }), leg({ side: 'CREDIT', defaultCurrency: 'EUR', defaultAmountTxCcy: '2500' })] }));

      comp.onTransactionCurrencyInput('GBP');
      expect(comp.transactionCurrency).toBe('GBP');
      comp.onTransactionCurrencyInput('');
      expect(comp.transactionCurrencyOverride).toBeNull();
      expect(comp.transactionCurrency).toBe('EUR');
    });

    it('onTransactionAmountInput(null) (field cleared via NumberValueAccessor) clears the override, reverting to the case\'s own derivation', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '1000' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '1000' })] }));

      comp.onTransactionAmountInput(42);
      expect(comp.baseTotalAmount).toBe(42);
      comp.onTransactionAmountInput(null);
      expect(comp.transactionAmountOverride).toBeNull();
      expect(comp.baseTotalAmount).toBe(1000);
    });

    it('treats a non-numeric transactionAmountOverride (defensive — should not occur via onTransactionAmountInput itself) as 0 rather than NaN', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '1000' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '1000' })] }));
      comp.transactionAmountOverride = 'not-a-number';
      expect(comp.baseTotalAmount).toBe(0);
    });

    it('selectCase() resets both overrides to null so a freshly-picked case never inherits a previous case\'s override', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.onTransactionCurrencyInput('JPY');
      comp.onTransactionAmountInput(999);

      comp.selectCase(passConfig({ id: 'case-2' }));

      expect(comp.transactionCurrencyOverride).toBeNull();
      expect(comp.transactionAmountOverride).toBeNull();
    });
  });

  describe('currencyDecimalsMap', () => {
    it('exposes the same CurrencyService.decimals() map decimalsFor() uses internally, for <app-response-viewer>\'s Currency View', () => {
      const { comp } = makeComponent({ decimals: { JPY: 0, USD: 2 } });
      expect(comp.currencyDecimalsMap).toEqual({ JPY: 0, USD: 2 });
    });

    it('starts as {} before CurrencyService.decimals() has emitted', () => {
      const mockApi = { confirm: jest.fn(), classify: jest.fn() } as unknown as PaymentComponentApiService;
      const mockCurrency = { options: jest.fn(() => of([])), codes: jest.fn(() => of([])), decimals: jest.fn(() => of()) } as unknown as CurrencyService;
      const mockFx = { rates: jest.fn(() => of()), crossRate: jest.fn() } as unknown as FxRateService;
      const comp = new BusinessCaseRunnerComponent(mockApi, mockCurrency, mockFx);
      expect(comp.currencyDecimalsMap).toEqual({});
    });
  });

  describe('debitDefaults / creditDefaults (sideDefaults)', () => {
    it('with no Suspense entries, totalAmount equals the case default for each side', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      expect(comp.debitDefaults.totalAmount).toBe('1000');
      expect(comp.creditDefaults.totalAmount).toBe('1000');
      expect(comp.debitDefaults.currency).toBe('USD');
      expect(comp.debitDefaults.accountType).toBe('CUSTOMER');
      expect(comp.debitDefaults.accountNo).toBe('CUST-ACC');
      expect(comp.creditDefaults.accountType).toBe('NOSTRO');
    });

    it('falls back to sensible defaults (USD/CUSTOMER/"") when no case is selected at all', () => {
      const { comp } = makeComponent();
      expect(comp.debitDefaults).toEqual({
        totalAmount: '0',
        currency: 'USD',
        accountType: 'CUSTOMER',
        rtgsIndicator: false,
        accountNo: '',
        accountTypeOptions: ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'],
      });
    });

    it('Debit Leg #1 = Total + Suspense Debit (same currency, no FX conversion)', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.suspenseDebitEntries = [entry('150', 'USD')];
      expect(comp.debitDefaults.totalAmount).toBe('1150');
      expect(comp.creditDefaults.totalAmount).toBe('1000'); // unaffected
    });

    it('Credit Leg #1 = Total - Suspense Credit (same currency)', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.suspenseCreditEntries = [entry('75', 'USD')];
      expect(comp.creditDefaults.totalAmount).toBe('925');
      expect(comp.debitDefaults.totalAmount).toBe('1000'); // unaffected
    });

    it('sums multiple Suspense entries across different currencies, each converted at its own crossRate', () => {
      const { comp } = makeComponent({ crossRate: 2 }); // every non-USD pair converts at x2
      comp.selectCase(passConfig());
      comp.suspenseDebitEntries = [entry('100', 'USD'), entry('50', 'EUR')]; // 100 + 50*2 = 200
      expect(comp.debitDefaults.totalAmount).toBe('1200');
    });

    it('ignores a blank/zero-amount or currency-less entry', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.suspenseDebitEntries = [entry('', 'USD'), entry('0', 'USD'), entry('50', '')];
      expect(comp.debitDefaults.totalAmount).toBe('1000');
    });

    it('falls back to a 1:1 crossRate for the Leg #1 seeding total when the pair is unknown (null)', () => {
      const { comp } = makeComponent({ crossRate: null });
      comp.selectCase(passConfig());
      comp.suspenseDebitEntries = [entry('100', 'EUR')];
      expect(comp.debitDefaults.totalAmount).toBe('1100'); // 1000 + 100 * 1 (fallback rate)
    });

    it('totalAmount falls back to "0" (string) when the net result is exactly 0', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '0' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '0' })] }));
      expect(comp.debitDefaults.totalAmount).toBe('0');
    });

    describe('v1.7.4: the seed formula stays gross-only, deliberately blind to any live leg in the same currency', () => {
      it('a live leg in the SAME foreign currency as a Suspense entry has NO effect on the seed (v1.7.3 tried combining with it; reverted — see suspenseAdjustment()\'s doc comment)', () => {
        const { comp } = makeComponent({ crossRate: 2 });
        comp.selectCase(passConfig());
        comp.suspenseCreditEntries = [entry('100', 'EUR')];
        comp.creditLegs = [creditLeg({ currency: 'EUR', amountTxCcy: '92', amountAccountCcy: '80' })];

        // Unaffected by creditLegs — only the Suspense entry's own gross amount converts: 1000 - round(100*2,2) = 800.
        expect(comp.creditDefaults.totalAmount).toBe('800');
      });

      it('DEBIT side: same — a live leg in the matching currency has no effect on the seed', () => {
        const { comp } = makeComponent({ crossRate: 2 });
        comp.selectCase(passConfig());
        comp.suspenseDebitEntries = [entry('100', 'EUR')];
        comp.debitLegs = [debitLeg({ currency: 'USD' }), debitLeg({ currency: 'EUR', amountTxCcy: '92', amountAccountCcy: '180' })];

        expect(comp.debitDefaults.totalAmount).toBe('1200'); // 1000 + round(100*2,2) = 1200
      });

      it('multiple Suspense entries in the SAME foreign currency are converted and summed PER ENTRY, mirroring buildSuspenseBridgeLeg exactly (not bucket-summed-then-rounded-once)', () => {
        const { comp } = makeComponent({ crossRate: 2 });
        comp.selectCase(passConfig());
        comp.suspenseCreditEntries = [entry('60', 'EUR'), entry('40', 'EUR')];

        expect(comp.creditDefaults.totalAmount).toBe('800'); // round(60*2)+round(40*2) = 120+80 = 200; 1000-200=800 — identical to the single-100-entry case here since the rate is clean
      });

      it('summing multiple already-rounded per-entry trx-equivalents stays exact — no binary-float ULP drift (would otherwise show as e.g. "-33441.95999999999" instead of "-33441.96")', () => {
        // Reproduces a real plain-JS-number summation drift: round(6799.47*2.99,2)=20330.42 and
        // round(4535.90*2.99,2)=13562.34 individually, but 20330.42+13562.34 computed as IEEE-754
        // doubles (via `total += trxEquivalent` on a plain number, as this method did before it was
        // rewritten to accumulate via Decimal) lands one ULP off — String()'d as "33441.95999999999"
        // rather than "33441.96". suspenseAdjustment()/sideDefaults() now stay in Decimal until one
        // final rounding pass, so this must come out exact.
        const { comp } = makeComponent({ crossRate: 2.99 });
        comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '450.8' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '450.8' })] }));
        comp.suspenseCreditEntries = [entry('6799.47', 'EUR'), entry('4535.90', 'EUR')];

        expect(comp.creditDefaults.totalAmount).toBe('-33441.96');
      });

      it('DEBIT side: same ULP-drift check, addition direction (would otherwise show as e.g. "38611.979999999996" instead of "38611.98") — the SAME suspenseAdjustment()/sideDefaults() code path handles both sides, no separate DEBIT formula to independently verify', () => {
        // round(6157.18*4.21,2)=25921.73 and round(2864.82*4.21,2)=12062.29 individually; summed as
        // plain IEEE-754 doubles (DEBIT adds, unlike CREDIT's subtraction above) this specific pair
        // lands one ULP off the exact decimal sum — a different failure instance of the identical bug,
        // confirming the DEBIT direction needed the same Decimal-accumulation fix as CREDIT.
        const { comp } = makeComponent({ crossRate: 4.21 });
        comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '629.36' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '629.36' })] }));
        comp.suspenseDebitEntries = [entry('6157.18', 'EUR'), entry('2864.82', 'EUR')];

        expect(comp.debitDefaults.totalAmount).toBe('38611.98');
      });

      it("end-to-end with the REAL reciprocal FX-rate convention (EUR/TWD=35.20, USD/TWD=32.50): CUST-ACC2 seeds to 9783.38, and the reported 9675.07 (seed - a live EUR leg's own 108.31) is exactly what the server accepts — genuinely balances aggregate V8", () => {
        const mockApi = { confirm: jest.fn(), classify: jest.fn() } as unknown as PaymentComponentApiService;
        const mockCurrency = { options: jest.fn(() => of([])), codes: jest.fn(() => of([])), decimals: jest.fn(() => of({})) } as unknown as CurrencyService;
        const mockFx = {
          rates: jest.fn(() => of({})),
          crossRate: jest.fn((_rates: unknown, from: string, to: string) => {
            if (from === to) return 1;
            const twd = (ccy: string) => (ccy === 'USD' ? 32.5 : ccy === 'EUR' ? 35.2 : null);
            const f = twd(from);
            const t = twd(to);
            return f === null || t === null ? null : f / t;
          }),
        } as unknown as FxRateService;
        const comp = new BusinessCaseRunnerComponent(mockApi, mockCurrency, mockFx);

        comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '10000' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '10000' })] }));
        comp.suspenseCreditEntries = [entry('200', 'EUR')]; // gross Suspense Credit, converted alone
        comp.creditLegs = [creditLeg({ currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100' })]; // a live EUR leg present — must NOT affect the seed

        // round(200 * 35.20/32.50, 2dp) = round(216.6154, 2dp) = 216.62; seeded = 10000 - 216.62 = 9783.38.
        expect(comp.creditDefaults.totalAmount).toBe('9783.38');
        // The leg-allocator's own remainder = seed - the live leg's own fixed 108.31 = 9675.07 — this
        // IS the correct, server-accepted figure (see the end-to-end test below for the full proof).
      });

      it('END-TO-END with a REAL <app-leg-allocator> wired up exactly like the template does (creditDefaults.totalAmount -> [initialTotalAmount], legsChange -> onCreditLegsChange): typing "this leg pays EUR 100" via Account Ccy Equiv. settles the USD remainder row at 9675.07 and the full leg set balances aggregate V8 exactly', () => {
        const mockApi = { confirm: jest.fn(), classify: jest.fn() } as unknown as PaymentComponentApiService;
        const mockCurrency = {
          codes: jest.fn(() => of(['USD', 'EUR'])),
          options: jest.fn(() => of([])),
          decimals: jest.fn(() => of({})),
        } as unknown as CurrencyService;
        const mockFx = {
          rates: jest.fn(() => of({ 'USD/TWD': 32.5, 'EUR/TWD': 35.2 })),
          crossRate: jest.fn((_rates: unknown, from: string, to: string) => {
            if (from === to) return 1;
            const twd = (ccy: string) => (ccy === 'USD' ? 32.5 : ccy === 'EUR' ? 35.2 : null);
            const f = twd(from);
            const t = twd(to);
            return f === null || t === null ? null : f / t;
          }),
        } as unknown as FxRateService;

        const runner = new BusinessCaseRunnerComponent(mockApi, mockCurrency, mockFx);
        runner.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '10000' }), leg({ side: 'CREDIT', defaultAccountNo: 'NOSTRO-ACC2', defaultAmountTxCcy: '10000' })] }));
        runner.suspenseCreditEntries = [entry('200', 'EUR')]; // Credit Suspense EUR 200

        const allocator = new LegAllocatorComponent(mockFx, mockCurrency);
        allocator.side = 'CREDIT';
        allocator.accountTypeOptions = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];
        allocator.defaultAccountType = 'NOSTRO';
        allocator.defaultAccountNo = 'NOSTRO-ACC2';
        allocator.caseKey = 'case-1';
        allocator.initialTotalAmount = runner.creditDefaults.totalAmount;
        allocator.initialCurrency = runner.transactionCurrency;
        allocator.legsChange.subscribe((legs) => runner.onCreditLegsChange(legs));

        allocator.ngOnInit(); // single 100% NOSTRO-ACC2 row, seeded gross-only: 10000 - round(200*1.083077,2) = 9783.38
        expect(runner.creditLegs).toEqual([{ accountNo: 'NOSTRO-ACC2', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '9783.38' }]);

        // User drives the ONLY row directly in EUR ("this leg pays EUR 100" — "if input with amount for
        // credit side"). Fixing the sole row auto-spawns a fresh transaction-currency remainder row.
        const eurRow = allocator.rows[0]!;
        allocator.onRowCurrencyChange(eurRow, 'EUR');
        allocator.onAccountAmountInput(eurRow, 100);
        expect(allocator.rows).toHaveLength(2);
        const usdRemainderRow = allocator.rows[1]!;
        expect(usdRemainderRow.currency).toBe('USD');
        expect(usdRemainderRow.isRemainder).toBe(true);
        expect(eurRow.amountTxCcy.toNumber()).toBe(108.31); // fixed, amount-driven — never recomputed via rate again
        expect(usdRemainderRow.amountTxCcy.toNumber()).toBe(9675.07); // seed(9783.38) - 108.31 — matches the server's own figure

        // The seed is deliberately blind to the live EUR leg (v1.7.4) — re-reading creditDefaults after
        // legsChange must NOT move the total (this is what v1.7.3 got wrong: it recomputed here and, in
        // this exact scenario, produced a total that broke aggregate V8 instead of preserving it).
        expect(runner.creditDefaults.totalAmount).toBe('9783.38');

        // Full aggregate V8 check, replicating the server's own leg generation exactly:
        //  - Suspense Credit leg (own entry, independently rounded): round(200 * 1.083077, 2) = 216.62
        //  - FX Exchange pair (Combined_C = live leg's own EUR 100 + gross Suspense 200 = 300,
        //    converted ONCE): round(300 * 1.083077, 2) = 324.92 — the SAME value lands on both the
        //    debit-side and credit-side FX leg, so it cancels out of the aggregate check unconditionally.
        const suspenseLegTrxEq = 216.62;
        const fxPairTrxEq = 324.92;
        const totalDebit = 10000 /* CUST-ACC */ + fxPairTrxEq;
        const totalCredit = runner.creditLegs.reduce((sum, l) => sum + Number(l.amountTxCcy), 0) + suspenseLegTrxEq + fxPairTrxEq;
        expect(totalCredit).toBe(totalDebit); // exact equality — this is what balanceValidation.ts (V8) actually enforces
      });
    });

    describe('debitSuspenseCurrencyTotals / creditSuspenseCurrencyTotals (business-requirement-confirmed 2026-08-12: per-currency breakdown feeding leg-allocator\'s granularity-unification snap)', () => {
      it('groups entries by currency, exposing each bucket\'s raw total and its per-entry-rounded trxEquivalent — the SAME math suspenseAdjustment() itself uses', () => {
        const { comp } = makeComponent({ crossRate: 1.083077 });
        comp.selectCase(passConfig());
        comp.suspenseDebitEntries = [entry('10', 'USD'), entry('20', 'EUR'), entry('50', 'EUR')];

        expect(comp.debitSuspenseCurrencyTotals).toEqual({
          USD: { rawTotal: '10', trxEquivalent: '10.00' }, // same-currency pass-through, no conversion
          EUR: { rawTotal: '70', trxEquivalent: '75.81' }, // round(20*1.083077)+round(50*1.083077) = 21.66+54.15 = 75.81
        });
      });

      it('the per-currency bucket total agrees with suspenseAdjustment()\'s own aggregate figure — a breakdown, not a different total', () => {
        const { comp } = makeComponent({ crossRate: 1.083077 });
        comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '10000' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '10000' })] }));
        comp.suspenseDebitEntries = [entry('10', 'USD'), entry('20', 'EUR'), entry('50', 'EUR')];

        expect(comp.debitDefaults.totalAmount).toBe('10085.81'); // 10000 + 10 + 75.81
      });

      it('omits a currency entirely when it has no entries', () => {
        const { comp } = makeComponent();
        comp.selectCase(passConfig());
        comp.suspenseDebitEntries = [entry('20', 'EUR')];

        expect(comp.debitSuspenseCurrencyTotals['USD']).toBeUndefined();
      });

      it('the CREDIT-side getter mirrors the DEBIT one, independently', () => {
        const { comp } = makeComponent({ crossRate: 1.083077 });
        comp.selectCase(passConfig());
        comp.suspenseCreditEntries = [entry('20', 'EUR'), entry('50', 'EUR')];

        expect(comp.creditSuspenseCurrencyTotals).toEqual({ EUR: { rawTotal: '70', trxEquivalent: '75.81' } });
        expect(comp.debitSuspenseCurrencyTotals).toEqual({});
      });

      it("END-TO-END with a REAL <app-leg-allocator>: the EUR debit row's Account Ccy Equiv. snaps to the per-entry-rounded 75.81 (not the combined 75.82), so the USD remainder row lands at exactly 10010.00 — the reviewer-reported 1-cent gap is gone", () => {
        const mockApi = { confirm: jest.fn(), classify: jest.fn() } as unknown as PaymentComponentApiService;
        const mockCurrency = {
          codes: jest.fn(() => of(['USD', 'EUR'])),
          options: jest.fn(() => of([])),
          decimals: jest.fn(() => of({})),
        } as unknown as CurrencyService;
        const mockFx = {
          rates: jest.fn(() => of({ 'USD/TWD': 32.5, 'EUR/TWD': 35.2 })),
          crossRate: jest.fn((_rates: unknown, from: string, to: string) => {
            if (from === to) return 1;
            const twd = (ccy: string) => (ccy === 'USD' ? 32.5 : ccy === 'EUR' ? 35.2 : null);
            const f = twd(from);
            const t = twd(to);
            return f === null || t === null ? null : f / t;
          }),
        } as unknown as FxRateService;

        const runner = new BusinessCaseRunnerComponent(mockApi, mockCurrency, mockFx);
        runner.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '10000' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '10000' })] }));
        runner.suspenseDebitEntries = [entry('10', 'USD'), entry('20', 'EUR'), entry('50', 'EUR')];
        expect(runner.debitDefaults.totalAmount).toBe('10085.81'); // 10000 + round(10) + [round(20*1.083077)+round(50*1.083077)]

        const allocator = new LegAllocatorComponent(mockFx, mockCurrency);
        allocator.side = 'DEBIT';
        allocator.accountTypeOptions = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];
        allocator.defaultAccountType = 'CUSTOMER';
        allocator.defaultAccountNo = 'CUST-ACC';
        allocator.caseKey = 'case-1';
        allocator.initialTotalAmount = runner.debitDefaults.totalAmount;
        allocator.initialCurrency = runner.transactionCurrency;
        allocator.suspenseCurrencyTotals = runner.debitSuspenseCurrencyTotals;
        allocator.legsChange.subscribe((legs) => runner.onDebitLegsChange(legs));

        allocator.ngOnInit(); // single 100% CUST-ACC row, seeded at 10085.81
        expect(allocator.totalAmount.toNumber()).toBe(10085.81);

        const eurRow = allocator.rows[0]!;
        allocator.onRowCurrencyChange(eurRow, 'EUR'); // row.rate resolves to 32.5/35.2 = 0.923295 (6dp) — same convention the reported bug used
        allocator.onAccountAmountInput(eurRow, 70); // exactly the EUR bucket's rawTotal (20 + 50)
        expect(allocator.rows).toHaveLength(2);
        const usdRemainderRow = allocator.rows[1]!;

        expect(eurRow.amountTxCcy.toNumber()).toBe(75.81); // per-entry-rounded, NOT the combined-conversion 75.82
        expect(usdRemainderRow.amountTxCcy.toNumber()).toBe(10010); // 10085.81 - 75.81, exactly — no 1-cent gap onto this row
        // emit() sorts the transaction-currency-matching leg first — USD ahead of EUR here.
        expect(runner.debitLegs).toEqual([
          { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10010.00' },
          { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '75.81', amountAccountCcy: '70.00', drBuyRate: '0.923295' },
        ]);
      });
    });
  });

  describe('leg state setters', () => {
    it('onDebitLegsChange / onCreditLegsChange update debitLegs/creditLegs', () => {
      const { comp } = makeComponent();
      comp.onDebitLegsChange([debitLeg()]);
      comp.onCreditLegsChange([creditLeg()]);
      expect(comp.debitLegs).toEqual([debitLeg()]);
      expect(comp.creditLegs).toEqual([creditLeg()]);
    });

    it('onDebitValidChange / onCreditValidChange gate onConfirm/runPreview readiness (exercised via onConfirm below)', () => {
      const { comp } = makeComponent();
      expect(() => {
        comp.onDebitValidChange(true);
        comp.onCreditValidChange(false);
      }).not.toThrow();
    });

    it('onSuspenseDebitEntriesChange / onSuspenseCreditEntriesChange update the entry lists', () => {
      const { comp } = makeComponent();
      comp.onSuspenseDebitEntriesChange([entry('10', 'USD')]);
      comp.onSuspenseCreditEntriesChange([entry('20', 'EUR')]);
      expect(comp.suspenseDebitEntries).toEqual([entry('10', 'USD')]);
      expect(comp.suspenseCreditEntries).toEqual([entry('20', 'EUR')]);
    });
  });

  describe('selectModule / selectCase', () => {
    it('selectCase(null) clears selectedCase and every derived field', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.onDebitLegsChange([debitLeg()]);
      comp.suspenseDebitEntries = [entry('10', 'USD')];

      comp.selectCase(null);

      expect(comp.selectedCase).toBeNull();
      expect(comp.debitLegs).toEqual([]);
      expect(comp.creditLegs).toEqual([]);
      expect(comp.suspenseDebitEntries).toEqual([]);
      expect(comp.suspenseCreditEntries).toEqual([]);
      expect(comp.headerFields).toEqual([]);
      expect(comp.model).toEqual({});
    });

    it('selectModule switches selectedModule and clears the case selection', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.selectModule('EPLC');
      expect(comp.selectedModule).toBe('EPLC');
      expect(comp.selectedCase).toBeNull();
    });

    it('does not open a preview subscription for an N_A case (no error, previewSub stays undefined behavior is internal — just assert no throw)', () => {
      const { comp } = makeComponent();
      expect(() => comp.selectCase(naConfig())).not.toThrow();
    });

    it('re-selecting a case unsubscribes the previous preview subscription first', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      const firstSub = (comp as any).previewSub;
      const unsubscribeSpy = jest.spyOn(firstSub, 'unsubscribe');
      comp.selectCase(passConfig({ id: 'case-2' }));
      expect(unsubscribeSpy).toHaveBeenCalled();
    });

    it('a leg/suspense-entry change, after debounce, actually runs the preview through the real (not directly-invoked) RxJS pipeline', fakeAsync(() => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(
        of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: false }),
      );
      const config = passConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };

      comp.onDebitLegsChange([debitLeg()]); // pushes legsChanged$ — debounced 400ms before runPreview fires
      expect(mockApi.confirm).not.toHaveBeenCalled(); // not yet — still within the debounce window

      tick(400);

      expect(mockApi.confirm).toHaveBeenCalledTimes(1);
      expect(comp.result?.confirmed).toBe(false);

      comp.ngOnDestroy(); // avoid a dangling timer/subscription leaking into the next test
    }));
  });

  describe('creditFxPairs (reads creditAllocatorRef so <app-response-viewer> does not reference the template variable directly)', () => {
    it('returns [] when creditAllocatorRef has not resolved yet (e.g. before the view\'s first change-detection pass)', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      expect((comp as any).creditAllocatorRef).toBeUndefined();
      expect(comp.creditFxPairs).toEqual([]);
    });

    it('returns the filtered creditAllocatorRef.fxPairs for an ordinary case once the ViewChild has resolved', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      const pairs: FxPairEntry[] = [
        { drCr: 'C', account: 'FX Exchange EUR', currency: 'USD', amount: 55, site: 'Trx Ccy' },
        { drCr: 'D', account: 'FX Exchange USD', currency: 'EUR', amount: 50, site: 'Other Ccy' },
      ];
      (comp as any).creditAllocatorRef = { fxPairs: pairs };
      comp.suspenseCreditEntries = []; // nothing to net out — filterFxPairsNettedBySuspense leaves both untouched

      expect(comp.creditFxPairs).toEqual(pairs);
    });

    it('a Suspense Credit entry in the matching currency suppresses the pair, same as debitFxPairs already does — proves this goes through filterFxPairsNettedBySuspense, not a raw pass-through', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      const pairs: FxPairEntry[] = [
        { drCr: 'C', account: 'FX Exchange EUR', currency: 'USD', amount: 55, site: 'Trx Ccy' },
        { drCr: 'D', account: 'FX Exchange USD', currency: 'EUR', amount: 50, site: 'Other Ccy' },
      ];
      (comp as any).creditAllocatorRef = { fxPairs: pairs };
      comp.suspenseCreditEntries = [entry('50', 'EUR')];

      expect(comp.creditFxPairs).toEqual([]);
    });
  });

  describe('debitFxPairs (reads debitAllocatorRef so <app-response-viewer> does not reference the template variable directly)', () => {
    it('returns [] when debitAllocatorRef has not resolved yet (e.g. before the view\'s first change-detection pass)', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      expect((comp as any).debitAllocatorRef).toBeUndefined();
      expect(comp.debitFxPairs).toEqual([]);
    });

    it('returns the filtered debitAllocatorRef.fxPairs for an ordinary case once the ViewChild has resolved', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      const pairs: FxPairEntry[] = [
        { drCr: 'D', account: 'FX Exchange EUR', currency: 'USD', amount: 55, site: 'Trx Ccy' },
        { drCr: 'C', account: 'FX Exchange USD', currency: 'EUR', amount: 50, site: 'Other Ccy' },
      ];
      (comp as any).debitAllocatorRef = { fxPairs: pairs };
      comp.suspenseDebitEntries = []; // nothing to net out — filterFxPairsNettedBySuspense leaves both untouched

      expect(comp.debitFxPairs).toEqual(pairs);
    });

    it('a Suspense Debit entry in the matching currency suppresses the pair — proves this still goes through filterFxPairsNettedBySuspense for an ordinary case, not a raw pass-through', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      const pairs: FxPairEntry[] = [
        { drCr: 'D', account: 'FX Exchange EUR', currency: 'USD', amount: 55, site: 'Trx Ccy' },
        { drCr: 'C', account: 'FX Exchange USD', currency: 'EUR', amount: 50, site: 'Other Ccy' },
      ];
      (comp as any).debitAllocatorRef = { fxPairs: pairs };
      comp.suspenseDebitEntries = [entry('50', 'EUR')];

      expect(comp.debitFxPairs).toEqual([]);
    });
  });

  describe('casesForSelectedModule', () => {
    it('returns the cases for the currently selected module, [] for an unknown module', () => {
      const { comp } = makeComponent();
      comp.selectedModule = MODULE_GROUPS[0].module;
      expect(comp.casesForSelectedModule).toBe(MODULE_GROUPS[0].cases);

      comp.selectedModule = 'NOT-A-REAL-MODULE';
      expect(comp.casesForSelectedModule).toEqual([]);
    });
  });

  describe('onConfirm', () => {
    it('is a no-op when no case is selected', () => {
      const { comp, mockApi } = makeComponent();
      comp.onConfirm();
      expect(mockApi.confirm).not.toHaveBeenCalled();
    });

    it('is a no-op for a non-PASS case', () => {
      const { comp, mockApi } = makeComponent();
      comp.selectCase(gapConfig());
      comp.onConfirm();
      expect(mockApi.confirm).not.toHaveBeenCalled();
    });

    it('happy path: posts debitLegs/creditLegs as emitted (no Suspense) and records a confirmed result', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(
        of({
          instruction: { classification: { paymentComponentRelated: true }, accountEntries: [], swiftMessages: [], instructionId: 'instr-1' },
          created: true,
        }),
      );
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onDebitLegsChange([debitLeg()]);
      comp.onCreditLegsChange([creditLeg()]);

      comp.onConfirm();

      expect(mockApi.confirm).toHaveBeenCalledTimes(1);
      const [request, dryRun] = (mockApi.confirm as jest.Mock).mock.calls[0];
      expect(dryRun).toBe(false);
      expect(request.debitLegs).toEqual([debitLeg()]);
      expect(request.creditLegs).toEqual([creditLeg()]);
      expect(comp.result?.confirmed).toBe(true);
      expect(comp.result?.replay).toBe(false); // created:true -> replay:false
      expect(comp.confirmLoading).toBe(false);
    });

    it('created:false marks the result as a replay', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(
        of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'instr-1' }, created: false }),
      );
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onConfirm();
      expect(comp.result?.replay).toBe(true);
    });

    it('error path: clears result and records confirmError', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(throwError(() => new PaymentComponentApiError(409, { code: 'LEGS_UNBALANCED', message: 'not balanced' })));
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.result = { classification: {} as any, balance: null, accountEntries: null, swiftMessages: null, instructionId: null, confirmed: true, replay: false };

      comp.onConfirm();

      expect(comp.result).toBeNull();
      expect(comp.confirmError).toBe('[409] LEGS_UNBALANCED: not balanced');
      expect(comp.confirmLoading).toBe(false);
    });

    it('a non-ApiError thrown from the API surfaces via Error.message', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(throwError(() => new Error('network down')));
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onConfirm();
      expect(comp.confirmError).toBe('network down');
    });

    it('a thrown value that is neither a PaymentComponentApiError nor an Error falls back to String(err)', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(throwError(() => 'just a string'));
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onConfirm();
      expect(comp.confirmError).toBe('just a string');
    });

    describe('suspenseBridge request field sent on Confirm (v1.4.0 — balancing algorithm moved server-side)', () => {
      it('debitLegs/creditLegs sent are exactly what the allocator emitted — no bridge legs merged in client-side any more', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.onDebitLegsChange([debitLeg()]);
        comp.onCreditLegsChange([creditLeg()]);
        comp.suspenseDebitEntries = [entry('150', 'USD')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.debitLegs).toEqual([debitLeg()]);
        expect(request.creditLegs).toEqual([creditLeg()]);
      });

      it('v1.10.0 regression: transactionCurrency does NOT track a leg\'s own currency any more — changing a debit leg\'s currency directly leaves the displayed/wire Transaction Currency untouched', () => {
        // Before v1.10.0, transactionCurrency reactively followed debitLegs[0].currency — so
        // recoloring a debit leg's own currency silently moved the WHOLE deal's Transaction
        // Currency too, even when the deal itself is still transacted in the original currency
        // and the leg is simply settling/paying in a different one (e.g. Full pay in JPY
        // against a USD transaction). v1.10.0 decouples them: a leg's own currency
        // (PaymentLegInput.currency) and the deal's transaction currency
        // (PaymentInstructionConfirmRequest.transactionCurrency) are independent concepts.
        const { comp } = makeComponent();
        comp.selectCase(passConfig()); // registry default currency USD
        comp.onDebitLegsChange([debitLeg({ currency: 'JPY' })]);
        comp.onCreditLegsChange([creditLeg({ currency: 'JPY' })]);

        expect(comp.transactionCurrency).toBe('USD');
      });

      it('v1.10.0: onConfirm sends transactionCurrency explicitly on the wire, independent of any leg\'s own currency — Full pay in JPY against a USD transaction', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        // The sole debit/credit leg on each side settles in JPY — no leg is left in USD — which
        // is exactly the shape that broke the server's OLD debitLegs[0].currency inference.
        comp.onDebitLegsChange([debitLeg({ currency: 'JPY', amountTxCcy: '10000.00' })]);
        comp.onCreditLegsChange([creditLeg({ currency: 'JPY', amountTxCcy: '10000.00' })]);

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.transactionCurrency).toBe('USD');
        expect(request.debitLegs[0].currency).toBe('JPY');
        expect(request.creditLegs[0].currency).toBe('JPY');
      });

      it('a Suspense entry is classified against the EXPLICIT Transaction Currency (override), not any leg\'s own currency', () => {
        const { comp, mockApi } = makeComponent({ crossRate: 1.5 }); // would wrongly apply if misclassified as cross-currency
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig()); // registry default currency USD
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.onTransactionCurrencyInput('EUR'); // the user explicitly sets Transaction Currency
        comp.onDebitLegsChange([debitLeg({ currency: 'EUR' })]);
        comp.onCreditLegsChange([creditLeg({ currency: 'EUR' })]);
        comp.suspenseDebitEntries = [entry('10', 'EUR')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.transactionCurrency).toBe('EUR');
        // No crossRate, no FX conversion — same currency as the explicit Transaction Currency.
        expect(request.suspenseBridge).toEqual({ debitEntries: [{ amount: '10', currency: 'EUR', sourceComponent: 'CHARGE' }] });
      });

      it('sideDefaults() converts Suspense entries against the EXPLICIT Transaction Currency (override), not this side\'s own registry default nor any leg\'s own currency', () => {
        const { comp } = makeComponent({ crossRate: 1.5 }); // would wrongly apply if sideDefaults used the stale USD default
        comp.selectCase(passConfig()); // registry default currency USD, baseTotalAmount 1000
        comp.onTransactionCurrencyInput('EUR'); // the user explicitly sets Transaction Currency
        comp.suspenseDebitEntries = [entry('10', 'EUR')]; // same currency as the EXPLICIT Transaction Currency

        // No FX markup — same currency as transactionCurrency (EUR), so this must be exact: 1000 + 10.
        expect(comp.debitDefaults.totalAmount).toBe('1010');
      });

      it('a same-currency Suspense Debit entry becomes one raw debitEntries item, no crossRate', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('150', 'USD')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge).toEqual({ debitEntries: [{ amount: '150', currency: 'USD', sourceComponent: 'CHARGE' }] });
      });

      it('a same-currency Suspense Credit entry becomes one raw creditEntries item', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseCreditEntries = [entry('80', 'USD')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge).toEqual({ creditEntries: [{ amount: '80', currency: 'USD', sourceComponent: 'CHARGE' }] });
      });

      it('a cross-currency Suspense entry resolves and attaches crossRate (6dp)', () => {
        const { comp, mockApi } = makeComponent({ crossRate: 1.5 }); // 1 EUR = 1.5 USD
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig()); // trx currency USD
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('100', 'EUR')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge).toEqual({
          debitEntries: [{ amount: '100', currency: 'EUR', sourceComponent: 'CHARGE', crossRate: '1.500000' }],
        });
      });

      it('falls back to a 1:1 crossRate when the pair is unknown (null) — never blocks the request', () => {
        const { comp, mockApi } = makeComponent({ crossRate: null });
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('100', 'EUR')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge).toEqual({
          debitEntries: [{ amount: '100', currency: 'EUR', sourceComponent: 'CHARGE', crossRate: '1.000000' }],
        });
      });

      it('multiple entries on the same side each become their own itemized entry', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('10', 'USD'), entry('20', 'USD')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge.debitEntries).toEqual([
          { amount: '10', currency: 'USD', sourceComponent: 'CHARGE' },
          { amount: '20', currency: 'USD', sourceComponent: 'CHARGE' },
        ]);
      });

      it('a Liability-tagged entry (BALANCE) is sent through as sourceComponent: BALANCE', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('150', 'USD', 'BALANCE')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge).toEqual({ debitEntries: [{ amount: '150', currency: 'USD', sourceComponent: 'BALANCE' }] });
      });

      it('a blank/zero entry on either side is dropped, and suspenseBridge is omitted entirely when nothing remains', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('', 'USD')];
        comp.suspenseCreditEntries = [entry('0', 'EUR')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.suspenseBridge).toBeUndefined();
      });
    });
  });

  describe('amountScaleErrors (H-2 client-side input guard: decimals from the Currency API)', () => {
    const dp = { USD: 2, EUR: 2, JPY: 0 };

    it('flags a Total Amount with more decimals than the transaction currency allows (USD = 2)', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig()); // transaction currency USD
      comp.onTransactionAmountInput(10000.123);
      expect(comp.hasAmountScaleError).toBe(true);
      expect(comp.amountScaleErrors[0]).toContain('Total Amount');
      expect(comp.amountScaleErrors[0]).toContain('USD allows at most 2');
    });

    it('flags a Suspense Debit entry over-precise for its own currency (JPY = 0)', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.onSuspenseDebitEntriesChange([entry('10.5', 'JPY')]);
      expect(comp.hasAmountScaleError).toBe(true);
      expect(comp.amountScaleErrors[0]).toContain('Suspense Debit');
      expect(comp.amountScaleErrors[0]).toContain('JPY allows at most 0');
    });

    it('flags a Suspense Credit entry over-precise for its own currency', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.onSuspenseCreditEntriesChange([entry('1.234', 'EUR')]);
      expect(comp.amountScaleErrors.some((e) => e.includes('Suspense Credit'))).toBe(true);
    });

    it('is empty for valid amounts (Total Amount at exactly 2dp, integer JPY suspense)', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.onTransactionAmountInput(10000.12);
      comp.onSuspenseDebitEntriesChange([entry('10', 'JPY')]);
      expect(comp.hasAmountScaleError).toBe(false);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('SKIPS a currency absent from the Currency master (source of truth) — no false rejection', () => {
      const { comp } = makeComponent({ decimals: dp }); // no BHD in the map
      comp.selectCase(passConfig());
      comp.onSuspenseDebitEntriesChange([entry('1.234', 'BHD')]);
      expect(comp.hasAmountScaleError).toBe(false);
    });

    it('skips empty amounts (still being typed)', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.onSuspenseDebitEntriesChange([entry('', 'USD')]);
      expect(comp.hasAmountScaleError).toBe(false);
    });

    it('onConfirm refuses to POST while an amount is over-precise (sets confirmError, never calls the API)', () => {
      const { comp, mockApi } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onTransactionAmountInput(10000.123);

      comp.onConfirm();

      expect(mockApi.confirm).not.toHaveBeenCalled();
      expect(comp.confirmError).toContain('Fix amount precision');
    });

    it('aggregates leg-allocator scale errors (via scaleErrorsChange) into the blocking guard', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.onDebitLegScaleErrorsChange(['DEBIT leg amount 9999.112 has 3 decimal place(s) but USD allows at most 2.']);
      expect(comp.hasAmountScaleError).toBe(true);
      expect(comp.allAmountScaleErrors.some((e) => e.includes('DEBIT leg amount 9999.112'))).toBe(true);
    });

    it('onConfirm refuses to POST while a leg amount is over-precise', () => {
      const { comp, mockApi } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onCreditLegScaleErrorsChange(['CREDIT leg amount 9988.123 has 3 decimal place(s) but USD allows at most 2.']);

      comp.onConfirm();

      expect(mockApi.confirm).not.toHaveBeenCalled();
      expect(comp.confirmError).toContain('9988.123');
    });

    it('selectCase resets leg scale errors so a fresh case does not inherit them', () => {
      const { comp } = makeComponent({ decimals: dp });
      comp.selectCase(passConfig());
      comp.onDebitLegScaleErrorsChange(['some error']);
      expect(comp.hasAmountScaleError).toBe(true);
      comp.selectCase(passConfig());
      expect(comp.hasAmountScaleError).toBe(false);
    });

    it('runPreview surfaces the precision error and does not call the API', () => {
      const { comp, mockApi } = makeComponent({ decimals: dp });
      const config = passConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
      comp.onTransactionAmountInput(10000.123);

      (comp as any).runPreview(config).subscribe();

      expect(mockApi.confirm).not.toHaveBeenCalled();
      expect(comp.result).toBeNull();
      expect(comp.previewError).toContain('USD allows at most 2');
      expect(comp.previewLoading).toBe(false);
    });
  });

  describe('runPreview (private — invoked directly to bypass the debounced RxJS pipeline)', () => {
    it('sets previewIncomplete and clears result when legs are not yet valid', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      comp.result = { classification: {} as any, balance: null, accountEntries: null, swiftMessages: null, instructionId: null, confirmed: false, replay: false };
      comp.onDebitValidChange(false);
      comp.onCreditValidChange(true);

      (comp as any).runPreview(passConfig()).subscribe();

      expect(comp.result).toBeNull();
      expect(comp.previewIncomplete).toBe(true);
      expect(comp.previewLoading).toBe(false);
    });

    it('PASS: previewIncomplete when mainRef/unitCode are missing even though legs are valid', () => {
      const { comp } = makeComponent();
      const config = passConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = {};

      (comp as any).runPreview(config).subscribe();

      expect(comp.previewIncomplete).toBe(true);
    });

    it('PASS happy path: calls api.confirm with dryRun:true and records an unconfirmed preview result', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(
        of({ instruction: { classification: { paymentComponentRelated: true }, accountEntries: [{ entryId: 'e1' }], swiftMessages: [], instructionId: 'i1' }, created: false }),
      );
      const config = passConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };

      (comp as any).runPreview(config).subscribe();

      expect(mockApi.confirm).toHaveBeenCalledTimes(1);
      expect((mockApi.confirm as jest.Mock).mock.calls[0][1]).toBe(true); // dryRun
      expect(comp.result?.confirmed).toBe(false);
      expect(comp.result?.accountEntries).toEqual([{ entryId: 'e1' }]);
      expect(comp.previewLoading).toBe(false);
    });

    it('PASS error path: clears result and records previewError', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(throwError(() => new PaymentComponentApiError(400, 'bad request')));
      const config = passConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };

      (comp as any).runPreview(config).subscribe();

      expect(comp.result).toBeNull();
      expect(comp.previewError).toBe('[400] bad request');
    });

    it('GAP happy path: calls api.classify (not confirm) and records classification/balance/accountEntries', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.classify as jest.Mock).mockReturnValue(
        of({
          classification: { paymentComponentRelated: false },
          balance: { debitTotal: '100', creditTotal: '100', difference: '0', balanced: true },
          accountEntries: [{ entryId: 'e1' }],
        }),
      );
      const config = gapConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);

      (comp as any).runPreview(config).subscribe();

      expect(mockApi.classify).toHaveBeenCalledTimes(1);
      expect(mockApi.confirm).not.toHaveBeenCalled();
      expect(comp.result?.balance?.balanced).toBe(true);
      expect(comp.result?.confirmed).toBe(false);
      expect(comp.result?.instructionId).toBeNull();
    });

    it('GAP error path: clears result and records previewError', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.classify as jest.Mock).mockReturnValue(throwError(() => new Error('classify failed')));
      const config = gapConfig();
      comp.selectCase(config);
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);

      (comp as any).runPreview(config).subscribe();

      expect(comp.result).toBeNull();
      expect(comp.previewError).toBe('classify failed');
    });

    it("clears a STALE confirmError left over from a PRIOR failed Confirm click the moment the form is corrected and the debounced pipeline re-runs — reviewer-reported: a fixed field (e.g. a previously-blank Account No.) left the old '⚠ [400] ...' banner on screen indefinitely, since nothing but a NEW Confirm click used to reset it", () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(
        of({ instruction: { classification: { paymentComponentRelated: true }, accountEntries: [], swiftMessages: [], instructionId: 'i1' }, created: true }),
      );
      const config = passConfig();
      comp.selectCase(config);
      comp.confirmError = '[400] REQUEST_VALIDATION_FAILED: debitLegs.1.accountNo: String must contain at least 1 character(s)';
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };

      (comp as any).runPreview(config).subscribe();

      expect(comp.confirmError).toBeNull();
    });

    it('clears a stale confirmError even on a preview that STILL fails — the fresh previewError takes over rather than showing both stacked', () => {
      const { comp, mockApi } = makeComponent();
      (mockApi.confirm as jest.Mock).mockReturnValue(throwError(() => new PaymentComponentApiError(400, 'still invalid')));
      const config = passConfig();
      comp.selectCase(config);
      comp.confirmError = '[400] some earlier confirm failure';
      comp.onDebitValidChange(true);
      comp.onCreditValidChange(true);
      comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };

      (comp as any).runPreview(config).subscribe();

      expect(comp.confirmError).toBeNull();
      expect(comp.previewError).toBe('[400] still invalid');
    });
  });

  describe('filterFxPairsNettedBySuspense', () => {
    function eurTrxPair(): FxPairEntry[] {
      return [
        { drCr: 'D', account: 'FX Exchange EUR', currency: 'USD', amount: 10.83, site: 'Trx Ccy' },
        { drCr: 'C', account: 'FX Exchange USD', currency: 'EUR', amount: 10, site: 'Other Ccy' },
      ];
    }

    it('suppresses BOTH entries of a pair whose row currency has a matching Suspense entry (net=0 case reported by the reviewer)', () => {
      const { comp } = makeComponent();
      const result = comp.filterFxPairsNettedBySuspense(eurTrxPair(), [entry('10', 'EUR')]);
      expect(result).toEqual([]);
    });

    it('leaves a currency with NO matching Suspense entry untouched (pre-v1.7.0 behavior)', () => {
      const { comp } = makeComponent();
      const result = comp.filterFxPairsNettedBySuspense(eurTrxPair(), [entry('10', 'JPY')]);
      expect(result).toEqual(eurTrxPair());
    });

    it('leaves the pair untouched when there are no Suspense entries at all', () => {
      const { comp } = makeComponent();
      const result = comp.filterFxPairsNettedBySuspense(eurTrxPair(), []);
      expect(result).toEqual(eurTrxPair());
    });

    it('only suppresses the matching currency\'s pair, leaving an unrelated currency\'s pair visible', () => {
      const { comp } = makeComponent();
      const jpyPair: FxPairEntry[] = [
        { drCr: 'D', account: 'FX Exchange JPY', currency: 'USD', amount: 90, site: 'Trx Ccy' },
        { drCr: 'C', account: 'FX Exchange USD', currency: 'JPY', amount: 9000, site: 'Other Ccy' },
      ];
      const result = comp.filterFxPairsNettedBySuspense([...eurTrxPair(), ...jpyPair], [entry('10', 'EUR')]);
      expect(result).toEqual(jpyPair);
    });
  });

  describe('ngOnDestroy', () => {
    it('unsubscribes the active preview subscription without throwing', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig());
      const sub = (comp as any).previewSub;
      const unsubscribeSpy = jest.spyOn(sub, 'unsubscribe');
      expect(() => comp.ngOnDestroy()).not.toThrow();
      expect(unsubscribeSpy).toHaveBeenCalled();
    });

    it('is a no-op when no subscription was ever created', () => {
      const { comp } = makeComponent();
      expect(() => comp.ngOnDestroy()).not.toThrow();
    });
  });
});
