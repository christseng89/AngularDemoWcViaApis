import { ParameterRuleEngine, type DeclarativeRule } from './rules';
const rule = (operator: 'EQ'|'NE'|'IN'|'PRESENT', value?: string|string[]): DeclarativeRule => ({ id: operator, when: [{ path: 'nested.value', operator, ...(value === undefined ? {} : { value }) }], severity: 'INFO', code: operator, message: operator, targetPath: 'nested.value' });
describe('parameter operators', () => {
  const engine = new ParameterRuleEngine(); const model = { nested: { value: 'USD' } };
  it('covers EQ, NE, IN and PRESENT', () => {
    expect(engine.evaluate(model, [rule('EQ','USD')])).toHaveLength(1); expect(engine.evaluate(model, [rule('EQ','EUR')])).toHaveLength(0);
    expect(engine.evaluate(model, [rule('NE','EUR')])).toHaveLength(1); expect(engine.evaluate(model, [rule('IN',['EUR','USD'])])).toHaveLength(1);
    expect(engine.evaluate(model, [rule('IN','USD')])).toHaveLength(0); expect(engine.evaluate(model, [rule('PRESENT')])[0]?.path).toBe('nested.value');
  });
  it('covers missing paths and rules without target paths', () => {
    expect(engine.evaluate({}, [rule('PRESENT')])).toHaveLength(0);
    expect(engine.evaluate({ value: null }, [{ id:'x', when:[], severity:'WARNING', code:'X', message:'x' }])).toEqual([{ severity:'WARNING', code:'X', message:'x' }]);
    expect(() => engine.evaluate(model, [{ ...rule('EQ'), when: [{ path:'x', operator:'BAD' as never }] }])).toThrow('Unsupported');
  });
});
