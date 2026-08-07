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

  it('throws for a malformed MonetaryAmount pattern', () => {
    const body = { ...validConfirmBody, debitLegs: [{ ...validLeg, amountTxCcy: 'not-a-number' }] };
    expect(() => validateConfirmRequest(body)).toThrow(RequestValidationError);
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
