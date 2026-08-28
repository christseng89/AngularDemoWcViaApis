import { applyStatusTransition, assertMakerCheckerSeparation } from '../../../src/domain/statusTransition';
import { IllegalStateTransitionError, MakerCheckerConflictError } from '../../../src/errors';

describe('applyStatusTransition (Design doc §4/§8)', () => {
  test.each([
    ['PENDING', 'RELEASE', 'RELEASED'],
    ['PENDING', 'REJECT', 'REJECTED'],
    ['PENDING', 'CANCEL', 'CANCELLED'],
    ['PENDING', 'EDIT', 'PENDING'],
    ['REJECTED', 'CANCEL', 'CANCELLED'],
    ['REJECTED', 'EDIT', 'PENDING'],
  ] as const)('%s -> %s => %s', (currentStatus, action, expected) => {
    expect(applyStatusTransition({ currentStatus, action, createdBy: 'maker1', actingUser: 'checker1' })).toBe(expected);
  });

  test('Maker and Checker being the same user is REJECTED for RELEASE (business-confirmed 2026-08-24, genuine 4-eyes separation — supersedes the earlier 2026-08-14 posture)', () => {
    expect(() => applyStatusTransition({ currentStatus: 'PENDING', action: 'RELEASE', createdBy: 'alice', actingUser: 'alice' })).toThrow(
      MakerCheckerConflictError,
    );
  });

  test('Maker and Checker being the same user is REJECTED for REJECT too', () => {
    expect(() => applyStatusTransition({ currentStatus: 'PENDING', action: 'REJECT', createdBy: 'alice', actingUser: 'alice' })).toThrow(
      MakerCheckerConflictError,
    );
  });

  test('CANCEL is untouched by the 4-eyes rule — a Maker cancelling their OWN still-PENDING entry is the expected, correct case, not a conflict', () => {
    expect(applyStatusTransition({ currentStatus: 'PENDING', action: 'CANCEL', createdBy: 'alice', actingUser: 'alice' })).toBe('CANCELLED');
  });

  test.each([
    ['RELEASED', 'RELEASE'],
    ['RELEASED', 'REJECT'],
    ['REJECTED', 'RELEASE'], // cannot re-release an already-rejected movement
    ['CANCELLED', 'CANCEL'],
    ['RELEASED', 'EDIT'], // a released movement is no longer Fix-Pending-editable
    ['CANCELLED', 'EDIT'],
  ] as const)('illegal: %s -> %s throws, never silently succeeds', (currentStatus, action) => {
    expect(() => applyStatusTransition({ currentStatus, action, createdBy: 'maker1', actingUser: 'checker1' })).toThrow(IllegalStateTransitionError);
  });

  test('the Maker/Checker conflict is checked BEFORE the legal-transition check — a same-user RELEASE on an already-RELEASED movement still reports the conflict, not a misleading "illegal transition"', () => {
    expect(() => applyStatusTransition({ currentStatus: 'RELEASED', action: 'RELEASE', createdBy: 'alice', actingUser: 'alice' })).toThrow(
      MakerCheckerConflictError,
    );
  });
});

describe('assertMakerCheckerSeparation() — the standalone export acknowledgeArrival() uses (bypasses applyStatusTransition() entirely, never changes status)', () => {
  test('same user throws MakerCheckerConflictError', () => {
    expect(() => assertMakerCheckerSeparation('alice', 'alice', 'ACKNOWLEDGE')).toThrow(MakerCheckerConflictError);
  });

  test('different users: no-op', () => {
    expect(() => assertMakerCheckerSeparation('maker1', 'checker1', 'ACKNOWLEDGE')).not.toThrow();
  });
});
