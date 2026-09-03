import { LookUpPanelService } from './look-up-panel.service';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import type { InquiredEvent } from './inquire-events.service';

function pendingAmendment(overrides: Partial<BalanceMovement>): InquiredEvent {
  const movement: BalanceMovement = {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'AMEND_INCREASE',
    exposureNature: 'CONTINGENT',
    amount: '10000',
    ceilingAmount: '21000',
    tolerancePct: '10',
    currency: 'USD',
    status: 'PENDING',
    sourceTransactionRef: 'A01',
    createdBy: 'maker1',
    createdAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
  return {
    movement,
    contract: {} as BalanceContract,
    eventStatus: movement.status,
    eventTime: movement.createdAt,
    phase: 'primary',
  } as InquiredEvent;
}

describe('LookUpPanelService pending amendment display', () => {
  it('shows every same-LC pending A2/B2 effect and the operative-to-proposed tolerance transition', () => {
    const service = new LookUpPanelService({} as BalanceComponentApiService);
    service.lookupResult = {
      contract: {
        balanceContractId: 'bc-1',
        logicalContractId: 'lc-1',
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'S01' },
        currency: 'USD',
        status: 'ACTIVE',
        tolerancePct: null,
      } as BalanceContract,
      snapshot: {} as never,
    };
    service.lookupMovements = [
      pendingAmendment({ movementId: 'issue', eventSeq: 0, movementType: 'ISSUE', status: 'RELEASED', tolerancePct: '10' }),
      pendingAmendment({ movementId: 'mv-a01', tolerancePct: '10', toleranceChangePct: '10', toleranceChangeDirection: 'INCREASE' }),
      pendingAmendment({
        movementId: 'mv-a02',
        eventSeq: 2,
        movementType: 'AMEND_DECREASE',
        ceilingAmount: '5000',
        tolerancePct: '10',
        toleranceChangePct: '5',
        toleranceChangeDirection: 'DECREASE',
        sourceTransactionRef: 'A02',
      }),
      pendingAmendment({ movementId: 'mv-no-ref', eventSeq: 4, sourceTransactionRef: null, tolerancePct: '10', ceilingAmount: '1000' }),
    ];

    expect(service.activeDisplayedAmendments).toEqual([
      { reference: 'A01', balanceEffect: '21000', toleranceBeforePct: '10', toleranceAfterPct: '20', isPending: true },
      { reference: 'A02', balanceEffect: '-5000', toleranceBeforePct: '10', toleranceAfterPct: '5', isPending: true },
      { reference: null, balanceEffect: '1000', toleranceBeforePct: '10', toleranceAfterPct: '10', isPending: true },
    ]);
  });

  it('shows the latest released Decrease with its historical 20% -> 15% transition when no amendment is pending', () => {
    const service = new LookUpPanelService({} as BalanceComponentApiService);
    service.lookupResult = {
      contract: contractWithTolerance('15'),
      snapshot: {} as never,
    };
    service.lookupMovements = [
      pendingAmendment({ movementId: 'issue', eventSeq: 1, movementType: 'ISSUE', status: 'RELEASED', tolerancePct: '0' }),
      pendingAmendment({ movementId: 'increase', eventSeq: 2, movementType: 'AMEND_INCREASE', status: 'RELEASED', tolerancePct: '20', sourceTransactionRef: 'A03' }),
      pendingAmendment({ movementId: 'decrease', eventSeq: 3, movementType: 'AMEND_DECREASE', status: 'RELEASED', ceilingAmount: '18000', tolerancePct: '15', sourceTransactionRef: 'A04' }),
    ];

    expect(service.activeDisplayedAmendments).toEqual([
      { reference: 'A04', balanceEffect: '-18000', toleranceBeforePct: '20', toleranceAfterPct: '15', isPending: false },
    ]);
  });

  it('inverts a negative AMEND_DECREASE ceiling when a tolerance increase outweighs the face decrease', () => {
    const service = new LookUpPanelService({} as BalanceComponentApiService);
    service.lookupResult = { contract: contractWithTolerance('30'), snapshot: {} as never };
    service.lookupMovements = [
      pendingAmendment({ movementId: 'decrease', status: 'RELEASED', movementType: 'AMEND_DECREASE', ceilingAmount: '-5000', tolerancePct: '30' }),
    ];

    expect(service.activeDisplayedAmendments[0]?.balanceEffect).toBe('5000');
  });

  it('returns no companion rows when the active ledger has no monetary amendment', () => {
    const service = new LookUpPanelService({} as BalanceComponentApiService);
    service.lookupMovements = [pendingAmendment({ movementType: 'UTILIZE', status: 'RELEASED' })];
    expect(service.activeDisplayedAmendments).toEqual([]);
  });
});

function contractWithTolerance(tolerancePct: string): BalanceContract {
  return {
    balanceContractId: 'bc-1', logicalContractId: 'lc-1', instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S01' }, currency: 'USD', status: 'ACTIVE', tolerancePct,
  } as BalanceContract;
}
