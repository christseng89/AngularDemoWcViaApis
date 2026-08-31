import { InquireDeletePendingComponent } from './inquire-delete-pending.component';
import { InquireDeletePendingService } from './inquire-delete-pending.service';
import type { BalanceComponentApiService, DeletePendingAuditRow } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (same convention as maker-queue.component.spec.ts's own
 * precedent). `service` (InquireDeletePendingService) is parent-owned/parent-constructed and passed in
 * as a plain @Input() — its own orchestration logic is already covered by
 * inquire-delete-pending.service.spec.ts, so this covers only what's new here: functionLabel()'s thin
 * delegation. The template itself is verified via `ng build`'s strict-template check plus a live
 * in-browser pass.
 */
function makeRow(overrides: Partial<DeletePendingAuditRow> = {}): DeletePendingAuditRow {
  return {
    auditId: 'audit-1',
    deleteSeq: 1,
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    sourceTransactionRef: null,
    statusBefore: 'PENDING',
    cancelledBy: 'maker1',
    cancelledAt: '2026-08-27T00:00:00.000Z',
    reasonCode: 'MAKER_EC',
    remarks: null,
    instrumentType: 'IPLC_LC',
    lcNumber: 'S001',
    ibNumber: null,
    sgNumber: null,
    ...overrides,
  };
}

describe('InquireDeletePendingComponent', () => {
  it('maps catalog error and both empty states to shared feedback', () => {
    const c = new InquireDeletePendingComponent();
    c.service = {
      catalogIndex: {
        error: null,
        errorCause: null,
        search: 'S0',
        emptyMessageIsError: false,
        emptyMessage: () => 'No records.',
      },
    } as any;
    expect(c.indexErrorFeedback).toBeNull();
    expect(c.indexEmptyFeedback).toMatchObject({ severity: 'INFO', title: 'No transactions available' });
    c.service.catalogIndex.error = 'network down';
    expect(c.indexErrorFeedback).toMatchObject({ severity: 'ERROR', retryable: true });
    c.service.catalogIndex.errorCause = { status: 0, message: 'Http failure response: 0 Unknown Error' };
    expect(c.indexErrorFeedback).toMatchObject({ title: 'Balance service unavailable' });
    expect(c.indexErrorFeedback?.supportCode).toBeUndefined();
    c.service.catalogIndex.error = null;
    Object.defineProperty(c.service.catalogIndex, 'emptyMessageIsError', { value: true });
    expect(c.indexEmptyFeedback).toMatchObject({ severity: 'WARNING', title: 'No matching transaction' });
  });
  it('functionOptions exposes both Import and Export function registries', () => {
    const c = new InquireDeletePendingComponent();
    expect(c.functionOptions.some((fn) => fn.code === 'A1')).toBe(true);
    expect(c.functionOptions.some((fn) => fn.code === 'B1')).toBe(true);
  });

  describe('functionLabel()', () => {
    it('formats "{code} · {label}" when the row resolves to a real Function', () => {
      const c = new InquireDeletePendingComponent();
      c.service = new InquireDeletePendingService({} as BalanceComponentApiService);
      expect(c.functionLabel(makeRow({ instrumentType: 'IPLC_LC', movementType: 'ISSUE' }))).toBe('A1 · LC Issue');
    });

    it("falls back to '—' when no Function can be resolved", () => {
      const c = new InquireDeletePendingComponent();
      c.service = new InquireDeletePendingService({} as BalanceComponentApiService);
      expect(c.functionLabel(makeRow({ instrumentType: 'IPLC_LC', movementType: 'REVERSAL' }))).toBe('—');
    });
  });
});
