// Deliberately a runtime (not `import type`) import — this is the only spec that
// actually executes payment-component.types.ts, so its exported consts (the
// wire-format enums every other test relies on) get a real regression check
// against accidental drift instead of only ever being referenced as types.
import {
  ORIGIN_MODULES,
  ACCOUNT_TYPES,
  ACCOUNT_CATEGORIES,
  PAY_INSTR_FLAGS,
  PAY_ADVICE_MSG_TYPES,
  PAY_COVER_MSG_TYPES,
  LEG_SIDES,
  VOUCHER_TYPES,
  DR_CR_INDICATORS,
  SWIFT_MESSAGE_TYPES,
  SWIFT_MESSAGE_STATUSES,
} from './payment-component.types';

describe('payment-component.types wire-format enums', () => {
  it('ORIGIN_MODULES matches the OAS OriginModule enum', () => {
    expect(ORIGIN_MODULES).toEqual(['IPLC', 'EPLC', 'IMCO', 'EXCO', 'PYMT', 'GTEE', 'RPFM', 'CFNC', 'SBLC', 'REIM', 'IWGT']);
  });

  it('ACCOUNT_TYPES has no standalone RTGS value (v1.3.0 — RTGS is a flag on NOSTRO, not its own type)', () => {
    expect(ACCOUNT_TYPES).toEqual(['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL']);
    expect(ACCOUNT_TYPES).not.toContain('RTGS');
  });

  it('ACCOUNT_CATEGORIES matches the OAS AccountCategory enum', () => {
    expect(ACCOUNT_CATEGORIES).toEqual(['CUSTOMER', 'NOSTRO_FAMILY', 'INTERNAL_SUSPENSE']);
  });

  it('PAY_INSTR_FLAGS matches CPYT_PAY_INSTR_FLAG', () => {
    expect(PAY_INSTR_FLAGS).toEqual(['F', 'A']);
  });

  it('PAY_ADVICE_MSG_TYPES / PAY_COVER_MSG_TYPES match the OAS enums', () => {
    expect(PAY_ADVICE_MSG_TYPES).toEqual(['MT103', 'PACS008', 'None']);
    expect(PAY_COVER_MSG_TYPES).toEqual(['MT202', 'MT202COV', 'PACS009COV', 'None']);
  });

  it('LEG_SIDES / VOUCHER_TYPES / DR_CR_INDICATORS match the OAS enums', () => {
    expect(LEG_SIDES).toEqual(['DEBIT', 'CREDIT']);
    expect(VOUCHER_TYPES).toEqual(['SETTLEMENT', 'CHARGE', 'LIABILITY']);
    expect(DR_CR_INDICATORS).toEqual(['D', 'C']);
  });

  it('SWIFT_MESSAGE_TYPES / SWIFT_MESSAGE_STATUSES match the OAS enums', () => {
    expect(SWIFT_MESSAGE_TYPES).toEqual(['MT103', 'MT202', 'MT202COV', 'PACS008', 'PACS009', 'PACS009COV']);
    expect(SWIFT_MESSAGE_STATUSES).toEqual(['PENDING', 'GENERATED', 'TRANSMITTED', 'FAILED']);
  });
});
