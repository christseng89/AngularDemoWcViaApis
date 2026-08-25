import { of, throwError } from 'rxjs';
import { DocumentArrivalHintsService } from './document-arrival-hints.service';
import { BalanceComponentApiService, CatalogPage } from './balance-component-api.service';

/**
 * A10/B6 (Close) — direct unit tests for `loadCloseEligibility()`, the one method in this service that
 * fetches via a single aggregate server call rather than fanning out per Step-1 candidate (see that
 * method's own doc comment). Every other method here is already covered indirectly through
 * `maker-panel.component.spec.ts`.
 */
function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    closeEligible: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 200 } as CatalogPage)),
    reopenEligible: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 200 } as CatalogPage)),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('DocumentArrivalHintsService.loadCloseEligibility (A10/B6)', () => {
  it('populates catalogCloseEligible from the server response', () => {
    const api = makeApi({
      closeEligible: jest.fn(() =>
        of({
          items: [
            { balanceContractId: 'bc-1' } as any,
            { balanceContractId: 'bc-2' } as any,
          ],
          total: 2,
          page: 1,
          pageSize: 200,
        } as CatalogPage),
      ),
    });
    const service = new DocumentArrivalHintsService(api);
    const onDone = jest.fn();

    service.loadCloseEligibility('IPLC_LC', onDone);

    expect(api.closeEligible).toHaveBeenCalledWith('IPLC_LC');
    expect(service.catalogCloseEligible).toEqual(new Set(['bc-1', 'bc-2']));
    expect(onDone).toHaveBeenCalled();
  });

  it('clears any previous result before repopulating (a re-filtered/re-picked function must not keep a stale eligible set)', () => {
    const api = makeApi({
      closeEligible: jest.fn(() => of({ items: [{ balanceContractId: 'bc-new' } as any], total: 1, page: 1, pageSize: 200 } as CatalogPage)),
    });
    const service = new DocumentArrivalHintsService(api);
    service.catalogCloseEligible.add('bc-stale');

    service.loadCloseEligibility('EPLC_CONFIRMATION', () => {});

    expect(service.catalogCloseEligible.has('bc-stale')).toBe(false);
    expect(service.catalogCloseEligible.has('bc-new')).toBe(true);
  });

  it('still calls onDone on a server error, leaving the eligible set empty rather than hanging the caller', () => {
    const api = makeApi({ closeEligible: jest.fn(() => throwError(() => new Error('network error'))) });
    const service = new DocumentArrivalHintsService(api);
    const onDone = jest.fn();

    service.loadCloseEligibility('IPLC_LC', onDone);

    expect(service.catalogCloseEligible.size).toBe(0);
    expect(onDone).toHaveBeenCalled();
  });
});

/**
 * A11/B7 (Reopen, F1) — mirrors the A10/B6 loadCloseEligibility() coverage above exactly, for the
 * genuinely separate loadReopenEligibility()/catalogReopenEligible pair (same "one aggregate server
 * call" shape, backed by GET .../reopen-eligible instead).
 */
describe('DocumentArrivalHintsService.loadReopenEligibility (A11/B7, F1)', () => {
  it('populates catalogReopenEligible from the server response', () => {
    const api = makeApi({
      reopenEligible: jest.fn(() =>
        of({
          items: [{ balanceContractId: 'bc-3' } as any, { balanceContractId: 'bc-4' } as any],
          total: 2,
          page: 1,
          pageSize: 200,
        } as CatalogPage),
      ),
    });
    const service = new DocumentArrivalHintsService(api);
    const onDone = jest.fn();

    service.loadReopenEligibility('IPLC_LC', onDone);

    expect(api.reopenEligible).toHaveBeenCalledWith('IPLC_LC');
    expect(service.catalogReopenEligible).toEqual(new Set(['bc-3', 'bc-4']));
    expect(onDone).toHaveBeenCalled();
  });

  it('clears any previous result before repopulating, independent of catalogCloseEligible (the two hint sets never leak into each other)', () => {
    const api = makeApi({
      reopenEligible: jest.fn(() => of({ items: [{ balanceContractId: 'bc-new' } as any], total: 1, page: 1, pageSize: 200 } as CatalogPage)),
    });
    const service = new DocumentArrivalHintsService(api);
    service.catalogReopenEligible.add('bc-stale');
    service.catalogCloseEligible.add('bc-close-untouched');

    service.loadReopenEligibility('EPLC_CONFIRMATION', () => {});

    expect(service.catalogReopenEligible.has('bc-stale')).toBe(false);
    expect(service.catalogReopenEligible.has('bc-new')).toBe(true);
    expect(service.catalogCloseEligible.has('bc-close-untouched')).toBe(true);
  });

  it('still calls onDone on a server error, leaving the eligible set empty rather than hanging the caller', () => {
    const api = makeApi({ reopenEligible: jest.fn(() => throwError(() => new Error('network error'))) });
    const service = new DocumentArrivalHintsService(api);
    const onDone = jest.fn();

    service.loadReopenEligibility('IPLC_LC', onDone);

    expect(service.catalogReopenEligible.size).toBe(0);
    expect(onDone).toHaveBeenCalled();
  });
});
