import { planCheckerExcessLifecycle, planWholeDeletePending } from '../../../src/domain/excessPendingLifecycle';

describe('BD-09 OVERDRAWN Checker Excess lifecycle policy', () => {
  test('B3 converts its own reservation at Checker Release', () => {
    expect(planCheckerExcessLifecycle({ functionCode: 'B3', decisionPoint: 'OWN_CHECKER_RELEASE' })).toEqual({
      reservationAction: 'CONVERT_TO_APPROVED',
      movementAction: 'RELEASE_SELF',
      applyA3SOnceOnlyEffects: false,
    });
  });

  test.each([
    ['A3', false],
    ['A3S', true],
  ] as const)('%s Acknowledge retains Pending Excess and applies A3S effects exactly when required', (functionCode, applyA3SOnceOnlyEffects) => {
    expect(planCheckerExcessLifecycle({ functionCode, decisionPoint: 'ACKNOWLEDGE' })).toEqual({
      reservationAction: 'RETAIN_PENDING',
      movementAction: 'KEEP_SOURCE_PENDING',
      applyA3SOnceOnlyEffects,
    });
  });

  test.each(['A3', 'A3S'] as const)('%s final A4/A6 Release converts and finalises without repeating A3S effects', (functionCode) => {
    expect(planCheckerExcessLifecycle({ functionCode, decisionPoint: 'DOWNSTREAM_FINAL_RELEASE' })).toEqual({
      reservationAction: 'CONVERT_TO_APPROVED',
      movementAction: 'FINALISE_REFERENCED_SOURCE',
      applyA3SOnceOnlyEffects: false,
    });
  });

  test.each([
    ['B3', 'ACKNOWLEDGE'],
    ['B3', 'DOWNSTREAM_FINAL_RELEASE'],
    ['A3', 'OWN_CHECKER_RELEASE'],
    ['A3S', 'OWN_CHECKER_RELEASE'],
  ] as const)('rejects invalid %s/%s lifecycle combinations', (functionCode, decisionPoint) => {
    expect(() => planCheckerExcessLifecycle({ functionCode, decisionPoint })).toThrow(/not (?:a )?valid/i);
  });
});

describe('BD-07 OVERDRAWN whole Delete Pending policy', () => {
  test.each(['PENDING', 'REJECTED'] as const)('releases the entire retained reservation for %s', (workflowStatus) => {
    expect(planWholeDeletePending({ workflowStatus, pendingReservationOwner: '200' })).toEqual({
      nextWorkflowStatus: 'DELETED',
      reservationReleaseOwner: '200',
      approvedExcessDeltaOwner: '0',
    });
  });

  test.each(['APPROVED', 'DELETED'] as const)('rejects deletion of %s facts', (workflowStatus) => {
    expect(() => planWholeDeletePending({ workflowStatus, pendingReservationOwner: '200' })).toThrow(/cannot be deleted/i);
  });

  test('rejects an amount or partial indicator instead of treating Delete Pending as a partial return', () => {
    expect(() =>
      planWholeDeletePending({
        workflowStatus: 'PENDING',
        pendingReservationOwner: '200',
        amount: '100',
      } as never),
    ).toThrow(/does not accept amount|whole movement/i);
  });

  test('rejects an invalid negative retained reservation', () => {
    expect(() => planWholeDeletePending({ workflowStatus: 'PENDING', pendingReservationOwner: '-1' })).toThrow(/non-negative/i);
  });
});
