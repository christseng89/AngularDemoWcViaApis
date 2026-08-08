import { buildSuspenseBridgeLeg, buildNetFxExchangePairLegs, expandSuspenseBridge } from '../../../src/domain/suspenseBridge';
import { RequestValidationError } from '../../../src/errors';
import type { PaymentLegInput } from '../../../src/types';
import Decimal from 'decimal.js';

function payLeg(overrides: Partial<PaymentLegInput> & { currency: string; amountTxCcy: string }): PaymentLegInput {
  return { accountNo: 'ACC', accountType: 'CUSTOMER', ...overrides };
}

describe('buildSuspenseBridgeLeg', () => {
  it('same-currency entry: passes the original amount string through unchanged, no amountAccountCcy/crBuyRate', () => {
    const leg = buildSuspenseBridgeLeg('Suspense - Debit', { amount: '100.5', currency: 'USD' }, 'USD');
    expect(leg).toEqual({
      accountNo: 'Suspense - Debit',
      accountType: 'SUSPENSE',
      currency: 'USD',
      amountTxCcy: '100.5',
    });
  });

  it('same-currency zero-amount entry returns null', () => {
    expect(buildSuspenseBridgeLeg('Suspense - Debit', { amount: '0', currency: 'USD' }, 'USD')).toBeNull();
  });

  it('cross-currency entry: converts via crossRate, rounds amountTxCcy to 3dp, sets amountAccountCcy and crBuyRate', () => {
    const leg = buildSuspenseBridgeLeg('Suspense - Credit', { amount: '100', currency: 'EUR', crossRate: '1.1' }, 'USD');
    expect(leg).toEqual({
      accountNo: 'Suspense - Credit',
      accountType: 'SUSPENSE',
      currency: 'EUR',
      amountTxCcy: '110',
      amountAccountCcy: '100',
      crBuyRate: '1.1',
    });
  });

  it('cross-currency conversion rounds to the TRANSACTION currency\'s minor units (USD=2dp), ROUND_HALF_UP', () => {
    const leg = buildSuspenseBridgeLeg('Suspense - Debit', { amount: '100', currency: 'EUR', crossRate: '1.234567' }, 'USD');
    // 100 * 1.234567 = 123.4567 -> rounds up to 123.46 at the 2nd decimal (USD's minor units, ROUND_HALF_UP)
    expect(leg?.amountTxCcy).toBe('123.46');
  });

  it('cross-currency conversion rounds to 0dp for a 0-decimal transaction currency (JPY)', () => {
    const leg = buildSuspenseBridgeLeg('Suspense - Debit', { amount: '100', currency: 'USD', crossRate: '110.4' }, 'JPY');
    // 100 * 110.4 = 11040 exactly -> still an integer string, no decimal point
    expect(leg?.amountTxCcy).toBe('11040');
  });

  it('rounds a fractional cross-currency product to 0dp for JPY, ROUND_HALF_UP', () => {
    const leg = buildSuspenseBridgeLeg('Suspense - Debit', { amount: '10', currency: 'USD', crossRate: '110.46' }, 'JPY');
    // 10 * 110.46 = 1104.6 -> rounds up to 1105 (JPY's 0dp minor units, ROUND_HALF_UP)
    expect(leg?.amountTxCcy).toBe('1105');
  });

  it('cross-currency entry with zero amount returns null even with a valid crossRate', () => {
    expect(buildSuspenseBridgeLeg('Suspense - Debit', { amount: '0', currency: 'EUR', crossRate: '1.1' }, 'USD')).toBeNull();
  });

  it('throws RequestValidationError when currency differs but crossRate is missing', () => {
    expect(() => buildSuspenseBridgeLeg('Suspense - Debit', { amount: '100', currency: 'EUR' }, 'USD')).toThrow(
      RequestValidationError,
    );
  });
});

