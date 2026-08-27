import { AccountEntriesDialogComponent } from './account-entries-dialog.component';
import type { BalanceMovement } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (see index-picker.component.spec.ts's own precedent for a
 * genuine `@Component` tested this way). Covers class-level logic only — @Input defaults, the @Output
 * EventEmitter shape, and displayStatus()/statusBadgeClass()'s own delegation to the shared
 * balance-component.model.ts functions. The template itself is verified via `ng build`'s strict-template
 * check plus a live in-browser pass.
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
    expect(c.linkedMovement).toBeNull();
  });

  // A6/B4/A3S Accounting Event Ownership Rule (2026-08-28) — the two-set case's own "Set" labels, each
  // derived independently from its own movementType (orientation-independent — see accountingSetLabel()'s
  // own doc comment for the real labeling bug this fixes: B4 viewed from the Checker's own screen has the
  // ACCEPT leg as primary, not the CREATE leg, so a fixed "primary = Acceptance" assumption gets it backwards).
  describe('primarySetLabel / linkedSetLabel', () => {
    it('reads "LC Balance Entries" for an UTILIZE (A3/A3S/A4/A6\'s own LC-side), on either side', () => {
      const c = new AccountEntriesDialogComponent();
      c.movement = movement({ movementType: 'UTILIZE' });
      c.linkedMovement = movement({ movementType: 'UTILIZE' });
      expect(c.primarySetLabel).toBe('LC Balance Entries');
      expect(c.linkedSetLabel).toBe('LC Balance Entries');
    });

    it('reads "Confirmed LC Balance Entries" for an ACCEPT (B4\'s own Confirmed LC-side), on either side', () => {
      const c = new AccountEntriesDialogComponent();
      c.movement = movement({ movementType: 'ACCEPT' });
      c.linkedMovement = movement({ movementType: 'ACCEPT' });
      expect(c.primarySetLabel).toBe('Confirmed LC Balance Entries');
      expect(c.linkedSetLabel).toBe('Confirmed LC Balance Entries');
    });

    it('reads "Acceptance Entries" for a CREATE (A6/B4\'s own Acceptance-side), on either side', () => {
      const c = new AccountEntriesDialogComponent();
      c.movement = movement({ movementType: 'CREATE' });
      c.linkedMovement = movement({ movementType: 'CREATE' });
      expect(c.primarySetLabel).toBe('Acceptance Entries');
      expect(c.linkedSetLabel).toBe('Acceptance Entries');
    });

    it('reads "Shipping Guarantee Entries" for FULL_REDEEM/PARTIAL_REDEEM (A3S\'s own matched SG leg)', () => {
      const c = new AccountEntriesDialogComponent();
      c.linkedMovement = movement({ movementType: 'FULL_REDEEM' });
      expect(c.linkedSetLabel).toBe('Shipping Guarantee Entries');
      c.linkedMovement = movement({ movementType: 'PARTIAL_REDEEM' });
      expect(c.linkedSetLabel).toBe('Shipping Guarantee Entries');
    });

    it('the ORIENTATION BUG this fixes: B4 viewed from the Checker screen has ACCEPT as primary and CREATE as linked — labels must not swap', () => {
      const c = new AccountEntriesDialogComponent();
      c.movement = movement({ movementType: 'ACCEPT' }); // selectedCheckerMovement for B4
      c.linkedMovement = movement({ movementType: 'CREATE' }); // resolved sibling Acceptance leg
      expect(c.primarySetLabel).toBe('Confirmed LC Balance Entries');
      expect(c.linkedSetLabel).toBe('Acceptance Entries');
    });

    it('defaults to the generic "Account Entries" fallback for an unmapped movementType, or when null (never actually rendered in that state, but stays non-throwing)', () => {
      const c = new AccountEntriesDialogComponent();
      expect(c.primarySetLabel).toBe('Account Entries');
      expect(c.linkedSetLabel).toBe('Account Entries');
      c.movement = movement({ movementType: 'ISSUE' });
      expect(c.primarySetLabel).toBe('Account Entries');
    });
  });

  // Business-confirmed 2026-08-28 ("A3S 一套帳是 EARMARKING/EARMARKED... 一套帳是 PENDING/APPROVED... 這是業務
  // 需求") — the linked set gets its OWN status, independent of the primary's (the two can genuinely differ).
  describe('linkedSetStatus / linkedSetStatusBadgeClass / linkedSetStatusIcon', () => {
    it('reads EARMARKING/EARMARKED for a linked UTILIZE (A3S\'s own LC-side, never sent to Accounting)', () => {
      const c = new AccountEntriesDialogComponent();
      c.linkedMovement = movement({ movementType: 'UTILIZE', status: 'PENDING', acknowledgedAt: null });
      expect(c.linkedSetStatus).toBe('EARMARKING');
      expect(c.linkedSetStatusBadgeClass).toBe('tb-status-badge--pending');
    });

    it('reads PENDING/APPROVED for a linked FULL_REDEEM (A3S\'s own SG-side, genuinely sent to Accounting) — independent of the UTILIZE side staying EARMARKED', () => {
      const c = new AccountEntriesDialogComponent();
      c.linkedMovement = movement({ movementType: 'FULL_REDEEM', status: 'RELEASED' });
      expect(c.linkedSetStatus).toBe('APPROVED');
      expect(c.linkedSetStatusBadgeClass).toBe('tb-status-badge--approved');
      expect(c.linkedSetStatusIcon).toBe('ok');
    });

    it('resolves an empty status when linkedMovement is null (never actually rendered in that state)', () => {
      const c = new AccountEntriesDialogComponent();
      expect(c.linkedSetStatus).toBe('');
      expect(c.linkedSetStatusBadgeClass).toBe('');
    });
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

    // Business-confirmed 2026-08-27 ("Transaction Status 與 Account Entries Status 必須保持一致") — was
    // missing acknowledgedAt entirely, so a PENDING, already Checker-acknowledged A3/A3S movement showed
    // "EARMARKING" here even though every other screen already correctly showed "EARMARKED".
    it('a still-PENDING earmark movement with no acknowledgedAt shows EARMARKING', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'UTILIZE', status: 'PENDING', acknowledgedAt: null });
      expect(c.displayStatus('PENDING')).toBe('EARMARKING');
    });

    it('a PENDING earmark movement WITH acknowledgedAt set shows EARMARKED, consistent with Transaction Status elsewhere', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'UTILIZE', status: 'PENDING', acknowledgedAt: '2026-08-27T00:00:00.000Z' });
      expect(c.displayStatus('PENDING')).toBe('EARMARKED');
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

    it('a PENDING earmark movement WITH acknowledgedAt set resolves to the earmark class, not plain pending', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'UTILIZE', status: 'PENDING', acknowledgedAt: '2026-08-27T00:00:00.000Z' });
      expect(c.statusBadgeClass('PENDING')).toBe('tb-status-badge--earmark');
    });
  });

  describe('statusBadgeIcon() (P2 UI/UX pass)', () => {
    it('derives the icon from statusBadgeClass(), not a second independent status mapping', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'ISSUE', status: 'RELEASED' });
      expect(c.statusBadgeIcon('RELEASED')).toBe('ok');
      expect(c.statusBadgeIcon('PENDING')).toBe('pending');
    });
  });

  // This dialog's own meta line is a 4th call site for the same AMEND_INCREASE/AMEND_DECREASE
  // relabeling as Look Up Current Balance, Inquire Events, and the Checker queue.
  describe('displayMovementType()', () => {
    it('delegates to the shared rule, relabeling a negative B2 (EPLC_CONFIRMATION/AMEND) amount as AMEND_DECREASE', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'EPLC_CONFIRMATION';
      c.movement = movement({ movementType: 'AMEND', amount: '-7000' });
      expect(c.displayMovementType()).toBe('AMEND_DECREASE');
    });

    it('passes every other (instrumentType, movementType) pair through unchanged', () => {
      const c = new AccountEntriesDialogComponent();
      c.instrumentType = 'IPLC_LC';
      c.movement = movement({ movementType: 'ISSUE' });
      expect(c.displayMovementType()).toBe('ISSUE');
    });
  });
});
