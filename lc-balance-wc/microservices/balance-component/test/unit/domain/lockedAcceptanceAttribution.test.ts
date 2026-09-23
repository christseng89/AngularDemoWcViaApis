import { planA6LockedAcceptance, planA7LegalSettlement, resolveLockedAcceptanceAttribution } from '../../../src/domain/lockedAcceptanceAttribution';

const lockedInput = {
  legalAmountOwner: '10200',
  coveredAmountOwner: '10000',
  excessAmountOwner: '200',
  ownerCurrency: 'USD',
} as const;

describe('locked Acceptance attribution', () => {
  test('resolves the immutable Legal = Covered + Excess invariant with canonical decimal strings', () => {
    const result = resolveLockedAcceptanceAttribution({
      legalAmountOwner: '10200.00',
      coveredAmountOwner: '10000.0',
      excessAmountOwner: '200.00',
      ownerCurrency: 'USD',
    });

    expect(result).toEqual({
      ok: true,
      attribution: {
        legalAmountOwner: '10200',
        coveredAmountOwner: '10000',
        excessAmountOwner: '200',
        ownerCurrency: 'USD',
      },
    });
    if (result.ok) expect(Object.isFrozen(result.attribution)).toBe(true);
  });

  test.each([
    [{ ...lockedInput, legalAmountOwner: '10199' }, 'LEGAL_SPLIT_MISMATCH'],
    [{ ...lockedInput, legalAmountOwner: 'not-an-amount' }, 'INVALID_ATTRIBUTION_AMOUNT'],
    [{ ...lockedInput, coveredAmountOwner: '-1' }, 'INVALID_ATTRIBUTION_AMOUNT'],
    [{ ...lockedInput, excessAmountOwner: '-1' }, 'INVALID_ATTRIBUTION_AMOUNT'],
    [{ ...lockedInput, ownerCurrency: '' }, 'INVALID_ATTRIBUTION_CURRENCY'],
  ] as const)('rejects an invalid locked attribution %#', (input, code) => {
    expect(resolveLockedAcceptanceAttribution(input)).toEqual({ ok: false, code });
  });

  test('plans A6 at the complete Legal Acceptance Amount while retaining the locked split', () => {
    const result = planA6LockedAcceptance({
      lockedAttribution: lockedInput,
      requestedLegalAmountOwner: '10200.00',
      requestedCurrency: 'USD',
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        legalAcceptanceAmountOwner: '10200',
        ownerCurrency: 'USD',
        lockedAttribution: {
          legalAmountOwner: '10200',
          coveredAmountOwner: '10000',
          excessAmountOwner: '200',
          ownerCurrency: 'USD',
        },
      },
    });
    if (result.ok) {
      expect(Object.isFrozen(result.plan)).toBe(true);
      expect(Object.isFrozen(result.plan.lockedAttribution)).toBe(true);
    }
  });

  test.each(['10000', '10300'])('rejects A6 amount %s when locked Legal Amount is 10200', (requestedLegalAmountOwner) => {
    expect(
      planA6LockedAcceptance({
        lockedAttribution: lockedInput,
        requestedLegalAmountOwner,
        requestedCurrency: 'USD',
      }),
    ).toEqual({ ok: false, code: 'ACCEPTANCE_AMOUNT_MISMATCH' });
  });

  test('rejects an A6 currency that differs from the locked owner currency', () => {
    expect(
      planA6LockedAcceptance({
        lockedAttribution: lockedInput,
        requestedLegalAmountOwner: '10200',
        requestedCurrency: 'EUR',
      }),
    ).toEqual({ ok: false, code: 'ACCEPTANCE_CURRENCY_MISMATCH' });
  });

  test.each([
    [{ requestedLegalAmountOwner: '0', requestedCurrency: 'USD' }, 'INVALID_ACCEPTANCE_AMOUNT'],
    [{ requestedLegalAmountOwner: 'not-an-amount', requestedCurrency: 'USD' }, 'INVALID_ACCEPTANCE_AMOUNT'],
    [{ requestedLegalAmountOwner: '10200', requestedCurrency: '   ' }, 'INVALID_ACCEPTANCE_CURRENCY'],
  ] as const)('rejects malformed A6 input %#', (request, code) => {
    expect(planA6LockedAcceptance({ lockedAttribution: lockedInput, ...request })).toEqual({ ok: false, code });
  });

  test('propagates a corrupted locked split before evaluating the A6 request', () => {
    expect(
      planA6LockedAcceptance({
        lockedAttribution: { ...lockedInput, excessAmountOwner: '201' },
        requestedLegalAmountOwner: '10200',
        requestedCurrency: 'USD',
      }),
    ).toEqual({ ok: false, code: 'LEGAL_SPLIT_MISMATCH' });
  });

  test('plans an A7 partial settlement against Legal Outstanding only and preserves attribution and Approved Excess', () => {
    const result = planA7LegalSettlement({
      lockedAttribution: lockedInput,
      legalOutstandingOwner: '10200',
      settlementAmountOwner: '3000',
      approvedExcessOwner: '200',
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        legalOutstandingBeforeOwner: '10200',
        settlementAmountOwner: '3000',
        legalOutstandingAfterOwner: '7200',
        approvedExcessOwnerBefore: '200',
        approvedExcessOwnerAfter: '200',
        lockedAttribution: {
          legalAmountOwner: '10200',
          coveredAmountOwner: '10000',
          excessAmountOwner: '200',
          ownerCurrency: 'USD',
        },
      },
    });
  });

  test('plans a full A7 settlement to zero without changing the locked split or Approved Excess', () => {
    const result = planA7LegalSettlement({
      lockedAttribution: lockedInput,
      legalOutstandingOwner: '10200',
      settlementAmountOwner: '10200',
      approvedExcessOwner: '200',
    });

    expect(result).toMatchObject({
      ok: true,
      plan: {
        legalOutstandingAfterOwner: '0',
        approvedExcessOwnerBefore: '200',
        approvedExcessOwnerAfter: '200',
        lockedAttribution: lockedInput,
      },
    });
  });

  test.each([
    ['0', 'INVALID_SETTLEMENT_AMOUNT'],
    ['not-an-amount', 'INVALID_SETTLEMENT_AMOUNT'],
    ['10200.001', 'SETTLEMENT_EXCEEDS_LEGAL_OUTSTANDING'],
  ] as const)('rejects invalid A7 settlement %s', (settlementAmountOwner, code) => {
    expect(
      planA7LegalSettlement({
        lockedAttribution: lockedInput,
        legalOutstandingOwner: '10200',
        settlementAmountOwner,
        approvedExcessOwner: '200',
      }),
    ).toEqual({ ok: false, code });
  });

  test.each([
    [{ legalOutstandingOwner: '-1', approvedExcessOwner: '200' }, 'INVALID_LEGAL_OUTSTANDING'],
    [{ legalOutstandingOwner: 'not-an-amount', approvedExcessOwner: '200' }, 'INVALID_LEGAL_OUTSTANDING'],
    [{ legalOutstandingOwner: '10200', approvedExcessOwner: '-1' }, 'INVALID_APPROVED_EXCESS'],
    [{ legalOutstandingOwner: '10200', approvedExcessOwner: 'not-an-amount' }, 'INVALID_APPROVED_EXCESS'],
  ] as const)('rejects malformed A7 state %#', (state, code) => {
    expect(
      planA7LegalSettlement({
        lockedAttribution: lockedInput,
        legalOutstandingOwner: state.legalOutstandingOwner,
        settlementAmountOwner: '1',
        approvedExcessOwner: state.approvedExcessOwner,
      }),
    ).toEqual({ ok: false, code });
  });

  test('propagates a corrupted locked split before evaluating A7 settlement', () => {
    expect(
      planA7LegalSettlement({
        lockedAttribution: { ...lockedInput, coveredAmountOwner: '9999' },
        legalOutstandingOwner: '10200',
        settlementAmountOwner: '1',
        approvedExcessOwner: '200',
      }),
    ).toEqual({ ok: false, code: 'LEGAL_SPLIT_MISMATCH' });
  });
});
