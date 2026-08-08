import { confirmPaymentInstruction } from '../../../src/domain/confirmPaymentInstruction';
import { createInMemoryPaymentInstructionStore, type PaymentInstructionStore } from '../../../src/store/paymentInstructionStore';
import { BusinessValidationError, RequestValidationError } from '../../../src/errors';
import type { ValidatedConfirmRequest } from '../../../src/validation/requestSchema';

function request(overrides: Partial<ValidatedConfirmRequest> = {}): ValidatedConfirmRequest {
  return {
    originModule: 'IPLC',
    mainRef: 'REF-1',
    sequence: 1,
    unitCode: 'HQ',
    debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
    creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }],
    ...overrides,
  };
}

describe('confirmPaymentInstruction', () => {
  let store: PaymentInstructionStore;

  beforeEach(() => {
    store = createInMemoryPaymentInstructionStore();
  });

  it('happy path: creates a new instruction with classification, settlement entries, and correct voucher descriptions', () => {
    const result = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    expect(result.created).toBe(true);
    expect(result.instruction.debitLegs[0]!.accountDesc).toBe('IPLC03NULLNULLNULLC');
    expect(result.instruction.creditLegs[0]!.accountDesc).toBe('IPLC03NULLNULLNULLN');
    expect(result.instruction.classification.paymentComponentRelated).toBe(true);
    expect(result.instruction.accountEntries).toHaveLength(2);
    expect(result.instruction.swiftMessages).toEqual([]);
  });

  it('persists the created instruction so a later confirm with the same natural key replays it (created:false, same instructionId)', () => {
    const first = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    const second = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    expect(second.created).toBe(false);
    expect(second.instruction.instructionId).toBe(first.instruction.instructionId);
  });

  it('idempotent replay returns the ORIGINAL result even if the request body has since changed', () => {
    const first = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    const changed = request({ debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '999' }] });
    const second = confirmPaymentInstruction(store, changed, { sourceFunctionCode: 'PayAccept' });
    expect(second.instruction.debitLegs[0]!.amountTxCcy).toBe(first.instruction.debitLegs[0]!.amountTxCcy);
  });

  describe('dryRun', () => {
    it('recomputes fresh on every call and is never persisted', () => {
      const first = confirmPaymentInstruction(store, request({ debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }], creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }] }), {
        sourceFunctionCode: 'PayAccept',
        dryRun: true,
      });
      const second = confirmPaymentInstruction(store, request({ debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '200' }], creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '200' }] }), {
        sourceFunctionCode: 'PayAccept',
        dryRun: true,
      });

      expect(first.instruction.debitLegs[0]!.amountTxCcy).toBe('100');
      expect(second.instruction.debitLegs[0]!.amountTxCcy).toBe('200');
      expect(first.instruction.instructionId).not.toBe(second.instruction.instructionId);
      expect(first.created).toBe(false);
      expect(store.find('IPLC', 'REF-1', 1)).toBeUndefined();
    });

    it('a real (non-dryRun) confirm after N dryRuns still creates for real', () => {
      confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept', dryRun: true });
      confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept', dryRun: true });
      const real = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
      expect(real.created).toBe(true);
      expect(store.find('IPLC', 'REF-1', 1)).toBeDefined();
    });
  });

  it('throws BusinessValidationError and does not persist anything when legs are unbalanced', () => {
    const unbalanced = request({ creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '50' }] });
    expect(() => confirmPaymentInstruction(store, unbalanced, { sourceFunctionCode: 'PayAccept' })).toThrow(
      BusinessValidationError,
    );
    expect(store.find('IPLC', 'REF-1', 1)).toBeUndefined();
  });

  it('voucherCodePrefixOverride bypasses sourceFunctionCode resolution entirely', () => {
    const result = confirmPaymentInstruction(store, request(), { voucherCodePrefixOverride: 'EPLC07NULLNULLNULL' });
    expect(result.instruction.debitLegs[0]!.accountDesc).toBe('EPLC07NULLNULLNULLC');
  });

  it('throws RequestValidationError when neither sourceFunctionCode nor an override is supplied', () => {
    expect(() => confirmPaymentInstruction(store, request(), {})).toThrow(RequestValidationError);
  });

  it('never produces CHARGE or LIABILITY entries — §6.2/§6.3 removed v1.6.0', () => {
    const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-NO-CHARGE-LIAB' }), { sourceFunctionCode: 'PayAccept' });
    expect(result.instruction.accountEntries.every((e) => e.voucherType === 'SETTLEMENT')).toBe(true);
  });

  describe('balance tolerance', () => {
    it('defaults to RPFM_BALANCE_TOLERANCE (0.01) for originModule RPFM', () => {
      const rpfmRequest = request({
        originModule: 'RPFM',
        mainRef: 'REF-RPFM',
        debitLegs: [{ accountNo: 'A', accountType: 'NOSTRO', currency: 'IDR', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'CUSTOMER', currency: 'IDR', amountTxCcy: '99.99' }],
      });
      expect(() => confirmPaymentInstruction(store, rpfmRequest, { voucherCodePrefixOverride: 'RPFM01NULLNULLNULL' })).not.toThrow();
    });

    it('requires exact equality by default for a non-RPFM module', () => {
      const iplcRequest = request({
        mainRef: 'REF-STRICT',
        debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '99.99' }],
      });
      expect(() => confirmPaymentInstruction(store, iplcRequest, { sourceFunctionCode: 'PayAccept' })).toThrow(
        BusinessValidationError,
      );
    });

    it('an explicit balanceTolerance overrides the default even for a non-RPFM module', () => {
      const iplcRequest = request({
        mainRef: 'REF-OVERRIDE-TOL',
        debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '99.5' }],
      });
      expect(() =>
        confirmPaymentInstruction(store, iplcRequest, { sourceFunctionCode: 'PayAccept', balanceTolerance: '1' }),
      ).not.toThrow();
    });
  });

  it('propagates a SWIFT cross-field violation as a BusinessValidationError and never persists', () => {
    const badSwift = request({
      mainRef: 'REF-SWIFT-BAD',
      creditLegs: [
        {
          accountNo: 'NOSTRO-ACC',
          accountType: 'NOSTRO',
          currency: 'USD',
          amountTxCcy: '100',
          payCoverMsgType: 'MT202COV',
          // payAdviceMsgType deliberately omitted -> cross-field violation
        },
      ],
    });
    expect(() => confirmPaymentInstruction(store, badSwift, { sourceFunctionCode: 'PayAccept' })).toThrow(
      BusinessValidationError,
    );
    expect(store.find('IPLC', 'REF-SWIFT-BAD', 1)).toBeUndefined();
  });

  describe('suspenseBridge (v1.4.0)', () => {
    it('expands debitEntries into a Suspense - Debit leg BEFORE the balance check, and includes it in accountEntries', () => {
      // Caller pre-adjusts its own debit total by the same amount (10), per the OAS contract.
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-1',
          debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '110' }],
          suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'Suspense - Debit' && l.amountTxCcy === '10')).toBe(true);
      expect(
        result.instruction.accountEntries.some(
          (e) => e.voucherType === 'SETTLEMENT' && e.glAccount === 'Suspense - Debit' && e.amount === '10',
        ),
      ).toBe(true);
    });

    it('a debitEntries bridge WITHOUT the caller pre-adjusting its own debit total is unbalanced -> 409', () => {
      const unadjusted = request({
        mainRef: 'REF-SB-2',
        suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD' }] },
      });
      expect(() => confirmPaymentInstruction(store, unadjusted, { sourceFunctionCode: 'PayAccept' })).toThrow(
        BusinessValidationError,
      );
    });

    it('creditEntries paired with the matching caller-side credit reduction stays balanced', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-3',
          creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '90' }],
          suspenseBridge: { creditEntries: [{ amount: '10', currency: 'USD' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'Suspense - Credit' && l.amountTxCcy === '10')).toBe(true);
    });

    it('a cross-currency entry adds its FX Exchange pair legs and stays balanced', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-4',
          debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '111' }],
          suspenseBridge: { debitEntries: [{ amount: '10', currency: 'EUR', crossRate: '1.1' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'FX Exchange EUR')).toBe(true);
      expect(result.instruction.debitLegs.some((l) => l.accountNo === 'FX Exchange USD')).toBe(true);
    });

    it('propagates RequestValidationError when a cross-currency entry has no crossRate, before the balance check ever runs', () => {
      const missingRate = request({
        mainRef: 'REF-SB-5',
        suspenseBridge: { debitEntries: [{ amount: '10', currency: 'EUR' }] },
      });
      expect(() => confirmPaymentInstruction(store, missingRate, { sourceFunctionCode: 'PayAccept' })).toThrow(
        RequestValidationError,
      );
      expect(store.find('IPLC', 'REF-SB-5', 1)).toBeUndefined();
    });

    it('omitting suspenseBridge entirely behaves exactly as before (no bridge legs added)', () => {
      const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-SB-6' }), { sourceFunctionCode: 'PayAccept' });
      expect(result.instruction.debitLegs).toHaveLength(1);
      expect(result.instruction.creditLegs).toHaveLength(1);
    });

    it('v1.7.0 netting end-to-end: a real EUR debit leg (20) alongside a EUR Suspense Debit entry (17) balances via the NET-sized FX pair, not the gross amount', () => {
      // Net = 20 (EUR leg's own amountAccountCcy) - 17 (gross Suspense) = 3; trxEq at 1.1 = 3.3.
      // Debit aggregate: 100 (Leg#1) + 18 (EUR leg's own amountTxCcy) + 3.3 (server Trx-Ccy-site) = 121.3
      // Credit aggregate: 99.3 (caller-adjusted) + 18.7 (bridge, gross trxEq) + 3.3 (server Other-Ccy-site) = 121.3
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-NET-1',
          debitLegs: [
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' },
            { accountNo: 'EUR-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '18', amountAccountCcy: '20' },
          ],
          creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '99.3' }],
          suspenseBridge: { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      const bridgeLeg = result.instruction.creditLegs.find((l) => l.accountNo === 'Suspense - Debit');
      expect(bridgeLeg?.amountAccountCcy).toBe('17'); // gross, unaffected by netting
      const fxCredit = result.instruction.creditLegs.find((l) => l.accountNo === 'FX Exchange USD');
      expect(fxCredit?.amountAccountCcy).toBe('3'); // FX pair sized to the NET, not the gross 17
    });

    it('v1.7.0 netting end-to-end: a real EUR debit leg (17) exactly matching gross Suspense (17) needs no FX pair at all', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-NET-2',
          debitLegs: [
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' },
            { accountNo: 'EUR-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '15.45', amountAccountCcy: '17' },
          ],
          creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '96.75' }],
          suspenseBridge: { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.debitLegs.some((l) => l.accountNo === 'FX Exchange EUR')).toBe(false);
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'FX Exchange USD')).toBe(false);
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'Suspense - Debit')).toBe(true);
    });

    it('v1.7.0 CREDIT-side end-to-end (reviewer-confirmed worked example): a real EUR credit leg (100) alongside a EUR Suspense Credit entry (100, gross) COMBINE — they do NOT net to zero — the FX pair is sized to their sum (200), not skipped', () => {
      // Trx Amount USD 10,000; Credit Suspense EUR 100; real Credit Leg NOSTRO-ACC EUR 100 (amountTxCcy=108.31 at rate 0.923295, matching amountAccountCcy=100).
      // Combined = 100 (leg) + 100 (gross suspense) = 200; trxEq at 1.0831 = 216.62.
      // Credit aggregate: 108.31 (EUR leg) + 9783.38 (USD remainder) + 108.31 (bridge, gross trxEq) + 216.62 (server Trx-Ccy-site) = 10216.62
      // Debit aggregate: 10000 (Leg#1) + 216.62 (server Other-Ccy-site) = 10216.62
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-NET-CREDIT-1',
          debitLegs: [{ accountNo: 'CUST-ACC2', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10000' }],
          creditLegs: [
            { accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100' },
            { accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '9783.38' },
          ],
          suspenseBridge: { creditEntries: [{ amount: '100', currency: 'EUR', crossRate: '1.0831' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      const bridgeLeg = result.instruction.creditLegs.find((l) => l.accountNo === 'Suspense - Credit');
      expect(bridgeLeg?.amountAccountCcy).toBe('100'); // gross — never netted/reduced
      const fxOtherCcy = result.instruction.debitLegs.find((l) => l.accountNo === 'FX Exchange USD');
      expect(fxOtherCcy?.amountAccountCcy).toBe('200'); // COMBINED (100+100), not net-to-zero
      const fxTrxCcy = result.instruction.creditLegs.find((l) => l.accountNo === 'FX Exchange EUR');
      expect(fxTrxCcy?.amountTxCcy).toBe('216.62');
    });
  });

  it('a suspenseBridge entry tagged with sourceComponent still only ever produces a SETTLEMENT entry (pure provenance metadata, v1.5.0/v1.6.0)', () => {
    const result = confirmPaymentInstruction(
      store,
      request({
        mainRef: 'REF-SB-TAGGED',
        debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '110' }],
        suspenseBridge: {
          debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'IBL' }],
        },
      }),
      { sourceFunctionCode: 'PayAccept' },
    );
    expect(result.instruction.accountEntries.every((e) => e.voucherType === 'SETTLEMENT')).toBe(true);
  });

  it('generates SWIFT messages when credit legs specify valid message types', () => {
    const result = confirmPaymentInstruction(
      store,
      request({
        mainRef: 'REF-SWIFT-OK',
        creditLegs: [
          {
            accountNo: 'NOSTRO-ACC',
            accountType: 'NOSTRO',
            currency: 'USD',
            amountTxCcy: '100',
            payAdviceMsgType: 'MT103',
          },
        ],
      }),
      { sourceFunctionCode: 'PayAccept' },
    );
    expect(result.instruction.swiftMessages).toHaveLength(1);
    expect(result.instruction.swiftMessages[0]!.messageType).toBe('MT103');
  });
});
