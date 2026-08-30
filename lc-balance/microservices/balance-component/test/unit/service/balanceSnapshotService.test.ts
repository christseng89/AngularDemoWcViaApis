import { BalanceSnapshotService } from '../../../src/service/balanceSnapshotService';
import type { BalanceContract, BalanceMovement, InstrumentType, MovementStatus } from '../../../src/types';

function contract(instrumentType: InstrumentType): BalanceContract {
  return {
    balanceContractId: 'contract-1',
    logicalContractId: 'logical-1',
    instrumentType,
    naturalKey: { lcNumber: 'LC001' },
    status: 'ACTIVE',
    currency: 'USD',
  } as BalanceContract;
}

function movement(movementType: string, amount: string, status: MovementStatus, overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: `${movementType}-${amount}-${status}`,
    balanceContractId: 'contract-1',
    eventSeq: 1,
    movementType,
    amount,
    ceilingAmount: amount,
    currency: 'USD',
    status,
    exposureNature: 'CONTINGENT',
    createdBy: 'maker1',
    createdAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  } as BalanceMovement;
}

describe('BalanceSnapshotService', () => {
  const service = new BalanceSnapshotService();

  it('projects Import LC available, off-balance exposure and Tight Available from one immutable input set', () => {
    const result = service.assemble(
      contract('IPLC_LC'),
      [movement('ISSUE', '1000', 'RELEASED'), movement('UTILIZE', '200', 'PENDING')],
      [movement('ISSUE', '300', 'RELEASED')],
      [],
    );

    expect(result).toMatchObject({
      confirmedBalance: '1000',
      availableBalance: '800',
      pendingEarmarkTotal: '-200',
      offBalanceExposure: '300',
      tightAvailableBalance: '500',
    });
  });

  it('leaves family-specific fields null for a contract outside the Import LC and Export Confirmation roots', () => {
    const result = service.assemble(contract('SHGT'), [movement('ISSUE', '250', 'RELEASED')], [], []);

    expect(result).toMatchObject({
      confirmedBalance: '250',
      availableBalance: '250',
      offBalanceExposure: null,
      tightAvailableBalance: null,
      presentDocsEarmarkPending: null,
      presentDocsEarmarkApproved: null,
    });
  });
});
