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

  describe('v1.9.0 DEBIT side — a real matching debit leg nets against the Suspense pair (superseded v1.8.0\'s "both pairs generate independently")', () => {
    it('real EUR Debit Leg 20 + Suspense Debit EUR 17: nets to ONE Leg-anchored pair sized to the 3 EUR / 0.52 USD residual (debitLegs exceed Suspense) — no longer two independent gross pairs', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
        // diff = 17 (gross Suspense) - 20 (real leg) = -3 -> Leg-anchored (DEBIT), no " - Suspense" suffix.
        { accountNo: 'FX Exchange USD', accountType: 'INTERNAL', currency: 'EUR', amountTxCcy: '0.52', amountAccountCcy: '3', crBuyRate: '1.1' },
      ]);
      expect(result.debit).toEqual([
        { accountNo: 'FX Exchange EUR', accountType: 'INTERNAL', currency: 'USD', amountTxCcy: '0.52', drBuyRate: '1.1' },
      ]);
    });

    it('a real Debit Leg EXACTLY matching gross Suspense skips the FX pair entirely (v1.9.0 — diff-netted to zero, superseding v1.8.0\'s "no more netting-to-zero" approach)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17' })],
      );
      expect(result.debit).toEqual([]);
      expect(result.credit).toEqual([
        { accountNo: 'Suspense - Debit', accountType: 'SUSPENSE', currency: 'EUR', amountTxCcy: '18.7', amountAccountCcy: '17', crBuyRate: '1.1' },
      ]);
    });

    it('multiple same-currency Suspense entries: the Suspense legs stay itemized (unaffected by diff-netting) — 12+5=17 gross vs a real 20 EUR leg nets to the same 3 EUR / 0.52 USD Leg-anchored residual', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '12', currency: 'EUR', crossRate: '1.1' }, { amount: '5', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      const bridgeLegs = result.credit.filter((l) => l.accountNo === 'Suspense - Debit');
      expect(bridgeLegs.map((l) => l.amountAccountCcy)).toEqual(['12', '5']); // itemized, not merged
      const legFxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(legFxCredit?.amountAccountCcy).toBe('3'); // diff = round(12*1.1)+round(5*1.1)=17 gross Suspense - 20 real leg = -3
      const legFxDebit = result.debit.find((l) => l.accountNo === 'FX Exchange EUR');
      expect(legFxDebit?.amountTxCcy).toBe('0.52'); // diffTrx = 18.7 (13.2+5.5) - 18.18 (the leg's own amountTxCcy)
    });

    it('a leg in a DIFFERENT currency does not net against this bucket — only the full-gross Suspense-anchored pair generates (diff reduces to the full gross amount, no matching-currency debitLegs at all)', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'GBP', amountTxCcy: '100', amountAccountCcy: '100' })],
      );
      expect(result.debit.map((l) => l.accountNo)).toEqual(['FX Exchange USD - Suspense']); // no unsuffixed "FX Exchange USD" leg pair
    });

    it('falls back to amountTxCcy for a leg missing amountAccountCcy (raw API caller edge case) when sizing the diff-netted pair\'s own-currency amount', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '20' })], // no amountAccountCcy
      );
      // legsOwnCcy falls back to amountTxCcy (20) for the native-currency diff: 17 (gross Suspense) - 20 = -3.
      const legFxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange USD');
      expect(legFxCredit?.amountAccountCcy).toBe('3');
      expect(legFxCredit?.amountTxCcy).toBe('1.3'); // diffTrx = 18.7 (Suspense trx-eq) - 20 (leg's own amountTxCcy, no fallback needed here)
    });

    it('a zero-amount entry inside an otherwise-foreign-currency bucket is skipped, but the sibling entry and the diff-netted pair still post', () => {
      const result = expandSuspenseBridge(
        { debitEntries: [{ amount: '0', currency: 'EUR', crossRate: '1.1' }, { amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        'USD',
        [payLeg({ currency: 'EUR', amountTxCcy: '18.18', amountAccountCcy: '20' })],
      );
      expect(result.credit.filter((l) => l.accountNo === 'Suspense - Debit')).toHaveLength(1); // zero-amount entry produced no leg
      expect(result.debit.map((l) => l.accountNo)).toEqual(['FX Exchange EUR']); // Leg-anchored diff pair only (diff = 17 - 20 = -3)
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

  it('a partial-match debitEntries bucket nets to a residual pair unconditionally — no request flag is involved', () => {
    const result = expandSuspenseBridge(
      { debitEntries: [{ amount: '200', currency: 'EUR', crossRate: '1.2' }] },
      'USD',
      [payLeg({ currency: 'EUR', amountTxCcy: '180', amountAccountCcy: '150' })], // only 150 of the 200 EUR is matched
      [],
    );
    const suspenseLeg = result.credit.find((l) => l.accountNo === 'Suspense - Debit');
    expect(suspenseLeg).toBeDefined(); // always lands on CREDIT — no flag-driven flip exists anymore
    expect(result.debit.find((l) => l.accountNo === 'Suspense - Debit')).toBeUndefined();
    const fxCredit = result.credit.find((l) => l.accountNo === 'FX Exchange EUR - Suspense');
    expect(fxCredit?.amountTxCcy).toBe('60'); // diff-sized (v1.9.0): 200 gross - 150 matched = 50 EUR / 60 USD residual
  });
});
