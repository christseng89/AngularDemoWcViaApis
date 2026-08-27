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

    // Business-confirmed 2026-08-28 ("1 只應該顯示一筆 2 一筆刪全部") — cascade-deletes every sibling
    // leg together now, rather than being disabled; this tooltip discloses that before the Maker clicks.
    it('returns an explanatory cascade-delete tooltip for a compound-submission row (businessEventId set)', () => {
      const c = new MakerQueueComponent();
      c.makerQueue = new MakerQueueService({} as BalanceComponentApiService);
      const row = { movement: makeMovement({ businessEventId: 'be-1' }), contract: makeContract() };
      expect(c.deletePendingLabel(row)).toMatch(/cancels all of them together/);
    });

    // Business-confirmed 2026-08-27 ("改成 Delete Pending 統一名稱") — the button text itself is always
    // plain "Delete Pending" (hardcoded in the template); this tooltip is the only place an A4 row still
    // discloses that it routes to withdrawMakerSubmit() rather than a full cancel().
    it('returns an A4-specific tooltip for a finalizing row (makerSubmittedAt set), whether PENDING or REJECTED', () => {
      const c = new MakerQueueComponent();
      c.makerQueue = new MakerQueueService({} as BalanceComponentApiService);
      const pendingRow = { movement: makeMovement({ movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      const rejectedRow = { movement: makeMovement({ movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'REJECTED' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(c.deletePendingLabel(pendingRow)).toMatch(/Delete Pending \(A4\)/);
      expect(c.deletePendingLabel(rejectedRow)).toMatch(/Delete Pending \(A4\)/);
    });
  });
});
