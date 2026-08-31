import { of, throwError } from 'rxjs';
import { LcCatalogIndexService } from './lc-catalog-index.service';
import { BalanceComponentApiService, BalanceContract, CatalogPage } from './balance-component-api.service';

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

function makePage(overrides: Partial<CatalogPage> = {}): CatalogPage {
  return { items: [], total: 0, page: 1, pageSize: 10, ...overrides };
}

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    catalog: overrides.catalog ?? jest.fn(() => of(makePage())),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('LcCatalogIndexService', () => {
  describe('default construction (identity decorate, catalog() fetchPage)', () => {
    it('load() calls api.catalog() with the current side/search/page and populates rows/paging on success', () => {
      const contract = makeContract();
      const catalog = jest.fn(() => of(makePage({ items: [contract], total: 1 })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));

      svc.load();

      expect(catalog).toHaveBeenCalledWith('IPLC_LC', undefined, undefined, 1, 10, undefined, undefined, undefined, false);
      expect(svc.rows).toEqual([contract]);
      expect(svc.paging.total).toBe(1);
      expect(svc.loading).toBe(false);
    });

    it('excludeCancelled (constructor arg) is passed through to catalog()', () => {
      const catalog = jest.fn(() => of(makePage()));
      const svc = new LcCatalogIndexService(makeApi({ catalog }), undefined, true);

      svc.load();

      expect(catalog).toHaveBeenCalledWith('IPLC_LC', undefined, undefined, 1, 10, undefined, undefined, undefined, true);
    });

    it('EPLC_CONFIRMATION is used for the EXPORT side', () => {
      const catalog = jest.fn(() => of(makePage()));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));
      svc.side = 'EXPORT';

      svc.load();

      expect(catalog).toHaveBeenCalledWith('EPLC_CONFIRMATION', undefined, undefined, 1, 10, undefined, undefined, undefined, false);
    });

    it('short-circuits to an empty rows array without calling decorate when the page has zero items', () => {
      const decorate = jest.fn(() => of([]));
      const catalog = jest.fn(() => of(makePage({ items: [], total: 0 })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }), decorate);

      svc.load();

      expect(decorate).not.toHaveBeenCalled();
      expect(svc.rows).toEqual([]);
      expect(svc.loading).toBe(false);
    });

    it('trims and passes a non-empty search as the q param', () => {
      const catalog = jest.fn(() => of(makePage()));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));
      svc.search = '  S0  ';

      svc.load();

      expect(catalog).toHaveBeenCalledWith('IPLC_LC', undefined, 'S0', 1, 10, undefined, undefined, undefined, false);
    });

    it('on error, sets a describable error and clears rows/total', () => {
      const catalog = jest.fn(() => throwError(() => ({ error: { message: 'boom' } })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));
      svc.rows = [makeContract()];

      svc.load();

      expect(svc.loading).toBe(false);
      expect(svc.error).toBe('boom');
      expect(svc.errorCause).toEqual({ error: { message: 'boom' } });
      expect(svc.rows).toEqual([]);
      expect(svc.paging.total).toBe(0);
    });

    it('keeps the original HttpErrorResponse shape so the UI can distinguish a transient network failure', () => {
      const networkError = { status: 0, message: 'Http failure response: 0 Unknown Error' };
      const catalog = jest.fn(() => throwError(() => networkError));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));

      svc.load();

      expect(svc.error).toContain('Unknown Error');
      expect(svc.errorCause).toBe(networkError);
    });

    it('clears a previous raw error cause when retrying', () => {
      const catalog = jest.fn().mockReturnValueOnce(throwError(() => ({ status: 0, message: 'network' }))).mockReturnValueOnce(of(makePage()));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));

      svc.load();
      expect(svc.errorCause).not.toBeNull();

      svc.load();
      expect(svc.error).toBeNull();
      expect(svc.errorCause).toBeNull();
    });
  });

  describe('custom decorate hook', () => {
    it('passes the fetched contracts and current side to decorate(), and stores its resolved rows', () => {
      const contract = makeContract();
      const catalog = jest.fn(() => of(makePage({ items: [contract], total: 1 })));
      const decorate = jest.fn((contracts: BalanceContract[]) => of(contracts.map((c) => ({ contract: c, tag: 'decorated' }))));
      const svc = new LcCatalogIndexService(makeApi({ catalog }), decorate);

      svc.load();

      expect(decorate).toHaveBeenCalledWith([contract], 'IMPORT');
      expect(svc.rows).toEqual([{ contract, tag: 'decorated' }]);
    });

    it('clears loading and reports an error when row decoration fails', () => {
      const contract = makeContract();
      const catalog = jest.fn(() => of(makePage({ items: [contract], total: 1 })));
      const decorate = jest.fn(() => throwError(() => ({ error: { message: 'decoration failed' } })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }), decorate);
      svc.rows = [makeContract({ balanceContractId: 'stale' })];

      svc.load();

      expect(svc.loading).toBe(false);
      expect(svc.error).toBe('decoration failed');
      expect(svc.rows).toEqual([]);
      expect(svc.paging.total).toBe(0);
    });
  });

  describe('custom fetchPage hook (e.g. Inquire Delete Pending\'s own catalogWithDeletePendingHistory)', () => {
    it('uses the injected fetchPage instead of api.catalog()', () => {
      const catalog = jest.fn(() => of(makePage()));
      const customFetch = jest.fn(() => of(makePage({ items: [makeContract()], total: 1 })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }), undefined, false, customFetch);

      svc.load();

      expect(catalog).not.toHaveBeenCalled();
      expect(customFetch).toHaveBeenCalledWith('IMPORT', undefined, 1, 10);
      expect(svc.rows).toHaveLength(1);
    });
  });

  describe('selectSide', () => {
    it('resets search/paging and reloads at page 1 for the new side', () => {
      const catalog = jest.fn(() => of(makePage({ total: 25 })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));
      svc.search = 'stale';
      svc.paging.page = 3;

      svc.selectSide('EXPORT');

      expect(svc.side).toBe('EXPORT');
      expect(svc.search).toBe('');
      expect(catalog).toHaveBeenLastCalledWith('EPLC_CONFIRMATION', undefined, undefined, 1, 10, undefined, undefined, undefined, false);
    });
  });

  describe('searchNow/prevPage/nextPage', () => {
    it('searchNow() reloads at page 1', () => {
      const catalog = jest.fn(() => of(makePage()));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));
      svc.paging.page = 3;

      svc.searchNow();

      expect(catalog).toHaveBeenLastCalledWith('IPLC_LC', undefined, undefined, 1, 10, undefined, undefined, undefined, false);
    });

    it('nextPage()/prevPage() re-fetch the target page and are no-ops at the boundaries', () => {
      const catalog = jest.fn((_a: string, _b?: string, _c?: string, page = 1) => of(makePage({ total: 25, page })));
      const svc = new LcCatalogIndexService(makeApi({ catalog }));
      svc.load(1);
      catalog.mockClear();

      svc.nextPage();
      expect(catalog).toHaveBeenLastCalledWith('IPLC_LC', undefined, undefined, 2, 10, undefined, undefined, undefined, false);

      svc.prevPage();
      expect(catalog).toHaveBeenLastCalledWith('IPLC_LC', undefined, undefined, 1, 10, undefined, undefined, undefined, false);

      catalog.mockClear();
      svc.prevPage();
      expect(catalog).not.toHaveBeenCalled();
    });
  });

  describe('entityLabel', () => {
    it('reflects the current side', () => {
      const svc = new LcCatalogIndexService(makeApi());
      expect(svc.entityLabel).toBe('Import LC');
      svc.side = 'EXPORT';
      expect(svc.entityLabel).toBe('Export Confirmed LC');
    });
  });

  // "Search — No Match Message" rule (business-directed, applies to every Search button)
  describe('emptyMessage', () => {
    it('reads "{query} not found" once a filter was typed', () => {
      const svc = new LcCatalogIndexService(makeApi());
      svc.search = '  AAA  ';
      expect(svc.emptyMessage('with Delete Pending history')).toBe('AAA not found');
    });

    it('falls back to "No {entityLabel} {suffix} found." when no filter was typed', () => {
      const svc = new LcCatalogIndexService(makeApi());
      svc.search = '';
      expect(svc.emptyMessage('with Delete Pending history')).toBe('No Import LC with Delete Pending history found.');
      svc.side = 'EXPORT';
      expect(svc.emptyMessage('with Delete Pending history')).toBe('No Export Confirmed LC with Delete Pending history found.');
    });
  });

  // Stylesheet unification rule (business-directed, "顯示STYLESHEET 應該統一 參考CHECKER")
  describe('emptyMessageIsError', () => {
    it('is true once a filter was typed, false otherwise', () => {
      const svc = new LcCatalogIndexService(makeApi());
      expect(svc.emptyMessageIsError).toBe(false);
      svc.search = 'AAA';
      expect(svc.emptyMessageIsError).toBe(true);
    });
  });
});
