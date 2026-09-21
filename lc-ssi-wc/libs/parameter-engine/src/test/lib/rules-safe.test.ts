import { ParameterRuleEngine } from '../../lib/rules';

describe('safe parameter evaluation', () => {
  it('returns severity-driven diagnostics without code evaluation', () => {
    const result = new ParameterRuleEngine().evaluate({ scope: 'TRANSACTION_ONLY' }, [{ id: 'r1', when: [{ path: 'scope', operator: 'EQ', value: 'TRANSACTION_ONLY' }], severity: 'WARNING', code: 'REVIEW', message: 'Review required' }]);
    expect(result).toEqual([{ severity: 'WARNING', code: 'REVIEW', message: 'Review required' }]);
  });
});
