import { of, throwError } from 'rxjs';
import { CheckerPanelComponent } from './checker-panel.component';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement, CatalogPage } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (same house style as `index-picker.component.spec.ts`) —
 * a genuine `@Component`, tested via plain `new CheckerPanelComponent(mockApi)`. The template itself is
 * verified via `ng build`'s strict-template check plus a live in-browser pass.
 */

function fn(code: string): TransactionFunction {
  const found = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === code);
  if (!found) throw new Error(`No TransactionFunction with code "${code}" in the registry`);
  return found;
}

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null },
    status: 'ACTIVE',
    tenorType: null,
    tenorDays: null,
    ...overrides,
  } as BalanceContract;
}

function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'AMEND_INCREASE',
    exposureNature: 'CONTINGENT',
    amount: '1000',
    ceilingAmount: '1000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  } as BalanceMovement;
}

function catalogPage(items: BalanceContract[]): CatalogPage {
  return { items, total: items.length, page: 1, pageSize: 100 };
}

function mockApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    resolveContract: jest.fn(() => of(contract())),
    listMovements: jest.fn(() => of([])),
    catalog: jest.fn(() => of(catalogPage([]))),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

function apiErr(message: string) {
  return throwError(() => ({ error: { message } }));
}

describe('CheckerPanelComponent', () => {
  it('has the documented @Input defaults and initial state', () => {
    const c = new CheckerPanelComponent(mockApi());
    expect(c.selectedFunction).toBeNull();
    expect(c.syncSignal).toBeNull();
    expect(c.resetTrigger).toBeNull();
    expect(c.checkerLcNumber).toBe('');
    expect(c.checkerSecondaryRef).toBe('');
    expect(c.checkerContract).toBeNull();
    expect(c.checkerSearching).toBe(false);
    expect(c.checkerSearchError).toBeNull();
    expect(c.checkerItems).toEqual([]);
    expect(c.checkerLoading).toBe(false);
    expect(c.selectedCheckerMovement).toBeNull();
    expect(c.checkerSecondaryCandidates).toEqual([]);
    expect(c.checkerAutoPickedHint).toBeNull();
  });

  it('exposes movementPicked/queueReloaded/queueLoadSucceeded as EventEmitters', () => {
    const c = new CheckerPanelComponent(mockApi());
    expect(c.movementPicked.emit).toBeInstanceOf(Function);
    expect(c.queueReloaded.emit).toBeInstanceOf(Function);
    expect(c.queueLoadSucceeded.emit).toBeInstanceOf(Function);
  });

  describe('checkerContractId / checkerSecondaryField / checkerSecondaryLabel', () => {
    it('checkerContractId reads the resolved checkerContract', () => {
      const c = new CheckerPanelComponent(mockApi());
      expect(c.checkerContractId).toBeNull();
      c.checkerContract = contract({ balanceContractId: 'ctx-1' });
      expect(c.checkerContractId).toBe('ctx-1');
    });

    it('checkerSecondaryField/Label delegate to function-policy.ts, keyed off selectedFunction', () => {
      const c = new CheckerPanelComponent(mockApi());
      expect(c.checkerSecondaryField).toBeNull();

      c.selectedFunction = fn('A8'); // SHGT -> sgNumber
      expect(c.checkerSecondaryField).toBe('sgNumber');
      expect(c.checkerSecondaryLabel).toBe('SG Number');

      c.selectedFunction = fn('A6'); // IPLC_ACCEPTANCE -> ibNumber, "IB Number"
      expect(c.checkerSecondaryField).toBe('ibNumber');
      expect(c.checkerSecondaryLabel).toBe('IB Number');

      c.selectedFunction = fn('B5'); // EPLC_ACCEPTANCE -> ibNumber, "EB Number"
      expect(c.checkerSecondaryField).toBe('ibNumber');
      expect(c.checkerSecondaryLabel).toBe('EB Number');
    });
  });

  // Thin delegation to the shared displayMovementType()/displayMovementAmount() pure functions.
  describe('displayMovementType / displayMovementAmount', () => {
    it('reads instrumentType off checkerContract, relabeling a negative B2 (EPLC_CONFIRMATION/AMEND) amount as AMEND_DECREASE with the de-signed magnitude', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract({ instrumentType: 'EPLC_CONFIRMATION' });
      expect(c.displayMovementType('AMEND', '-7000')).toBe('AMEND_DECREASE');
      expect(c.displayMovementAmount('AMEND', '-7000')).toBe('7000');
    });

    it('passes every other (instrumentType, movementType) pair through unchanged, and handles a null checkerContract gracefully', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract({ instrumentType: 'IPLC_LC' });
      expect(c.displayMovementType('ISSUE', '5000')).toBe('ISSUE');
      expect(c.displayMovementAmount('ISSUE', '5000')).toBe('5000');
      c.checkerContract = null;
      expect(c.displayMovementType('ISSUE', '5000')).toBe('ISSUE');
    });
  });

  // Business-reported gap 2026-08-27: this row-sub label was a hardcoded "earmarked" literal for every
  // function, including A4/A6/B4 (Final-Processing, never Earmarking) — see CLAUDE.md's own "LC Balance
  // Status Rules" entry for the underlying EARMARKING/EARMARKED-vs-PENDING/APPROVED rule this now follows.
  describe('checkerRowVerb()', () => {
    it('reads "earmarked" for an Earmarking Function\'s own shape (A3/A3S: IPLC_LC/UTILIZE)', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract({ instrumentType: 'IPLC_LC' });
      expect(c.checkerRowVerb('UTILIZE')).toBe('earmarked');
    });

    it('reads "earmarked" for B3\'s own shape (EPLC_EXAMINATION/CREATE)', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract({ instrumentType: 'EPLC_EXAMINATION' });
      expect(c.checkerRowVerb('CREATE')).toBe('earmarked');
    });

    it('reads "submitted" for a Final-Processing Function\'s own shape (A6: IPLC_ACCEPTANCE/CREATE) — the reported gap', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract({ instrumentType: 'IPLC_ACCEPTANCE' });
      expect(c.checkerRowVerb('CREATE')).toBe('submitted');
    });

    it('reads "submitted" for a plain function (A1: IPLC_LC/ISSUE) and handles a null checkerContract gracefully', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract({ instrumentType: 'IPLC_LC' });
      expect(c.checkerRowVerb('ISSUE')).toBe('submitted');
      c.checkerContract = null;
      expect(c.checkerRowVerb('UTILIZE')).toBe('submitted');
    });
  });

  describe('ngOnChanges()', () => {
    it('resetTrigger: does nothing on the first change (initial binding), calls resetPanel() on a later change', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract();
      c.checkerItems = [movement()];
      c.selectedCheckerMovement = movement();
      c.checkerSecondaryCandidates = [contract({ balanceContractId: 'sg-1' })];
      c.checkerAutoPickedHint = 'stale hint';

      c.ngOnChanges({ resetTrigger: { previousValue: undefined, currentValue: 0, firstChange: true, isFirstChange: () => true } });
      expect(c.checkerContract).not.toBeNull(); // unaffected — firstChange is ignored

      c.ngOnChanges({ resetTrigger: { previousValue: 0, currentValue: 1, firstChange: false, isFirstChange: () => false } });
      expect(c.checkerContract).toBeNull();
      expect(c.checkerSearchError).toBeNull();
      expect(c.checkerItems).toEqual([]);
      expect(c.selectedCheckerMovement).toBeNull();
      expect(c.checkerSecondaryCandidates).toEqual([]);
      expect(c.checkerAutoPickedHint).toBeNull();
      // checkerLcNumber is deliberately NOT part of the reset — see resetPanel()'s own doc comment.
      c.checkerLcNumber = 'S001';
      c.ngOnChanges({ resetTrigger: { previousValue: 1, currentValue: 2, firstChange: false, isFirstChange: () => false } });
      expect(c.checkerLcNumber).toBe('S001');
    });

    it('queueRefreshTrigger: does nothing on the first change, reloads the queue in place on a later change when a contract is already resolved', () => {
      const api = mockApi({ listMovements: jest.fn(() => of([movement({ movementId: 'm1' })])) });
      const c = new CheckerPanelComponent(api);
      c.checkerContract = contract({ balanceContractId: 'bc-9' });
      c.checkerLcNumber = 'S001';

      c.ngOnChanges({ queueRefreshTrigger: { previousValue: undefined, currentValue: 0, firstChange: true, isFirstChange: () => true } });
      expect(api.listMovements).not.toHaveBeenCalled();

      c.ngOnChanges({ queueRefreshTrigger: { previousValue: 0, currentValue: 1, firstChange: false, isFirstChange: () => false } });
      expect(api.listMovements).toHaveBeenCalledWith('bc-9');
      // reloads IN PLACE — the search itself (checkerLcNumber) survives, unlike resetTrigger.
      expect(c.checkerLcNumber).toBe('S001');
    });

    it('queueRefreshTrigger: a no-op when no contract is resolved yet — nothing to reload', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.checkerContract = null;

      c.ngOnChanges({ queueRefreshTrigger: { previousValue: 0, currentValue: 1, firstChange: false, isFirstChange: () => false } });

      expect(api.listMovements).not.toHaveBeenCalled();
    });

    it('syncSignal: a non-null change calls syncFromContext() with the signal payload', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A2');
      // Angular sets the bound @Input BEFORE calling ngOnChanges in the same CD cycle — replicate that
      // ordering here (this.syncSignal is what the method body actually reads, not changes[...].currentValue).
      c.syncSignal = { lcNumber: 'LC-SYNC', secondaryRef: null };

      c.ngOnChanges({
        syncSignal: {
          previousValue: null,
          currentValue: c.syncSignal,
          firstChange: true,
          isFirstChange: () => true,
        },
      });

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'LC-SYNC', ibNumber: null, sgNumber: null }, false);
    });

    it('an unrelated change (neither key present) is a no-op', () => {
      const c = new CheckerPanelComponent(mockApi());
      expect(() => c.ngOnChanges({})).not.toThrow();
    });
  });

  describe('syncFromContext()', () => {
    it('does nothing when lcNumber is falsy', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.checkerLcNumber = 'unchanged';

      c.syncFromContext(null, 'IB01');

      expect(c.checkerLcNumber).toBe('unchanged');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('sets checkerLcNumber/checkerSecondaryRef and searches', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A8'); // SHGT -> sgNumber

      c.syncFromContext('S001', 'G01');

      expect(c.checkerLcNumber).toBe('S001');
      expect(c.checkerSecondaryRef).toBe('G01');
      expect(api.resolveContract).toHaveBeenCalledWith('SHGT', { lcNumber: 'S001', ibNumber: null, sgNumber: 'G01' }, false);
    });

    it('defaults secondaryRef to empty string when null', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A2');

      c.syncFromContext('LC1', null);

      expect(c.checkerSecondaryRef).toBe('');
    });
  });

  describe('searchCheckerLc()', () => {
    it('is a no-op (beyond the top-of-method reset) when no function is selected', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = null;
      c.checkerLcNumber = 'LC1';

      expect(() => c.searchCheckerLc()).not.toThrow();
      expect(c.checkerContract).toBeNull();
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires an LC Number', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A2');
      c.checkerLcNumber = '';

      c.searchCheckerLc();

      expect(c.checkerSearchError).toBe('Type an LC Number to search.');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    // Business-reported gap 2026-08-21 ("單獨執行 A9 Checker 輸入LC NUMBER 無法自動找到PENDING交易") —
    // superseded the old blocking "Type a IB/SG Number to search" error: when the secondary field is
    // left blank, searchCheckerLc() now browses every candidate under the LC instead of demanding the
    // Checker already know the exact one. See the searchCheckerCandidatesByLcOnly() describe block below
    // for the 0/1/many-candidate branches.
    it("delegates to searchCheckerCandidatesByLcOnly() (via catalog()), not a blocking error, when the secondary ref is blank", () => {
      const api = mockApi({ catalog: jest.fn(() => of(catalogPage([]))) });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A7'); // IPLC_ACCEPTANCE -> ibNumber
      c.checkerLcNumber = 'LC1';
      c.checkerSecondaryRef = '';

      c.searchCheckerLc();

      expect(api.catalog).toHaveBeenCalledWith('IPLC_ACCEPTANCE', 'ACTIVE', undefined, 1, 100, 'LC1');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('resolves the contract and loads the Checker queue on success (no secondary field needed)', () => {
      const resolved = contract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } });
      const pendingMovement = movement({ movementId: 'M1', status: 'PENDING' });
      const api = mockApi({
        resolveContract: jest.fn(() => of(resolved)),
        listMovements: jest.fn(() => of([pendingMovement, movement({ movementId: 'M2', status: 'RELEASED' })])),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A2');
      c.checkerLcNumber = 'LC1';
      const queueLoadSucceededSpy = jest.fn();
      c.queueLoadSucceeded.subscribe(queueLoadSucceededSpy);

      c.searchCheckerLc();

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'LC1', ibNumber: null, sgNumber: null }, false);
      expect(c.checkerContract?.balanceContractId).toBe('C1');
      expect(c.checkerSearching).toBe(false);
      expect(c.checkerItems).toEqual([pendingMovement]); // loadCheckerQueue() side effect, PENDING-only
      expect(queueLoadSucceededSpy).toHaveBeenCalled();
    });

    it('sends ibNumber (not sgNumber) for an Acceptance-typed function', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A7');
      c.checkerLcNumber = 'LC1';
      c.checkerSecondaryRef = 'IB01';

      c.searchCheckerLc();

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_ACCEPTANCE', { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null }, false);
    });

    // F1 regression (found via live browser testing, not a unit test gap that existed before): A11/B7's
    // whole point is a movement PENDING against an ALREADY-CLOSED contract — the default ACTIVE-only
    // resolveContract() 404s here ("No Logical Contract exists yet for this natural key" even though a
    // genuine PENDING REOPEN existed), silently blocking the Checker from ever finding it.
    it('F1: passes includeAnyStatus=true for A11/B7 (Reopen) — its own target contract is CLOSED, not ACTIVE, while the REOPEN movement is PENDING', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A11');
      c.checkerLcNumber = 'U01';

      c.searchCheckerLc();

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'U01', ibNumber: null, sgNumber: null }, true);
    });

    it('sets checkerSearchError from the server message on a resolve failure', () => {
      const api = mockApi({ resolveContract: jest.fn(() => apiErr('no such SG')) });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A8'); // SHGT -> sgNumber
      c.checkerLcNumber = 'LC1';
      c.checkerSecondaryRef = 'SG01';

      c.searchCheckerLc();

      expect(c.checkerSearchError).toBe('no such SG');
      expect(c.checkerSearching).toBe(false);
      expect(c.checkerContract).toBeNull();
    });

    it('emits movementPicked(null) at its own top-of-method reset, even before knowing the search will succeed', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.selectedFunction = fn('A2');
      c.checkerLcNumber = 'LC1';
      const picked = jest.fn();
      c.movementPicked.subscribe(picked);

      c.searchCheckerLc();

      expect(picked).toHaveBeenCalledWith(null);
    });
  });

  // Business-reported gap 2026-08-21 ("單獨執行 A9 Checker 輸入LC NUMBER 無法自動找到PENDING交易") —
  // A9 (and A6/A7/A8/B3/B4/B5, every function whose instrumentType carries a 2nd natural-key field)
  // no longer needs the Checker to already know the SG/IB Number before searching.
  describe('searchCheckerCandidatesByLcOnly() (LC Number typed, secondary ref left blank — triggered from searchCheckerLc())', () => {
    it('zero candidates: a real error, not a silent empty queue', () => {
      const api = mockApi({ catalog: jest.fn(() => of(catalogPage([]))) });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9'); // SHGT -> sgNumber, "SG Number"
      c.checkerLcNumber = 'LC1';

      c.searchCheckerLc();

      expect(c.checkerSearchError).toBe('No SG Number record with an actionable PENDING item found under this LC.');
      expect(c.checkerContract).toBeNull();
      expect(c.checkerSecondaryCandidates).toEqual([]);
    });

    it('exactly one candidate: auto-resolves, sets checkerAutoPickedHint, and loads its Checker queue — no resolveContract() round trip needed', () => {
      const sole = contract({ balanceContractId: 'sg-1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'G01' } });
      const pendingRedeem = movement({ movementId: 'redeem-1', status: 'PENDING', movementType: 'FULL_REDEEM', balanceContractId: 'sg-1' });
      const api = mockApi({
        catalog: jest.fn(() => of(catalogPage([sole]))),
        listMovements: jest.fn(() => of([pendingRedeem])),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9');
      c.checkerLcNumber = 'LC1';

      c.searchCheckerLc();

      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(c.checkerContract?.balanceContractId).toBe('sg-1');
      expect(c.checkerSecondaryRef).toBe('G01'); // reflects what was auto-picked, not left blank
      expect(c.checkerAutoPickedHint).toBe('Only one SG Number under this LC — picked automatically.');
      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['redeem-1']); // loadCheckerQueue() ran
    });

    it('more than one candidate: surfaces checkerSecondaryCandidates for the user to pick, without resolving a contract yet', () => {
      const g01 = contract({ balanceContractId: 'sg-1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'G01' } });
      const g02 = contract({ balanceContractId: 'sg-2', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'G02' } });
      const api = mockApi({
        catalog: jest.fn(() => of(catalogPage([g01, g02]))),
        listMovements: jest.fn((balanceContractId: string) =>
          of([movement({ movementId: `redeem-${balanceContractId}`, status: 'PENDING', movementType: 'FULL_REDEEM', balanceContractId })]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9');
      c.checkerLcNumber = 'LC1';

      c.searchCheckerLc();

      expect(c.checkerSecondaryCandidates).toEqual([g01, g02]);
      expect(c.checkerContract).toBeNull();
      expect(c.checkerAutoPickedHint).toBeNull();
      expect(api.listMovements).toHaveBeenCalledWith('sg-1');
      expect(api.listMovements).toHaveBeenCalledWith('sg-2');
    });

    it('a candidate with nothing actionable (already earmarked/RELEASED) is excluded — business-reported gap 2026-08-24 ("B3/A3/A3S 單獨使用 Checker，已經 earmarked 的交易不應該再被選出")', () => {
      const eb01 = contract({ balanceContractId: 'exam-1', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S01', ibNumber: 'EB01', sgNumber: null } });
      const eb02 = contract({ balanceContractId: 'exam-2', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S01', ibNumber: 'EB02', sgNumber: null } });
      const api = mockApi({
        catalog: jest.fn(() => of(catalogPage([eb01, eb02]))),
        listMovements: jest.fn((balanceContractId: string) =>
          of([
            movement({
              movementId: `create-${balanceContractId}`,
              movementType: 'CREATE',
              balanceContractId,
              // eb01's own presentation is already Checker-Released (earmarked) — nothing left to approve.
              // eb02's is still genuinely PENDING (EARMARKING) — the only one that should survive.
              status: balanceContractId === 'exam-1' ? 'RELEASED' : 'PENDING',
            }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('B3');
      c.checkerLcNumber = 'S01';

      c.searchCheckerLc();

      expect(api.listMovements).toHaveBeenCalledWith('exam-1');
      expect(api.listMovements).toHaveBeenCalledWith('exam-2');
      // Only one actionable candidate survives -> auto-resolves instead of surfacing a pick-one list.
      expect(c.checkerContract?.balanceContractId).toBe('exam-2');
      expect(c.checkerSecondaryCandidates).toEqual([]);
      expect(c.checkerAutoPickedHint).toBe('Only one IB Number under this LC — picked automatically.');
    });

    it('every candidate already earmarked/RELEASED: the same "no actionable record" error as zero candidates, not a misleading pick-one list', () => {
      const eb01 = contract({ balanceContractId: 'exam-1', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S01', ibNumber: 'EB01', sgNumber: null } });
      const eb02 = contract({ balanceContractId: 'exam-2', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S01', ibNumber: 'EB02', sgNumber: null } });
      const api = mockApi({
        catalog: jest.fn(() => of(catalogPage([eb01, eb02]))),
        listMovements: jest.fn((balanceContractId: string) => of([movement({ movementType: 'CREATE', balanceContractId, status: 'RELEASED' })])),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('B3');
      c.checkerLcNumber = 'S01';

      c.searchCheckerLc();

      expect(c.checkerSearchError).toBe('No IB Number record with an actionable PENDING item found under this LC.');
      expect(c.checkerContract).toBeNull();
      expect(c.checkerSecondaryCandidates).toEqual([]);
    });

    it('a catalog() failure sets checkerSearchError from the server message', () => {
      const api = mockApi({ catalog: jest.fn(() => apiErr('boom')) });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9');
      c.checkerLcNumber = 'LC1';

      c.searchCheckerLc();

      expect(c.checkerSearchError).toBe('boom');
      expect(c.checkerSearching).toBe(false);
    });

    it("a listMovements() failure for one candidate treats that candidate as not-actionable rather than failing the whole search", () => {
      const g01 = contract({ balanceContractId: 'sg-1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'G01' } });
      const g02 = contract({ balanceContractId: 'sg-2', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'G02' } });
      const api = mockApi({
        catalog: jest.fn(() => of(catalogPage([g01, g02]))),
        listMovements: jest.fn((balanceContractId: string) =>
          balanceContractId === 'sg-1'
            ? throwError(() => ({ error: { message: 'boom' } }))
            : of([movement({ movementId: 'redeem-2', status: 'PENDING', movementType: 'FULL_REDEEM', balanceContractId })]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9');
      c.checkerLcNumber = 'LC1';

      c.searchCheckerLc();

      expect(c.checkerContract?.balanceContractId).toBe('sg-2');
      expect(c.checkerAutoPickedHint).toBe('Only one SG Number under this LC — picked automatically.');
    });

    it('a fresh search clears a previous round\'s leftover checkerSecondaryCandidates/checkerAutoPickedHint', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.selectedFunction = fn('A9');
      c.checkerSecondaryCandidates = [contract()];
      c.checkerAutoPickedHint = 'stale hint';
      c.checkerLcNumber = 'LC1';
      c.checkerSecondaryRef = 'G01'; // a direct, non-ambiguous search this time

      c.searchCheckerLc();

      expect(c.checkerSecondaryCandidates).toEqual([]);
      expect(c.checkerAutoPickedHint).toBeNull();
    });
  });

  describe('onSelectSecondaryCandidate()', () => {
    it('resolves the matching candidate, sets checkerSecondaryRef from its own natural key, and loads the Checker queue', () => {
      const g02 = contract({ balanceContractId: 'sg-2', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'G02' } });
      const api = mockApi({ listMovements: jest.fn(() => of([movement({ movementId: 'redeem-1', status: 'PENDING' })])) });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9');
      c.checkerSecondaryCandidates = [contract({ balanceContractId: 'sg-1' }), g02];

      c.onSelectSecondaryCandidate('sg-2');

      expect(c.checkerSecondaryCandidates).toEqual([]);
      expect(c.checkerContract?.balanceContractId).toBe('sg-2');
      expect(c.checkerSecondaryRef).toBe('G02');
      expect(api.listMovements).toHaveBeenCalledWith('sg-2');
    });

    it('an unmatched id clears the candidate list without resolving any contract (defensive — app-index-picker only ever emits an id from the list it was given)', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerSecondaryCandidates = [contract({ balanceContractId: 'sg-1' })];

      c.onSelectSecondaryCandidate('does-not-exist');

      expect(c.checkerSecondaryCandidates).toEqual([]);
      expect(c.checkerContract).toBeNull();
    });
  });

  describe('loadCheckerQueue()', () => {
    it('no-ops (no listMovements call) when there is no checker contract resolved, but still emits the reset events', () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.checkerContract = null;
      const picked = jest.fn();
      const reloaded = jest.fn();
      c.movementPicked.subscribe(picked);
      c.queueReloaded.subscribe(reloaded);

      c.loadCheckerQueue();

      expect(api.listMovements).not.toHaveBeenCalled();
      expect(c.checkerItems).toEqual([]);
      expect(picked).toHaveBeenCalledWith(null);
      expect(reloaded).toHaveBeenCalled();
    });

    it('success: filters to PENDING movements only and emits queueLoadSucceeded', () => {
      const api = mockApi({
        listMovements: jest.fn(() =>
          of([
            movement({ movementId: 'm1', status: 'PENDING' }),
            movement({ movementId: 'm2', status: 'RELEASED' }),
            movement({ movementId: 'm3', status: 'PENDING' }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.checkerContract = contract({ balanceContractId: 'bc-9' });
      const succeeded = jest.fn();
      c.queueLoadSucceeded.subscribe(succeeded);

      c.loadCheckerQueue();

      expect(api.listMovements).toHaveBeenCalledWith('bc-9');
      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['m1', 'm3']);
      expect(c.checkerLoading).toBe(false);
      expect(succeeded).toHaveBeenCalled();
    });

    it('excludes an already-acknowledgedAt UTILIZE while A3 (deferSettlement) is the selected function (restored 2026-08-20 — "A3 A3S 交易 Approve 過後 不要再顯示")', () => {
      const api = mockApi({
        listMovements: jest.fn(() =>
          of([
            movement({ movementId: 'm1', status: 'PENDING', movementType: 'UTILIZE', acknowledgedAt: null }),
            movement({ movementId: 'm2', status: 'PENDING', movementType: 'UTILIZE', acknowledgedAt: '2026-08-20T00:00:00.000Z', acknowledgedBy: 'checker1' }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A3');
      c.checkerContract = contract({ balanceContractId: 'bc-9' });

      c.loadCheckerQueue();

      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['m1']);
    });

    // Bug fixed 2026-08-20 (reviewer-reported live, "A4 SUBMIT後無法APPROVED" — S101 repro): the exact
    // same acknowledged (EARMARKED) UTILIZE A3's own screen hides above is exactly what A4's own Checker
    // search must still find — this shared queue component must NOT apply the exclusion while A4 (or any
    // non-deferSettlement function) is selected.
    it('does NOT exclude an already-acknowledgedAt, already-Maker-Submitted UTILIZE while A4 (not deferSettlement) is the selected function — A4 needs to find it to Release it', () => {
      const api = mockApi({
        listMovements: jest.fn(() =>
          of([
            movement({
              movementId: 'm2',
              status: 'PENDING',
              movementType: 'UTILIZE',
              acknowledgedAt: '2026-08-20T00:00:00.000Z',
              acknowledgedBy: 'checker1',
              makerSubmittedAt: '2026-08-20T01:00:00.000Z',
              makerSubmittedBy: 'maker1',
            }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A4');
      c.checkerContract = contract({ balanceContractId: 'bc-9' });

      c.loadCheckerQueue();

      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['m2']);
    });

    // Business instruction 2026-08-20 ("A4 需要 SUBMIT 後 才能 APPROVE") — an EARMARKED UTILIZE (A3/A3S's
    // own Checker already acknowledged it) must still not appear in A4's own Checker Queue until A4's own
    // Maker has Submitted it — release() already 409s server-side for this (BAL-123), but the item must
    // not even look selectable/approvable before then.
    it('excludes an already-acknowledgedAt UTILIZE that has NOT yet been Maker-Submitted while A4 is the selected function', () => {
      const api = mockApi({
        listMovements: jest.fn(() =>
          of([
            movement({
              movementId: 'earmarked-not-submitted',
              status: 'PENDING',
              movementType: 'UTILIZE',
              acknowledgedAt: '2026-08-20T00:00:00.000Z',
              acknowledgedBy: 'checker1',
              makerSubmittedAt: null,
            }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A4');
      c.checkerContract = contract({ balanceContractId: 'bc-9' });

      c.loadCheckerQueue();

      expect(c.checkerItems).toEqual([]);
    });

    // Business instruction 2026-08-20 ("Import A4 Checker Search 也要濾掉EARMARKING的交易") — the opposite
    // direction of the same split: A4's own Checker Search must exclude a still-EARMARKING (no
    // acknowledgedAt) UTILIZE — genuine 4-eyes, nothing for A4's Checker to Release until A3's own
    // Checker has confirmed it first.
    it('excludes a still-EARMARKING UTILIZE (no acknowledgedAt) while A4 is the selected function', () => {
      const api = mockApi({
        listMovements: jest.fn(() =>
          of([
            movement({ movementId: 'not-yet-acknowledged', status: 'PENDING', movementType: 'UTILIZE', acknowledgedAt: null, makerSubmittedAt: '2026-08-20T01:00:00.000Z' }),
            movement({
              movementId: 'acknowledged',
              status: 'PENDING',
              movementType: 'UTILIZE',
              acknowledgedAt: '2026-08-20T00:00:00.000Z',
              makerSubmittedAt: '2026-08-20T01:00:00.000Z',
            }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A4');
      c.checkerContract = contract({ balanceContractId: 'bc-9' });

      c.loadCheckerQueue();

      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['acknowledged']);
    });

    // Business instruction 2026-08-20 ("各功能 RELEASE 自己產生的 PENDING 或 EARMARKING 交易" — "A2 不該
    // 看到 UTILIZED 交易", the user's own literal example): IPLC_LC is shared by A1/A2/A3/A3S/A4 — without
    // this filter, A2's own Checker Queue would also show an unrelated A3 UTILIZE sitting PENDING on the
    // same LC.
    it("excludes a movementType the selected function couldn't have produced (A2's own queue must not show an A3 UTILIZE on the same LC)", () => {
      const api = mockApi({
        listMovements: jest.fn(() =>
          of([
            movement({ movementId: 'amend-1', status: 'PENDING', movementType: 'AMEND_INCREASE' }),
            movement({ movementId: 'utilize-1', status: 'PENDING', movementType: 'UTILIZE' }),
          ]),
        ),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A2');
      c.checkerContract = contract({ balanceContractId: 'bc-9' });

      c.loadCheckerQueue();

      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['amend-1']);
    });

    it('A9 (movementType placeholder FULL_REDEEM, real value derived) still sees a PARTIAL_REDEEM sitting PENDING on the same SG', () => {
      const api = mockApi({
        listMovements: jest.fn(() => of([movement({ movementId: 'redeem-1', status: 'PENDING', movementType: 'PARTIAL_REDEEM' })])),
      });
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A9');
      c.checkerContract = contract({ balanceContractId: 'bc-9', instrumentType: 'SHGT' });

      c.loadCheckerQueue();

      expect(c.checkerItems.map((m) => m.movementId)).toEqual(['redeem-1']);
    });

    it('error: resets checkerItems to empty and checkerLoading to false, without emitting queueLoadSucceeded', () => {
      const api = mockApi({ listMovements: jest.fn(() => apiErr('NOT_FOUND')) });
      const c = new CheckerPanelComponent(api);
      c.checkerContract = contract({ balanceContractId: 'bc-9' });
      const succeeded = jest.fn();
      c.queueLoadSucceeded.subscribe(succeeded);

      c.loadCheckerQueue();

      expect(c.checkerItems).toEqual([]);
      expect(c.checkerLoading).toBe(false);
      expect(succeeded).not.toHaveBeenCalled();
    });
  });

  describe('onSelectCheckerMovement()', () => {
    it('selects the matching movement and emits it via movementPicked', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerItems = [movement({ movementId: 'm1' }), movement({ movementId: 'm2' })];
      const picked = jest.fn();
      c.movementPicked.subscribe(picked);

      c.onSelectCheckerMovement('m2');

      expect(c.selectedCheckerMovement?.movementId).toBe('m2');
      expect(picked).toHaveBeenCalledWith(c.selectedCheckerMovement);
    });

    it('sets/emits null when the movementId is not found in the current queue', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerItems = [movement({ movementId: 'm1' })];
      const picked = jest.fn();
      c.movementPicked.subscribe(picked);

      c.onSelectCheckerMovement('does-not-exist');

      expect(c.selectedCheckerMovement).toBeNull();
      expect(picked).toHaveBeenCalledWith(null);
    });
  });
});
