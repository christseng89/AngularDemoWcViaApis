import { of, throwError } from 'rxjs';
import { DocumentArrivalHintsService } from './document-arrival-hints.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';

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

describe('DocumentArrivalHintsService combined transaction-index data', () => {
  const root = { balanceContractId: 'root-1', naturalKey: { lcNumber: 'LC01' } } as BalanceContract;
  const child = { balanceContractId: 'child-1', naturalKey: { lcNumber: 'LC01', sgNumber: 'SG01', ibNumber: 'EB01' } } as BalanceContract;
  const snapshot = { availableBalance: '100', currency: 'USD' } as BalanceSnapshot;
  const movement = {
    movementId: 'movement-1',
    movementType: 'CREATE',
    status: 'RELEASED',
    amount: '100',
    currency: 'USD',
    sourceTransactionRef: null,
  } as BalanceMovement;

  it('retains outstanding SG contracts and snapshots for the A3S combined Index', () => {
    const api = makeApi({
      catalog: jest.fn(() => of({ items: [child] } as CatalogPage)),
      getSnapshot: jest.fn(() => of(snapshot)),
    });
    const service = new DocumentArrivalHintsService(api);
    const done = jest.fn();

    service.loadCatalogSgEligibility([root], done);

    expect(service.catalogSgEligible.has('root-1')).toBe(true);
    expect(service.catalogSgRows.get('root-1')).toEqual([{ contract: child, snapshot }]);
    expect(done).toHaveBeenCalled();
  });

  it('handles empty input, catalog errors, snapshot errors and zero SG balances without stale rows', () => {
    const done = jest.fn();
    const emptyService = new DocumentArrivalHintsService(makeApi());
    emptyService.catalogSgEligible.add('stale');
    emptyService.loadCatalogSgEligibility([], done);
    expect(emptyService.catalogSgEligible.size).toBe(0);

    const catalogError = new DocumentArrivalHintsService(makeApi({ catalog: jest.fn(() => throwError(() => new Error('catalog'))) }));
    catalogError.loadCatalogSgEligibility([root], done);
    expect(catalogError.catalogSgRows.size).toBe(0);

    const snapshotError = new DocumentArrivalHintsService(
      makeApi({ catalog: jest.fn(() => of({ items: [child] } as CatalogPage)), getSnapshot: jest.fn(() => throwError(() => new Error('snapshot'))) }),
    );
    snapshotError.loadCatalogSgEligibility([root], done);
    expect(snapshotError.catalogSgRows.size).toBe(0);

    const zero = new DocumentArrivalHintsService(
      makeApi({ catalog: jest.fn(() => of({ items: [child] } as CatalogPage)), getSnapshot: jest.fn(() => of({ ...snapshot, availableBalance: '0' })) }),
    );
    zero.loadCatalogSgEligibility([root], done);
    expect(zero.catalogSgRows.size).toBe(0);
  });

  it('retains eligible B3 movements for the B4 combined Index and supplies the EB fallback', () => {
    const api = makeApi({
      catalog: jest.fn(() => of({ items: [child] } as CatalogPage)),
      listMovements: jest.fn(() => of([movement])),
    });
    const service = new DocumentArrivalHintsService(api);
    service.loadChildHints([root], 'EPLC_EXAMINATION', 'CREATE', () => {});

    expect(service.catalogChildPayableIbs.get('root-1')).toEqual(['EB01']);
    expect(service.catalogChildPayableMovements.get('root-1')?.[0].sourceTransactionRef).toBe('EB01');
  });

  it('keeps an explicit B3 source reference and falls back when both references are absent', () => {
    const explicit = { ...movement, movementId: 'explicit', sourceTransactionRef: 'EB-DIRECT' } as BalanceMovement;
    const childWithoutEb = { ...child, naturalKey: { lcNumber: 'LC01', ibNumber: null } } as BalanceContract;
    const api = makeApi({
      catalog: jest.fn(() => of({ items: [child, childWithoutEb] } as CatalogPage)),
      listMovements: jest.fn((id: string) => of([{ ...(id === 'child-1' ? explicit : movement), movementId: id } as BalanceMovement])),
    });
    const service = new DocumentArrivalHintsService(api);
    service.loadChildHints([root], 'EPLC_EXAMINATION', 'CREATE', () => {});
    expect(service.catalogChildPayableIbs.get('root-1')).toEqual(['EB-DIRECT', '(no EB Number)']);
  });

  it('treats an undefined movement-list response as no A3/A3S candidates', () => {
    const service = new DocumentArrivalHintsService(makeApi({ listMovements: jest.fn(() => of(undefined as unknown as BalanceMovement[])) }));
    service.loadCatalogHints([root], () => {});
    expect(service.catalogPayableMovements.size).toBe(0);
  });

  it('handles empty input and child catalog/list errors for the B4 combined Index', () => {
    const done = jest.fn();
    const empty = new DocumentArrivalHintsService(makeApi());
    empty.loadChildHints([], 'EPLC_EXAMINATION', 'CREATE', done);

    const catalogError = new DocumentArrivalHintsService(makeApi({ catalog: jest.fn(() => throwError(() => new Error('catalog'))) }));
    catalogError.loadChildHints([root], 'EPLC_EXAMINATION', 'CREATE', done);
    expect(catalogError.catalogChildPayableMovements.size).toBe(0);

    const listError = new DocumentArrivalHintsService(
      makeApi({ catalog: jest.fn(() => of({ items: [child] } as CatalogPage)), listMovements: jest.fn(() => throwError(() => new Error('list'))) }),
    );
    listError.loadChildHints([root], 'EPLC_EXAMINATION', 'CREATE', done);
    expect(listError.catalogChildPayableMovements.size).toBe(0);
    expect(done).toHaveBeenCalledTimes(3);
  });

  it('excludes ineligible B3 rows and handles a child catalog with no contracts', () => {
    const noChildren = new DocumentArrivalHintsService(makeApi({ catalog: jest.fn(() => of({ items: [] } as unknown as CatalogPage)) }));
    noChildren.loadChildHints([root], 'EPLC_EXAMINATION', 'CREATE', () => {});
    expect(noChildren.catalogChildPayableIbs.size).toBe(0);

    const ineligible = [
      { ...movement, movementId: 'wrong-type', movementType: 'OTHER' },
      { ...movement, movementId: 'pending', status: 'PENDING' },
      { ...movement, movementId: 'consumed', presentDocsConsumedAt: '2026-08-30T00:00:00Z' },
    ] as BalanceMovement[];
    const service = new DocumentArrivalHintsService(
      makeApi({ catalog: jest.fn(() => of({ items: [child] } as CatalogPage)), listMovements: jest.fn(() => of(ineligible)) }),
    );
    service.loadChildHints([root], 'EPLC_EXAMINATION', 'CREATE', () => {});
    expect(service.catalogChildPayableMovements.size).toBe(0);
  });

  it('handles an LC with no SG child contracts', () => {
    const service = new DocumentArrivalHintsService(makeApi({ catalog: jest.fn(() => of({ items: [] } as unknown as CatalogPage)) }));
    service.loadCatalogSgEligibility([root], () => {});
    expect(service.catalogSgEligible.size).toBe(0);
    expect(service.catalogSgRows.size).toBe(0);
  });
});
