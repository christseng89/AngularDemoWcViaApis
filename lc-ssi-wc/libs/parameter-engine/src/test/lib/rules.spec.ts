import { ParameterRuleEngine } from '../../lib/rules';

describe('ParameterRuleEngine', () => {
  it('evaluates allow-listed declarative conditions', () => {
    const result = new ParameterRuleEngine().evaluate(
      { scope: 'TRANSACTION_ONLY', route: { accountId: 'NEW-ACCOUNT' } },
      [{
        id: 'cross-check',
        when: [{ path: 'scope', operator: 'EQ', value: 'TRANSACTION_ONLY' }, { path: 'route.accountId', operator: 'PRESENT' }],
        severity: 'ERROR', code: 'SSI_CROSSCHECK_REQUIRED', message: 'Callback and second Checker are required',
      }],
    );
    expect(result).toEqual([{ code: 'SSI_CROSSCHECK_REQUIRED', severity: 'ERROR', message: 'Callback and second Checker are required' }]);
  });

  it('does not execute arbitrary expressions', () => {
    const engine = new ParameterRuleEngine();
    expect(() => engine.evaluate({}, [{
      id: 'invalid', when: [{ path: 'x', operator: 'EVAL' as never }], severity: 'ERROR', code: 'X', message: 'X',
    }])).toThrow();
  });
});
