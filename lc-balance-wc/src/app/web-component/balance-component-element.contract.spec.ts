import { BALANCE_COMPONENT_CONTRACT_VERSION, isBalanceComponentView, normalizeBalanceComponentConfig } from './balance-component-element.contract';

describe('Balance Component element contract', () => {
  it('uses the transaction builder when configuration is absent', () => {
    expect(normalizeBalanceComponentConfig(undefined)).toEqual({
      version: BALANCE_COMPONENT_CONTRACT_VERSION,
      initialView: 'transaction-builder',
    });
  });

  it('accepts a partial versioned configuration', () => {
    expect(normalizeBalanceComponentConfig({ version: '1', initialView: 'business-cases' })).toEqual({
      version: '1',
      initialView: 'business-cases',
    });
  });

  it('rejects unsupported contract versions at the boundary', () => {
    expect(() => normalizeBalanceComponentConfig({ version: '2' as '1' })).toThrow('Unsupported Balance Component contract version: 2');
  });

  it.each([
    ['transaction-builder', true],
    ['business-cases', true],
    ['unknown', false],
    [null, false],
  ])('validates view %p at the JavaScript boundary', (value, expected) => {
    expect(isBalanceComponentView(value)).toBe(expected);
  });
});
