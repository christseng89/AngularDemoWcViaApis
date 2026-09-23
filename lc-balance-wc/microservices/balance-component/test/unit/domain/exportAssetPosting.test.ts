import { MakerCheckerConflictError, RequestValidationError } from '../../../src/errors';
import { planExportAssetPosting } from '../../../src/domain/exportAssetPosting';

const base = {
  makerContext: 'maker-1',
  checkerContext: 'checker-1',
  ownerCurrency: 'EUR',
  legalAmountOwner: '10200',
  coveredAmountOwner: '10000',
  excessAmountOwner: '200',
  tenorBehavior: 'SIGHT' as const,
};

describe('FROZEN V2 B4 Export authorization and asset posting policy', () => {
  test.each([
    {
      label: 'fully valid authorization',
      authorization: {
        claimStatus: 'SUBMITTED' as const,
        authorizationReference: 'AUTH-1',
        authorizedAmountOwner: '200',
        authorizedCurrency: 'EUR',
        authorizationValidationResult: 'CONFIRMED' as const,
      },
      expectedDebtor: 'ISSUING_BANK',
    },
    {
      label: 'absent authorization',
      authorization: { claimStatus: 'ABSENT' as const, authorizationValidationResult: 'NOT_CONFIRMED' as const },
      expectedDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY',
    },
    {
      label: 'partial authorization',
      authorization: {
        claimStatus: 'SUBMITTED' as const,
        authorizationReference: 'AUTH-2',
        authorizedAmountOwner: '199.99',
        authorizedCurrency: 'EUR',
        authorizationValidationResult: 'CONFIRMED' as const,
      },
      expectedDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY',
    },
    {
      label: 'wrong-currency authorization',
      authorization: {
        claimStatus: 'SUBMITTED' as const,
        authorizationReference: 'AUTH-3',
        authorizedAmountOwner: '200',
        authorizedCurrency: 'USD',
        authorizationValidationResult: 'CONFIRMED' as const,
      },
      expectedDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY',
    },
    {
      label: 'non-confirmed authorization',
      authorization: {
        claimStatus: 'SUBMITTED' as const,
        authorizationReference: 'AUTH-4',
        authorizedAmountOwner: '200',
        authorizedCurrency: 'EUR',
        authorizationValidationResult: 'NOT_CONFIRMED' as const,
      },
      expectedDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY',
    },
  ])('uses all-or-nothing debtor attribution for $label', ({ authorization, expectedDebtor }) => {
    const result = planExportAssetPosting({ ...base, authorization });

    expect(result.excessDebtor).toBe(expectedDebtor);
    expect(result.assets).toEqual([
      {
        balanceType: 'Due from Issuing Bank',
        amountOwner: '10000',
        ownerCurrency: 'EUR',
        debtor: 'ISSUING_BANK',
        mappingKey: 'EPLC_DUE_FROM_ISSUING_BANK:SIGHT',
      },
      {
        balanceType: 'EXPORT_EXCESS_ASSET',
        amountOwner: '200',
        ownerCurrency: 'EUR',
        debtor: expectedDebtor,
        mappingKey: 'EXPORT_EXCESS_ASSET:SIGHT',
      },
    ]);
  });

  test('uses existing Reimbursement Receivable Covered mapping for Usance while keeping a dedicated Excess mapping', () => {
    const result = planExportAssetPosting({
      ...base,
      tenorBehavior: 'USANCE',
      authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' },
    });

    expect(result.assets.map((asset) => [asset.balanceType, asset.mappingKey])).toEqual([
      ['Reimbursement Receivable', 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE:USANCE'],
      ['EXPORT_EXCESS_ASSET', 'EXPORT_EXCESS_ASSET:USANCE'],
    ]);
  });

  test('rejects Checker == Maker before producing either asset leg', () => {
    expect(() =>
      planExportAssetPosting({
        ...base,
        checkerContext: 'maker-1',
        authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' },
      }),
    ).toThrow(MakerCheckerConflictError);
  });

  test.each([
    ['non-reconciling locked split', { legalAmountOwner: '10200.01' }],
    ['zero Excess', { excessAmountOwner: '0', legalAmountOwner: '10000' }],
    ['malformed amount', { excessAmountOwner: 'not-a-number' }],
    ['blank owner currency', { ownerCurrency: ' ' }],
  ])('fails closed for %s', (_label, override) => {
    expect(() =>
      planExportAssetPosting({
        ...base,
        ...override,
        authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' },
      }),
    ).toThrow(RequestValidationError);
  });

  test('a blank authorization reference cannot attribute Excess to the Issuing Bank', () => {
    const result = planExportAssetPosting({
      ...base,
      authorization: {
        claimStatus: 'SUBMITTED',
        authorizationReference: '  ',
        authorizedAmountOwner: '999',
        authorizedCurrency: 'EUR',
        authorizationValidationResult: 'CONFIRMED',
      },
    });

    expect(result.excessDebtor).toBe('BENEFICIARY_OR_RECOURSE_PARTY');
  });
});
