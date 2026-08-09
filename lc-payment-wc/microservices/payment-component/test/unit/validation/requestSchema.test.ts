import { validateConfirmRequest, validateClassifyRequest } from '../../../src/validation/requestSchema';
import { RequestValidationError } from '../../../src/errors';

const validLeg = { accountNo: 'ACC-1', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' };

const validConfirmBody = {
  originModule: 'IPLC',
  mainRef: 'REF-1',
  sequence: 1,
  unitCode: 'HQ',
  debitLegs: [validLeg],
  creditLegs: [{ ...validLeg, accountType: 'NOSTRO' }],
};

describe('validateConfirmRequest', () => {
  it('parses a fully valid body and returns it typed', () => {
    const result = validateConfirmRequest(validConfirmBody);
    expect(result.originModule).toBe('IPLC');
    expect(result.debitLegs).toHaveLength(1);
  });

  it('accepts optional fields when present and valid', () => {
    const result = validateConfirmRequest({
      ...validConfirmBody,
      tenorType: 'Sight',
      tenorStartDate: '2026-01-01',
      maturityDate: '2026-06-01',
      payInstrFlag: 'F',
    });
    expect(result.payInstrFlag).toBe('F');
  });

  it('throws RequestValidationError when a required field is missing', () => {
    const { mainRef: _drop, ...withoutMainRef } = validConfirmBody;
    expect(() => validateConfirmRequest(withoutMainRef)).toThrow(RequestValidationError);
  });

  it('throws for an invalid accountType enum value', () => {
    const body = { ...validConfirmBody, debitLegs: [{ ...validLeg, accountType: 'BOGUS' }] };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });

  it('throws when debitLegs is an empty array (minItems 1)', () => {
    expect(() => validateConfirmRequest({ ...validConfirmBody, debitLegs: [] })).toThrow(RequestValidationError);
  });

  it('throws when creditLegs is an empty array (minItems 1)', () => {
    expect(() => validateConfirmRequest({ ...validConfirmBody, creditLegs: [] })).toThrow(RequestValidationError);
  });

  describe('chargeComponentBridge (empty creditLegs exemption)', () => {
    it('allows empty creditLegs when chargeComponentBridge is true and suspenseBridge.creditEntries is populated', () => {
      const result = validateConfirmRequest({
        ...validConfirmBody,
        creditLegs: [],
        chargeComponentBridge: true,
        suspenseBridge: { creditEntries: [{ amount: '100', currency: 'USD' }] },
      });
      expect(result.creditLegs).toHaveLength(0);
      expect(result.chargeComponentBridge).toBe(true);
    });

    it('throws when chargeComponentBridge is true but suspenseBridge.creditEntries is missing', () => {
      expect(() =>
        validateConfirmRequest({ ...validConfirmBody, creditLegs: [], chargeComponentBridge: true }),
      ).toThrow(RequestValidationError);
    });

    it('throws when chargeComponentBridge is true but suspenseBridge only has debitEntries', () => {
      expect(() =>
        validateConfirmRequest({
          ...validConfirmBody,
          creditLegs: [],
          chargeComponentBridge: true,
          suspenseBridge: { debitEntries: [{ amount: '100', currency: 'USD' }] },
        }),
      ).toThrow(RequestValidationError);
    });

    it('throws when creditLegs is empty and chargeComponentBridge is omitted, even with suspenseBridge.creditEntries populated', () => {
      expect(() =>
        validateConfirmRequest({
          ...validConfirmBody,
          creditLegs: [],
          suspenseBridge: { creditEntries: [{ amount: '100', currency: 'USD' }] },
        }),
      ).toThrow(RequestValidationError);
    });

    it('throws when creditLegs is empty and chargeComponentBridge is explicitly false, even with suspenseBridge.creditEntries populated', () => {
      expect(() =>
        validateConfirmRequest({
          ...validConfirmBody,
          creditLegs: [],
          chargeComponentBridge: false,
          suspenseBridge: { creditEntries: [{ amount: '100', currency: 'USD' }] },
        }),
      ).toThrow(RequestValidationError);
    });

    it('does not require chargeComponentBridge/suspenseBridge for an ordinary non-empty creditLegs request', () => {
      const result = validateConfirmRequest(validConfirmBody);
      expect(result.chargeComponentBridge).toBeUndefined();
    });
  });

  it('throws for a malformed MonetaryAmount pattern', () => {
    const body = { ...validConfirmBody, debitLegs: [{ ...validLeg, amountTxCcy: 'not-a-number' }] };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });

  describe('currency minor-unit (decimal places) validation (H-2)', () => {
    it('rejects amountTxCcy with more decimals than the transaction currency allows (JPY = 0)', () => {
      const body = {
        ...validConfirmBody,
        debitLegs: [{ ...validLeg, currency: 'JPY', amountTxCcy: '100.50' }],
        creditLegs: [{ ...validLeg, accountType: 'NOSTRO', currency: 'JPY', amountTxCcy: '100' }],
      };
      try {
        validateConfirmRequest(body);
        fail('expected throw');
      } catch (err) {
        const msg = (err as RequestValidationError).message;
        expect(msg).toContain('debitLegs.0.amountTxCcy');
        expect(msg).toContain('JPY');
        expect(msg).toContain('at most 0');
      }
    });

    it('rejects an EUR amount with 3 decimal places (EUR = 2)', () => {
      const body = { ...validConfirmBody, debitLegs: [{ ...validLeg, currency: 'EUR', amountTxCcy: '1.234' }] };
      // transaction currency is EUR here (debitLegs[0]); creditLeg stays USD/100 — balance is checked later, not here.
      expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
    });

    it('rejects amountAccountCcy (native) with more decimals than the leg currency allows', () => {
      // Leg currency TWD (0-dp) with a fractional native amount; transaction currency USD is fine.
      const body = {
        ...validConfirmBody,
        creditLegs: [{ ...validLeg, accountType: 'NOSTRO', currency: 'TWD', amountTxCcy: '100', amountAccountCcy: '100.5' }],
      };
      try {
        validateConfirmRequest(body);
        fail('expected throw');
      } catch (err) {
        expect((err as RequestValidationError).message).toContain('creditLegs.0.amountAccountCcy');
      }
    });

    it('rejects a suspenseBridge entry amount with more decimals than its currency allows (JPY = 0)', () => {
      const body = {
        ...validConfirmBody,
        suspenseBridge: { debitEntries: [{ amount: '10.5', currency: 'JPY', crossRate: '1' }] },
      };
      try {
        validateConfirmRequest(body);
        fail('expected throw');
      } catch (err) {
        expect((err as RequestValidationError).message).toContain('suspenseBridge.debitEntries.0.amount');
      }
    });

    it('accepts an amount at exactly the currency minor-unit boundary (USD = 2)', () => {
      const body = { ...validConfirmBody, debitLegs: [{ ...validLeg, amountTxCcy: '100.00' }] };
      expect(() => validateConfirmRequest(body)).not.toThrow();
    });

    it('SKIPS the decimal check for a currency not in the Currency master (source of truth) — a 3-dp BHD amount passes', () => {
      const body = {
        ...validConfirmBody,
        debitLegs: [{ ...validLeg, currency: 'BHD', amountTxCcy: '1.234' }],
        creditLegs: [{ ...validLeg, accountType: 'NOSTRO', currency: 'BHD', amountTxCcy: '1.234' }],
      };
      expect(() => validateConfirmRequest(body)).not.toThrow();
    });
  });

  it('throws for a malformed ExchangeRate pattern', () => {
    const body = { ...validConfirmBody, debitLegs: [{ ...validLeg, drRate: 'bad-rate' }] };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });

  it('throws for a non-ISO tenorStartDate', () => {
    expect(() => validateConfirmRequest({ ...validConfirmBody, tenorStartDate: '01/01/2026' })).toThrow(
      RequestValidationError,
    );
  });

  it('throws for an invalid originModule', () => {
    expect(() => validateConfirmRequest({ ...validConfirmBody, originModule: 'NOPE' })).toThrow(RequestValidationError);
  });

  it('error message concatenates multiple simultaneous violations', () => {
    try {
      validateConfirmRequest({ ...validConfirmBody, mainRef: undefined, sequence: 'not-a-number' });
      fail('expected throw');
    } catch (err) {
      const message = (err as RequestValidationError).message;
      expect(message).toContain('mainRef');
      expect(message).toContain('sequence');
      expect(message.split(';').length).toBeGreaterThan(1);
    }
  });

  it('error message uses "(root)" when the failing path is empty', () => {
    try {
      validateConfirmRequest('not-an-object');
      fail('expected throw');
    } catch (err) {
      expect((err as RequestValidationError).message).toContain('(root)');
    }
  });

  it('accepts a valid suspenseBridge with debit/credit entries', () => {
    const result = validateConfirmRequest({
      ...validConfirmBody,
      suspenseBridge: {
        debitEntries: [{ amount: '10', currency: 'USD' }],
        creditEntries: [{ amount: '5', currency: 'EUR', crossRate: '1.1' }],
      },
    });
    expect(result.suspenseBridge?.debitEntries).toHaveLength(1);
  });

  it('suspenseBridge is optional and undefined when omitted', () => {
    const result = validateConfirmRequest(validConfirmBody);
    expect(result.suspenseBridge).toBeUndefined();
  });

  it('throws for a suspenseBridge entry with a malformed MonetaryAmount', () => {
    const body = { ...validConfirmBody, suspenseBridge: { debitEntries: [{ amount: 'nope', currency: 'USD' }] } };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });

  it('throws for a suspenseBridge entry with a malformed crossRate', () => {
    const body = { ...validConfirmBody, suspenseBridge: { debitEntries: [{ amount: '10', currency: 'EUR', crossRate: 'bad' }] } };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });

  it('accepts a suspenseBridge entry with sourceComponent BALANCE and balanceModule IBL/EBL (v1.5.0)', () => {
    const result = validateConfirmRequest({
      ...validConfirmBody,
      suspenseBridge: {
        debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'IBL' }],
        creditEntries: [{ amount: '5', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'EBL' }],
      },
    });
    expect(result.suspenseBridge?.debitEntries?.[0]?.sourceComponent).toBe('BALANCE');
    expect(result.suspenseBridge?.creditEntries?.[0]?.balanceModule).toBe('EBL');
  });

  it('accepts a suspenseBridge entry with sourceComponent CHARGE and no balanceModule', () => {
    const result = validateConfirmRequest({
      ...validConfirmBody,
      suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'CHARGE' }] },
    });
    expect(result.suspenseBridge?.debitEntries?.[0]?.sourceComponent).toBe('CHARGE');
  });

  it('throws for an invalid sourceComponent enum value', () => {
    const body = { ...validConfirmBody, suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BOGUS' }] } };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });

  it('throws for an invalid balanceModule enum value', () => {
    const body = {
      ...validConfirmBody,
      suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'BOGUS' }] },
    };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
  });
});

describe('validateClassifyRequest', () => {
  it('parses a minimal valid body (legs only)', () => {
    const result = validateClassifyRequest({ debitLegs: [validLeg], creditLegs: [validLeg] });
    expect(result.debitLegs).toHaveLength(1);
    expect(result.balanceTolerance).toBeUndefined();
  });

  it('accepts an optional nonnegative balanceTolerance', () => {
    const result = validateClassifyRequest({ debitLegs: [validLeg], creditLegs: [validLeg], balanceTolerance: 0.5 });
    expect(result.balanceTolerance).toBe(0.5);
  });

  it('throws when debitLegs is missing', () => {
    expect(() => validateClassifyRequest({ creditLegs: [validLeg] })).toThrow(RequestValidationError);
  });

  it('throws when balanceTolerance is negative', () => {
    expect(() =>
      validateClassifyRequest({ debitLegs: [validLeg], creditLegs: [validLeg], balanceTolerance: -1 }),
    ).toThrow(RequestValidationError);
  });

  it('error message uses "(root)" when the failing path is empty', () => {
    try {
      validateClassifyRequest('not-an-object');
      fail('expected throw');
    } catch (err) {
      expect((err as RequestValidationError).message).toContain('(root)');
    }
  });
});
