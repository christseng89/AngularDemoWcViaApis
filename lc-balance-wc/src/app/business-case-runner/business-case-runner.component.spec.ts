import { of, throwError, Subject } from 'rxjs';
import { BusinessCaseRunnerComponent } from './business-case-runner.component';
import type { BalanceCaseApiService, BusinessCaseRunResult, BusinessCaseSummary, TraceStep } from './balance-case-api.service';

/**
 * Direct-instantiation style (house convention, see lc-payment-wc's own
 * business-case-runner.component.spec.ts) — no DOM rendering needed since
 * this component's own .html template is excluded from the coverage config.
 */
function makeApi(overrides: { listCases?: jest.Mock; runCase?: jest.Mock; resetDatabase?: jest.Mock } = {}) {
  return {
    listCases: overrides.listCases ?? jest.fn(() => of([])),
    runCase: overrides.runCase ?? jest.fn(() => of({} as BusinessCaseRunResult)),
    resetDatabase: overrides.resetDatabase ?? jest.fn(() => of({ status: 'ok' })),
  } as unknown as BalanceCaseApiService;
}

function makeComponent(api: BalanceCaseApiService) {
  return new BusinessCaseRunnerComponent(api);
}

const cases: BusinessCaseSummary[] = [
  { id: 'import-1', title: 'Import LC Case 1', description: 'desc1', stepCount: 3 },
  { id: 'import-2', title: 'Import LC Case 2', description: 'desc2', stepCount: 5 },
];

