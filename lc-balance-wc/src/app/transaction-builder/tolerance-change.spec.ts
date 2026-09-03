import { amendmentDirection, resultingTolerancePct } from './tolerance-change';

describe('tolerance-change', () => {
  it('adds and subtracts whole-number amendment changes exactly', () => {
    expect(resultingTolerancePct('10', '5', 'INCREASE')).toEqual({ ok: true, value: '15' });
    expect(resultingTolerancePct('15', '15', 'DECREASE')).toEqual({ ok: true, value: '0' });
  });

  it('rejects a decrease whose result would be below zero', () => {
    expect(resultingTolerancePct('10', '11', 'DECREASE')).toEqual({ ok: false });
  });

  it('handles fractional-scale changes and strips a trailing-zero-only fraction', () => {
    expect(resultingTolerancePct('10.5', '0.25', 'INCREASE')).toEqual({ ok: true, value: '10.75' });
    expect(resultingTolerancePct('10.50', '0.50', 'INCREASE')).toEqual({ ok: true, value: '11' });
  });

  it('defaults missing current/change values to zero', () => {
    expect(resultingTolerancePct(null, '5', 'INCREASE')).toEqual({ ok: true, value: '5' });
    expect(resultingTolerancePct('5', undefined, 'INCREASE')).toEqual({ ok: true, value: '5' });
  });

  it('rejects non-numeric current or change values', () => {
    expect(resultingTolerancePct('abc', '5', 'INCREASE')).toEqual({ ok: false });
    expect(resultingTolerancePct('5', 'abc', 'INCREASE')).toEqual({ ok: false });
  });

  it('derives A2 direction from movement type and B2 direction from its selection', () => {
    expect(amendmentDirection('AMEND_INCREASE', 'DECREASE')).toBe('INCREASE');
    expect(amendmentDirection('AMEND_DECREASE', 'INCREASE')).toBe('DECREASE');
    expect(amendmentDirection('AMEND', 'DECREASE')).toBe('DECREASE');
  });

  it('falls back to INCREASE when neither the movement type nor a selection picks a direction', () => {
    expect(amendmentDirection(null, null)).toBe('INCREASE');
    expect(amendmentDirection(undefined, null)).toBe('INCREASE');
  });
});
