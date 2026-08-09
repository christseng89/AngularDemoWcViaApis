import { buildSuspenseBridgeLeg, buildFxPair, expandSuspenseBridge } from '../../../src/domain/suspenseBridge';
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

describe('buildFxPair (v1.8.0 — one self-balancing pair per SOURCE, not per-currency-combined)', () => {
  it('returns empty debit/credit when ownCcyAmount is exactly zero', () => {
    expect(buildFxPair('EUR', 'USD', new Decimal(0), new Decimal(0), 'CREDIT', '1.1', '')).toEqual({ debit: [], credit: [] });
  });

  it('CREDIT direction: Other-Ccy-site debit, Trx-Ccy-site credit', () => {
    const pair = buildFxPair('EUR', 'USD', new Decimal(17), new Decimal(18.7), 'CREDIT', '1.1', '');
    expect(pair.debit).toEqual([
      { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', drBuyRate: '1.1' },
    ]);
    expect(pair.credit).toEqual([
      { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.7', crBuyRate: '1.1' },
    ]);
  });

  it('DEBIT direction: Other-Ccy-site credit, Trx-Ccy-site debit', () => {
    const pair = buildFxPair('EUR', 'USD', new Decimal(3), new Decimal(3.3), 'DEBIT', '1.1', '');
    expect(pair.credit).toEqual([
      { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '3.3', amountAccountCcy: '3', crBuyRate: '1.1' },
    ]);
    expect(pair.debit).toEqual([
      { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '3.3', drBuyRate: '1.1' },
    ]);
  });

  it('trxCcyAmount is reused VERBATIM, never re-derived from ownCcyAmount × a rate — proven by passing a trxCcyAmount that does NOT equal ownCcyAmount × any sensible rate', () => {
    const pair = buildFxPair('EUR', 'USD', new Decimal(100), new Decimal(999.99), 'CREDIT', '1.1', '');
    expect(pair.credit[0]!.amountTxCcy).toBe('999.99'); // NOT 110 (100*1.1) — the caller's trxCcyAmount wins outright
  });

  it("rounds the Other-Ccy-site amount to the FOREIGN currency's own minor units (JPY=0dp)", () => {
    const pair = buildFxPair('JPY', 'USD', new Decimal(9000), new Decimal(90), 'CREDIT', '0.01', '');
    expect(pair.debit[0]!.amountAccountCcy).toBe('9000');
  });

  it("rounds the Trx-Ccy-site amount to the TRANSACTION currency's own minor units", () => {
    const pair = buildFxPair('EUR', 'USD', new Decimal(17), new Decimal(18.666), 'CREDIT', '1.1', '');
    expect(pair.credit[0]!.amountTxCcy).toBe('18.67'); // rounds to USD's 2dp, ROUND_HALF_UP
  });

  it('passes the crossRate string through verbatim (no re-rounding) as crBuyRate/drBuyRate', () => {
    const pair = buildFxPair('EUR', 'USD', new Decimal(17), new Decimal(18.7), 'CREDIT', '1.10000001', '');
    expect(pair.credit[0]!.crBuyRate).toBe('1.10000001');
  });

  it('accountSuffix is appended to BOTH generated account names', () => {
    const pair = buildFxPair('EUR', 'USD', new Decimal(17), new Decimal(18.7), 'CREDIT', '1.1', ' - Suspense');
    expect(pair.debit[0]!.accountNo).toBe('FX Exchange USD - Suspense');
    expect(pair.credit[0]!.accountNo).toBe('FX Exchange EUR - Suspense');
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

  it('a cross-currency entry with NO matching-currency leg produces only its own Suspense-suffixed FX pair (v1.8.0 — always suffixed, even with no leg to disambiguate from)', () => {
    const result = expandSuspenseBridge({ debitEntries: [{ amount: '100', currency: 'EUR', crossRate: '1.1' }] }, 'USD');
    expect(result.credit).toHaveLength(2); // bridge leg + Suspense Trx-Ccy-site
    expect(result.debit).toHaveLength(1); // Suspense Other-Ccy-site
    expect(result.credit[0]!.accountNo).toBe('Suspense - Debit');
    expect(result.credit[1]!.accountNo).toBe('FX Exchange EUR - Suspense');
    expect(result.credit[1]!.amountTxCcy).toBe('110');
    expect(result.debit[0]!.accountNo).toBe('FX Exchange USD - Suspense');
    expect(result.debit[0]!.amountAccountCcy).toBe('100');
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

  describe('v1.8.0 DEBIT side — a real debit leg gets its own pair, independent of the Suspense pair', () => {
    it('real EUR Debit Leg 20 + Suspense Debit EUR 17: BOTH pairs generate independently — Suspense reuses its OWN bridge-leg amountTxCcy (18.7), the leg pair reuses the LEG\'s OWN already-submitted amountTxCcy (18.18) verbatim, never recombined into one net figure', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
        // Suspense pair's Trx-Ccy-site (CREDIT-anchored — the bridge leg is always credit-direction).
        { accountNo: 'FX Exchange EUR - Suspense', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.7', crBuyRate: '1.1' },
        // Leg pair's Other-Ccy-site (CREDIT direction for a DEBIT-anchored pair) — reuses the leg's
        // own EUR 20 and its own 18.18 verbatim (NOT re-derived as 20 * some rate).
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20', crBuyRate: '1.1' },
      ]);
      expect(result.debit).toEqual([
        // Suspense pair's Other-Ccy-site.
        { accountNo: 'FX Exchange USD - Suspense', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', drBuyRate: '1.1' },
        // Leg pair's Trx-Ccy-site — DEBIT-anchored (matches the real leg's own direction), reusing
        // the leg's OWN 18.18 verbatim.
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.18', drBuyRate: '1.1' },
      ]);
    });

    it('a real Debit Leg EXACTLY matching gross Suspense no longer skips the FX pair (v1.8.0 — no more netting-to-zero special case; both self-balancing pairs still generate independently, and still net to the same overall effect once summed)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17' })],
      );
      // Two pairs now exist (not zero, as the old Net_C=0 special case produced) — but their
      // Trx-Ccy-site legs are equal-and-opposite (18.7 credit vs 18.7 debit), netting to the same
      // zero incremental effect on the USD total once summed.
      const debitTrxCcySite = result.debit.filter((l) => l.currency === 'USD');
      const creditTrxCcySite = result.credit.filter((l) => l.currency === 'USD');
      expect(debitTrxCcySite.map((l) => l.amountTxCcy)).toEqual(['18.7']); // leg pair, DEBIT-anchored
      expect(creditTrxCcySite.map((l) => l.amountTxCcy)).toEqual(['18.7']); // Suspense pair, CREDIT-anchored
    });

    it('multiple same-currency Suspense entries: the Suspense pair reuses the SUM of their individually-rounded bridge legs (not a bucket-combined-then-rounded-once figure)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '12', currency: 'EUR', crossRate: '1.1' }, { amount: '5', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      const bridgeLegs = result.credit.filter((l) => l.accountNo === 'Suspense - Debit');
      expect(bridgeLegs.map((l) => l.amountAccountCcy)).toEqual(['12', '5']); // itemized, not merged
      const suspenseFxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange EUR - Suspense');
      expect(suspenseFxCredit?.amountTxCcy).toBe('18.7'); // round(12*1.1)+round(5*1.1) = 13.2+5.5 = 18.7
      const legFxDebit = result.debit.find((l) => l.accountNo === 'FX Exchange EUR');
      expect(legFxDebit?.amountTxCcy).toBe('18.18'); // the leg's own amountTxCcy, unaffected by Suspense
    });

    it('a leg in a DIFFERENT currency does not produce a leg pair for this bucket — only the Suspense pair generates', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'GBP', amountTxCcy: '100', amountAccountCcy: '100' })],
      );
      expect(result.debit.map((l) => l.accountNo)).toEqual(['FX Exchange USD - Suspense']); // no unsuffixed "FX Exchange USD" leg pair
    });

    it('falls back to amountTxCcy for a leg missing amountAccountCcy (raw API caller edge case) when sizing the leg pair\'s own-currency amount', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '20' })], // no amountAccountCcy
      );
      const legFxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(legFxCredit?.amountAccountCcy).toBe('20'); // falls back to amountTxCcy
      expect(legFxCredit?.amountTxCcy).toBe('20'); // and the Trx-Ccy-site side reuses the same value verbatim
    });

    it('a zero-amount entry inside an otherwise-foreign-currency bucket is skipped, but sibling entries and both pairs still post', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '0', currency: 'EUR', crossRate: '1.1' }, { amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      expect(result.credit.filter((l) => l.accountNo === 'Suspense - Debit')).toHaveLength(1); // zero-amount entry produced no leg
      expect(result.debit.map((l) => l.accountNo)).toEqual(['FX Exchange USD - Suspense', 'FX Exchange EUR']);
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

  describe('v1.8.0 CREDIT side — a real credit leg gets its own pair, independent of the Suspense pair (reviewer-confirmed EUR100+EUR100 scenario)', () => {
    it('reviewer-confirmed worked example (Credit Suspense EUR 200, real Credit Leg NOSTRO-ACC EUR 100): TWO independent pairs, each reusing its own already-computed trx-equivalent — this is what makes CUST-ACC2/NOSTRO-ACC2\'s remainder (9675.07, computed client-side gross-only) balance exactly, both aggregate AND per-currency', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.083077' }] },
        'USD',
        [],
        [payLeg({ currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100' })],
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '216.62', amountAccountCcy: '200', crBuyRate: '1.083077' },
        { accountNo: 'FX Exchange EUR - Suspense', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '216.62', crBuyRate: '1.083077' },
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '108.31', crBuyRate: '1.083077' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange USD - Suspense', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '216.62', amountAccountCcy: '200', drBuyRate: '1.083077' },
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100', drBuyRate: '1.083077' },
      ]);

      // Full aggregate V8 check with CUST-ACC(10000, DEBIT) and the client's own gross-only
      // remainder (9675.07) — matches lc-payment-wc's business-case-runner.component.ts seed
      // formula exactly (v1.7.4/v1.7.5), which never combines with the live leg.
      const debitLegs = [payLeg({ accountNo: 'CUST-ACC', currency: 'USD', amountTxCcy: '10000' }), ...result.debit];
      const creditLegs = [payLeg({ accountNo: 'NOSTRO-ACC2', currency: 'USD', amountTxCcy: '9675.07' }), payLeg({ currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100' }), ...result.credit];
      const sum = (legs: PaymentLegInput[]) => legs.reduce((s, l) => s.plus(new Decimal(l.amountTxCcy)), new Decimal(0));
      expect(sum(debitLegs).toString()).toBe(sum(creditLegs).toString());
    });

    it('with no matching-currency credit leg, only the Suspense pair generates — identical to the DEBIT-side no-leg case', () => {
      const result = expandSuspenseBridge({ creditEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] }, 'USD', [], []);
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
        { accountNo: 'FX Exchange EUR - Suspense', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '18.7', crBuyRate: '1.1' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange USD - Suspense', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', drBuyRate: '1.1' },
      ]);
    });

    it('debitEntries and creditEntries process independently — a debitLegs-side EUR leg never produces a leg pair for a creditEntries EUR suspense bucket', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })], // debitLegs — irrelevant to creditEntries
        [],
      );
      expect(result.credit.map((l) => l.accountNo)).toEqual(['Suspense - Credit', 'FX Exchange EUR - Suspense']); // no unsuffixed leg pair
    });

    it('multiple same-currency real credit legs: the leg pair reuses the SUM of their own already-submitted amountTxCcy verbatim', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [],
        [payLeg({ currency: 'EUR', amountTxCcy: '10.00', amountAccountCcy: '11' }), payLeg({ currency: 'EUR', amountTxCcy: '8.18', amountAccountCcy: '9' })],
      );
      const legFxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange EUR');
      expect(legFxCredit?.amountTxCcy).toBe('18.18'); // 10.00 + 8.18, summed verbatim — not re-derived from (11+9)*rate
    });
  });

  describe('chargeComponentBridge diff-sized pair (2026-08-09, business-requirement-confirmed)', () => {
    it('diff === 0 (exact match): no FX pair at all, only the plain Suspense - Credit leg', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200' })], // debitLegs — opposite side from creditEntries
        [], // creditLegs always empty for a chargeBridge case
        true, // chargeComponentBridge
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200', crBuyRate: '1.2' },
      ]);
      expect(result.debit).toEqual([]);
    });

    it('reproduces the reviewer-confirmed multi-currency worked example (USD 100+EUR 200 Suspense Credit vs USD 80+20 / EUR 200 debit legs) — clean output, no FX Exchange lines at all', () => {
      const result = expandSuspenseBridge(
        {
          creditEntries: [
            { amount: '100', currency: 'USD' },
            { amount: '200', currency: 'EUR', crossRate: '1.2' },
          ],
        },
        'USD',
        [
          payLeg({ accountNo: 'CUST-ACC2', currency: 'USD', amountTxCcy: '80', amountAccountCcy: '80' }),
          payLeg({ accountNo: 'CUST-ACC3', currency: 'USD', amountTxCcy: '20', amountAccountCcy: '20' }),
          payLeg({ accountNo: 'CUST-ACC', currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200' }),
        ],
        [],
        true,
      );
      expect(result.debit).toEqual([]);
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'USD', amountTxCcy: '100' },
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200', crBuyRate: '1.2' },
      ]);
    });

    it('diff > 0, NO matching debit leg at all: reduces to the full gross-sized pair — identical to the pre-existing "no matching leg" behavior', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
        'USD',
        [], // no EUR debit leg at all
        [],
        true,
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Credit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200', crBuyRate: '1.2' },
        { accountNo: 'FX Exchange EUR - Suspense', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '240', crBuyRate: '1.2' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange USD - Suspense', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200', drBuyRate: '1.2' },
      ]);
    });

    it('diff > 0, PARTIAL match (150 of 200 EUR): the pair is sized to just the 50 EUR / 60 USD residual, not the full 200/240 gross', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '180', amountAccountCcy: '150' })], // only 150 of the 200 EUR is matched
        [],
        true,
      );
      const fxDebit = result.debit.find((l) => l.accountNo === 'FX Exchange USD - Suspense');
      const fxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange EUR - Suspense');
      expect(fxDebit).toEqual({ accountNo: 'FX Exchange USD - Suspense', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '60', amountAccountCcy: '50', drBuyRate: '1.2' });
      expect(fxCredit).toEqual({ accountNo: 'FX Exchange EUR - Suspense', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '60', crBuyRate: '1.2' });
      // Full end-to-end aggregate + per-currency balance for this exact scenario (plus the USD
      // Suspense Credit bucket this isolated call doesn't exercise) is verified via
      // confirmPaymentInstruction.test.ts's "partial coverage" integration test.
    });

    it('diff < 0 (debitLegs EXCEED the Suspense Credit bucket): a DEBIT-anchored pair, sized to just the excess, direction mirrors the diff > 0 case', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '252', amountAccountCcy: '210' })], // 210, not 200 — a 10 EUR excess
        [],
        true,
      );
      const fxDebit = result.debit.find((l) => l.accountNo === 'FX Exchange EUR - Suspense');
      const fxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange USD - Suspense');
      expect(fxDebit).toEqual({ accountNo: 'FX Exchange EUR - Suspense', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '12', drBuyRate: '1.2' });
      expect(fxCredit).toEqual({ accountNo: 'FX Exchange USD - Suspense', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '12', amountAccountCcy: '10', crBuyRate: '1.2' });
      // Full end-to-end aggregate + per-currency balance for this exact scenario (with a
      // compensating leg elsewhere covering the 10 EUR / 12 USD excess) is verified via
      // confirmPaymentInstruction.test.ts's "debit exceeds Suspense Credit" integration test.
    });

    it('does NOT apply when chargeComponentBridge is false/omitted, even with an exact native-currency match (opt-in only — the default 4-arg call site is unaffected, unconditional gross-sized pair still generates)', () => {
      const result = expandSuspenseBridge(
        { creditEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200' })],
        [],
      );
      const fxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange EUR - Suspense');
      expect(fxCredit?.amountTxCcy).toBe('240'); // full gross, not diff-sized — the old default path, untouched
    });

    it('does NOT apply to a debitEntries bucket (side DEBIT) — only ever compares creditEntries against the OPPOSITE-side debitLegs, never the reverse', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
        'USD',
        [],
        [payLeg({ currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200' })], // creditLegs matching debitEntries — not the shape this targets
        true,
      );
      const fxDebit = result.debit.find((l) => l.accountNo === 'FX Exchange USD - Suspense');
      expect(fxDebit?.amountAccountCcy).toBe('200'); // full gross, not diff-sized — side DEBIT is untouched by this branch
    });
  });
});
