import { AccountEntriesDialogComponent } from './account-entries-dialog.component';
import type { BalanceMovement } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (same house style as every other spec file in this
 * project — see index-picker.component.spec.ts's own precedent for a genuine `@Component`, not just a
 * plain class, being tested this way). Covers this component's own class-level logic only — @Input
 * defaults, the @Output EventEmitter shape, and displayStatus()/statusBadgeClass()'s own delegation to
 * the shared balance-component.model.ts functions. The template itself (account-entries-dialog.component.html)
 * is verified via `ng build`'s strict-template check plus a live in-browser pass, same as every other
 * template in this project.
 */
function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'UTILIZE',
    exposureNature: 'CONTINGENT',
    amount: '1000',
    ceilingAmount: '1000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('AccountEntriesDialogComponent', () => {
  it('has the documented @Input defaults', () => {
    const c = new AccountEntriesDialogComponent();
    expect(c.movement).toBeNull();
    expect(c.instrumentType).toBeNull();
    expect(c.phase).toBeNull();
  });

  it('exposes closed as an EventEmitter', () => {
    const c = new AccountEntriesDialogComponent();
    expect(c.closed.emit).toBeInstanceOf(Function);
  });

  describe('displayStatus()', () => {
    it('delegates to the shared balance-component.model.ts rule, reading its own @Input state', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'UTILIZE', status: 'RELEASED' });
      // IPLC_LC/UTILIZE, phase omitted (default 'primary') -> the earmark rule applies.
      expect(c.displayStatus('RELEASED')).toBe('EARMARKED');
    });

    it('a non-earmark function/status passes through the plain PENDING/APPROVED label', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'ISSUE', status: 'RELEASED' });
      expect(c.displayStatus('RELEASED')).toBe('APPROVED');
    });

    it("phase 'finalize' disqualifies the earmark rule even for an otherwise-earmark (instrumentType, movementType) pair", () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'UTILIZE', status: 'RELEASED' });
      c.phase = 'finalize';
      expect(c.displayStatus('RELEASED')).toBe('APPROVED');
    });

    it('works with no movement set at all (movementType read via the optional-chain fallback)', () => {
      const c = new AccountEntriesDialogComponent();
      expect(c.displayStatus('REJECTED')).toBe('REJECTED');
    });
  });

  describe('statusBadgeClass()', () => {
    it('delegates to the shared rule the same way displayStatus() does', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'UTILIZE', status: 'RELEASED' });
      expect(c.statusBadgeClass('RELEASED')).toBe('tb-status-badge--earmark');
    });

    it('a plain RELEASED (not an earmark function) resolves to the approved class', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'ISSUE', status: 'RELEASED' });
      expect(c.statusBadgeClass('RELEASED')).toBe('tb-status-badge--approved');
    });

    it('PENDING resolves to the pending class regardless of instrumentType/movementType', () => {
      const c = new AccountEntriesDialogComponent();
      expect(c.statusBadgeClass('PENDING')).toBe('tb-status-badge--pending');
    });
  });
});
