import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';

/**
 * Closes coverage gaps left after the three method-slice agents finished
 * transaction-builder.component.spec.ts / .selection.spec.ts / .actions.spec.ts.
 * Those three specs covered the imperative methods listed in their own
 * briefs; none of them was told to exercise the ~30 plain `get` accessors
 * this component defines, nor a handful of error-callback branches inside
 * methods they DID otherwise cover. This file targets exactly those misses,
 * confirmed against the real combined-suite coverage report (not guessed).
 */

function fn(code: string): TransactionFunction {
  const found = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === code);
  if (!found) throw new Error(`No TransactionFunction with code "${code}" in the registry`);
  return found;
}

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
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

function snapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    currency: 'USD',
    confirmedBalance: '100000',
    availableBalance: '80000',
    pendingEarmarkTotal: '20000',
    ...overrides,
  };
}

function mockApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    createMovement: jest.fn(),
    release: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    acknowledge: jest.fn(),
    resolveContract: jest.fn(() => of(contract())),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getSnapshot: jest.fn(() => of(snapshot())),
    listMovements: jest.fn(() => of([])),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('TransactionBuilderComponent — coverage gap-closing (getters + error branches + Formly expressions)', () => {
  describe('plain getters — default/empty state', () => {
    it('isCreatingMovement / requiredNaturalKeyFields / hasParent / parentOptions / toleranceApplicable / ready are all falsy/empty before any function is picked', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.isCreatingMovement).toBe(false);
      expect(c.requiredNaturalKeyFields).toEqual([]);
      expect(c.hasParent).toBe(false);
      expect(c.parentOptions).toEqual([]);
      expect(c.toleranceApplicable).toBe(false);
      expect(c.ready).toBe(false);
      expect(c.usesTwoFieldSearch).toBe(false);
    });

    it('ready becomes true once a fixed-movementType function (A1) is selected, false again after selecting a subChoice function (A2) before the subChoice is picked', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A1'));
      expect(c.ready).toBe(true);
      expect(c.isCreatingMovement).toBe(true);
      expect(c.hasParent).toBe(false);

      c.selectFunction(fn('A2'));
      expect(c.ready).toBe(false);
    });

    it('hasParent / parentOptions / requiredNaturalKeyFields for a parented instrument (A6, IPLC_ACCEPTANCE)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A6'));
      expect(c.hasParent).toBe(true);
      expect(c.parentOptions).toEqual(['IPLC_LC']);
      expect(c.requiredNaturalKeyFields).toEqual(['ibNumber']);
    });

    it('ibNumberLabel reads "IB Number" on the Import side and "EB Number" on the Export side', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunctionSide('IMPORT');
      expect(c.ibNumberLabel).toBe('IB Number');
      c.selectFunctionSide('EXPORT');
      expect(c.ibNumberLabel).toBe('EB Number');
    });

    it('toleranceApplicable is true for A1 (IPLC_LC ISSUE) and false for A8 (SHGT ISSUE, ISSUE-string collision case)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A1'));
      expect(c.toleranceApplicable).toBe(true);

      const c2 = new TransactionBuilderComponent(mockApi());
      c2.selectFunction(fn('A8'));
      expect(c2.toleranceApplicable).toBe(false);
    });
  });

  describe('activeLookup* getters — LC vs ACCEPTANCE vs SG tab', () => {
    function withLookupResult(c: TransactionBuilderComponent, overrides: Partial<BalanceContract> = {}) {
      (c as any).lookupResult = { contract: contract(overrides), snapshot: snapshot() };
    }

    it('default (LC) tab reads from lookupMovements/lookupResult', () => {
      const c = new TransactionBuilderComponent(mockApi());
      (c as any).lookupMovements = [{ id: 1 }];
      withLookupResult(c);
      expect(c.activeLookupMovements).toEqual([{ id: 1 }]);
      expect(c.activeLookupSnapshot).toEqual(snapshot());
      expect(c.activeLookupContract).toEqual(contract());
      expect(c.activeLookupLabel).toBe('LC S001');
    });

    it('ACCEPTANCE tab reads from acceptanceMovements/acceptanceSnapshot/selectedLookupAcceptance, and appends IB Number when present', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookupTab = 'ACCEPTANCE';
      (c as any).acceptanceMovements = [{ id: 2 }];
      (c as any).acceptanceSnapshot = snapshot({ confirmedBalance: '5' });
      (c as any).selectedLookupAcceptance = contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } });
      withLookupResult(c);
      expect(c.activeLookupMovements).toEqual([{ id: 2 }]);
      expect(c.activeLookupSnapshot).toEqual(snapshot({ confirmedBalance: '5' }));
      expect(c.activeLookupContract).toEqual(contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } }));
      expect(c.activeLookupLabel).toBe('LC S001 / IB IB01');
    });

    it('ACCEPTANCE tab label falls back to bare LC when the selected acceptance has no ibNumber', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookupTab = 'ACCEPTANCE';
      (c as any).selectedLookupAcceptance = contract({ naturalKey: { lcNumber: 'S001' } });
      withLookupResult(c);
      expect(c.activeLookupLabel).toBe('LC S001');
    });

    it('SG tab reads from sgMovements/sgSnapshot/selectedLookupSg, and appends SG Number when present', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookupTab = 'SG';
      (c as any).sgMovements = [{ id: 3 }];
      (c as any).sgSnapshot = snapshot({ confirmedBalance: '9' });
      (c as any).selectedLookupSg = contract({ naturalKey: { lcNumber: 'S001', sgNumber: 'SG01' } });
      withLookupResult(c);
      expect(c.activeLookupMovements).toEqual([{ id: 3 }]);
      expect(c.activeLookupSnapshot).toEqual(snapshot({ confirmedBalance: '9' }));
      expect(c.activeLookupContract).toEqual(contract({ naturalKey: { lcNumber: 'S001', sgNumber: 'SG01' } }));
      expect(c.activeLookupLabel).toBe('LC S001 / SG SG01');
    });

    it('SG tab label falls back to bare LC when the selected SG has no sgNumber', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookupTab = 'SG';
      (c as any).selectedLookupSg = contract({ naturalKey: { lcNumber: 'S001' } });
      withLookupResult(c);
      expect(c.activeLookupLabel).toBe('LC S001');
    });

    it('activeLookupLabel falls back to the typed lookup.lcNumber when no lookupResult is loaded yet', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookup.lcNumber = 'TYPED01';
      expect(c.activeLookupLabel).toBe('LC TYPED01');
    });

    it('activeLookupSnapshot/activeLookupContract fall back to null on the default (LC) tab before any lookup has run', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.activeLookupSnapshot).toBeNull();
      expect(c.activeLookupContract).toBeNull();
    });

    it('lookupIsUsanceLc is false with no lookupResult, false for a non-LC/non-Confirmation contract, false for Sight, true for Usance', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.lookupIsUsanceLc).toBe(false);

      withLookupResult(c, { instrumentType: 'SHGT' });
      expect(c.lookupIsUsanceLc).toBe(false);

      withLookupResult(c, { instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      expect(c.lookupIsUsanceLc).toBe(false);

      withLookupResult(c, { instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      expect(c.lookupIsUsanceLc).toBe(true);

      withLookupResult(c, { instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' });
      expect(c.lookupIsUsanceLc).toBe(true);
    });

    it('lookupHasSg is true only for an IPLC_LC lookup result', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.lookupHasSg).toBe(false);
      withLookupResult(c, { instrumentType: 'IPLC_LC' });
      expect(c.lookupHasSg).toBe(true);
      withLookupResult(c, { instrumentType: 'EPLC_LC' });
      expect(c.lookupHasSg).toBe(false);
    });
  });

  describe('flattenedPayableRows, catalog/parent paging + filtering getters', () => {
    it('flattenedPayableRows is empty with no catalog contracts, and builds/sorts rows by LC Number then IB reference when populated', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A4'));
      expect(c.flattenedPayableRows).toEqual([]);

      c.catalogContracts = [
        contract({ balanceContractId: 'b', naturalKey: { lcNumber: 'B001' } }),
        contract({ balanceContractId: 'a', naturalKey: { lcNumber: 'A001' } }),
      ];
      (c as any).catalogPayableMovements.set('b', [{ movementId: 'm-b2', sourceTransactionRef: 'IB02' }]);
      (c as any).catalogPayableMovements.set('a', [
        { movementId: 'm-a2', sourceTransactionRef: 'IB02' },
        { movementId: 'm-a1', sourceTransactionRef: 'IB01' },
      ]);
      const rows = c.flattenedPayableRows;
      expect(rows.map((r) => r.movement.movementId)).toEqual(['m-a1', 'm-a2', 'm-b2']);
    });

    it('catalogTotalPages / parentTotalPages are always at least 1', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.catalogTotalPages).toBe(1);
      expect(c.parentTotalPages).toBe(1);
      c.catalogTotal = 25;
      expect(c.catalogTotalPages).toBe(3);
      c.parentTotal = 21;
      expect(c.parentTotalPages).toBe(3);
    });

    it('filteredCatalogContracts: no tenor filter / no movementType -> passthrough', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.catalogContracts = [contract()];
      expect(c.filteredCatalogContracts).toEqual([contract()]);
    });

    it('filteredCatalogContracts: payExistingUtilize (A4) always returns the tenor-filtered list unfiltered by balance', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A4'));
      c.catalogContracts = [contract({ balanceContractId: 'zero', tenorType: 'SIGHT' })];
      (c as any).catalogSnapshots.set('zero', snapshot({ availableBalance: '0' }));
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['zero']);
    });

    it('filteredCatalogContracts: a decreasing movementType (A3) excludes 0-available contracts but keeps ones with no snapshot yet', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A3'));
      c.catalogContracts = [
        contract({ balanceContractId: 'zero' }),
        contract({ balanceContractId: 'nonzero' }),
        contract({ balanceContractId: 'unknown' }),
      ];
      (c as any).catalogSnapshots.set('zero', snapshot({ availableBalance: '0' }));
      (c as any).catalogSnapshots.set('nonzero', snapshot({ availableBalance: '500' }));
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId).sort()).toEqual(['nonzero', 'unknown'].sort());
    });

    it('filteredCatalogContracts: tenorFilter excludes the opposite tenor family but keeps contracts with no tenorType recorded', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A4')); // catalogTenorFilter: 'SIGHT'
      c.catalogContracts = [
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'usance', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'legacy' }),
      ];
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId).sort()).toEqual(['legacy', 'sight'].sort());
    });

    it('parentTenorFamily: undefined with no function, USANCE when tenorTypeOptions is set (A6), USANCE when catalogTenorFilter is USANCE (A7)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.parentTenorFamily).toBeUndefined();
      c.selectFunction(fn('A6'));
      expect(c.parentTenorFamily).toBe('USANCE');
      const c2 = new TransactionBuilderComponent(mockApi());
      c2.selectFunction(fn('A7'));
      expect(c2.parentTenorFamily).toBe('USANCE');
    });

    it('filteredParentCatalog: tenorTypeOptions functions (A6) require an exact tenor match and exclude legacy/Sight', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A6'));
      c.model.tenorType = 'BUYERS_USANCE';
      c.parentCatalog = [
        contract({ balanceContractId: 'match', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'other-tenor', tenorType: 'SELLERS_USANCE' }),
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'legacy' }),
      ];
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['match']);
    });

    it('filteredParentCatalog: catalogTenorFilter USANCE (A7) excludes only Sight, keeps legacy, and skips the 0-balance filter', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A7'));
      c.parentCatalog = [
        contract({ balanceContractId: 'usance', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'legacy' }),
      ];
      (c as any).parentSnapshots.set('usance', snapshot({ availableBalance: '0' }));
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId).sort()).toEqual(['legacy', 'usance'].sort());
    });

    it('filteredParentCatalog: no tenor flags at all (A8) applies only the 0-balance filter', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A8'));
      c.parentCatalog = [contract({ balanceContractId: 'zero' }), contract({ balanceContractId: 'nonzero' })];
      (c as any).parentSnapshots.set('zero', snapshot({ availableBalance: '0' }));
      (c as any).parentSnapshots.set('nonzero', snapshot({ availableBalance: '500' }));
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['nonzero']);
    });
  });

  describe('filteredPayableMovements / catalogPendingHint / displayStatus', () => {
    it('filteredPayableMovements passes through with no search text and filters by sourceTransactionRef case-insensitively', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.payableMovements = [{ movementId: '1', sourceTransactionRef: 'IB01' }, { movementId: '2', sourceTransactionRef: 'IB02' }];
      expect(c.filteredPayableMovements.length).toBe(2);
      c.payableMovementSearch = 'ib01';
      expect(c.filteredPayableMovements).toEqual([{ movementId: '1', sourceTransactionRef: 'IB01' }]);
    });

    it('filteredPayableMovements: a movement missing sourceTransactionRef falls back to "" for the search comparison instead of crashing', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.payableMovements = [{ movementId: '1' }, { movementId: '2', sourceTransactionRef: 'IB02' }];
      c.payableMovementSearch = 'ib';
      expect(c.filteredPayableMovements).toEqual([{ movementId: '2', sourceTransactionRef: 'IB02' }]);
    });

    it('catalogPendingHint returns "" outside payExistingUtilize, or with no/zero pending, and formats single vs multiple pending with thousands separators', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.catalogPendingHint(contract())).toBe('');

      c.selectFunction(fn('A4'));
      expect(c.catalogPendingHint(contract({ balanceContractId: 'no-snap' }))).toBe('');

      (c as any).catalogSnapshots.set('zero', snapshot({ pendingEarmarkTotal: '0' }));
      expect(c.catalogPendingHint(contract({ balanceContractId: 'zero' }))).toBe('');

      (c as any).catalogSnapshots.set('one', snapshot({ pendingEarmarkTotal: '-1234567.89' }));
      (c as any).catalogPayableIbs.set('one', ['IB01']);
      expect(c.catalogPendingHint(contract({ balanceContractId: 'one' }))).toBe(' — Pending: 1,234,567.89');

      (c as any).catalogSnapshots.set('many', snapshot({ pendingEarmarkTotal: '-5000' }));
      (c as any).catalogPayableIbs.set('many', ['IB01', 'IB02']);
      expect(c.catalogPendingHint(contract({ balanceContractId: 'many' }))).toBe(' — Total Pending: 5,000');
    });

    it('displayStatus relabels RELEASED to Approved and passes every other status through unchanged', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.displayStatus('RELEASED')).toBe('Approved');
      expect(c.displayStatus('PENDING')).toBe('PENDING');
      expect(c.displayStatus('REJECTED')).toBe('REJECTED');
    });
  });

  describe('arrivalSgRedeem* getters (A3S)', () => {
    it('are all null with no SG snapshot loaded', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.arrivalSgRedeemAmount).toBeNull();
      expect(c.arrivalSgRedeemType).toBeNull();
      expect(c.arrivalSgRemaining).toBeNull();
    });

    it('are null when a snapshot is loaded but Bill Amount is blank, zero, negative, or non-numeric', () => {
      const c = new TransactionBuilderComponent(mockApi());
      (c as any).arrivalSgSnapshot = snapshot({ confirmedBalance: '1000' });
      for (const bad of ['', '0', '-5', 'abc']) {
        c.model.amount = bad;
        expect(c.arrivalSgRedeemAmount).toBeNull();
      }
    });

    it('computes MIN(Bill Amount, SG outstanding), FULL_REDEEM when it fully covers, and the correct remaining balance', () => {
      const c = new TransactionBuilderComponent(mockApi());
      (c as any).arrivalSgSnapshot = snapshot({ confirmedBalance: '1000' });

      c.model.amount = '400';
      expect(c.arrivalSgRedeemAmount).toBe('400');
      expect(c.arrivalSgRedeemType).toBe('PARTIAL_REDEEM');
      expect(c.arrivalSgRemaining).toBe('600');

      c.model.amount = '5000';
      expect(c.arrivalSgRedeemAmount).toBe('1000');
      expect(c.arrivalSgRedeemType).toBe('FULL_REDEEM');
      expect(c.arrivalSgRemaining).toBe('0');
    });
  });

  describe('IB Index / context / checker getters', () => {
    it('filteredIbIndexCatalog: passthrough for a non-decreasing movementType, filters 0-balance for a decreasing one', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A1'));
      c.ibIndexCatalog = [contract({ balanceContractId: 'x' })];
      expect(c.filteredIbIndexCatalog).toEqual(c.ibIndexCatalog);

      const c2 = new TransactionBuilderComponent(mockApi());
      c2.selectFunction(fn('A7'));
      c2.model.movementType = 'FULL_SETTLE';
      c2.ibIndexCatalog = [contract({ balanceContractId: 'zero' }), contract({ balanceContractId: 'nonzero' })];
      (c2 as any).ibIndexSnapshots.set('zero', snapshot({ availableBalance: '0' }));
      (c2 as any).ibIndexSnapshots.set('nonzero', snapshot({ availableBalance: '10' }));
      expect(c2.filteredIbIndexCatalog.map((x) => x.balanceContractId)).toEqual(['nonzero']);
    });

    it('lcNumberFromParent / contextLcNumber across every picker shape: parent (A6), freely-typed (A1), two-field search (A7), flat catalog', () => {
      const cParent = new TransactionBuilderComponent(mockApi());
      cParent.selectFunction(fn('A6'));
      cParent.selectedParent = contract({ naturalKey: { lcNumber: 'PARENT01' } });
      expect(cParent.lcNumberFromParent).toBe(true);
      expect(cParent.contextLcNumber).toBe('PARENT01');

      const cTyped = new TransactionBuilderComponent(mockApi());
      cTyped.selectFunction(fn('A1'));
      cTyped.naturalKey.lcNumber = 'TYPED01';
      expect(cTyped.lcNumberFromParent).toBe(false);
      expect(cTyped.contextLcNumber).toBe('TYPED01');
      cTyped.naturalKey.lcNumber = '';
      expect(cTyped.contextLcNumber).toBeNull();

      const cSearch = new TransactionBuilderComponent(mockApi());
      cSearch.selectFunction(fn('A7'));
      cSearch.subChoiceValue = 'FULL_SETTLE';
      cSearch.onSubChoice(); // resolves model.instrumentType/movementType so usesTwoFieldSearch turns true
      cSearch.searchNaturalKey.lcNumber = 'SEARCHED01';
      expect(cSearch.contextLcNumber).toBe('SEARCHED01');
      cSearch.selectedContract = contract({ naturalKey: { lcNumber: 'RESOLVED01' } });
      expect(cSearch.contextLcNumber).toBe('RESOLVED01');

      const cFlat = new TransactionBuilderComponent(mockApi());
      cFlat.selectFunction(fn('A3'));
      expect(cFlat.contextLcNumber).toBeNull();
      cFlat.selectedContract = contract({ naturalKey: { lcNumber: 'FLAT01' } });
      expect(cFlat.contextLcNumber).toBe('FLAT01');
    });

    it('contextSecondaryRef: null with no secondary field, then reads typed/search/resolved values for an ibNumber-bearing function (A7)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A1'));
      expect(c.contextSecondaryRef).toBeNull();

      const c2 = new TransactionBuilderComponent(mockApi());
      c2.selectFunction(fn('A6'));
      c2.naturalKey.ibNumber = 'IB-TYPED';
      expect(c2.contextSecondaryRef).toBe('IB-TYPED');

      const c3 = new TransactionBuilderComponent(mockApi());
      c3.selectFunction(fn('A7'));
      c3.subChoiceValue = 'FULL_SETTLE';
      c3.onSubChoice();
      c3.searchNaturalKey.ibNumber = 'IB-SEARCHED';
      expect(c3.contextSecondaryRef).toBe('IB-SEARCHED');
      c3.selectedContract = contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB-RESOLVED' } });
      expect(c3.contextSecondaryRef).toBe('IB-RESOLVED');

      // usesTwoFieldSearch branch, empty searchNaturalKey.ibNumber and no selectedContract resolved yet
      // -> the inner `|| null` fallback, not just the outer `??` one exercised above.
      const c3b = new TransactionBuilderComponent(mockApi());
      c3b.selectFunction(fn('A7'));
      c3b.subChoiceValue = 'FULL_SETTLE';
      c3b.onSubChoice();
      c3b.searchNaturalKey.ibNumber = '';
      expect(c3b.contextSecondaryRef).toBeNull();
    });

    it('searchExistingContract (A7, Acceptance Settlement): a resolved Acceptance with 0 Available Balance reports "<IB label> ... nothing left to settle" (confirmed via the raw branch-hit-count JSON, not just the summary table, that the SG-label/redeem-wording sides were already covered elsewhere and it was specifically the IB-label/settle-wording sides still missing)', () => {
      const foundAcceptance = contract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } });
      const api = mockApi({
        resolveContract: jest.fn(() => of(foundAcceptance)) as any,
        getSnapshot: jest.fn(() => of(snapshot({ availableBalance: '0' }))) as any,
      });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('A7'));
      c.subChoiceValue = 'FULL_SETTLE';
      c.onSubChoice();
      c.searchNaturalKey = { lcNumber: 'S001', ibNumber: 'IB01', sgNumber: '' };
      c.searchExistingContract();
      expect(c.searchError).toBe('IB Number IB01 already has a 0 Available Balance — nothing left to settle.');
      expect(c.selectedContract).toBeNull();

      // Final fallback branch: checkerSecondaryField reads selectedFunction.instrumentType (available
      // immediately on selection), but usesTwoFieldSearch reads model.instrumentType (still unset for
      // a subChoice function like A7 until onSubChoice() resolves it) — so right after selectFunction(),
      // before onSubChoice(), neither isCreatingMovement nor usesTwoFieldSearch is true yet, even though
      // checkerSecondaryField already resolved to 'ibNumber'.
      const c5 = new TransactionBuilderComponent(mockApi());
      c5.selectFunction(fn('A7'));
      expect(c5.checkerSecondaryField).toBe('ibNumber');
      expect(c5.usesTwoFieldSearch).toBe(false);
      expect(c5.contextSecondaryRef).toBeNull();
      c5.selectedContract = contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB-FALLBACK' } });
      expect(c5.contextSecondaryRef).toBe('IB-FALLBACK');
    });

    it('checkerContractId / checkerSecondaryField / checkerSecondaryLabel', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.checkerContractId).toBeNull();
      expect(c.checkerSecondaryField).toBeNull();

      c.selectFunction(fn('A8')); // SHGT -> sgNumber
      expect(c.checkerSecondaryField).toBe('sgNumber');
      expect(c.checkerSecondaryLabel).toBe('SG Number');

      const c2 = new TransactionBuilderComponent(mockApi());
      c2.selectFunction(fn('A6')); // IPLC_ACCEPTANCE -> ibNumber, "IB Number"
      expect(c2.checkerSecondaryField).toBe('ibNumber');
      expect(c2.checkerSecondaryLabel).toBe('IB Number');

      const c3 = new TransactionBuilderComponent(mockApi());
      c3.selectFunction(fn('B4')); // EPLC_ACCEPTANCE reachable via B4's own instrumentType? use B5 which is EPLC_ACCEPTANCE
      const c4 = new TransactionBuilderComponent(mockApi());
      c4.selectFunction(fn('B5')); // EPLC_ACCEPTANCE -> ibNumber, "EB Number"
      expect(c4.checkerSecondaryField).toBe('ibNumber');
      expect(c4.checkerSecondaryLabel).toBe('EB Number');

      (c3 as any).checkerContract = contract({ balanceContractId: 'ctx-1' });
      expect(c3.checkerContractId).toBe('ctx-1');
    });

    it('isCheckerCompoundOwnSubmission / checkerActionInFlight / isArrivalAcknowledgmentStep / checkerActionButtonLabel', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.isCheckerCompoundOwnSubmission).toBe(false);
      expect(c.checkerActionInFlight).toBe(false);
      expect(c.isArrivalAcknowledgmentStep).toBe(false);
      expect(c.checkerActionButtonLabel).toBe('Release');

      c.checkerBusy = true;
      expect(c.checkerActionInFlight).toBe(true);
      expect(c.checkerActionButtonLabel).toBe('Working…');
      c.checkerBusy = false;

      (c as any).actionBusy = true;
      expect(c.checkerActionInFlight).toBe(true);
      (c as any).actionBusy = false;

      // isCheckerCompoundOwnSubmission: movementId must match submitResult's, and the function must be compound
      c.selectFunction(fn('A3S')); // documentArrivalWithSg
      (c as any).selectedCheckerMovement = { movementId: 'm-1', movementType: 'UTILIZE' };
      (c as any).submitResult = { movementId: 'm-1' };
      expect(c.isCheckerCompoundOwnSubmission).toBe(true);
      expect(c.isArrivalAcknowledgmentStep).toBe(true);
      expect(c.checkerActionButtonLabel).toBe('Release (Shipping Guarantee redemption)');

      // mismatched movementId -> false
      (c as any).submitResult = { movementId: 'other' };
      expect(c.isCheckerCompoundOwnSubmission).toBe(false);

      // no selectedCheckerMovement -> false
      (c as any).selectedCheckerMovement = null;
      expect(c.isCheckerCompoundOwnSubmission).toBe(false);

      // createsIssuingBankReceivableOnHonour's own branch (movementType === 'HONOUR') sits behind the
      // settlesDocumentArrival/documentArrivalWithSg check above, which always wins first. In the real
      // registry every function carrying createsIssuingBankReceivableOnHonour (only B4) also carries
      // settlesDocumentArrival, so that branch is unreachable via any real function object — exercise it
      // directly via a synthetic variant with the earlier flags stripped, same pattern used elsewhere in
      // this file for other doc-comment-confirmed "unreachable in practice" branches.
      const syntheticB4: TransactionFunction = { ...fn('B4'), settlesDocumentArrival: false, documentArrivalWithSg: false };
      const c2 = new TransactionBuilderComponent(mockApi());
      c2.selectFunction(syntheticB4);
      (c2 as any).selectedCheckerMovement = { movementId: 'm-2', movementType: 'ACCEPT' };
      (c2 as any).submitResult = { movementId: 'm-2' };
      expect(c2.isCheckerCompoundOwnSubmission).toBe(false);
      (c2 as any).selectedCheckerMovement = { movementId: 'm-2', movementType: 'HONOUR' };
      expect(c2.isCheckerCompoundOwnSubmission).toBe(true);

      // plain, non-compound function -> false
      const c3 = new TransactionBuilderComponent(mockApi());
      c3.selectFunction(fn('A1'));
      (c3 as any).selectedCheckerMovement = { movementId: 'm-3', movementType: 'ISSUE' };
      (c3 as any).submitResult = { movementId: 'm-3' };
      expect(c3.isCheckerCompoundOwnSubmission).toBe(false);
      expect(c3.checkerActionButtonLabel).toBe('Release');

      // isArrivalAcknowledgmentStep also fires for plain A3 (deferSettlement), independent of compound status
      const c4 = new TransactionBuilderComponent(mockApi());
      c4.selectFunction(fn('A3'));
      (c4 as any).selectedCheckerMovement = { movementId: 'm-4', movementType: 'UTILIZE' };
      expect(c4.isArrivalAcknowledgmentStep).toBe(true);
      expect(c4.checkerActionButtonLabel).toBe('Approve (acknowledgment only)');

      // Neither deferSettlement nor documentArrivalWithSg set (A1) -> false, even with a UTILIZE-typed
      // selectedCheckerMovement — both `||` operands must actually be evaluated and found falsy here,
      // not just short-circuited true by an earlier one as in the A3/A3S cases above.
      const c5 = new TransactionBuilderComponent(mockApi());
      c5.selectFunction(fn('A1'));
      (c5 as any).selectedCheckerMovement = { movementId: 'm-5', movementType: 'UTILIZE' };
      expect(c5.isArrivalAcknowledgmentStep).toBe(false);
    });
  });

  describe('remaining small default-value (??/||) branch gaps found in the full combined coverage run', () => {
    it('loadPayableIbHints/flattenedPayableRows: a pending movement missing sourceTransactionRef falls back to the "(no IB Number)" label and empty-string sort key (two same-LC-number rows, to force the sort comparator to actually run)', () => {
      const twoContracts = [
        contract({ balanceContractId: 'bc-1', naturalKey: { lcNumber: 'S001' } }),
        contract({ balanceContractId: 'bc-2', naturalKey: { lcNumber: 'S001' } }),
      ];
      const api = mockApi({
        catalog: jest.fn(() => of({ items: twoContracts, total: 2, page: 1, pageSize: 10 })) as any,
        listMovements: jest.fn(() => of([{ status: 'PENDING', movementType: 'UTILIZE' }])) as any, // no sourceTransactionRef, on every contract
      });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('A4'));
      c.onCatalogSearch();
      expect(c.catalogPayableIbs.get('bc-1')).toEqual(['(no IB Number)']);
      const rows = c.flattenedPayableRows;
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.movement.sourceTransactionRef === undefined)).toBe(true);
    });

    it('flattenedPayableRows: a filtered catalog contract with no entry in catalogPayableMovements contributes zero rows (the Map.get() ?? [] fallback)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A4'));
      c.catalogContracts = [contract({ balanceContractId: 'no-movements' })];
      // catalogPayableMovements deliberately left empty for this contract.
      expect(c.flattenedPayableRows).toEqual([]);
    });

    it('onSelectPayMovement (B4): a picked movement missing sourceTransactionRef falls back to empty-string IB Number / secondaryRef', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('B4')); // settlesDocumentArrival + secondaryRefLabel: 'EB Number'
      c.payableMovements = [{ movementId: 'm-1', amount: '5000' }]; // no sourceTransactionRef
      c.onSelectPayMovement('m-1');
      expect(c.naturalKey.ibNumber).toBe('');
      expect(c.model.secondaryRef).toBe('');
      expect(c.model.amount).toBe('5000');
    });

    it('filteredCatalogContracts: the tenorFilter ternary\'s USANCE side (as opposed to A4\'s SIGHT side already covered elsewhere)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A7')); // catalogTenorFilter: 'USANCE' — exercised directly against the getter,
      // independent of A7's normal two-field-search flow (which never populates catalogContracts itself).
      c.catalogContracts = [
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'usance', tenorType: 'BUYERS_USANCE' }),
      ];
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['usance']);
    });

    it('searchExistingContract (B5): a truthy searchNaturalKey.ibNumber is sent as-is, not defaulted to null', () => {
      // Errors deliberately, not a success — a success `next:` path also calls syncCheckerToContext()
      // (a separate, unrelated resolveContract call via searchCheckerLc()), which would inflate the
      // call count this test is checking; the error path keeps this test focused on the one call under
      // test, same convention the rest of this describe block already uses.
      const resolveContractSpy: jest.Mock = jest.fn(() => throwError(() => ({ error: { message: 'miss' } })));
      const api = mockApi({ resolveContract: resolveContractSpy as any });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('B5'));
      c.searchNaturalKey = { lcNumber: 'S001', ibNumber: 'IB-PRESENT', sgNumber: '' };
      c.searchExistingContract();
      expect(resolveContractSpy.mock.calls.length).toBe(1);
      const naturalKeyArg = resolveContractSpy.mock.calls[0][1];
      expect(naturalKeyArg.ibNumber).toBe('IB-PRESENT');
    });

    it('searchExistingContract: a resolveContract error clears selectedContract/snapshot and sets searchError, with no retry (Quality-report-balance.md BAL-101 — a previously-implemented dual-instrument-fallback retry was removed as dead code, since no registry function ever set the field it depended on; searchExistingContract() now always has exactly one resolveContract call, success or failure)', () => {
      const resolveContractSpy: jest.Mock = jest.fn(() => throwError(() => ({ error: { message: 'not found' } })));
      const api = mockApi({ resolveContract: resolveContractSpy as any });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('B5'));
      c.searchNaturalKey = { lcNumber: 'S001', ibNumber: 'IB01', sgNumber: '' };
      c.selectedContract = contract(); // must be cleared by the error handler
      c.searchExistingContract();

      expect(resolveContractSpy.mock.calls.length).toBe(1);
      expect(c.selectedContract).toBeNull();
      expect(c.selectedContractSnapshot).toBeNull();
      expect(c.searchError).toBe('not found');
    });

    it('payExisting(): a release() error lacking err.error.message falls back to String(err)', () => {
      const api = mockApi({ release: jest.fn(() => throwError(() => 'plain string failure')) as any });
      const c = new TransactionBuilderComponent(api);
      c.selectedPayMovement = { movementId: 'm-1' } as any;
      c.payExisting();
      expect(c.submitError).toBe('plain string failure');
    });
  });

  describe('error-callback branches inside onSelectContract\'s helper chain', () => {
    it('loadSgsForArrival: a catalog() error clears loading/list state (A3S)', () => {
      const api = mockApi({ catalog: jest.fn(() => throwError(() => new Error('boom'))) as any });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('A3S'));
      // onSelectContract() itself re-resolves selectedContract from catalogContracts by id — must be
      // populated first, or the lookup falls back to null and loadSgsForArrival() short-circuits on
      // its own `if (!lcNumber) return;` guard before ever reaching the catalog() call under test.
      c.catalogContracts = [contract({ balanceContractId: 'bc-1', naturalKey: { lcNumber: 'S001' } })];
      c.onSelectContract('bc-1');
      expect(c.sgsForArrivalLoading).toBe(false);
      expect(c.sgsForArrival).toEqual([]);
    });

    it('loadSgsForArrival: no lcNumber to search on (selectedContract never resolved) -> early return, no catalog() call at all', () => {
      const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 50 }));
      const api = mockApi({ catalog: catalogSpy as any });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('A3S'));
      catalogSpy.mockClear(); // selectFunction()'s own reloadCatalog() already called it once, unrelated to this guard
      c.catalogContracts = []; // picking an id that matches nothing leaves selectedContract null
      c.onSelectContract('does-not-exist');
      expect(c.sgsForArrivalLoading).toBe(false);
      expect(c.sgsForArrival).toEqual([]);
      expect(catalogSpy).not.toHaveBeenCalled();
    });

    it('loadPayableMovements: a listMovements() error clears loading/list state (A4)', () => {
      const api = mockApi({
        catalog: jest.fn(() => of({ items: [contract({ balanceContractId: 'bc-1' })], total: 1, page: 1, pageSize: 10 })) as any,
        listMovements: jest.fn(() => throwError(() => new Error('boom'))) as any,
      });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('A4'));
      c.catalogContracts = [contract({ balanceContractId: 'bc-1' })];
      c.onSelectContract('bc-1');
      expect(c.payableMovementsLoading).toBe(false);
      expect(c.payableMovements).toEqual([]);
    });

    it('loadPayableMovementsAcrossChildContracts (B4): no lcNumber at all -> clears payableMovements without calling the API', () => {
      const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const api = mockApi({ catalog: catalogSpy as any });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('B4'));
      // No selectedContract/selectedParent set at all, so lcNumber resolves to undefined.
      // (selectFunction()/its own reloadCatalog() call already invoked catalogSpy once for the
      // ordinary LC Index — that's unrelated to the guard under test, so only the call SHAPE, not
      // the call count, distinguishes this method's own would-be pageSize-50 child-contract lookup.)
      catalogSpy.mockClear();
      (c as any).loadPayableMovementsAcrossChildContracts(fn('B4').payableMovementInstrumentType!);
      expect(c.payableMovements).toEqual([]);
      expect(catalogSpy).not.toHaveBeenCalled();
    });

    it('loadPayableMovementsAcrossChildContracts (B4): a listMovements() failure for one child contract is swallowed (catchError -> []), an outer catalog() failure clears loading/list state', () => {
      const child = contract({ balanceContractId: 'child-1', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'EB01' } });
      const api = mockApi({
        catalog: jest.fn(() => of({ items: [child], total: 1, page: 1, pageSize: 50 })) as any,
        listMovements: jest.fn(() => throwError(() => new Error('boom'))) as any,
      });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('B4'));
      c.selectedContract = contract({ naturalKey: { lcNumber: 'S001' } });
      (c as any).loadPayableMovementsAcrossChildContracts(fn('B4').payableMovementInstrumentType!);
      expect(c.payableMovementsLoading).toBe(false);
      expect(c.payableMovements).toEqual([]);

      const apiErr = mockApi({ catalog: jest.fn(() => throwError(() => new Error('boom'))) as any });
      const c2 = new TransactionBuilderComponent(apiErr);
      c2.selectFunction(fn('B4'));
      c2.selectedContract = contract({ naturalKey: { lcNumber: 'S001' } });
      (c2 as any).loadPayableMovementsAcrossChildContracts(fn('B4').payableMovementInstrumentType!);
      expect(c2.payableMovementsLoading).toBe(false);
      expect(c2.payableMovements).toEqual([]);
    });
  });

  describe('afterResolved()\'s amount-default branches (via onSubChoice, with a contract snapshot already present)', () => {
    it('FULL_SETTLE branch defaults model.amount to the snapshot\'s Available Balance, not Confirmed (A7)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A7'));
      c.selectedContractSnapshot = snapshot({ confirmedBalance: '1000', availableBalance: '750' });
      c.subChoiceValue = 'FULL_SETTLE';
      c.onSubChoice();
      expect(c.model.amount).toBe('750');
    });

    it('autoRedeemType branch defaults model.amount to the snapshot\'s Available Balance (A9-shaped function forced through onSubChoice for direct coverage)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      // A9 has no subChoice in the real registry (fixed FULL_REDEEM) — afterResolved()'s
      // autoRedeemType branch is normally reached via refreshSelectedContractSnapshot() instead.
      // Exercise it directly through the same private path with a synthetic subChoice variant,
      // matching the pattern already used elsewhere in this suite for hard-to-reach symmetry branches.
      const synthetic: TransactionFunction = { ...fn('A9'), subChoice: { key: 'x', label: 'X', options: [{ value: 'FULL_REDEEM', label: 'Full' }] } };
      c.selectFunction(synthetic);
      c.selectedContractSnapshot = snapshot({ confirmedBalance: '1000', availableBalance: '600' });
      c.subChoiceValue = 'FULL_REDEEM';
      c.onSubChoice();
      expect(c.model.amount).toBe('600');
    });

    it('settlesAcceptanceOnMature branch defaults model.amount to the snapshot\'s Available Balance (B5-shaped synthetic, per the field\'s own "unreachable in practice without a subChoice" doc comment)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      const synthetic: TransactionFunction = { ...fn('B5'), subChoice: { key: 'x', label: 'X', options: [{ value: 'FULL_SETTLE', label: 'Full' }] } };
      c.selectFunction(synthetic);
      c.model.instrumentType = 'EPLC_ACCEPTANCE';
      c.selectedContractSnapshot = snapshot({ confirmedBalance: '1000', availableBalance: '300' });
      c.subChoiceValue = 'RECLASSIFY_OUT'; // anything other than FULL_SETTLE, so the first branch doesn't win
      c.onSubChoice();
      expect(c.model.amount).toBe('300');
    });
  });

  describe('rebuildFields()\'s A1/B1 Tenor Days Formly `expressions` callbacks', () => {
    function tenorDaysField(c: TransactionBuilderComponent) {
      const field = c.fields.find((f) => f.key === 'tenorDays');
      if (!field?.expressions) throw new Error('tenorDays field has no expressions — check A1 is unlocked');
      return field.expressions as Record<string, (f: any) => any>;
    }

    it('disables/requires/labels/classes/zeros Tenor Days based on the live Tenor Type value, for A1 with no locked tenor', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A1'));
      const exprs = tenorDaysField(c);

      expect(exprs['props.disabled']({ model: { tenorType: 'SIGHT' } })).toBe(true);
      expect(exprs['props.disabled']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(false);

      expect(exprs['props.required']({ model: { tenorType: 'SIGHT' } })).toBe(false);
      expect(exprs['props.required']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(true);
      expect(exprs['props.required']({ model: {} })).toBe(false);

      expect(exprs['props.min']({ model: { tenorType: 'SIGHT' } })).toBeNull();
      expect(exprs['props.min']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(1);

      expect(exprs['props.label']({ model: { tenorType: 'SIGHT' } })).toBe('Tenor Days (Sight — always 0, protected)');
      expect(exprs['props.label']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe('Tenor Days');

      expect(exprs['className']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe('tb-field--required');
      expect(exprs['className']({ model: { tenorType: 'SIGHT' } })).toBe('');

      expect(exprs['model.tenorDays']({ model: { tenorType: 'SIGHT', tenorDays: 30 } })).toBe(0);
      expect(exprs['model.tenorDays']({ model: { tenorType: 'BUYERS_USANCE', tenorDays: 90 } })).toBe(90);
    });

    it('same expressions are wired for B1 (Confirm LC)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('B1'));
      const exprs = tenorDaysField(c);
      expect(exprs['props.disabled']({ model: { tenorType: 'SIGHT' } })).toBe(true);
    });
  });

  describe('remaining ??-fallback branches found in a follow-up combined-coverage pass (raising the floor from 90% to 95%)', () => {
    it('onSelectParent (A6, tenorTypeOptions): a parent LC with no declared tenorType/tenorDays falls back to undefined, not carrying over a stale value', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A6'));
      c.parentCatalog = [contract({ balanceContractId: 'p1', instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } })]; // no tenorType/tenorDays set
      c.onSelectParent('p1');
      expect(c.model.tenorType).toBeUndefined();
      expect(c.model.tenorDays).toBeUndefined();
    });

    it('onSelectIbIndex: a found contract with no ibNumber on its natural key (e.g. an SHGT row, A8) falls back to "" rather than undefined', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A8'));
      c.ibIndexCatalog = [contract({ balanceContractId: 'ib1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'SG01' } })];
      c.onSelectIbIndex('ib1');
      expect(c.searchNaturalKey.ibNumber).toBe('');
      expect(c.searchNaturalKey.sgNumber).toBe('SG01');
    });
  });
});
