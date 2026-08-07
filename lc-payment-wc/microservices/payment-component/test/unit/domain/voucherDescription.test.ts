import {
  resolveVoucherCodePrefix,
  accountDescFor,
  accountCategoryFor,
  enrichLegs,
  VOUCHER_CODE_PREFIXES,
  TYPE_CHARS,
} from '../../../src/domain/voucherDescription';
import { RequestValidationError } from '../../../src/errors';
import type { AccountType, PaymentLegInput } from '../../../src/types';

describe('resolveVoucherCodePrefix', () => {
  it('resolves every entry in the VOUCHER_CODE_PREFIXES table', () => {
    for (const [key, expectedPrefix] of Object.entries(VOUCHER_CODE_PREFIXES)) {
      const [originModule, sourceFunctionCode] = key.split(':') as [
        Parameters<typeof resolveVoucherCodePrefix>[0],
        string,
      ];
      expect(resolveVoucherCodePrefix(originModule, sourceFunctionCode)).toBe(expectedPrefix);
    }
  });

  it('throws RequestValidationError for a module/function combo not in the table', () => {
    expect(() => resolveVoucherCodePrefix('IPLC', 'NotARealFunction')).toThrow(RequestValidationError);
  });

  it('throws for the two known dual-prefix rows omitted deliberately (EPLC PayAccept, EXCO SettlementAtMaturity)', () => {
    expect(() => resolveVoucherCodePrefix('EPLC', 'PayAccept')).toThrow(RequestValidationError);
    expect(() => resolveVoucherCodePrefix('EXCO', 'SettlementAtMaturity')).toThrow(RequestValidationError);
  });

  it('error message names the unresolved key', () => {
    try {
      resolveVoucherCodePrefix('RPFM', 'ProcessGrantor');
      fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('RPFM:ProcessGrantor');
    }
  });
});

describe('accountDescFor', () => {
  const ALL_TYPES: AccountType[] = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];

  it('produces prefix + TypeChar for every AccountType without rtgsIndicator', () => {
    for (const type of ALL_TYPES) {
      expect(accountDescFor(type, 'IPLC03NULLNULLNULL')).toBe('IPLC03NULLNULLNULL' + TYPE_CHARS[type]);
    }
  });

  it('a NOSTRO leg with rtgsIndicator=true gets TypeChar "R" instead of "N"', () => {
    expect(accountDescFor('NOSTRO', 'IPLC03NULLNULLNULL', true)).toBe('IPLC03NULLNULLNULLR');
  });

  it('a NOSTRO leg with rtgsIndicator=false gets the normal "N"', () => {
    expect(accountDescFor('NOSTRO', 'IPLC03NULLNULLNULL', false)).toBe('IPLC03NULLNULLNULLN');
  });

  it('rtgsIndicator is ignored for non-NOSTRO account types', () => {
    expect(accountDescFor('CUSTOMER', 'IPLC03NULLNULLNULL', true)).toBe('IPLC03NULLNULLNULLC');
  });
});

describe('accountCategoryFor', () => {
  it('maps CUSTOMER to CUSTOMER', () => {
    expect(accountCategoryFor('CUSTOMER')).toBe('CUSTOMER');
  });

  it('maps NOSTRO and VOSTRO to NOSTRO_FAMILY', () => {
    expect(accountCategoryFor('NOSTRO')).toBe('NOSTRO_FAMILY');
    expect(accountCategoryFor('VOSTRO')).toBe('NOSTRO_FAMILY');
  });

  it('maps SUSPENSE and INTERNAL to INTERNAL_SUSPENSE', () => {
    expect(accountCategoryFor('SUSPENSE')).toBe('INTERNAL_SUSPENSE');
    expect(accountCategoryFor('INTERNAL')).toBe('INTERNAL_SUSPENSE');
  });
});

describe('enrichLegs', () => {
  it('adds legId, legSide, accountDesc, accountCategory while preserving original fields', () => {
    const legs: PaymentLegInput[] = [
      { accountNo: 'CUST-1', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' },
      { accountNo: 'NOSTRO-1', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100', rtgsIndicator: true },
    ];
    const enriched = enrichLegs(legs, 'DEBIT', 'IPLC03NULLNULLNULL');

    expect(enriched).toHaveLength(2);
    expect(enriched[0]!.legSide).toBe('DEBIT');
    expect(enriched[0]!.accountNo).toBe('CUST-1');
    expect(enriched[0]!.accountDesc).toBe('IPLC03NULLNULLNULLC');
    expect(enriched[0]!.accountCategory).toBe('CUSTOMER');
    expect(enriched[1]!.accountDesc).toBe('IPLC03NULLNULLNULLR');
    expect(enriched[1]!.accountCategory).toBe('NOSTRO_FAMILY');
  });

  it('assigns a unique legId per leg', () => {
    const legs: PaymentLegInput[] = [
      { accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10' },
      { accountNo: 'B', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10' },
    ];
    const enriched = enrichLegs(legs, 'CREDIT', 'IPLC03NULLNULLNULL');
    expect(enriched[0]!.legId).not.toBe(enriched[1]!.legId);
  });

  it('returns an empty array for an empty input', () => {
    expect(enrichLegs([], 'DEBIT', 'IPLC03NULLNULLNULL')).toEqual([]);
  });
});
