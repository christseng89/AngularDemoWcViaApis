import { validateSwiftCrossField, buildSwiftMessages } from '../../../src/domain/swiftMessages';
import { BusinessValidationError } from '../../../src/errors';
import type { PaymentLeg } from '../../../src/types';

function creditLeg(overrides: Partial<PaymentLeg> = {}): PaymentLeg {
  return {
    accountNo: 'NOSTRO-1',
    accountType: 'NOSTRO',
    currency: 'USD',
    amountTxCcy: '1000',
    legId: 'leg-1',
    legSide: 'CREDIT',
    accountDesc: 'IPLC03NULLNULLNULLN',
    accountCategory: 'NOSTRO_FAMILY',
    ...overrides,
  };
}

describe('validateSwiftCrossField', () => {
  it('passes when a COV cover type is paired with an in-scope advice type', () => {
    expect(() =>
      validateSwiftCrossField([creditLeg({ payCoverMsgType: 'MT202COV', payAdviceMsgType: 'MT103' })]),
    ).not.toThrow();
    expect(() =>
      validateSwiftCrossField([creditLeg({ payCoverMsgType: 'PACS009COV', payAdviceMsgType: 'PACS008' })]),
    ).not.toThrow();
  });

  it('throws BusinessValidationError SWIFT_ADV_COV_MISMATCH when the advice type is missing', () => {
    expect(() => validateSwiftCrossField([creditLeg({ payCoverMsgType: 'MT202COV' })])).toThrow(BusinessValidationError);
    try {
      validateSwiftCrossField([creditLeg({ payCoverMsgType: 'MT202COV', accountNo: 'BAD-ACC' })]);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessValidationError);
      expect((err as BusinessValidationError).code).toBe('SWIFT_ADV_COV_MISMATCH');
      expect((err as BusinessValidationError).message).toContain('BAD-ACC');
      expect((err as BusinessValidationError).message).toContain('leg[0]');
    }
  });

  it('throws when the advice type is present but not in the required set', () => {
    expect(() =>
      validateSwiftCrossField([creditLeg({ payCoverMsgType: 'PACS009COV', payAdviceMsgType: 'None' })]),
    ).toThrow(BusinessValidationError);
  });

  it('does not throw when payCoverMsgType is not a COV-requiring type (e.g. plain MT202)', () => {
    expect(() => validateSwiftCrossField([creditLeg({ payCoverMsgType: 'MT202' })])).not.toThrow();
  });

  it('does not throw when payCoverMsgType is absent entirely', () => {
    expect(() => validateSwiftCrossField([creditLeg()])).not.toThrow();
  });

  it('reports the correct index when a later leg in a multi-leg array violates the rule', () => {
    const legs = [
      creditLeg({ payCoverMsgType: 'MT202', accountNo: 'OK-LEG' }),
      creditLeg({ payCoverMsgType: 'MT202COV', accountNo: 'BAD-LEG' }),
    ];
    try {
      validateSwiftCrossField(legs);
      fail('expected throw');
    } catch (err) {
      expect((err as BusinessValidationError).message).toContain('leg[1]');
      expect((err as BusinessValidationError).message).toContain('BAD-LEG');
    }
  });
});

describe('buildSwiftMessages', () => {
  it('produces only an advice message when payAdviceMsgType is set and payCoverMsgType is None', () => {
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', payCoverMsgType: 'None', currency: 'USD', amountTxCcy: '500' }),
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageType).toBe('MT103');
    expect(messages[0]!.settlementAmount).toBe('500');
    expect(messages[0]!.instructedAmount).toBe('500');
  });

  it('produces only a cover message when payCoverMsgType is set and payAdviceMsgType is None', () => {
    const messages = buildSwiftMessages('instr-1', [creditLeg({ payCoverMsgType: 'MT202', payAdviceMsgType: 'None' })]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageType).toBe('MT202');
    expect(messages[0]!.instructedAmount).toBeUndefined();
  });

  it('produces both messages when both types are set', () => {
    const messages = buildSwiftMessages('instr-1', [creditLeg({ payAdviceMsgType: 'MT103', payCoverMsgType: 'MT202COV' })]);
    expect(messages).toHaveLength(2);
  });

  it('produces no messages when both types are None or absent', () => {
    expect(buildSwiftMessages('instr-1', [creditLeg({ payAdviceMsgType: 'None', payCoverMsgType: 'None' })])).toEqual([]);
    expect(buildSwiftMessages('instr-1', [creditLeg()])).toEqual([]);
  });

  it('prefers amountAccountCcy over amountTxCcy for settlement/instructed amounts', () => {
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', amountTxCcy: '100', amountAccountCcy: '120' }),
    ]);
    expect(messages[0]!.settlementAmount).toBe('120');
  });

  it('aggregates messages across multiple legs', () => {
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', legId: 'leg-a' }),
      creditLeg({ payCoverMsgType: 'MT202', legId: 'leg-b' }),
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.legId).toBe('leg-a');
    expect(messages[1]!.legId).toBe('leg-b');
  });

  it('carries instructionId and valueDate through onto each message', () => {
    const messages = buildSwiftMessages('instr-99', [creditLeg({ payAdviceMsgType: 'PACS008', valueDate: '2026-03-01' })]);
    expect(messages[0]!.instructionId).toBe('instr-99');
    expect(messages[0]!.valueDate).toBe('2026-03-01');
  });
});
