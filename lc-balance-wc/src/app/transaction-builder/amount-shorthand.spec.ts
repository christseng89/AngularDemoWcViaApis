import { AMOUNT_SHORTHAND_ERROR, parseAmountShorthand } from './amount-shorthand';

describe('parseAmountShorthand', () => {
  it.each([
    ['1500', '1500'],
    ['1500.25', '1500.25'],
    ['.5', '0.5'],
    ['001500.2500', '1500.25'],
    ['0.000', '0'],
    ['1.00', '1'],
  ])('keeps plain decimal input exact: %s -> %s', (input, expected) => {
    expect(parseAmountShorthand(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['1h', '100'],
    ['2H', '200'],
    ['1k', '1000'],
    ['2K', '2000'],
    ['1m', '1000000'],
    ['2M', '2000000'],
    ['15000m', '15000000000'],
  ])('expands case-insensitive h/k/m suffixes: %s -> %s', (input, expected) => {
    expect(parseAmountShorthand(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['20.5h', '2050'],
    ['3h2h', '500'],
    ['1m2k3h', '1002300'],
    ['1h.25', '100.25'],
    ['40k2k', '42000'],
    ['1m2m3k40k', '3043000'],
    ['1.5m2.5k', '1502500'],
    ['.5m.25k', '500250'],
    ['1m500', '1000500'],
    ['1m2', '1000002'],
    ['1m500.25', '1000500.25'],
    ['1k.25', '1000.25'],
    ['40k2k.25', '42000.25'],
    ['0.000001m', '1'],
    ['0.0000001m', '0.1'],
  ])('adds shorthand segments exactly without floating-point drift: %s -> %s', (input, expected) => {
    expect(parseAmountShorthand(input)).toEqual({ ok: true, value: expected });
  });

  it.each([null, undefined, '', ' ', '-1k', '+1k', '1t', '1T', '1b', '1,000', '1e3', 'k', 'm', '1kk', '1.2.3m', '1m.', '1 m', 'NaN'])('rejects invalid input %p', (input) => {
    expect(parseAmountShorthand(input)).toEqual({ ok: false, error: AMOUNT_SHORTHAND_ERROR });
  });

  it('rejects pathologically long input before BigInt parsing', () => {
    expect(parseAmountShorthand(`${'1'.repeat(129)}m`)).toEqual({ ok: false, error: AMOUNT_SHORTHAND_ERROR });
  });
});
