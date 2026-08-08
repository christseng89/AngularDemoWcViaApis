import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BusinessCaseRunnerComponent } from './business-case-runner.component';
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

      it('regression: transactionCurrency tracks the LIVE debit leg currency, not the case registry default — a Suspense entry matching the user-overridden leg currency is never treated as cross-currency', () => {
        // The registry default for passConfig() is USD, but the user has changed the debit
        // leg's own currency to EUR in the allocator (e.g. via its "Transaction Currency"
        // dropdown) — this must be reflected everywhere, not just displayed.
        const { comp, mockApi } = makeComponent({ crossRate: 1.5 }); // would wrongly apply if misclassified as cross-currency
        (mockApi.confirm as jest.Mock).mockReturnValue(of({ instruction: { classification: {}, accountEntries: [], swiftMessages: [], instructionId: 'i' }, created: true }));
        comp.selectCase(passConfig());
        comp.model = { unitCode: 'HQ', mainRef: 'REF-1', sequence: 1 };
        comp.onDebitLegsChange([debitLeg({ currency: 'EUR' })]);
        comp.onCreditLegsChange([creditLeg({ currency: 'EUR' })]);

        expect(comp.transactionCurrency).toBe('EUR');

        comp.suspenseDebitEntries = [entry('10', 'EUR')];
        comp.onConfirm();

        const [request] = (mockApi.confirm as jest.Mock).mock.calls[0];
        // No crossRate, no FX conversion — same currency as the live debit leg.
        expect(request.suspenseBridge).toEqual({ debitEntries: [{ amount: '10', currency: 'EUR', sourceComponent: 'CHARGE' }] });
        // debitLegs/creditLegs are untouched — still exactly what the allocator emitted.
        expect(request.debitLegs).toEqual([debitLeg({ currency: 'EUR' })]);
        expect(request.creditLegs).toEqual([creditLeg({ currency: 'EUR' })]);
      });

      it('regression: sideDefaults() converts against the LIVE transaction currency (not the stale registry default), so its own seeded Leg #1 total never disagrees with what gets sent on the wire for the same entry', () => {
        // Bug: sideDefaults() used to convert Suspense entries against this SIDE's own
        // registry-default currency (always 'USD' for passConfig()), while
        // buildSuspenseBridgeEntries()/transactionCurrency already used the LIVE debit leg
        // currency. Once the user changed the debit leg to EUR, the two disagreed about
        // whether a same-currency EUR Suspense entry needed FX conversion at all — Leg #1 got
        // seeded with a spurious ~1.5x markup that the wire payload never carried, so the
        // client's own total didn't match what it actually sent (a real 409 LEGS_UNBALANCED).
        const { comp } = makeComponent({ crossRate: 1.5 }); // would wrongly apply if sideDefaults used the stale USD default
        comp.selectCase(passConfig()); // registry default currency USD, baseTotalAmount 1000
        comp.onDebitLegsChange([debitLeg({ currency: 'EUR' })]); // live debit leg now EUR
        comp.onCreditLegsChange([creditLeg({ currency: 'EUR' })]);
        comp.suspenseDebitEntries = [entry('10', 'EUR')]; // same currency as the LIVE debit leg

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