describe('BusinessCaseRunnerComponent', () => {
  describe('ngOnInit', () => {
    it('populates cases and builds the Formly select field on success', () => {
      const listCases = jest.fn(() => of(cases));
      const api = makeApi({ listCases });
      const component = makeComponent(api);

      component.ngOnInit();

      expect(component.cases).toEqual(cases);
      expect(component.loadError).toBeNull();
      expect(component.fields).toEqual([
        {
          key: 'caseId',
          type: 'select',
          props: {
            label: 'Business Case',
            placeholder: 'Choose a case to run…',
            required: true,
            options: [
              { value: 'import-1', label: 'Import LC Case 1 (3 steps)' },
              { value: 'import-2', label: 'Import LC Case 2 (5 steps)' },
            ],
          },
        },
      ]);
    });

    it('sets loadError from the error message when the request fails', () => {
      const listCases = jest.fn(() => throwError(() => new Error('network down')));
      const api = makeApi({ listCases });
      const component = makeComponent(api);

      component.ngOnInit();

      expect(component.loadError).toBe('Could not reach the 中台 (backend) at /api/business-cases — is it running? network down');
      expect(component.cases).toEqual([]);
      expect(component.fields).toEqual([]);
    });

    it('falls back to the raw error value when it has no .message', () => {
      const listCases = jest.fn(() => throwError(() => 'boom'));
      const api = makeApi({ listCases });
      const component = makeComponent(api);

      component.ngOnInit();

      expect(component.loadError).toBe('Could not reach the 中台 (backend) at /api/business-cases — is it running? boom');
    });
  });

  describe('run', () => {
    it('does nothing when model.caseId is falsy', () => {
      const runCase = jest.fn(() => of({} as BusinessCaseRunResult));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.model = {};

      component.run();

      expect(runCase).not.toHaveBeenCalled();
      expect(component.running).toBe(false);
    });

    it('sets result and clears running on success', () => {
      const result: BusinessCaseRunResult = { id: 'import-1', title: 'Import LC Case 1', description: 'd', trace: [] };
      const runCase = jest.fn(() => of(result));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.model = { caseId: 'import-1' };

      component.run();

      expect(runCase).toHaveBeenCalledWith('import-1');
      expect(component.result).toEqual(result);
      expect(component.running).toBe(false);
    });

    it('clears running and sets loadError on failure', () => {
      const runCase = jest.fn(() => throwError(() => new Error('server exploded')));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.model = { caseId: 'import-1' };

      component.run();

      expect(component.running).toBe(false);
      expect(component.loadError).toBe('Run failed: server exploded');
    });

    it('falls back to the raw error value when it has no .message', () => {
      const runCase = jest.fn(() => throwError(() => 'plain string failure'));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.model = { caseId: 'import-1' };

      component.run();

      expect(component.running).toBe(false);
      expect(component.loadError).toBe('Run failed: plain string failure');
    });

    it('starts running=true and clears any previous result before the response arrives', () => {
      const subject = new Subject<BusinessCaseRunResult>();
      const runCase = jest.fn(() => subject.asObservable());
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.model = { caseId: 'import-1' };
      component.result = { id: 'stale', title: 't', description: 'd', trace: [] };

      component.run();

      expect(component.running).toBe(true);
      expect(component.result).toBeNull();
    });
  });

  describe('runAll', () => {
    it('drains all cases sequentially, accumulating into a NEW array each time', () => {
      const result1: BusinessCaseRunResult = { id: 'import-1', title: 'Import LC Case 1', description: 'd', trace: [] };
      const result2: BusinessCaseRunResult = { id: 'import-2', title: 'Import LC Case 2', description: 'd', trace: [] };
      const runCase = jest.fn((id: string) => of(id === 'import-1' ? result1 : result2));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.cases = [...cases];

      const seenArrays: BusinessCaseRunResult[][] = [];
      const originalPush = Array.prototype.push;
      // Snapshot allResults identity after each accumulation by intercepting via a getter spy is
      // overkill here — instead just verify final state plus call ordering/count.
      component.runAll();

      expect(runCase).toHaveBeenCalledTimes(2);
      expect(runCase.mock.calls[0][0]).toBe('import-1');
      expect(runCase.mock.calls[1][0]).toBe('import-2');
      expect(component.allResults).toEqual([result1, result2]);
      expect(component.runningAll).toBe(false);
      expect(component.result).toBeNull();
      void seenArrays;
      void originalPush;
    });

    it('replaces allResults with a new array reference on each accumulation, never mutating in place', () => {
      const result1: BusinessCaseRunResult = { id: 'import-1', title: 'Import LC Case 1', description: 'd', trace: [] };
      const result2: BusinessCaseRunResult = { id: 'import-2', title: 'Import LC Case 2', description: 'd', trace: [] };

      // Use Subjects so we can inspect allResults' identity between the two emissions.
      const subject1 = new Subject<BusinessCaseRunResult>();
      const subject2 = new Subject<BusinessCaseRunResult>();
      const runCase = jest.fn((id: string) => (id === 'import-1' ? subject1.asObservable() : subject2.asObservable()));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.cases = [...cases];

      component.runAll();
      const arrayBeforeFirstEmit = component.allResults;
      expect(arrayBeforeFirstEmit).toEqual([]);

      subject1.next(result1);
      const arrayAfterFirstEmit = component.allResults;
      expect(arrayAfterFirstEmit).toEqual([result1]);
      expect(arrayAfterFirstEmit).not.toBe(arrayBeforeFirstEmit);

      subject2.next(result2);
      const arrayAfterSecondEmit = component.allResults;
      expect(arrayAfterSecondEmit).toEqual([result1, result2]);
      expect(arrayAfterSecondEmit).not.toBe(arrayAfterFirstEmit);
    });

    it('stops on the first error, sets loadError, and never calls runCase for remaining cases', () => {
      const result1: BusinessCaseRunResult = { id: 'import-1', title: 'Import LC Case 1', description: 'd', trace: [] };
      const runCase = jest.fn((id: string) => (id === 'import-1' ? of(result1) : throwError(() => new Error('case 2 blew up'))));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.cases = [...cases, { id: 'import-3', title: 'Import LC Case 3', description: 'd', stepCount: 1 }];

      component.runAll();

      expect(runCase).toHaveBeenCalledTimes(2);
      expect(runCase).not.toHaveBeenCalledWith('import-3');
      expect(component.allResults).toEqual([result1]);
      expect(component.loadError).toBe('Run failed on import-2: case 2 blew up');
      expect(component.runningAll).toBe(false);
    });

    it('falls back to the raw error value when it has no .message', () => {
      const runCase = jest.fn(() => throwError(() => 'plain string failure'));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.cases = [cases[0]];

      component.runAll();

      expect(component.loadError).toBe('Run failed on import-1: plain string failure');
      expect(component.runningAll).toBe(false);
    });

    it('sets runningAll=false immediately when there are no cases to run', () => {
      const runCase = jest.fn(() => of({} as BusinessCaseRunResult));
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.cases = [];

      component.runAll();

      expect(runCase).not.toHaveBeenCalled();
      expect(component.runningAll).toBe(false);
      expect(component.allResults).toEqual([]);
    });

    it('starts runningAll=true and clears prior allResults/result before running', () => {
      const subject = new Subject<BusinessCaseRunResult>();
      const runCase = jest.fn(() => subject.asObservable());
      const api = makeApi({ runCase });
      const component = makeComponent(api);
      component.cases = [cases[0]];
      component.allResults = [{ id: 'stale', title: 't', description: 'd', trace: [] }];
      component.result = { id: 'stale', title: 't', description: 'd', trace: [] };

      component.runAll();

      expect(component.runningAll).toBe(true);
      expect(component.allResults).toEqual([]);
      expect(component.result).toBeNull();
    });
  });

  describe('resetDatabase', () => {
    let confirmSpy: jest.SpyInstance;

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it('does nothing and never calls the API when the confirm dialog is declined', () => {
      confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      const resetDatabase = jest.fn(() => of({ status: 'ok' }));
      const api = makeApi({ resetDatabase });
      const component = makeComponent(api);

      component.resetDatabase();

      expect(resetDatabase).not.toHaveBeenCalled();
      expect(component.resettingDatabase).toBe(false);
    });

    it('calls the API and sets a confirmation message on success when the confirm dialog is accepted', () => {
      confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const resetDatabase = jest.fn(() => of({ status: 'ok' }));
      const api = makeApi({ resetDatabase });
      const component = makeComponent(api);

      component.resetDatabase();

      expect(resetDatabase).toHaveBeenCalledTimes(1);
      expect(component.resettingDatabase).toBe(false);
      expect(component.resetDatabaseMessage).toBe('Database tables cleaned up.');
    });

    it('sets resettingDatabase=true and clears any previous message before the response arrives', () => {
      confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const subject = new Subject<{ status: string }>();
      const resetDatabase = jest.fn(() => subject.asObservable());
      const api = makeApi({ resetDatabase });
      const component = makeComponent(api);
      component.resetDatabaseMessage = 'stale message';

      component.resetDatabase();

      expect(component.resettingDatabase).toBe(true);
      expect(component.resetDatabaseMessage).toBeNull();
    });

    it('clears resettingDatabase and sets an error message on failure', () => {
      confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const resetDatabase = jest.fn(() => throwError(() => new Error('microservice down')));
      const api = makeApi({ resetDatabase });
      const component = makeComponent(api);

      component.resetDatabase();

      expect(component.resettingDatabase).toBe(false);
      expect(component.resetDatabaseMessage).toBe('Cleanup failed: microservice down');
    });

    it('falls back to the raw error value when it has no .message', () => {
      confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const resetDatabase = jest.fn(() => throwError(() => 'plain string failure'));
      const api = makeApi({ resetDatabase });
      const component = makeComponent(api);

      component.resetDatabase();

      expect(component.resetDatabaseMessage).toBe('Cleanup failed: plain string failure');
    });
  });

  describe('rowClass', () => {
    const component = makeComponent(makeApi());

    it("returns 'step-note' for a note step", () => {
      expect(component.rowClass({ type: 'note', label: 'n' })).toBe('step-note');
    });

    it("returns 'step-ok' for an expectedError createMovement that was correctly rejected (ok=false)", () => {
      const step: TraceStep = { type: 'createMovement', label: 'l', expectedError: true, ok: false };
      expect(component.rowClass(step)).toBe('step-ok');
    });

    it("returns 'step-error' for an expectedError createMovement that unexpectedly succeeded (ok=true)", () => {
      const step: TraceStep = { type: 'createMovement', label: 'l', expectedError: true, ok: true };
      expect(component.rowClass(step)).toBe('step-error');
    });

    it("returns 'step-warn' when the response carries warnings", () => {
      const step: TraceStep = { type: 'snapshot', label: 'l', ok: true, response: { warnings: [{ message: 'w' }] } };
      expect(component.rowClass(step)).toBe('step-warn');
    });

    it("returns 'step-error' when ok is false (non-expectedError)", () => {
      const step: TraceStep = { type: 'release', label: 'l', ok: false };
      expect(component.rowClass(step)).toBe('step-error');
    });

    it("returns 'step-ok' when ok is true (non-expectedError)", () => {
      const step: TraceStep = { type: 'release', label: 'l', ok: true };
      expect(component.rowClass(step)).toBe('step-ok');
    });

    it("returns '' when none of the conditions apply", () => {
      const step: TraceStep = { type: 'release', label: 'l' };
      expect(component.rowClass(step)).toBe('');
    });
  });

  describe('statusText', () => {
    const component = makeComponent(makeApi());

    it("returns '—' for a note step", () => {
      expect(component.statusText({ type: 'note', label: 'n' })).toBe('—');
    });

    it("returns 'SKIPPED' for a skipped step", () => {
      const step: TraceStep = { type: 'release', label: 'l', skipped: true };
      expect(component.statusText(step)).toBe('SKIPPED');
    });

    it('returns "<status> WARN" when the response carries warnings', () => {
      const step: TraceStep = { type: 'snapshot', label: 'l', status: 200, response: { warnings: [{ message: 'w' }] } };
      expect(component.statusText(step)).toBe('200 WARN');
    });

    it('returns "<status> OK" when ok is true', () => {
      const step: TraceStep = { type: 'createMovement', label: 'l', status: 201, ok: true };
      expect(component.statusText(step)).toBe('201 OK');
    });

    it('returns "<status> ERROR" when ok is false', () => {
      const step: TraceStep = { type: 'createMovement', label: 'l', status: 409, ok: false };
      expect(component.statusText(step)).toBe('409 ERROR');
    });

    it('trims a leading blank when status is undefined, still showing ERROR', () => {
      const step: TraceStep = { type: 'createMovement', label: 'l' };
      expect(component.statusText(step)).toBe('ERROR');
    });
  });

  describe('detailText', () => {
    const component = makeComponent(makeApi());

    it("returns '' for a note step", () => {
      expect(component.detailText({ type: 'note', label: 'n' })).toBe('');
    });

    it('returns the reason for a skipped step', () => {
      const step: TraceStep = { type: 'release', label: 'l', skipped: true, reason: 'A3 does not call the real release API' };
      expect(component.detailText(step)).toBe('A3 does not call the real release API');
    });

    it("returns '' for a skipped step with no reason", () => {
      const step: TraceStep = { type: 'release', label: 'l', skipped: true };
      expect(component.detailText(step)).toBe('');
    });

    it("returns '' when there is no response at all", () => {
      const step: TraceStep = { type: 'release', label: 'l' };
      expect(component.detailText(step)).toBe('');
    });

    it('returns "code: message" when the response carries an error code', () => {
      const step: TraceStep = {
        type: 'createMovement',
        label: 'l',
        response: { code: 'INSUFFICIENT_AVAILABLE_BALANCE', message: 'exceeds available balance' },
      };
      expect(component.detailText(step)).toBe('INSUFFICIENT_AVAILABLE_BALANCE: exceeds available balance');
    });

    it('formats a snapshot without offBalanceExposure', () => {
      const step: TraceStep = {
        type: 'snapshot',
        label: 'l',
        response: { confirmedBalance: '100000', availableBalance: '50000' },
      };
      expect(component.detailText(step)).toBe('confirmed=100000  available=50000');
    });

    it('formats a snapshot WITH offBalanceExposure, appending the extra fields', () => {
      const step: TraceStep = {
        type: 'snapshot',
        label: 'l',
        response: {
          confirmedBalance: '100000',
          availableBalance: '40000',
          offBalanceExposure: '60000',
          tightAvailableBalance: '40000',
        },
      };
      expect(component.detailText(step)).toBe('confirmed=100000  available=40000  offBalanceExposure=60000  tightAvailable=40000');
    });

    it('formats a createMovement step without warnings', () => {
      const step: TraceStep = {
        type: 'createMovement',
        label: 'l',
        response: { movementType: 'ISSUE', amount: '100000', ceilingAmount: '110000', status: 'PENDING' },
      };
      expect(component.detailText(step)).toBe('ISSUE amount=100000 ceilingAmount=110000 status=PENDING');
    });

    it('formats a createMovement step WITH warnings, appending the first warning message', () => {
      const step: TraceStep = {
        type: 'createMovement',
        label: 'l',
        response: {
          movementType: 'UTILIZE',
          amount: '50000',
          ceilingAmount: '55000',
          status: 'PENDING',
          warnings: [{ message: 'close to tolerance limit' }, { message: 'second warning' }],
        },
      };
      expect(component.detailText(step)).toBe('UTILIZE amount=50000 ceilingAmount=55000 status=PENDING  ⚠ close to tolerance limit');
    });

    it('falls back to "status=<status>" for any other step type (e.g. release)', () => {
      const step: TraceStep = { type: 'release', label: 'l', response: { status: 'RELEASED' } };
      expect(component.detailText(step)).toBe('status=RELEASED');
    });

    it('formats every movement in an A6/B4 compound trace record', () => {
      const step: TraceStep = {
        type: 'createCompoundMovements',
        functionCode: 'B4',
        label: 'B4 compound',
        response: [{ movementType: 'ACCEPT', status: 'PENDING' }, { movementType: 'CREATE', status: 'PENDING' }],
      };
      expect(component.detailText(step)).toBe('ACCEPT status=PENDING | CREATE status=PENDING');
    });
  });
});
