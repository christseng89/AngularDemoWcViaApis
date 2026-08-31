import { of, throwError } from 'rxjs';
import { PickerSelectionService } from './picker-selection.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import { deriveFunctionStrategy } from './function-strategy';

/**
 * BAL-003 (PickerSelectionService extraction, 2026-08-19) — direct unit tests for the paging getters/
 * navigation methods and the two "guard fires before any HTTP call" branches that the component's own
 * indirect (mechanically-renamed) test coverage didn't happen to exercise. Every OTHER branch of this
 * service is already covered indirectly through `transaction-builder.component.*.spec.ts` (the service
 * was extracted as pure code motion from the component, so those tests already prove the extraction is
 * behavior-preserving) — this file closes the specific gaps the coverage report flagged, matching
 * `checker-actions.service.spec.ts`'s own established convention for a dispatcher-style service with
 * real branching logic.
 */

const A6 = IMPORT_FUNCTIONS.find((f) => f.code === 'A6')!;
const A4 = IMPORT_FUNCTIONS.find((f) => f.code === 'A4')!;
const B4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4')!;
const B5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5')!;

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    instrumentType: 'SHGT',
    naturalKey: { lcNumber: 'S001', sgNumber: 'G01' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  } as BalanceContract;
}

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

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 50 })),
    getSnapshot: jest.fn(() => of({ availableBalance: '1000', confirmedBalance: '1000' } as BalanceSnapshot)),
    listMovements: jest.fn(() => of([] as BalanceMovement[])),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('PickerSelectionService', () => {
  describe('pagedSgsForArrival / arrivalSgPrevPage / arrivalSgNextPage', () => {
    it('windows sgsForArrival by the current page and navigates within bounds only', () => {
      const svc = new PickerSelectionService(makeApi());
      svc.sgsForArrival = Array.from({ length: 15 }, (_, i) => contract({ balanceContractId: `sg-${i}`, naturalKey: { lcNumber: 'S001', sgNumber: `G${i}` } }));
      svc.arrivalSgPaging.total = 15;

      expect(svc.pagedSgsForArrival.length).toBe(10);
      expect(svc.pagedSgsForArrival[0].balanceContractId).toBe('sg-0');

      svc.arrivalSgPrevPage(); // already page 1 — no-op
      expect(svc.arrivalSgPaging.page).toBe(1);

      svc.arrivalSgNextPage();
      expect(svc.arrivalSgPaging.page).toBe(2);
      expect(svc.pagedSgsForArrival.length).toBe(5);
      expect(svc.pagedSgsForArrival[0].balanceContractId).toBe('sg-10');

      svc.arrivalSgNextPage(); // already last page — no-op
      expect(svc.arrivalSgPaging.page).toBe(2);

      svc.arrivalSgPrevPage();
      expect(svc.arrivalSgPaging.page).toBe(1);
    });
  });

  describe('pagedSettleableBalances / settleableBalancesPrevPage / settleableBalancesNextPage', () => {
    it('windows settleableBalances by the current page and navigates within bounds only', () => {
      const svc = new PickerSelectionService(makeApi());
      svc.settleableBalances = Array.from({ length: 12 }, (_, i) => ({
        balanceContractId: `eb-${i}`,
        instrumentType: 'EPLC_ACCEPTANCE' as const,
        ibNumber: `IB${i}`,
        availableBalance: '5000',
        currency: 'USD',
      }));
      svc.settleableBalancesPaging.total = 12;

      expect(svc.pagedSettleableBalances.length).toBe(10);

      svc.settleableBalancesPrevPage(); // already page 1 — no-op
      expect(svc.settleableBalancesPaging.page).toBe(1);

      svc.settleableBalancesNextPage();
      expect(svc.settleableBalancesPaging.page).toBe(2);
      expect(svc.pagedSettleableBalances.length).toBe(2);

      svc.settleableBalancesNextPage(); // already last page — no-op
      expect(svc.settleableBalancesPaging.page).toBe(2);

      svc.settleableBalancesPrevPage();
      expect(svc.settleableBalancesPaging.page).toBe(1);
    });
  });

  describe('loadSettleableBalances — no instrumentType', () => {
    it('clears settleableBalances and never calls the API when selectedFunction has no instrumentType', () => {
      const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 50 }));
      const svc = new PickerSelectionService(makeApi({ catalog: catalogSpy }));
      svc.settleableBalances = [{ balanceContractId: 'stale', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'IB01', availableBalance: '1', currency: 'USD' }];
      svc.loadSettleableBalances('S001', undefined);
      expect(svc.settleableBalances).toEqual([]);
      expect(catalogSpy).not.toHaveBeenCalled();
    });
  });

  describe('pagedFilteredPayableMovements / payableMovementsPrevPage / payableMovementsNextPage', () => {
    it('windows filteredPayableMovements by the current page and navigates within bounds only', () => {
      const svc = new PickerSelectionService(makeApi());
      svc.payableMovements = Array.from({ length: 13 }, (_, i) => movement({ movementId: `m-${i}`, sourceTransactionRef: `B${i}` }));
      svc.payableMovementsPaging.total = 13;

      expect(svc.pagedFilteredPayableMovements.length).toBe(10);

      svc.payableMovementsPrevPage(); // already page 1 — no-op
      expect(svc.payableMovementsPaging.page).toBe(1);

      svc.payableMovementsNextPage();
      expect(svc.payableMovementsPaging.page).toBe(2);
      expect(svc.pagedFilteredPayableMovements.length).toBe(3);

      svc.payableMovementsNextPage(); // already last page — no-op
      expect(svc.payableMovementsPaging.page).toBe(2);

      svc.payableMovementsPrevPage();
      expect(svc.payableMovementsPaging.page).toBe(1);
    });
  });

  describe('loadPayableMovements — B4 cross-contract, no matching child contracts at all', () => {
    // Bug fixed 2026-08-29 ("B4 還可以選同一筆 再SUBMIT") — the parent Confirmation's own movements are
    // now ALWAYS fetched in parallel with the child catalog search (needed to know which B3 candidates
    // already have a live PENDING B4 attempt referencing them), so listMovementsSpy IS called once now —
    // for the parent contractId — even when the child catalog search itself returns zero candidates.
    it('clears payableMovements when the catalog search returns zero candidates, still fetching the parent\'s own movements for the referenced-candidate exclusion', () => {
      const listMovementsSpy = jest.fn(() => of([] as BalanceMovement[]));
      const svc = new PickerSelectionService(
        makeApi({
          catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 50 })),
          listMovements: listMovementsSpy,
        }),
      );
      svc.payableMovements = [movement({ movementId: 'stale' })];
      svc.loadPayableMovements({
        contractId: 'confirmation-1',
        lcNumber: 'S001',
        selectedFunction: B4,
        selectedFunctionStrategy: deriveFunctionStrategy(B4),
        onAutoPicked: () => {
          throw new Error('should not auto-pick when there is nothing to pick');
        },
      });
      expect(svc.payableMovementsLoading).toBe(false);
      expect(svc.payableMovements).toEqual([]);
      expect(listMovementsSpy).toHaveBeenCalledWith('confirmation-1');
      expect(listMovementsSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadPayableMovements — B4 cross-contract, real candidates: movementType/status/presentDocsConsumedAt filtering', () => {
    it('excludes an already-consumed RELEASED presentation and a wrong-movementType one, keeps the one genuine candidate, and auto-picks it', () => {
      const consumed = contract({ balanceContractId: 'exam-consumed', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E01' } });
      const wrongType = contract({
        balanceContractId: 'exam-wrong-type',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'S001', ibNumber: 'E02' },
      });
      const genuine = contract({ balanceContractId: 'exam-genuine', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E03' } });
      const svc = new PickerSelectionService(
        makeApi({
          catalog: jest.fn(() => of({ items: [consumed, wrongType, genuine], total: 3, page: 1, pageSize: 50 })),
          listMovements: jest.fn((contractId: string) => {
            if (contractId === 'exam-consumed') {
              return of([
                movement({ movementId: 'mv-consumed', movementType: 'CREATE', status: 'RELEASED', presentDocsConsumedAt: '2026-08-19T00:00:00.000Z' }),
              ]);
            }
            if (contractId === 'exam-wrong-type') {
              return of([movement({ movementId: 'mv-wrong-type', movementType: 'AMEND', status: 'RELEASED' })]);
            }
            return of([movement({ movementId: 'mv-genuine', movementType: 'CREATE', status: 'RELEASED', sourceTransactionRef: null })]);
          }) as any,
        }),
      );
      let captured: ReturnType<PickerSelectionService['selectPayMovement']> | null = null;
      svc.loadPayableMovements({
        contractId: 'confirmation-1',
        lcNumber: 'S001',
        selectedFunction: B4,
        selectedFunctionStrategy: deriveFunctionStrategy(B4),
        onAutoPicked: (outcome) => (captured = outcome),
      });
      expect(svc.payableMovementsLoading).toBe(false);
      expect(svc.payableMovements.map((m) => m.movementId)).toEqual(['mv-genuine']);
      // The EPLC_EXAMINATION contract's own naturalKey.ibNumber is merged onto the movement as a
      // synthetic sourceTransactionRef when the raw movement carries none of its own (see the module's
      // own doc comment on this exact merge).
      expect(svc.payableMovements[0].sourceTransactionRef).toBe('E03');
      expect(captured).not.toBeNull();
      expect(captured!.selectedPayMovement?.movementId).toBe('mv-genuine');
    });

    // Bug fixed 2026-08-29 (live-reported, "B4 S02 E01 Submit -> Maker Queue (看不到) -> B4 還可以選同一筆
    // 再SUBMIT sourceTransactionRef 'E01' is already used...") — unlike A4/A6 (excluded via their own
    // makerSubmittedAt on the SAME referenced movement), B4's own HONOUR/ACCEPT is a separate movement
    // referencing the B3 CREATE via referencedTransactionId; a still-PENDING (not yet Released/Rejected/
    // Cancelled) prior B4 attempt left the SAME B3 presentation fully re-pickable, so a second Submit hit
    // the server's own duplicate-sourceTransactionRef guard.
    it('excludes a B3 presentation already referenced by a still-PENDING parent movement (a prior unresolved B4 attempt)', () => {
      const alreadyAttempted = contract({ balanceContractId: 'exam-attempted', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E01' } });
      const genuine = contract({ balanceContractId: 'exam-genuine', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E02' } });
      const svc = new PickerSelectionService(
        makeApi({
          catalog: jest.fn(() => of({ items: [alreadyAttempted, genuine], total: 2, page: 1, pageSize: 50 })),
          listMovements: jest.fn((contractId: string) => {
            if (contractId === 'confirmation-1') {
              // The parent Confirmation's own movements — a still-PENDING HONOUR already references
              // 'mv-attempted' (the B3 CREATE under exam-attempted/E01).
              return of([movement({ movementId: 'mv-honour-pending', movementType: 'HONOUR', status: 'PENDING', referencedTransactionId: 'mv-attempted' })]);
            }
            if (contractId === 'exam-attempted') {
              return of([movement({ movementId: 'mv-attempted', movementType: 'CREATE', status: 'RELEASED', sourceTransactionRef: null })]);
            }
            return of([movement({ movementId: 'mv-genuine', movementType: 'CREATE', status: 'RELEASED', sourceTransactionRef: null })]);
          }) as any,
        }),
      );
      svc.loadPayableMovements({
        contractId: 'confirmation-1',
        lcNumber: 'S001',
        selectedFunction: B4,
        selectedFunctionStrategy: deriveFunctionStrategy(B4),
        onAutoPicked: () => {
          throw new Error('should not auto-pick — more than one candidate remains only if the exclusion failed');
        },
      });
      expect(svc.payableMovements.map((m) => m.movementId)).toEqual(['mv-genuine']);
    });

    it('does NOT exclude a B3 presentation whose prior B4 attempt was REJECTED/CANCELLED — re-picking after Delete Pending must keep working', () => {
      const retried = contract({ balanceContractId: 'exam-retried', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E01' } });
      const svc = new PickerSelectionService(
        makeApi({
          catalog: jest.fn(() => of({ items: [retried], total: 1, page: 1, pageSize: 50 })),
          listMovements: jest.fn((contractId: string) => {
            if (contractId === 'confirmation-1') {
              // The prior B4 attempt was Delete-Pending'd (CANCELLED) — no longer PENDING, so it must not block a re-pick.
              return of([movement({ movementId: 'mv-honour-cancelled', movementType: 'HONOUR', status: 'CANCELLED', referencedTransactionId: 'mv-retried' })]);
            }
            return of([movement({ movementId: 'mv-retried', movementType: 'CREATE', status: 'RELEASED', sourceTransactionRef: null })]);
          }) as any,
        }),
      );
      let captured: ReturnType<PickerSelectionService['selectPayMovement']> | null = null;
      svc.loadPayableMovements({
        contractId: 'confirmation-1',
        lcNumber: 'S001',
        selectedFunction: B4,
        selectedFunctionStrategy: deriveFunctionStrategy(B4),
        onAutoPicked: (outcome) => (captured = outcome),
      });
      expect(svc.payableMovements.map((m) => m.movementId)).toEqual(['mv-retried']);
      expect(captured).not.toBeNull();
    });
  });

  describe('selectSettleableBalance — fallback branches (no parentLcNumber, candidate with no ibNumber)', () => {
    it('falls back to an empty lcNumber/ibNumber when parentLcNumber is undefined and the candidate itself has no ibNumber', () => {
      const svc = new PickerSelectionService(makeApi());
      svc.settleableBalances = [{ balanceContractId: 'acc-2', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: null, availableBalance: '2000', currency: 'USD' }];
      const outcome = svc.selectSettleableBalance('acc-2', undefined);
      expect(outcome).toEqual({
        instrumentType: 'EPLC_ACCEPTANCE',
        contract: {
          balanceContractId: 'acc-2',
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: '', ibNumber: null },
          status: 'ACTIVE',
          currency: 'USD',
        },
        ibNumber: '',
      });
    });
  });

  describe('B5 (settleAcceptanceOnMature) end-to-end — closes the loop between loadSettleableBalances and selectSettleableBalance', () => {
    it('loads a candidate, then resolves a real pick to the expected outcome shape', () => {
      const svc = new PickerSelectionService(
        makeApi({
          catalog: jest.fn(() =>
            of({
              items: [contract({ balanceContractId: 'acc-1', instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } })],
              total: 1,
              page: 1,
              pageSize: 50,
            }),
          ),
          getSnapshot: jest.fn(() => of({ availableBalance: '5000', confirmedBalance: '5000' } as BalanceSnapshot)),
        }),
      );
      svc.loadSettleableBalances('S001', B5.instrumentType);
      expect(svc.settleableBalances).toEqual([
        { balanceContractId: 'acc-1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'IB01', availableBalance: '5000', currency: 'USD' },
      ]);

      const outcome = svc.selectSettleableBalance('acc-1', 'S001');
      expect(outcome).toEqual({
        instrumentType: 'EPLC_ACCEPTANCE',
        contract: {
          balanceContractId: 'acc-1',
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' },
          status: 'ACTIVE',
          currency: 'USD',
        },
        ibNumber: 'IB01',
      });

      expect(svc.selectSettleableBalance('does-not-exist', 'S001')).toBeNull();
    });
  });

  describe('A6 end-to-end — loadPayableMovements auto-picks the sole PENDING candidate via selectPayMovement', () => {
    it('sets naturalKey.ibNumber/model.amount-worthy outcome fields and needsRebuildFields', () => {
      const svc = new PickerSelectionService(
        makeApi({
          listMovements: jest.fn(() =>
            of([movement({ movementId: 'only-one', sourceTransactionRef: 'B01', amount: '30000', acknowledgedAt: '2026-08-20T00:00:00.000Z' })]),
          ),
        }),
      );
      let captured: ReturnType<PickerSelectionService['selectPayMovement']> | null = null;
      svc.loadPayableMovements({
        contractId: 'lc-1',
        lcNumber: 'S001',
        selectedFunction: A6,
        selectedFunctionStrategy: deriveFunctionStrategy(A6),
        onAutoPicked: (outcome) => (captured = outcome),
      });
      expect(captured).not.toBeNull();
      expect(captured!.selectedPayMovement?.movementId).toBe('only-one');
      expect(captured!.naturalKeyIbNumber).toBe('B01');
      expect(captured!.modelAmount).toBe('30000');
      expect(captured!.needsRebuildFields).toBe(true);
      expect(captured!.clearsSubmitResult).toBe(false);
    });

    // Business instruction 2026-08-20 ("A4 選取 EARMARKED 的交易") — a still-PENDING UTILIZE that hasn't
    // been Checker-acknowledged yet must not be offered as a payable candidate here either (mirrors
    // DocumentArrivalHintsService's own Step-1 LC-level gate — needed again at this Step-2 layer since
    // one LC can have multiple outstanding Document Arrivals).
    it('excludes a still-PENDING UTILIZE with no acknowledgedAt from payableMovements', () => {
      const svc = new PickerSelectionService(
        makeApi({
          listMovements: jest.fn(() => of([movement({ movementId: 'not-yet-acknowledged', sourceTransactionRef: 'B02' })])),
        }),
      );
      svc.loadPayableMovements({
        contractId: 'lc-1',
        lcNumber: 'S001',
        selectedFunction: A6,
        selectedFunctionStrategy: deriveFunctionStrategy(A6),
        onAutoPicked: () => {
          throw new Error('should not auto-pick — nothing eligible');
        },
      });
      expect(svc.payableMovements).toEqual([]);
    });

    // Bug fixed 2026-08-20 (reviewer-reported live, "已經Submit 為何可以A4重複出現再選取" — S101 repro):
    // once A4 has already Maker-Submitted this same UTILIZE (makerSubmittedAt set), it must drop out of
    // the Step-2 picker too — nothing left for A4's own Maker step to do.
    it('excludes a UTILIZE that A4 has already Maker-Submitted (acknowledged AND makerSubmittedAt set)', () => {
      const svc = new PickerSelectionService(
        makeApi({
          listMovements: jest.fn(() =>
            of([
              movement({
                movementId: 'already-submitted',
                sourceTransactionRef: 'B03',
                acknowledgedAt: '2026-08-20T00:00:00.000Z',
                makerSubmittedAt: '2026-08-20T01:00:00.000Z',
              }),
            ]),
          ),
        }),
      );
      svc.loadPayableMovements({
        contractId: 'lc-1',
        lcNumber: 'S001',
        selectedFunction: A6,
        selectedFunctionStrategy: deriveFunctionStrategy(A6),
        onAutoPicked: () => {
          throw new Error('should not auto-pick — nothing eligible');
        },
      });
      expect(svc.payableMovements).toEqual([]);
    });
  });

  // Bug fixed 2026-08-28 (live-reported, "A4 沒抓到2ndary number(IB number?)" — the protected-natural-key
  // card's new A4-only IB Number line showed "—" instead of the picked record's own reference): before
  // this fix, `selectPayMovement()`'s field-population block was gated on `settlesDocumentArrival` only
  // (A6/B4) — A4's own `releasesExistingMovementInPlace` shape fell through to ONLY `clearsSubmitResult`,
  // never populating `modelAmount`/`modelSecondaryRef` at all. Masked previously because A4's own template
  // read `pickerSelection.selectedPayMovement` directly, bypassing `model` — once that bespoke readout was
  // replaced with the generic, `model`-driven Amount field + protected-card IB Number line (same session,
  // "A4 銀幕改成配置方式"), the gap became visible.
  describe('A4 (releasesExistingMovementInPlace) — selectPayMovement() now populates modelAmount/modelSecondaryRef', () => {
    it('sets modelAmount/modelSecondaryRef (but NOT naturalKeyIbNumber, which only A6/B4 need) even with no secondaryRefLabel at all', () => {
      const svc = new PickerSelectionService(
        makeApi({
          listMovements: jest.fn(() => of([movement({ movementId: 'only-one', sourceTransactionRef: 'B01', amount: '30000', acknowledgedAt: '2026-08-20T00:00:00.000Z' })])),
        }),
      );
      let captured: ReturnType<PickerSelectionService['selectPayMovement']> | null = null;
      svc.loadPayableMovements({
        contractId: 'lc-1',
        lcNumber: 'S04',
        selectedFunction: A4,
        selectedFunctionStrategy: deriveFunctionStrategy(A4),
        onAutoPicked: (outcome) => (captured = outcome),
      });
      expect(captured).not.toBeNull();
      expect(captured!.selectedPayMovement?.movementId).toBe('only-one');
      expect(captured!.modelAmount).toBe('30000');
      expect(captured!.modelSecondaryRef).toBe('B01');
      expect(captured!.naturalKeyIbNumber).toBeUndefined(); // A4 creates nothing — no natural key of its own to populate
      expect(captured!.needsRebuildFields).toBe(true);
      expect(captured!.clearsSubmitResult).toBe(true);
    });
  });

  describe('loadSgsForArrival — error path', () => {
    it('clears sgsForArrival and resets total on a catalog() error', () => {
      const svc = new PickerSelectionService(makeApi({ catalog: jest.fn(() => throwError(() => new Error('boom'))) }));
      svc.sgsForArrival = [contract({ balanceContractId: 'stale' })];
      svc.loadSgsForArrival('S001', () => {});
      expect(svc.sgsForArrivalLoading).toBe(false);
      expect(svc.sgsForArrival).toEqual([]);
      expect(svc.arrivalSgPaging.total).toBe(0);
    });
  });
});
