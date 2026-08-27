import { MakerQueueComponent } from './maker-queue.component';
import { MakerQueueService } from './maker-queue.service';
import type { BalanceContract, BalanceComponentApiService, BalanceMovement } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (same convention as inquire-events.component.spec.ts's own
 * precedent). `makerQueue` (MakerQueueService) is parent-owned/parent-constructed and passed in as a
 * plain @Input() — its own orchestration logic is already covered by maker-queue.service.spec.ts, so
 * these tests cover only what's new here: the thin pure-function delegations and deletePendingLabel()'s
 * own compound-shape gating. The template itself is verified via `ng build`'s strict-template check plus
 * a live in-browser pass.
 */
function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'S001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    exposureNature: 'CONTINGENT',
    amount: '50000',
    ceilingAmount: '50000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('MakerQueueComponent', () => {
  describe('thin pure-function delegations (same shared balance-component.model.ts rules the rest of this sub-project uses)', () => {
    it('displayStatus()', () => {
      const c = new MakerQueueComponent();
      expect(c.displayStatus('PENDING')).toBe('PENDING');
    });

    it('statusBadgeClass()', () => {
      const c = new MakerQueueComponent();
      expect(c.statusBadgeClass('REJECTED')).toBe('tb-status-badge--negative');
    });

    it('statusBadgeIcon()', () => {
      const c = new MakerQueueComponent();
      expect(c.statusBadgeIcon('tb-status-badge--negative')).toBe('cross');
    });
  });

  describe('deletePendingLabel()', () => {
    it('returns the plain action label for a single-leg (non-compound) row', () => {
      const c = new MakerQueueComponent();
      c.makerQueue = new MakerQueueService({} as BalanceComponentApiService);
      const row = { movement: makeMovement({ businessEventId: null }), contract: makeContract() };
      expect(c.deletePendingLabel(row)).toBe('Delete Pending');
    });

    it('returns an explanatory tooltip for a compound-submission row (businessEventId set)', () => {
      const c = new MakerQueueComponent();
      c.makerQueue = new MakerQueueService({} as BalanceComponentApiService);
      const row = { movement: makeMovement({ businessEventId: 'be-1' }), contract: makeContract() };
      expect(c.deletePendingLabel(row)).toMatch(/not yet supported here for compound submissions/);
    });
  });
});