describe('buildNetFxExchangePairLegs (v1.7.0)', () => {
  it('returns empty debit/credit when magnitude is exactly zero', () => {
    expect(buildNetFxExchangePairLegs('EUR', 'USD', new Decimal(0), false, '1.1')).toEqual({ debit: [], credit: [] });
  });

  it('otherCcySiteIsCredit=false: Other-Ccy-site debit, Trx-Ccy-site credit — matches pre-v1.7.0 gross behavior (DEBIT-list negative net, or CREDIT-list unconditionally)', () => {
    const pair = buildNetFxExchangePairLegs('EUR', 'USD', new Decimal(17), false, '1.1');
    expect(pair.debit).toEqual([
      { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', drBuyRate: '1.1' },
    ]);
    expect(pair.credit).toEqual([
      { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.7', crBuyRate: '1.1' },
    ]);
  });

  it('otherCcySiteIsCredit=true: Other-Ccy-site credit, Trx-Ccy-site debit (DEBIT-list only, when the real leg exceeds gross Suspense)', () => {
    const pair = buildNetFxExchangePairLegs('EUR', 'USD', new Decimal(3), true, '1.1');
    expect(pair.credit).toEqual([
      { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '3.3', amountAccountCcy: '3', crBuyRate: '1.1' },
    ]);
    expect(pair.debit).toEqual([
      { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '3.3', drBuyRate: '1.1' },
    ]);
  });

  it('takes the absolute value of magnitude regardless of sign — the caller (expandSuspenseBridge) is responsible for passing the right otherCcySiteIsCredit', () => {
    const pair = buildNetFxExchangePairLegs('EUR', 'USD', new Decimal(-17), false, '1.1');
    expect(pair.debit[0]!.amountAccountCcy).toBe('17');
  });

  it('rounds the Other-Ccy-site amount to the FOREIGN currency\'s own minor units (JPY=0dp)', () => {
    const pair = buildNetFxExchangePairLegs('JPY', 'USD', new Decimal(9000), false, '0.01');
    expect(pair.debit[0]!.amountAccountCcy).toBe('9000');
    expect(pair.debit[0]!.amountTxCcy).toBe('90');
  });

  it('passes the crossRate string through verbatim (no re-rounding) as crBuyRate/drBuyRate', () => {
    const pair = buildNetFxExchangePairLegs('EUR', 'USD', new Decimal(17), false, '1.10000001');
    expect(pair.debit[0]!.drBuyRate).toBe('1.10000001');
    expect(pair.credit[0]!.crBuyRate).toBe('1.10000001');
  });
});

describe('expandSuspenseBridge', () => {
  it('returns empty debit/credit when bridge is undefined', () => {
    expect(expandSuspenseBridge(undefined, 'USD')).toEqual({ debit: [], credit: [] });
  });

  it('returns empty debit/credit when both entry lists are empty/absent', () => {
    expect(expandSuspenseBridge({}, 'USD')).toEqual({ debit: [], credit: [] });
  });

  it('every debitEntries/creditEntries entry lands on the CREDIT side as its own bridge leg (no matching-currency legs supplied)', () => {
    const result = expandSuspenseBridge(
      {
        debitEntries: [{ amount: '10', currency: 'USD' }],
        creditEntries: [{ amount: '20', currency: 'USD' }],
      },
      'USD',
    );
    expect(result.debit).toEqual([]);
    expect(result.credit).toHaveLength(2);
    expect(result.credit.map((l) => l.accountNo)).toEqual(['Suspense - Debit', 'Suspense - Credit']);
    expect(result.credit.map((l) => l.amountTxCcy)).toEqual(['10', '20']);
  });

  it('a cross-currency entry with no matching-currency leg produces its FX Exchange pair exactly as pre-v1.7.0', () => {
    const result = expandSuspenseBridge({ debitEntries: [{ amount: '100', currency: 'EUR', crossRate: '1.1' }] }, 'USD');
    expect(result.credit).toHaveLength(2); // bridge leg + Trx-Ccy-site
    expect(result.debit).toHaveLength(1); // Other-Ccy-site
    expect(result.credit[0]!.accountNo).toBe('Suspense - Debit');
    expect(result.credit[1]!.accountNo).toBe('FX Exchange EUR');
    expect(result.debit[0]!.accountNo).toBe('FX Exchange USD');
  });

  it('multiple entries in the same list each become their own itemized leg, not merged', () => {
    const result = expandSuspenseBridge(
      { creditEntries: [{ amount: '10', currency: 'USD' }, { amount: '20', currency: 'USD' }] },
      'USD',
    );
    expect(result.credit).toHaveLength(2);
    expect(result.credit.map((l) => l.amountTxCcy)).toEqual(['10', '20']);
  });

  it('a zero-amount entry is silently skipped (no leg generated)', () => {
    const result = expandSuspenseBridge({ debitEntries: [{ amount: '0', currency: 'USD' }] }, 'USD');
    expect(result.debit).toEqual([]);
    expect(result.credit).toEqual([]);
  });

  it('a sourceComponent-tagged entry expands exactly like an untagged one — the tag is pure provenance metadata (v1.5.0/v1.6.0)', () => {
    const result = expandSuspenseBridge(
      { debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'IBL' }] },
      'USD',
    );
    expect(result.credit).toEqual([{ accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'USD', amountTxCcy: '10' }]);
  });

  describe('v1.7.0 DEBIT side — genuine netting (opposite polarity from the always-credit bridge leg)', () => {
    it("worked example (EUR Debit Leg 20, Suspense Debit EUR 17 -> Net 3): Suspense posts GROSS, FX pair sized to NET only", () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '3.3', amountAccountCcy: '3', crBuyRate: '1.1' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '3.3', drBuyRate: '1.1' },
      ]);
    });

    it('worked example (JPY Debit Leg 10000, Suspense Debit JPY 1000 -> Net 9000)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '1000', currency: 'JPY', crossRate: '0.01' }] },
        'USD',
        [payLeg({ currency: 'JPY', amountTxCcy: '100', amountAccountCcy: '10000' })],
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'JPY', amountTxCcy: '10', amountAccountCcy: '1000', crBuyRate: '0.01' },
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'JPY', amountTxCcy: '90', amountAccountCcy: '9000', crBuyRate: '0.01' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange JPY', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '90', drBuyRate: '0.01' },
      ]);
    });

    it('"如果輸入EUR17則無需兌換" — a Debit Leg exactly matching gross Suspense (Net=0) skips the FX pair entirely, Suspense still posts gross', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '15.45', amountAccountCcy: '17' })],
      );
      expect(result.debit).toEqual([]);
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
      ]);
    });

    it('multiple same-currency Suspense entries are aggregated for netting, but each still posts its own itemized gross bridge leg', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '12', currency: 'EUR', crossRate: '1.1' }, { amount: '5', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      const bridgeLegs = result.credit.filter((l) => l.accountNo === 'Suspense - Debit');
      expect(bridgeLegs.map((l) => l.amountAccountCcy)).toEqual(['12', '5']); // itemized, not merged
      const fxPairCredit = result.credit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(fxPairCredit?.amountAccountCcy).toBe('3'); // Net = 20 - (12+5) = 3, ONE consolidated pair
      expect(result.debit).toHaveLength(1);
    });

    it('a leg in a DIFFERENT currency is not counted toward the net (Net falls back to -gross, same as no matching leg)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'GBP', amountTxCcy: '100', amountAccountCcy: '100' })],
      );
      const fxPairDebit = result.debit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(fxPairDebit?.amountAccountCcy).toBe('17'); // full gross, unaffected by the unrelated GBP leg
    });

    it('falls back to amountTxCcy for a leg missing amountAccountCcy (raw API caller edge case)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '20' })], // no amountAccountCcy
      );
      const fxPairCredit = result.credit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(fxPairCredit?.amountAccountCcy).toBe('3'); // Net = 20 - 17 = 3, using amountTxCcy as the fallback
    });

    it('a zero-amount entry inside an otherwise-foreign-currency bucket is skipped, but sibling entries and the net FX pair still post', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '0', currency: 'EUR', crossRate: '1.1' }, { amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      expect(result.credit.filter((l) => l.accountNo === 'Suspense - Debit')).toHaveLength(1); // zero-amount entry produced no leg
      expect(result.debit).toHaveLength(1); // Trx-Ccy-site only
      expect(result.debit[0]!.accountNo).toBe('FX Exchange EUR');
      expect(result.credit.find((l) => l.accountNo === 'FX Exchange USD')?.amountAccountCcy).toBe('3'); // net FX pair unaffected by the skipped zero entry
    });

    it('throws RequestValidationError when same-currency entries carry different crossRate values', () => {
      expect(() =>
        expandSuspenseBridge(
          { debitEntries: [{ amount: '10', currency: 'EUR', crossRate: '1.1' }, { amount: '5', currency: 'EUR', crossRate: '1.2' }] },
          'USD',
        ),
      ).toThrow(RequestValidationError);
    });
  });

  describe('v1.7.0 CREDIT side — combining (SAME polarity as the always-credit bridge leg, so it can never net to zero)', () => {
    it('reviewer-confirmed worked example (Credit Suspense EUR 100, real Credit Leg NOSTRO EUR 100 -> Combined EUR 200, NOT net-to-zero): Credit Suspense and a real Credit Leg do NOT offset each other', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '100', currency: 'EUR', crossRate: '1.0831' }] },
        'USD',
        [],
        [payLeg({ currency: 'EUR', amountTxCcy: '92.33', amountAccountCcy: '100' })],
      );
      // Bridge leg: ALWAYS credit, gross — never flips, unlike the earlier (incorrect) implementation.
      // Trx-Ccy-site (FX Exchange EUR, USD-denominated) also lands on credit for the credit-list case.
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100', crBuyRate: '1.0831' },
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '216.62', crBuyRate: '1.0831' },
      ]);
      // Other-Ccy-site (FX Exchange USD, EUR-denominated) sized to the COMBINED amount (100 + 100 = 200), not net-to-zero.
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '216.62', amountAccountCcy: '200', drBuyRate: '1.0831' },
      ]);
    });

    it('with no matching-currency credit leg (L_C=0), Combined_C degenerates to gross Suspense — identical to pre-v1.7.0', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [],
        [],
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.7', crBuyRate: '1.1' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', drBuyRate: '1.1' },
      ]);
    });

    it('debitEntries and creditEntries combine independently — a debitLegs-side EUR leg never affects a creditEntries EUR suspense entry', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })], // debitLegs — irrelevant to creditEntries combining
        [],
      );
      // Combined for creditEntries = 0 (no creditLegs in EUR) + 17 = 17, same as "no matching leg" — the debitLegs EUR leg must not leak in.
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.7', crBuyRate: '1.1' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', drBuyRate: '1.1' },
      ]);
    });

    it('multiple same-currency Suspense Credit entries are aggregated for combining, but each still posts its own itemized gross bridge leg', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '12', currency: 'EUR', crossRate: '1.1' }, { amount: '5', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [],
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      const bridgeLegs = result.credit.filter((l) => l.accountNo === 'Suspense - Credit');
      expect(bridgeLegs.map((l) => l.amountAccountCcy)).toEqual(['12', '5']); // itemized, not merged
      const fxOtherCcy = result.debit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(fxOtherCcy?.amountAccountCcy).toBe('37'); // Combined = 20 + (12+5) = 37 — ADDED, not netted
    });
  });
});
