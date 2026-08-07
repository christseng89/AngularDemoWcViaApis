import { round, fmt, escapeHtml, ddaAcctsByCcy, chargeAmt, groupChargesByCcy, CCYS, type ChargeItem } from './shared';

describe('round', () => {
  it('rounds to the given number of decimal places', () => {
    expect(round(1.236, 2)).toBe(1.24);
    expect(round(1.234, 0)).toBe(1);
    expect(round(1.5, 0)).toBe(2);
  });
});

describe('fmt', () => {
  it('formats TWD and JPY with 0 decimal places', () => {
    expect(fmt(1234.5, 'TWD')).toBe('1,235');
    expect(fmt(1234.5, 'JPY')).toBe('1,235');
  });

  it('formats other currencies with 2 decimal places', () => {
    expect(fmt(1234.5, 'USD')).toBe('1,234.50');
    expect(fmt(1000, 'EUR')).toBe('1,000.00');
  });
});

describe('escapeHtml', () => {
  it('escapes all 5 special characters', () => {
    expect(escapeHtml(`<div class="a">O'Brien & Sons</div>`)).toBe('&lt;div class=&quot;a&quot;&gt;O&#39;Brien &amp; Sons&lt;/div&gt;');
  });

  it('coerces non-string values via String()', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(null)).toBe('null');
  });

  it('is a no-op for strings with nothing to escape', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});

describe('CCYS', () => {
  it('matches the backend currencies.json codes (kept in sync manually — see shared.ts doc comment)', () => {
    expect([...CCYS]).toEqual(['USD', 'EUR', 'JPY', 'GBP', 'TWD', 'IDR', 'CNY', 'HKD', 'SGD', 'AUD']);
  });
});

describe('ddaAcctsByCcy', () => {
  it('returns only accounts matching the currency, excluding pledge accounts by default', () => {
    const accts = ddaAcctsByCcy('C-001', 'USD');
    expect(accts.map((a) => a.id)).toEqual(['A1-U1', 'A1-FX']); // A1-U2 is a pledge account, excluded
  });

  it('includes pledge accounts when includePledge is true', () => {
    const accts = ddaAcctsByCcy('C-001', 'USD', true);
    expect(accts.map((a) => a.id)).toContain('A1-U2');
  });

  it('falls back to the "_default" pool for an unknown applicant id', () => {
    const accts = ddaAcctsByCcy('UNKNOWN-ID', 'TWD');
    expect(accts.map((a) => a.id)).toEqual(['DEF-T']);
  });

  it('returns an empty array when no account matches the currency', () => {
    expect(ddaAcctsByCcy('C-003', 'CNY')).toEqual([]);
  });
});

describe('chargeAmt', () => {
  const rates = { 'USD/TWD': 32.5, 'JPY/TWD': 0.218 };

  it('returns the raw amtTwd rounded to whole TWD when ccy is TWD', () => {
    const item: ChargeItem = { id: '1', label: 'x', amtTwd: 1000.6, ccy: 'TWD', ccyOptions: ['TWD'] };
    expect(chargeAmt(item, rates)).toBe(1001);
  });

  it('converts via the rate, 2dp for a non-JPY foreign currency', () => {
    const item: ChargeItem = { id: '1', label: 'x', amtTwd: 3250, ccy: 'USD', ccyOptions: ['USD', 'TWD'] };
    expect(chargeAmt(item, rates)).toBe(100);
  });

  it('converts via the rate, 0dp for JPY', () => {
    const item: ChargeItem = { id: '1', label: 'x', amtTwd: 218, ccy: 'JPY', ccyOptions: ['JPY', 'TWD'] };
    expect(chargeAmt(item, rates)).toBe(1000);
  });

  it('returns 0 when no rate is available for the currency', () => {
    const item: ChargeItem = { id: '1', label: 'x', amtTwd: 1000, ccy: 'EUR', ccyOptions: ['EUR'] };
    expect(chargeAmt(item, rates)).toBe(0);
  });
});

describe('groupChargesByCcy', () => {
  const rates = { 'USD/TWD': 32.5 };

  it('sums amtTwd and the converted amount per distinct currency', () => {
    const charges: ChargeItem[] = [
      { id: '1', label: 'a', amtTwd: 3250, ccy: 'USD', ccyOptions: ['USD'] },
      { id: '2', label: 'b', amtTwd: 650, ccy: 'USD', ccyOptions: ['USD'] },
      { id: '3', label: 'c', amtTwd: 500, ccy: 'TWD', ccyOptions: ['TWD'] },
    ];

    const groups = groupChargesByCcy(charges, rates);

    expect(groups).toEqual(
      expect.arrayContaining([
        { ccy: 'USD', totalAmt: 120, totalTwd: 3900 },
        { ccy: 'TWD', totalAmt: 500, totalTwd: 500 },
      ]),
    );
    expect(groups).toHaveLength(2);
  });

  it('returns an empty array for no charges', () => {
    expect(groupChargesByCcy([], rates)).toEqual([]);
  });
});
