import { applyStatusTransition } from '../../../src/domain/statusTransition';
import { IllegalStateTransitionError } from '../../../src/errors';

describe('applyStatusTransition (Design doc §4/§8)', () => {
  test.each([
    ['PENDING', 'RELEASE', 'RELEASED'],
    ['PENDING', 'REJECT', 'REJECTED'],
    ['PENDING', 'CANCEL', 'CANCELLED'],
    ['PENDING', 'EDIT', 'SUPERSEDED'],
    ['REJECTED', 'CANCEL', 'CANCELLED'],
    ['REJECTED', 'EDIT', 'SUPERSEDED'],
  ] as const)('%s -> %s => %s', (currentStatus, action, expected) => {
    expect(applyStatusTransition({ currentStatus, action, createdBy: 'maker1', actingUser: 'checker1' })).toBe(expected);
  });

  test("Maker and Checker being the same user is allowed — not this service's concern (business instruction 2026-08-14)", () => {
    expect(applyStatusTransition({ currentStatus: 'PENDING', action: 'RELEASE', createdBy: 'alice', actingUser: 'alice' })).toBe('RELEASED');
  });

  test.each([
    ['RELEASED', 'RELEASE'],
    ['RELEASED', 'REJECT'],
    ['REJECTED', 'RELEASE'], // cannot re-release an already-rejected movement
    ['CANCELLED', 'CANCEL'],
    ['SUPERSEDED', 'EDIT'],
  ] as const)('illegal: %s -> %s throws, never silently succeeds', (currentStatus, action) => {
    expect(() => applyStatusTransition({ currentStatus, action, createdBy: 'maker1', actingUser: 'checker1' })).toThrow(IllegalStateTransitionError);
  });
});
