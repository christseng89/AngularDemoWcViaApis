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

  it('includes a CHARGE entry only when chargeContext is supplied', () => {
    const withCharge = confirmPaymentInstruction(store, request({ mainRef: 'REF-CHG' }), {
      sourceFunctionCode: 'PayAccept',
      chargeContext: {
        isSettleCharges: false,
        localChgCustPayTotalAmt: '5',
        foreignChgCustPayTotalAmt: '0',
        localPayVatTotalAmt: '0',
        chargeAccountNo: 'CHG-ACC',
        currency: 'USD',
      },
    });
    expect(withCharge.instruction.accountEntries.some((e) => e.voucherType === 'CHARGE')).toBe(true);

    const withoutCharge = confirmPaymentInstruction(store, request({ mainRef: 'REF-NOCHG' }), { sourceFunctionCode: 'PayAccept' });
    expect(withoutCharge.instruction.accountEntries.some((e) => e.voucherType === 'CHARGE')).toBe(false);
  });

  it('includes LIABILITY entries when liabilityContext is supplied with real data', () => {
    const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-LIAB' }), {
      sourceFunctionCode: 'PaymentAtMaturity',
      liabilityContext: {
        module: 'IPLC',
        sourceFunctionCode: 'PaymentAtMaturity',
        stlAmt: '100',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      },
    });
    expect(result.instruction.accountEntries.filter((e) => e.voucherType === 'LIABILITY')).toHaveLength(2);
  });

  it('produces no LIABILITY entries when liabilityContext is omitted entirely', () => {
    const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-NOLIAB-A' }), { sourceFunctionCode: 'PayAccept' });
    expect(result.instruction.accountEntries.some((e) => e.voucherType === 'LIABILITY')).toBe(false);
  });

  it('produces no LIABILITY entries when liabilityContext is explicitly module NONE', () => {
    const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-NOLIAB-B' }), {
      sourceFunctionCode: 'PayAccept',
      liabilityContext: { module: 'NONE' },
    });
    expect(result.instruction.accountEntries.some((e) => e.voucherType === 'LIABILITY')).toBe(false);
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
