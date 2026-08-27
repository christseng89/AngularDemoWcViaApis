import { of, throwError } from 'rxjs';
import { MakerQueueService } from './maker-queue.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, MyMovementsPage } from './balance-component-api.service';

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

function makePage(overrides: Partial<MyMovementsPage> = {}): MyMovementsPage {
  return { items: [], total: 0, page: 1, pageSize: 10, ...overrides };
}

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    listMyMovements: overrides.listMyMovements ?? jest.fn(() => of(makePage())),
    cancel: overrides.cancel ?? jest.fn(() => of(makeMovement({ status: 'CANCELLED' }))),
  } as unknown as BalanceComponentApiService;
}

describe('MakerQueueService', () => {
  describe('load', () => {
    it('does nothing when createdBy is blank', () => {
      const api = makeApi();
      const svc = new MakerQueueService(api);
      svc.createdBy = '';
      svc.load();
      expect(api.listMyMovements).not.toHaveBeenCalled();
    });

    it('defaults to PENDING+REJECTED for the current createdBy and populates items/paging on success', () => {
      const row = { movement: makeMovement(), contract: makeContract() };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [row], total: 1, page: 1, pageSize: 10 }))) });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';

      svc.load();

      expect(api.listMyMovements).toHaveBeenCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], page: 1, pageSize: 10 });
      expect(svc.items).toEqual([row]);
      expect(svc.paging.total).toBe(1);
      expect(svc.loading).toBe(false);
    });

    it('on error, sets a describable error and clears items/total', () => {
      const api = makeApi({ listMyMovements: jest.fn(() => throwError(() => ({ error: { message: 'boom' } }))) });
      const svc = new MakerQueueService(api);
      svc.items = [{ movement: makeMovement(), contract: makeContract() }];

      svc.load();

      expect(svc.loading).toBe(false);
      expect(svc.error).toBe('boom');
      expect(svc.items).toEqual([]);
      expect(svc.paging.total).toBe(0);
    });
  });

  describe('prevPage/nextPage', () => {
    it('nextPage() re-loads at the next page target', () => {
      const listMyMovements = jest.fn(() => of(makePage({ total: 25, page: 1, pageSize: 10 })));
      const api = makeApi({ listMyMovements });
      const svc = new MakerQueueService(api);
      svc.load();
      expect(svc.paging.total).toBe(25);

      svc.nextPage();

      expect(listMyMovements).toHaveBeenLastCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], page: 2, pageSize: 10 });
    });

    it('prevPage() no-ops on page 1', () => {
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ listMyMovements });
      const svc = new MakerQueueService(api);
      svc.load();
      listMyMovements.mockClear();

      svc.prevPage();

      expect(listMyMovements).not.toHaveBeenCalled();
    });
  });

  describe('functionFor', () => {
    it('resolves the producing TransactionFunction via the Strategy registry', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'ISSUE' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.functionFor(row)?.code).toBe('A1');
    });

    it('returns undefined (never throws) when no function can be resolved for the row', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'REVERSAL' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.functionFor(row)).toBeUndefined();
    });
  });

  describe('isCompoundShape', () => {
    // Deliberately keyed off businessEventId, NOT resolveFunctionForMovement() — see isCompoundShape()'s
    // own doc comment for why the Strategy-lookup route is ambiguous for exactly this shape (IPLC_LC/
    // UTILIZE always resolves to plain A3, the first registry match, never A3S).
    it('is false for a plain single-leg movement (no businessEventId)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', businessEventId: null }), contract: makeContract() };
      expect(svc.isCompoundShape(row)).toBe(false);
    });

    it('is true for a compound-submission leg (businessEventId set, e.g. an A3S/B4/B5 leg)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', businessEventId: 'be-1' }), contract: makeContract() };
      expect(svc.isCompoundShape(row)).toBe(true);
    });
  });

  describe('deletePending', () => {
    it('calls api.cancel with createdBy/MAKER_EC and reloads the current page on success', () => {
      const cancel = jest.fn(() => of(makeMovement({ status: 'CANCELLED' })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      svc.paging.page = 2;
      const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };

      svc.deletePending(row);

      expect(cancel).toHaveBeenCalledWith('mv-9', 'maker1', 'MAKER_EC');
      expect(listMyMovements).toHaveBeenCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], page: 2, pageSize: 10 });
    });

    it('on failure, sets a describable error and does not reload', () => {
      const cancel = jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };

      svc.deletePending(row);

      expect(svc.error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(listMyMovements).not.toHaveBeenCalled();
    });
  });
});
