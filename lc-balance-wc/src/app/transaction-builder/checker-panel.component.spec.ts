import { of, throwError } from 'rxjs';
import { CheckerPanelComponent } from './checker-panel.component';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';

/**
 * Direct-instantiation, no-TestBed unit tests (same house style as `index-picker.component.spec.ts`/
 * `account-entries-dialog.component.spec.ts`) — a genuine `@Component`, tested via plain `new
 * CheckerPanelComponent(mockApi)`. This file absorbed the behavioral coverage that used to live directly
 * on `TransactionBuilderComponent`'s own spec files (`searchCheckerLc`/`loadCheckerQueue`/
 * `onSelectCheckerMovement` describe blocks, plus the `checkerContractId`/`checkerSecondaryField`/
 * `checkerSecondaryLabel` getter test) before the BAL-003 pilot #2 extraction (2026-08-19,
 * desiger-comments.md) moved that state/logic here — every assertion below reproduces the ORIGINAL
 * test's own expectation, just against the new class. `ngOnChanges()`'s own reactive wiring
 * (`resetTrigger`/`syncSignal`) is new coverage this extraction itself needed — see
 * `CheckerPanelComponent`'s own class doc comment for why a plain method call (`ngOnChanges({...})`),
 * not `TestBed`, is enough to test it directly; the template itself
 * (checker-panel.component.html) is verified via `ng build`'s strict-template check plus a live
 * in-browser pass, same as every other template in this project.
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

function mockApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    resolveContract: jest.fn(() => of(contract())),
    listMovements: jest.fn(() => of([])),
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

  // 2026-08-20, user-directed ("B2 Decrease...Checker 佇列一併統一") — thin delegation to the shared
  // displayMovementType()/displayMovementAmount() pure functions, reading instrumentType off this
  // panel's own single resolved checkerContract (every row in checkerItems belongs to it).
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

  describe('ngOnChanges()', () => {
    it('resetTrigger: does nothing on the first change (initial binding), calls resetPanel() on a later change', () => {
      const c = new CheckerPanelComponent(mockApi());
      c.checkerContract = contract();
      c.checkerItems = [movement()];
      c.selectedCheckerMovement = movement();

      c.ngOnChanges({ resetTrigger: { previousValue: undefined, currentValue: 0, firstChange: true, isFirstChange: () => true } });
      expect(c.checkerContract).not.toBeNull(); // unaffected — firstChange is ignored

      c.ngOnChanges({ resetTrigger: { previousValue: 0, currentValue: 1, firstChange: false, isFirstChange: () => false } });
      expect(c.checkerContract).toBeNull();
      expect(c.checkerSearchError).toBeNull();
      expect(c.checkerItems).toEqual([]);
      expect(c.selectedCheckerMovement).toBeNull();
      // checkerLcNumber is deliberately NOT part of the reset — see resetPanel()'s own doc comment.
      c.checkerLcNumber = 'S001';
      c.ngOnChanges({ resetTrigger: { previousValue: 1, currentValue: 2, firstChange: false, isFirstChange: () => false } });
      expect(c.checkerLcNumber).toBe('S001');
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

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'LC-SYNC', ibNumber: null, sgNumber: null });
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
      expect(api.resolveContract).toHaveBeenCalledWith('SHGT', { lcNumber: 'S001', ibNumber: null, sgNumber: 'G01' });
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

    it("requires the secondary ref (IB/SG Number) when the function's instrumentType has one", () => {
      const api = mockApi();
      const c = new CheckerPanelComponent(api);
      c.selectedFunction = fn('A7'); // IPLC_ACCEPTANCE -> ibNumber
      c.checkerLcNumber = 'LC1';
      c.checkerSecondaryRef = '';

      c.searchCheckerLc();

      expect(c.checkerSearchError).toContain('Type a IB Number to search');
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

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'LC1', ibNumber: null, sgNumber: null });
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

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_ACCEPTANCE', { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null });
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
