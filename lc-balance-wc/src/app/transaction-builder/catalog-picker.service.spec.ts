import { of } from 'rxjs';
import { CatalogPickerService } from './catalog-picker.service';
import { BalanceComponentApiService, BalanceContract } from './balance-component-api.service';

/**
 * desiger-comments.md F-09 (2026-08-19, OCP) — direct unit tests for `load()`'s own `status`/
 * `requireIssueReleased` override, the one new extension point this fix added. This class's own
 * long-established convention (see its own class doc comment) is to test the fetch/populate/error shape
 * only indirectly, through `TransactionBuilderComponent`'s own 3 real callers — that convention still
 * holds for everything ELSE in this file, since the 3 existing callers' own behavior is completely
 * unchanged (both new params default to the exact literals they used to hardcode). This one small file
 * exists purely to prove the override itself actually works end to end, since none of the 3 existing
 * callers exercises a non-default value.
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
