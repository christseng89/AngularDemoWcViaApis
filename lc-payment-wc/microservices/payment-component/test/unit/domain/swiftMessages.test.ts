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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('buildSwiftMessages', () => {
  it('produces only an advice message when payAdviceMsgType is set and payCoverMsgType is None', () => {
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', payCoverMsgType: 'None', currency: 'USD', amountTxCcy: '500' }),
    ], 'USD');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageType).toBe('MT103');
    // Same-currency payment: 32A == 33B, currencies both the transaction currency.
    expect(messages[0]!.settlementAmount).toBe('500');
    expect(messages[0]!.instructedAmount).toBe('500');
    expect(messages[0]!.settlementCurrency).toBe('USD');
    expect(messages[0]!.instructedCurrency).toBe('USD');
  });

  it('produces only a cover message when payCoverMsgType is set and payAdviceMsgType is None', () => {
    const messages = buildSwiftMessages('instr-1', [creditLeg({ payCoverMsgType: 'MT202', payAdviceMsgType: 'None' })], 'USD');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageType).toBe('MT202');
    // A cover carries 32A only — no 33B (instructed) amount/currency.
    expect(messages[0]!.instructedAmount).toBeUndefined();
    expect(messages[0]!.instructedCurrency).toBeUndefined();
  });

  it('produces both messages when both types are set', () => {
    const messages = buildSwiftMessages('instr-1', [creditLeg({ payAdviceMsgType: 'MT103', payCoverMsgType: 'MT202COV' })], 'USD');
    expect(messages).toHaveLength(2);
  });

  it('produces no messages when both types are None or absent', () => {
    expect(buildSwiftMessages('instr-1', [creditLeg({ payAdviceMsgType: 'None', payCoverMsgType: 'None' })], 'USD')).toEqual([]);
    expect(buildSwiftMessages('instr-1', [creditLeg()], 'USD')).toEqual([]);
  });

  it('H-3: for a CROSS-currency leg, 32A (settled, leg ccy) and 33B (instructed, transaction ccy) DIFFER', () => {
    // Pay-out settles EUR 120 (leg/account currency), instructed as USD 100 (transaction currency).
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', currency: 'EUR', amountTxCcy: '100', amountAccountCcy: '120' }),
    ], 'USD');
    const m = messages[0]!;
    expect(m.settlementCurrency).toBe('EUR'); // 32A
    expect(m.settlementAmount).toBe('120'); // 32A
    expect(m.instructedCurrency).toBe('USD'); // 33B
    expect(m.instructedAmount).toBe('100'); // 33B
    expect(m.settlementAmount).not.toBe(m.instructedAmount);
  });

  it('H-3: populates a v4 UETR on every generated message, shared between a leg\'s advice and its cover', () => {
    const messages = buildSwiftMessages('instr-1', [creditLeg({ payAdviceMsgType: 'MT103', payCoverMsgType: 'MT202COV' })], 'USD');
    expect(messages).toHaveLength(2);
    expect(messages[0]!.uetr).toMatch(UUID_V4);
    expect(messages[1]!.uetr).toMatch(UUID_V4);
    // Advice + cover of the SAME leg share the SAME UETR (gpi cover carries the MT103's UETR).
    expect(messages[0]!.uetr).toBe(messages[1]!.uetr);
  });

  it('H-3: different legs get different UETRs', () => {
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', legId: 'leg-a' }),
      creditLeg({ payAdviceMsgType: 'MT103', legId: 'leg-b' }),
    ], 'USD');
    expect(messages[0]!.uetr).not.toBe(messages[1]!.uetr);
  });

  it('aggregates messages across multiple legs', () => {
    const messages = buildSwiftMessages('instr-1', [
      creditLeg({ payAdviceMsgType: 'MT103', legId: 'leg-a' }),
      creditLeg({ payCoverMsgType: 'MT202', legId: 'leg-b' }),
    ], 'USD');
    expect(messages).toHaveLength(2);
    expect(messages[0]!.legId).toBe('leg-a');
    expect(messages[1]!.legId).toBe('leg-b');
  });

  it('carries instructionId and valueDate through onto each message', () => {
    const messages = buildSwiftMessages('instr-99', [creditLeg({ payAdviceMsgType: 'PACS008', valueDate: '2026-03-01' })], 'USD');
    expect(messages[0]!.instructionId).toBe('instr-99');
    expect(messages[0]!.valueDate).toBe('2026-03-01');
  });
});
