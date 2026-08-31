import {
  BALANCE_COMPONENT_CONTRACT_VERSION,
  BALANCE_COMPONENT_THEME_TOKENS,
  isBalanceComponentTheme,
  isBalanceComponentView,
  normalizeBalanceComponentConfig,
} from './balance-component-element.contract';

describe('Balance Component element contract', () => {
  it('uses the transaction builder when configuration is absent', () => {
    expect(normalizeBalanceComponentConfig(undefined)).toEqual({
      version: BALANCE_COMPONENT_CONTRACT_VERSION,
      initialView: 'transaction-builder',
      theme: 'system',
    });
  });

  it('accepts a partial versioned configuration', () => {
    expect(normalizeBalanceComponentConfig({ version: '1', initialView: 'business-cases' })).toEqual({
      version: '1',
      initialView: 'business-cases',
      theme: 'system',
    });
  });

  it('rejects unsupported contract versions at the boundary', () => {
    expect(() => normalizeBalanceComponentConfig({ version: '2' as '1' })).toThrow('Unsupported Balance Component contract version: 2');
  });

  it('normalizes an instance-local theme without changing the contract version', () => {
    expect(normalizeBalanceComponentConfig({ version: '1', theme: 'dark' })).toEqual({
      version: '1',
      initialView: 'transaction-builder',
      theme: 'dark',
    });
  });

  it('rejects an unsupported runtime theme value', () => {
    expect(() => normalizeBalanceComponentConfig({ version: '1', theme: 'neon' as 'dark' })).toThrow('Unsupported Balance Component theme: neon');
    expect(isBalanceComponentTheme('neon')).toBe(false);
  });

  it('publishes stable host token names without exposing internal tb classes', () => {
    expect(BALANCE_COMPONENT_THEME_TOKENS).toContain('--balance-color-accent');
    expect(BALANCE_COMPONENT_THEME_TOKENS).toContain('--balance-font-sans');
    expect(BALANCE_COMPONENT_THEME_TOKENS.every((token) => token.startsWith('--balance-'))).toBe(true);
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
