import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { BusinessCaseRunnerComponent } from './business-case-runner.component';
import { MODULE_GROUPS } from './business-case-registry';
import { PaymentComponentApiError, type PaymentComponentApiService } from './payment-component-api.service';
import type { CurrencyService } from './currency.service';
import type { FxRateService } from './fx-rate.service';
import type { BusinessCaseConfig, LegSpec } from './business-case.model';
import type { PaymentLegInput } from './payment-component.types';
import type { SuspenseEntry } from './suspense-entries.component';

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
function entry(amount: string, currency: string): SuspenseEntry {
  return { amount, currency };
}

function makeComponent(overrides: { crossRate?: number | null } = {}) {
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

    it('totalAmount falls back to "0" (string) when the net result is exactly 0', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig({ legs: [leg({ side: 'DEBIT', defaultAmountTxCcy: '0' }), leg({ side: 'CREDIT', defaultAmountTxCcy: '0' })] }));
      expect(comp.debitDefaults.totalAmount).toBe('0');
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

  describe('casesForSelectedModule', () => {
    it('returns the cases for the currently selected module, [] for an unknown module', () => {
      const { comp } = makeComponent();
      comp.selectedModule = MODULE_GROUPS[0].module;
      expect(comp.casesForSelectedModule).toBe(MODULE_GROUPS[0].cases);

      comp.selectedModule = 'NOT-A-REAL-MODULE';
      expect(comp.casesForSelectedModule).toEqual([]);
    });
  });

  describe('constructor — CurrencyService.options() arriving after a case is already selected', () => {
    it('rebuilds tailFields (now with real currency options) once the delayed emission arrives', () => {
      const optionsSubject = new Subject<{ label: string; value: string }[]>();
      const mockApi = { confirm: jest.fn(), classify: jest.fn() } as unknown as PaymentComponentApiService;
      const mockCurrency = { options: jest.fn(() => optionsSubject.asObservable()) } as unknown as CurrencyService;
      const mockFx = { rates: jest.fn(() => of({})), crossRate: jest.fn(() => 1) } as unknown as FxRateService;

      const comp = new BusinessCaseRunnerComponent(mockApi, mockCurrency, mockFx);
      // A case with `charge: true` so buildTailFields' output visibly differs once real
      // currencyOptions are available (its 'currency' select needs non-empty options).
      comp.selectCase(passConfig({ charge: true }));
      const beforeOptions = comp.tailFields.find((f) => f.key === 'charge')?.fieldGroup?.find((f) => f.key === 'currency');
      expect(beforeOptions?.props?.options).toEqual([]); // no currencyOptions yet

      optionsSubject.next([{ label: 'USD', value: 'USD' }]); // arrives late — constructor's `if (this.selectedCase)` branch

      const afterOptions = comp.tailFields.find((f) => f.key === 'charge')?.fieldGroup?.find((f) => f.key === 'currency');
      expect(afterOptions?.props?.options).toEqual([{ label: 'USD', value: 'USD' }]);
      comp.ngOnDestroy();
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

    describe('Suspense bridge legs actually sent on Confirm', () => {
      it('a same-currency Suspense Debit entry adds exactly one extra Cr "Suspense - Debit" leg, no FX pair', () => {
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
        expect(request.creditLegs).toEqual([
          creditLeg(),
          { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'USD', amountTxCcy: '150.00' },
        ]);
      });

      it('a same-currency Suspense Credit entry adds exactly one extra Cr "Suspense - Credit" leg', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.onDebitLegsChange([debitLeg()]);
        comp.onCreditLegsChange([creditLeg()]);
        comp.suspenseCreditEntries = [entry('80', 'USD')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.creditLegs).toEqual([
          creditLeg(),
          { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'USD', amountTxCcy: '80.00' },
        ]);
      });

      it('a cross-currency Suspense entry adds the bridge leg plus a self-balancing FX Exchange pair (one Dr, one Cr)', () => {
        const { comp, mockApi } = makeComponent({ crossRate: 1.5 }); // 1 EUR = 1.5 USD
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig()); // trx currency USD
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.onDebitLegsChange([debitLeg()]);
        comp.onCreditLegsChange([creditLeg()]);
        comp.suspenseDebitEntries = [entry('100', 'EUR')]; // 100 EUR -> 150 USD equivalent

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        // Debit side: original + the "Other Ccy site" FX pair leg (Dr, EUR)
        expect(request.debitLegs).toEqual([
          debitLeg(),
          { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '150.00', amountAccountCcy: '100.00', drBuyRate: '1.500000' },
        ]);
        // Credit side: original + the bridge leg (Cr, EUR) + the "Trx Ccy site" FX pair leg (Cr, USD)
        expect(request.creditLegs).toEqual([
          creditLeg(),
          { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '150.00', amountAccountCcy: '100.00', crBuyRate: '1.500000' },
          { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '150.00', crBuyRate: '1.500000' },
        ]);

        // Per-currency balance check across just the three new entries (the real point of
        // fxExchangePairLegs()): EUR nets to zero — Cr EUR 100 (the bridge leg's real EUR
        // exposure, amountAccountCcy) exactly cancels Dr EUR 100 (the Other-Ccy-site leg's).
        const eurCredit = Number(request.creditLegs[1].amountAccountCcy);
        const eurDebit = Number(request.debitLegs[1].amountAccountCcy);
        expect(eurCredit).toBe(eurDebit);
        // And the pair's own two entries net to zero in transaction-currency terms too
        // (same 150 USD-equivalent, opposite sides) — so it can't disturb the aggregate
        // V8 balance sideDefaults() already established (verified separately above).
        expect(Number(request.debitLegs[1].amountTxCcy)).toBe(Number(request.creditLegs[2].amountTxCcy));
      });

      it('omits crBuyRate/drBuyRate when crossRate is unknown (null) for the pair', () => {
        const { comp, mockApi } = makeComponent({ crossRate: null });
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('100', 'EUR')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        const bridgeLeg = request.creditLegs.find((l: PaymentLegInput) => l.accountNo === 'Suspense - Debit');
        expect(bridgeLeg.crBuyRate).toBeUndefined();
        // Falls back to a 1:1 rate for the Trx Equivalent itself (still balances at face value).
        expect(bridgeLeg.amountTxCcy).toBe('100.00');
      });

      it('multiple entries on the same side each become their own bridge leg', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('10', 'USD'), entry('20', 'USD')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        const bridgeLegs = request.creditLegs.filter((l: PaymentLegInput) => l.accountNo === 'Suspense - Debit');
        expect(bridgeLegs).toHaveLength(2);
        expect(bridgeLegs.map((l: PaymentLegInput) => l.amountTxCcy).sort()).toEqual(['10.00', '20.00']);
      });

      it('a blank/zero entry contributes no bridge leg at all', () => {
        const { comp, mockApi } = makeComponent();
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.suspenseDebitEntries = [entry('', 'USD')];
        comp.suspenseCreditEntries = [entry('0', 'EUR')];

        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        expect(request.debitLegs).toEqual([]);
        expect(request.creditLegs).toEqual([]);
      });
    });
  });

  describe('fxExchangePairLegs (private — direct invocation for its own defensive fallback)', () => {
    it('falls back to amountTxCcy for the Other-Ccy-site amount when the input leg has no amountAccountCcy of its own', () => {
      // suspenseBridgeLeg() (the only real caller) always sets amountAccountCcy for a
      // cross-currency leg, so this fallback never fires via onConfirm() — it only
      // guards fxExchangePairLegs()'s own general PaymentLegInput parameter type against
      // a leg built some other way, without one.
      const { comp } = makeComponent({ crossRate: 1.5 });
      comp.selectCase(passConfig()); // trx currency USD
      const legWithoutAccountCcy: PaymentLegInput = { accountNo: 'X', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '150.00' };

      const pair = (comp as any).fxExchangePairLegs(legWithoutAccountCcy);

      expect(pair.debit[0].amountAccountCcy).toBe('150.00'); // fell back to amountTxCcy, not undefined
    });

    it('returns { debit: [], credit: [] } when the leg is already in the transaction currency', () => {
      const { comp } = makeComponent();
      comp.selectCase(passConfig()); // trx currency USD
      const sameCurrencyLeg: PaymentLegInput = { accountNo: 'X', accountType: 'SUSPENSE', currency: 'USD', amountTxCcy: '100.00' };
      expect((comp as any).fxExchangePairLegs(sameCurrencyLeg)).toEqual({ debit: [], credit: [] });
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
