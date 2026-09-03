import { Subject, of } from 'rxjs';
import { CatalogPickerService } from './catalog-picker.service';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';

/**
 * desiger-comments.md F-09 — direct unit tests for `load()`'s own `status`/`requireIssueReleased`
 * override (the class is otherwise tested only indirectly, through `TransactionBuilderComponent`'s own
 * 3 real callers, none of which exercises a non-default value).
 */

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'S001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  } as BalanceContract;
}

describe('CatalogPickerService — load() status/requireIssueReleased override (desiger-comments.md F-09)', () => {
  it('uses the transaction-screen requirement of 10 rows per display page', () => {
    const api = { catalog: jest.fn() } as unknown as BalanceComponentApiService;
    expect(new CatalogPickerService(100, api).pageSize).toBe(10);
  });

  it('defaults to status=ACTIVE and requireIssueReleased=true when neither is supplied (existing Maker-action picker behavior, unchanged)', () => {
    const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC' });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, 100, undefined, undefined, true);
  });

  it('passes an explicit status string through unchanged', () => {
    const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC', status: 'CLOSED' });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_LC', 'CLOSED', undefined, 1, 100, undefined, undefined, true);
  });

  it('passes a multi-status filter for actions that legitimately target more than one lifecycle state', () => {
    const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC', status: null, statuses: ['ACTIVE', 'EXPIRED'] });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_LC', undefined, undefined, 1, 100, undefined, undefined, true, undefined, ['ACTIVE', 'EXPIRED']);
  });

  it('honors an explicit query override alongside a multi-status filter', () => {
    const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);
    svc.search = 'ignored-when-query-set';

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC', status: null, statuses: ['ACTIVE', 'EXPIRED'], query: 'LC-Q' });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_LC', undefined, 'LC-Q', 1, 100, undefined, undefined, true, undefined, ['ACTIVE', 'EXPIRED']);
  });

  it('supports a null query override for a client-side multi-column index', () => {
    const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);
    svc.search = 'IB-02';

    svc.load({ guardFails: false, instrumentType: 'IPLC_ACCEPTANCE', query: null });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_ACCEPTANCE', 'ACTIVE', undefined, 1, 100, undefined, undefined, true);
  });

  it('requests NO status filter (undefined, every status a legitimate candidate) when status is explicitly null — the read-only-inquiry case F-09 was written for', () => {
    const catalogSpy = jest.fn(() => of({ items: [contract()], total: 1, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC', status: null, requireIssueReleased: false });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_LC', undefined, undefined, 1, 100, undefined, undefined, false);
    expect(svc.contracts).toEqual([contract()]);
  });

  it('requireIssueReleased explicitly false is honored (not coerced back to the true default)', () => {
    const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 100 }));
    const api = { catalog: catalogSpy } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC', requireIssueReleased: false });

    expect(catalogSpy).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, 100, undefined, undefined, false);
  });
});

/**
 * Reviewer-reported 2026-08-26 ("A35 A7 先出現 ⚠ No eligible records... 再出現交易") — `total` used to read
 * 0 for the whole HTTP round trip (a real gap in a real browser, invisible to the earlier tests above
 * since `of(...)` emits synchronously). `loading` closes that gap; these tests use a manually-controlled
 * `Subject` so the pending (not-yet-resolved) state is actually observable, unlike `of(...)`.
 */
describe('CatalogPickerService — loading flag (reviewer-reported "No eligible records" flash)', () => {
  it('is true immediately after load() starts, and false once contracts arrive with no snapshots to await (empty result)', () => {
    const catalogSubject = new Subject<{ items: BalanceContract[]; total: number; page: number; pageSize: number }>();
    const api = { catalog: jest.fn(() => catalogSubject) } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC' });
    expect(svc.loading).toBe(true);

    catalogSubject.next({ items: [], total: 0, page: 1, pageSize: 100 });
    expect(svc.loading).toBe(false);
  });

  it('stays true until snapshots ALSO resolve, not just once contracts arrive — total is not final till then', () => {
    const c = contract();
    const catalogSubject = new Subject<{ items: BalanceContract[]; total: number; page: number; pageSize: number }>();
    const snapshotSubject = new Subject<BalanceSnapshot>();
    const api = {
      catalog: jest.fn(() => catalogSubject),
      getSnapshot: jest.fn(() => snapshotSubject),
    } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC' });
    catalogSubject.next({ items: [c], total: 1, page: 1, pageSize: 100 });
    expect(svc.loading).toBe(true); // contracts arrived, but the snapshot fetch is still in flight

    // forkJoin (loadSnapshotsInto's own combinator) waits for each inner observable to COMPLETE, not just
    // emit — a raw Subject (unlike a real HttpClient call, which auto-completes after one emission) needs
    // both.
    snapshotSubject.next({ balanceContractId: 'bc-1', confirmedBalance: '0', availableBalance: '0' } as BalanceSnapshot);
    snapshotSubject.complete();
    expect(svc.loading).toBe(false);
  });

  it('is false again on a failed load (error path), not stuck true', () => {
    const catalogSubject = new Subject<{ items: BalanceContract[]; total: number; page: number; pageSize: number }>();
    const api = { catalog: jest.fn(() => catalogSubject) } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: false, instrumentType: 'IPLC_LC' });
    expect(svc.loading).toBe(true);

    catalogSubject.error(new Error('boom'));
    expect(svc.loading).toBe(false);
  });

  it('is false, not left true, when guardFails short-circuits the load entirely', () => {
    const api = { catalog: jest.fn() } as unknown as BalanceComponentApiService;
    const svc = new CatalogPickerService(100, api);

    svc.load({ guardFails: true, instrumentType: 'IPLC_LC' });

    expect(svc.loading).toBe(false);
    expect(api.catalog).not.toHaveBeenCalled();
  });
});
