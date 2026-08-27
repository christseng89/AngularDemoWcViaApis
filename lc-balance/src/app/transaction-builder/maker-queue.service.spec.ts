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
    withdrawMakerSubmit: overrides.withdrawMakerSubmit ?? jest.fn(() => of(makeMovement({ makerSubmittedAt: null }))),
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

    // Unified Earmarking display model (lc-balance/CLAUDE.md) — once makerSubmittedAt is set, this
    // queue's own "which screen owns this" question is A4's, not A3's.
    it('resolves to A4 once makerSubmittedAt is set on a Sight IPLC_LC/UTILIZE row', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' }) };
      expect(svc.functionFor(row)?.code).toBe('A4');
    });

    // Business-confirmed 2026-08-27 ("A6 必須... 承接並正式轉換 A3/A3S 的 EARMARKED exposure") — same
    // makerSubmittedAt-driven relabeling, but to A6 for a Usance-tenor row.
    it('resolves to A6 once makerSubmittedAt is set on a Usance IPLC_LC/UTILIZE row', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' }) };
      expect(svc.functionFor(row)?.code).toBe('A6');
    });

    it('still resolves to A3 (first registry match) when acknowledged but not yet makerSubmitted', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.functionFor(row)?.code).toBe('A3');
    });
  });

  describe('displayPhaseFor (unified Earmarking display model)', () => {
    it('returns "finalize" once makerSubmittedAt is set on a Sight IPLC_LC/UTILIZE row (Function has already relabeled to A4)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' }) };
      expect(svc.displayPhaseFor(row)).toBe('finalize');
    });

    it('returns "finalize" once makerSubmittedAt is set on a Usance IPLC_LC/UTILIZE row (Function has already relabeled to A6)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' }) };
      expect(svc.displayPhaseFor(row)).toBe('finalize');
    });

    it('returns null when acknowledged but not yet makerSubmitted (still A3\'s own EARMARKED business)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.displayPhaseFor(row)).toBeNull();
    });

    it('returns null for an instrumentType with no finalizing function (e.g. SHGT)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'ISSUE', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'SHGT' }) };
      expect(svc.displayPhaseFor(row)).toBeNull();
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

  describe('isWithdrawMakerSubmitCase (business-confirmed 2026-08-27, unified under the "Delete Pending" name)', () => {
    it('is true once makerSubmittedAt is set on an IPLC_LC/UTILIZE row, regardless of status (PENDING)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.isWithdrawMakerSubmitCase(row)).toBe(true);
    });

    it('is ALSO true once REJECTED — the "revert to before Submit" rule applies regardless', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'REJECTED' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.isWithdrawMakerSubmitCase(row)).toBe(true);
    });

    it('is false when never Maker-Submitted (still A3\'s own EARMARKED business, uses plain cancel())', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.isWithdrawMakerSubmitCase(row)).toBe(false);
    });
  });

  // Business-confirmed 2026-08-28 ("1 只應該顯示一筆 2 一筆刪全部") — reverses the former Phase-2 posture
  // (3 separate rows, Delete Pending disabled) once `findByBusinessEventId()` made cross-session sibling
  // reconstruction possible; see MakerQueueService's own updated isCompoundShape()/groupCompoundRows() doc
  // comments for the full history.
  describe('load — groupCompoundRows() merges every leg sharing one businessEventId into ONE row', () => {
    it('a B4 Usance triple (Confirmation ACCEPT + Acceptance CREATE + Receivable CREATE) collapses to one row, representative = the direct-match leg (EPLC_CONFIRMATION/ACCEPT), carrying every sibling movementId', () => {
      const confirmationAccept = { movement: makeMovement({ movementId: 'mv-confirm', movementType: 'ACCEPT', businessEventId: 'be-1', sourceTransactionRef: 'E02', createdAt: '2026-08-28T00:00:02.000Z' }), contract: makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' }) };
      const acceptanceCreate = { movement: makeMovement({ movementId: 'mv-acceptance', movementType: 'CREATE', businessEventId: 'be-1', createdAt: '2026-08-28T00:00:01.000Z' }), contract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE' }) };
      const receivableCreate = { movement: makeMovement({ movementId: 'mv-receivable', movementType: 'CREATE', businessEventId: 'be-1', createdAt: '2026-08-28T00:00:00.000Z' }), contract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE' }) };
      // server order is created_at DESC — Confirmation first (most recent leg created), then Acceptance, then Receivable.
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [confirmationAccept, acceptanceCreate, receivableCreate], total: 3 }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toHaveLength(1);
      expect(svc.items[0].movement.movementId).toBe('mv-confirm');
      expect(svc.items[0].movement.sourceTransactionRef).toBe('E02');
      expect(svc.items[0].siblingMovementIds).toEqual(['mv-confirm', 'mv-acceptance', 'mv-receivable']);
      expect(svc.functionFor(svc.items[0])?.code).toBe('B4');
    });

    it('a plain single-leg row (no businessEventId) is left untouched, no siblingMovementIds', () => {
      const row = { movement: makeMovement({ movementId: 'mv-1', businessEventId: null }), contract: makeContract() };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [row], total: 1 }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toEqual([row]);
      expect(svc.items[0].siblingMovementIds).toBeUndefined();
    });

    it('two DIFFERENT compound events (different businessEventId) merge independently, not into each other', () => {
      const eventA1 = { movement: makeMovement({ movementId: 'a-1', businessEventId: 'be-a', movementType: 'ACCEPT', createdAt: '2026-08-28T00:00:03.000Z' }), contract: makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' }) };
      const eventA2 = { movement: makeMovement({ movementId: 'a-2', businessEventId: 'be-a', movementType: 'CREATE', createdAt: '2026-08-28T00:00:02.000Z' }), contract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE' }) };
      const eventB1 = { movement: makeMovement({ movementId: 'b-1', businessEventId: 'be-b', movementType: 'UTILIZE', createdAt: '2026-08-28T00:00:01.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      const eventB2 = { movement: makeMovement({ movementId: 'b-2', businessEventId: 'be-b', movementType: 'FULL_REDEEM', createdAt: '2026-08-28T00:00:00.000Z' }), contract: makeContract({ instrumentType: 'SHGT' }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [eventA1, eventA2, eventB1, eventB2], total: 4 }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toHaveLength(2);
      const siblingSets = svc.items.map((r) => r.siblingMovementIds?.slice().sort());
      expect(siblingSets).toContainEqual(['a-1', 'a-2']);
      expect(siblingSets).toContainEqual(['b-1', 'b-2']);
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

    it('routes to api.withdrawMakerSubmit (not cancel) for an A4 row (makerSubmittedAt set), even if still PENDING', () => {
      const withdrawMakerSubmit = jest.fn(() => of(makeMovement({ makerSubmittedAt: null })));
      const cancel = jest.fn(() => of(makeMovement({ status: 'CANCELLED' })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ withdrawMakerSubmit, cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      svc.deletePending(row);

      expect(withdrawMakerSubmit).toHaveBeenCalledWith('mv-9', 'maker1');
      expect(cancel).not.toHaveBeenCalled();
    });

    it('routes to api.withdrawMakerSubmit for an A4 row even when REJECTED', () => {
      const withdrawMakerSubmit = jest.fn(() => of(makeMovement({ makerSubmittedAt: null, status: 'PENDING' })));
      const cancel = jest.fn(() => of(makeMovement({ status: 'CANCELLED' })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ withdrawMakerSubmit, cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'REJECTED' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      svc.deletePending(row);

      expect(withdrawMakerSubmit).toHaveBeenCalledWith('mv-9', 'maker1');
      expect(cancel).not.toHaveBeenCalled();
    });

    it('on withdrawMakerSubmit failure (A4 row), sets a describable error and does not reload', () => {
      const withdrawMakerSubmit = jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ withdrawMakerSubmit, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      svc.deletePending(row);

      expect(svc.error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(listMyMovements).not.toHaveBeenCalled();
    });

    // Business-confirmed 2026-08-28 ("1 只應該顯示一筆 2 一筆刪全部") — a merged compound row (built by
    // groupCompoundRows() at load time, see the describe block above) cascades: every sibling first, THEN
    // the representative's own movement last, same "never leave a later leg orphaned" ordering
    // checker-actions.service.ts's own same-session deleteMakerPending() uses.
    describe('cascades across every sibling for a merged compound row (siblingMovementIds set)', () => {
      it('cancels every sibling THEN the representative last, then reloads once', () => {
        const calls: string[] = [];
        const cancel = jest.fn((id: string) => {
          calls.push(id);
          return of(makeMovement({ movementId: id, status: 'CANCELLED' }));
        });
        const listMyMovements = jest.fn(() => of(makePage()));
        const api = makeApi({ cancel, listMyMovements });
        const svc = new MakerQueueService(api);
        svc.createdBy = 'maker1';
        const row = { movement: makeMovement({ movementId: 'mv-confirm' }), contract: makeContract(), siblingMovementIds: ['mv-confirm', 'mv-acceptance', 'mv-receivable'] };

        svc.deletePending(row);

        expect(calls).toEqual(['mv-acceptance', 'mv-receivable', 'mv-confirm']); // siblings first, representative last.
        expect(cancel).toHaveBeenCalledTimes(3);
        cancel.mock.calls.forEach((call) => expect(call.slice(1)).toEqual(['maker1', 'MAKER_EC']));
        expect(listMyMovements).toHaveBeenCalledTimes(1); // reloads once at the end, not once per leg.
      });

      it('stops the chain on the first failure and reports it — siblings already cancelled before the failure stay cancelled, no reload', () => {
        const cancel = jest.fn((id: string) => (id === 'mv-acceptance' ? throwError(() => ({ error: { message: 'CANNOT_CANCEL_RELEASED' } })) : of(makeMovement({ movementId: id, status: 'CANCELLED' }))));
        const listMyMovements = jest.fn(() => of(makePage()));
        const api = makeApi({ cancel, listMyMovements });
        const svc = new MakerQueueService(api);
        svc.createdBy = 'maker1';
        const row = { movement: makeMovement({ movementId: 'mv-confirm' }), contract: makeContract(), siblingMovementIds: ['mv-confirm', 'mv-acceptance', 'mv-receivable'] };

        svc.deletePending(row);

        expect(svc.error).toBe('CANNOT_CANCEL_RELEASED');
        expect(cancel).toHaveBeenCalledTimes(1); // stopped after the first (failing) sibling — never reached the representative.
        expect(listMyMovements).not.toHaveBeenCalled();
      });

      it('a compound row with only itself in siblingMovementIds (single-leg group) behaves exactly like a plain row', () => {
        const cancel = jest.fn((id: string) => of(makeMovement({ movementId: id, status: 'CANCELLED' })));
        const listMyMovements = jest.fn(() => of(makePage()));
        const api = makeApi({ cancel, listMyMovements });
        const svc = new MakerQueueService(api);
        svc.createdBy = 'maker1';
        const row = { movement: makeMovement({ movementId: 'mv-1' }), contract: makeContract(), siblingMovementIds: ['mv-1'] };

        svc.deletePending(row);

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledWith('mv-1', 'maker1', 'MAKER_EC');
      });
    });
  });
});
