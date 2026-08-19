import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';

// submit()'s compound branches (A3S/B4/B5) call `crypto.randomUUID()` to link legs via
// businessEventId — jsdom's test environment doesn't always implement it. Polyfill once, module-load
// time, same posture as any other jsdom API gap. `maker-submit.service.spec.ts` carries an identical
// copy of this same polyfill — each Jest test FILE gets its own fresh module registry/globalThis, so
// there's no single shared place to hoist this to without a global Jest setup-file change.
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = {};
}
if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  // jsdom's `window.crypto` is a non-configurable getter — mutate the existing object in place
  // rather than reassigning `globalThis.crypto` (a plain reassignment silently no-ops).
  (globalThis as any).crypto.randomUUID = () => 'test-uuid-' + Math.random().toString(36).slice(2);
}

/**
 * Covers: loadCheckerQueue(), onSelectCheckerMovement(), checkerAct(), submit(), approveArrival(),
 * release(), reject(), deleteMakerPending(), runLookup(), selectLookupTab(), selectLookupSg(),
 * selectLookupAcceptance() — the Maker submit + Checker release/reject/acknowledge flow.
 *
 * Direct instantiation (no TestBed), matching lc-payment-wc's business-case-runner.component.spec.ts
 * house style — `new TransactionBuilderComponent(mockApi as unknown as BalanceComponentApiService)`.
 */

const A1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1')!;
const A2 = IMPORT_FUNCTIONS.find((f) => f.code === 'A2')!;
const A3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3')!;
const A3S = IMPORT_FUNCTIONS.find((f) => f.code === 'A3S')!;
const A4 = IMPORT_FUNCTIONS.find((f) => f.code === 'A4')!;
const A6 = IMPORT_FUNCTIONS.find((f) => f.code === 'A6')!;
const A8 = IMPORT_FUNCTIONS.find((f) => f.code === 'A8')!;
const A9 = IMPORT_FUNCTIONS.find((f) => f.code === 'A9')!;
const B3 = EXPORT_FUNCTIONS.find((f) => f.code === 'B3')!;
const B4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4')!;
const B5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5')!;

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lgl-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lgl-1',
    currency: 'USD',
    confirmedBalance: '1000',
    availableBalance: '1000',
    pendingEarmarkTotal: '0',
    ...overrides,
  };
}

function makeMovement(overrides: any = {}): any {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    status: 'PENDING',
    movementType: 'UTILIZE',
    amount: '500',
    currency: 'USD',
    sourceTransactionRef: 'IB001',
    eventSeq: 1,
    ...overrides,
  };
}

/**
 * 2026-08-18 ("Look Up Current Balance's own Event Timeline should use the SAME status/display logic as
 * Inquire Events") — lookUp.lookupMovements/acceptanceMovements/sgMovements are now InquiredEvent[], not
 * a raw BalanceMovement[]. Only used where a test needs SOME pre-existing row present (to prove it gets
 * reset) — never for a fixture whose own toEventRows() split matters, since makeContract()'s default
 * (no tenorType) never triggers the Sight-UTILIZE split anyway.
 */
function makeEventRow(overrides: any = {}): any {
  return { movement: makeMovement(), contract: makeContract(), eventTime: '2026-01-01T00:00:00Z', eventStatus: 'PENDING', phase: 'primary', ...overrides };
}

function apiErr(message: string) {
  return throwError(() => ({ error: { message } }));
}

function makeApi() {
  return {
    createMovement: jest.fn(() => of({ body: { movementId: 'mv-new', status: 'PENDING' } })),
    release: jest.fn(() => of({ movementId: 'mv-released', status: 'RELEASED' })),
    reject: jest.fn(() => of({ movementId: 'mv-rejected', status: 'REJECTED' })),
    cancel: jest.fn(() => of({ movementId: 'mv-cancelled', status: 'CANCELLED' })),
    resolveContract: jest.fn(() => of(makeContract())),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getSnapshot: jest.fn(() => of(makeSnapshot())),
    listMovements: jest.fn(() => of([] as any[])),
    findByBusinessEventId: jest.fn(() => of([] as any[])),
  };
}

function setup() {
  const api = makeApi();
  const comp = new TransactionBuilderComponent(api as unknown as BalanceComponentApiService);
  return { comp, api };
}

function lastReq(api: ReturnType<typeof makeApi>, callIndex = 0): CreateMovementRequest {
  return (api.createMovement.mock.calls as any[])[callIndex][0];
}

describe('TransactionBuilderComponent — Maker/Checker action flow', () => {
  // ---------------------------------------------------------------------
  // submit() — validation guards (no createMovement call)
  // ---------------------------------------------------------------------
  describe('submit() — validation guards', () => {
    it('requires amount/currency/createdBy', () => {
      const { comp, api } = setup();
      comp.selectFunction(A1);
      comp.naturalKey.lcNumber = 'LC001';
      // model.amount left unset
      comp.submit();
      expect(comp.submitError).toBe('Fill in amount, currency, createdBy.');
      expect(comp.submitting).toBe(false);
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('rejects an Amount with more decimal places than the typed Currency allows (e.g. JPY has no cents)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A1);
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '10000.5';
      comp.model.currency = 'JPY';
      comp.model.createdBy = 'maker1';
      comp.submit();
      expect(comp.submitError).toBe('Amount 10000.5 has more decimal places than JPY allows (0).');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires the dynamic secondary reference label (A2)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.subChoiceValue = 'AMEND_INCREASE';
      comp.onSubChoice();
      comp.model.amount = '500';
      comp.selectedContract = makeContract();
      // model.secondaryRef left unset
      comp.submit();
      expect(comp.submitError).toBe('Amendment No./Times is mandatory for A2.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires SG Number when issuing a Shipping Guarantee (A8)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A8);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      // naturalKey.sgNumber left unset
      comp.submit();
      expect(comp.submitError).toBe('SG Number is mandatory when issuing a Shipping Guarantee.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires the Parent LC to be picked first for a lcNumberFromParent function (A6)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.model.amount = '1000';
      // naturalKey.lcNumber left unset — never picked a Parent LC
      comp.submit();
      expect(comp.submitError).toBe("Pick the Parent LC first — that selection supplies this record's LC Number.");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires LC Number for a natural-key creating function with no parent (A1)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A1);
      comp.model.amount = '1000';
      // naturalKey.lcNumber left unset
      comp.submit();
      expect(comp.submitError).toBe('LC Number is mandatory.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires IB Number when the instrument natural key needs it (A6)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      // naturalKey.ibNumber left unset
      comp.submit();
      expect(comp.submitError).toBe('IB Number is mandatory.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires Tenor Type when tenorTypeOptions are declared (A6)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      comp.naturalKey.ibNumber = 'IB01';
      // model.tenorType left unset
      comp.submit();
      expect(comp.submitError).toBe('Tenor Type is mandatory for A6.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it("requires Tenor Days > 0 for A1 Seller's/Buyer's Usance", () => {
      const { comp, api } = setup();
      comp.selectFunction(A1);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.tenorType = 'SELLERS_USANCE';
      // model.tenorDays left unset
      comp.submit();
      expect(comp.submitError).toBe("Tenor Days must be greater than 0 for Seller's/Buyer's Usance.");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires picking the still-PENDING Document Arrival before creating an Acceptance (A6)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      comp.naturalKey.ibNumber = 'IB01';
      comp.model.tenorType = 'SELLERS_USANCE';
      comp.model.tenorDays = 90;
      // selectedPayMovement left unset
      comp.submit();
      expect(comp.submitError).toBe('Pick the still-PENDING Document Arrival (2ndary Index) to convert first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires picking a Shipping Guarantee for Document Arrival w/ Shipping Gtee (A3S)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      comp.model.amount = '1000';
      comp.model.secondaryRef = 'IB01';
      comp.selectedContract = makeContract();
      // selectedArrivalSg / arrivalSgSnapshot left unset
      comp.submit();
      expect(comp.submitError).toBe('Pick the Shipping Guarantee this Document Arrival is against first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('A9 autoRedeemType: requires a snapshot before redeeming', () => {
      const { comp, api } = setup();
      comp.selectFunction(A9);
      comp.model.amount = '500';
      comp.selectedContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      // selectedContractSnapshot left unset
      comp.submit();
      expect(comp.submitError).toBe('Search for the Shipping Guarantee to redeem first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('A9 autoRedeemType: rejects an amount exceeding Available Balance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A9);
      comp.model.amount = '2000';
      comp.selectedContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      comp.selectedContractSnapshot = makeSnapshot({ availableBalance: '1000' });
      comp.submit();
      expect(comp.submitError).toBe("Amount must not exceed the SG's Available Balance (1000).");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('B5 settlesAcceptanceOnMature: requires a snapshot before settling', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.model.amount = '500';
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null } });
      // selectedContractSnapshot left unset
      comp.submit();
      expect(comp.submitError).toBe('Search for the Acceptance to settle first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('B5 settlesAcceptanceOnMature: rejects an amount exceeding Available Balance', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.model.amount = '2000';
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null } });
      comp.selectedContractSnapshot = makeSnapshot({ availableBalance: '1000' });
      comp.submit();
      expect(comp.submitError).toBe("Amount must not exceed the Acceptance's Available Balance (1000).");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires an existing contract to be picked for a non-creating function (A2)', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.subChoiceValue = 'AMEND_DECREASE';
      comp.onSubChoice();
      comp.model.amount = '100';
      comp.model.secondaryRef = 'AMD01';
      // selectedContract left unset
      comp.submit();
      expect(comp.submitError).toBe('Pick a contract from the Catalog below.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // submit() — request-building + happy/error paths
  // ---------------------------------------------------------------------
  describe('submit() — request building', () => {
    it('A1 LC Issue: builds via the natural-key path, Sight omits tenorDays from the wire, and handles success', () => {
      const { comp, api } = setup();
      comp.selectFunction(A1);
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '100000';
      comp.model.tolerancePct = '10';
      comp.model.eventSeq = 42;
      // tenorType defaults to SIGHT via selectFunction()

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      const req = lastReq(api);
      expect(req).toMatchObject({
        instrumentType: 'IPLC_LC',
        movementType: 'ISSUE',
        eventSeq: 42,
        amount: '100000',
        currency: 'USD',
        createdBy: 'maker1',
        tolerancePct: '10',
        tenorType: 'SIGHT',
        naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null },
      });
      // 0 is falsy — `if (this.model.tenorDays)` never fires for Sight's forced 0.
      expect(req.tenorDays).toBeUndefined();
      expect(req.sourceTransactionRef).toBeUndefined();
      expect(req.balanceContractId).toBeUndefined();

      expect(comp.submitting).toBe(false);
      expect(comp.submitResult).toEqual({ movementId: 'mv-new', status: 'PENDING' });
      expect(comp.submitError).toBeNull();
    });

    it('A1 LC Issue Usance: includes tenorDays on the wire and defaults tolerancePct absent when not typed', () => {
      const { comp, api } = setup();
      comp.selectFunction(A1);
      comp.naturalKey.lcNumber = 'LC002';
      comp.model.amount = '50000';
      comp.model.tenorType = 'BUYERS_USANCE';
      comp.model.tenorDays = 90;
      // tolerancePct left unset

      comp.submit();

      const req = lastReq(api);
      expect(req.tenorDays).toBe(90);
      expect(req.tenorType).toBe('BUYERS_USANCE');
      expect(req.tolerancePct).toBeUndefined();
    });

    it('A1 LC Issue: surfaces the server error code/message and resets submitting on failure', () => {
      const { comp, api } = setup();
      api.createMovement.mockReturnValueOnce(apiErr('NATURAL_KEY_ALREADY_EXISTS: LC001 already exists') as any);
      comp.selectFunction(A1);
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '100000';

      comp.submit();

      expect(comp.submitting).toBe(false);
      expect(comp.submitError).toBe('NATURAL_KEY_ALREADY_EXISTS: LC001 already exists');
      // submitResult is set to err.error (?? null) on failure, not left null — so a raw server error
      // payload is still visible for debugging even on the failure path.
      expect(comp.submitResult).toEqual({ message: 'NATURAL_KEY_ALREADY_EXISTS: LC001 already exists' });
    });

    it('A2 Amendment: builds via the existing balanceContractId path with sourceTransactionRef', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.subChoiceValue = 'AMEND_INCREASE';
      comp.onSubChoice();
      comp.model.amount = '5000';
      comp.model.secondaryRef = 'AMD01';
      comp.selectedContract = makeContract({ balanceContractId: 'bc-42' });

      comp.submit();

      const req = lastReq(api);
      expect(req.movementType).toBe('AMEND_INCREASE');
      expect(req.balanceContractId).toBe('bc-42');
      expect(req.naturalKey).toBeUndefined();
      expect(req.sourceTransactionRef).toBe('AMD01');
    });

    it('sets exposureNature and parentLogicalContractId when the top-level request itself targets EPLC_ACCEPTANCE/CREATE with a parent picked', () => {
      // None of the currently-registered UI functions route their OWN top-level `req` through
      // instrumentType EPLC_ACCEPTANCE/movementType CREATE (A6 is IPLC_ACCEPTANCE; B4's Usance branch
      // builds its EPLC_ACCEPTANCE leg on a SEPARATE sub-request, not `req` itself) — this exercises
      // submit()'s own generic `model.instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE'`
      // branch directly via component state, same as the task brief's "set fields directly" guidance.
      const { comp, api } = setup();
      comp.selectedFunction = null;
      comp.model = { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'CREATE', amount: '1000', currency: 'USD', createdBy: 'maker1', eventSeq: 7 };
      comp.naturalKey = { lcNumber: 'LC001', ibNumber: 'IB01', sgNumber: '' };
      comp.selectedParent = makeContract({ logicalContractId: 'lgl-parent-1' });
      comp.exposureNature = 'ACTUAL';

      comp.submit();

      const req = lastReq(api);
      expect(req.parentLogicalContractId).toBe('lgl-parent-1');
      expect(req.exposureNature).toBe('ACTUAL');
    });

    it('A9 autoRedeemType: derives FULL_REDEEM when the typed amount equals Available Balance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A9);
      comp.selectedContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      comp.selectedContractSnapshot = makeSnapshot({ availableBalance: '500' });
      comp.model.amount = '500';

      comp.submit();

      expect(lastReq(api).movementType).toBe('FULL_REDEEM');
    });

    it('A9 autoRedeemType: derives PARTIAL_REDEEM when the typed amount is below Available Balance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A9);
      comp.selectedContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      comp.selectedContractSnapshot = makeSnapshot({ availableBalance: '500' });
      comp.model.amount = '300';

      comp.submit();

      expect(lastReq(api).movementType).toBe('PARTIAL_REDEEM');
    });

    it('A6 (settlesDocumentArrival, plain): submit only creates the Acceptance and never releases anything — LC Balance stays untouched', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.naturalKey.lcNumber = 'LC001';
      comp.naturalKey.ibNumber = 'IB01';
      comp.model.amount = '1000';
      comp.model.tenorType = 'SELLERS_USANCE';
      comp.model.tenorDays = 60;
      comp.selectedPayMovement = makeMovement({ movementType: 'UTILIZE', sourceTransactionRef: 'IB01', amount: '1000' });

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(lastReq(api)).toMatchObject({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' });
      // The whole point of A6's Maker Submit: no release call touches the Document Arrival / LC Balance.
      expect(api.release).not.toHaveBeenCalled();
      expect(comp.submitResult).toEqual({ movementId: 'mv-new', status: 'PENDING' });
    });
  });

  // ---------------------------------------------------------------------
  // submit() — A3S compound (documentArrivalWithSg)
  // ---------------------------------------------------------------------
  describe('submit() — A3S documentArrivalWithSg compound', () => {
    function primed(comp: TransactionBuilderComponent) {
      comp.selectFunction(A3S);
      comp.model.amount = '1000';
      comp.model.secondaryRef = 'IB01';
      comp.selectedContract = makeContract({ balanceContractId: 'bc-lc' });
      comp.selectedArrivalSg = makeContract({
        balanceContractId: 'bc-sg',
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null },
      });
      comp.arrivalSgSnapshot = makeSnapshot({ confirmedBalance: '1000' });
    }

    it('creates the SG redemption THEN the Document Arrival, in that order, on full success', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'sg-redeem-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'utilize-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(2);
      expect(lastReq(api, 0)).toMatchObject({ instrumentType: 'SHGT', balanceContractId: 'bc-sg', movementType: 'FULL_REDEEM', amount: '1000' });
      expect(lastReq(api, 1)).toMatchObject({ instrumentType: 'IPLC_LC', balanceContractId: 'bc-lc' });
      // Both legs share one businessEventId.
      expect(lastReq(api, 0).businessEventId).toBe(lastReq(api, 1).businessEventId);
      expect(comp.arrivalSgRedeemMovementId).toBe('sg-redeem-1');
      expect(comp.submitResult).toEqual({ movementId: 'utilize-1', status: 'PENDING' });
      expect(comp.submitting).toBe(false);
    });

    // Bug fixed 2026-08-16, reviewer-reported ("A3S does not generate the related SG redemption
    // entries in Pending"): the SG's own FULL_REDEEM/PARTIAL_REDEEM is a REAL, in-scope contingent
    // account family, but its entry was silently dropped since submitResult only ever tracked the
    // second (LC UTILIZE) call. arrivalSgRedeemMovement now carries the FULL first-leg response
    // (not just its movementId) so the Account Entries button can be offered for this leg too.
    it("captures the SG redemption leg's own full response (including its contingentAccountEntry) separately from submitResult", () => {
      const { comp, api } = setup();
      const sgEntry = {
        drAccount: 'Shipping Guarantees Outstanding',
        crAccount: "Customers' Liability under Shipping Guarantees",
        currency: 'USD',
        amount: '1000',
      };
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'sg-redeem-1', status: 'PENDING', contingentAccountEntry: sgEntry } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'utilize-1', status: 'PENDING', contingentAccountEntry: null } }) as any);
      primed(comp);

      comp.submit();

      expect(comp.arrivalSgRedeemMovement).toEqual({ movementId: 'sg-redeem-1', status: 'PENDING', contingentAccountEntry: sgEntry });
      expect(comp.submitResult.contingentAccountEntry).toBeNull();
    });

    it('a failed SG reservation never attempts the Document Arrival call', () => {
      const { comp, api } = setup();
      api.createMovement.mockReturnValueOnce(apiErr('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not reserve the Shipping Guarantee redemption: INSUFFICIENT_AVAILABLE_BALANCE');
      expect(comp.submitting).toBe(false);
    });

    it('SG reservation succeeds but the Document Arrival fails — surfaces the compound error, keeps the SG movementId', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'sg-redeem-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErr('LEGS_UNBALANCED') as any);
      primed(comp);

      comp.submit();

      expect(comp.arrivalSgRedeemMovementId).toBe('sg-redeem-1');
      expect(comp.submitError).toBe('Shipping Guarantee redemption reserved (PENDING), but the Document Arrival itself failed: LEGS_UNBALANCED');
      expect(comp.submitting).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // submit() — B4 Sight/HONOUR compound (createsIssuingBankReceivableOnHonour)
  // ---------------------------------------------------------------------
  describe('submit() — B4 Sight/HONOUR compound', () => {
    function primed(comp: TransactionBuilderComponent) {
      comp.selectFunction(B4);
      comp.model.movementType = 'HONOUR';
      comp.model.amount = '2000';
      comp.model.secondaryRef = 'EB01';
      comp.selectedContract = makeContract({ balanceContractId: 'bc-cnf', instrumentType: 'EPLC_CONFIRMATION', logicalContractId: 'lgl-cnf' });
      comp.selectedPayMovement = makeMovement({ movementType: 'CREATE', sourceTransactionRef: 'EB01', amount: '2000' });
    }

    it('creates the Confirmation HONOUR then the Due from Issuing Bank asset', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'honour-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'receivable-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(2);
      expect(lastReq(api, 0)).toMatchObject({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'HONOUR' });
      expect(lastReq(api, 1)).toMatchObject({ instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK', movementType: 'CREATE', parentLogicalContractId: 'lgl-cnf' });
      expect(comp.submitResult).toEqual({ movementId: 'honour-1', status: 'PENDING' });
      expect(comp.dueFromIssuingBankMovementId).toBe('receivable-1');
    });

    it('a failed HONOUR never creates the asset', () => {
      const { comp, api } = setup();
      api.createMovement.mockReturnValueOnce(apiErr('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    });

    it('HONOUR succeeds but the asset create fails — surfaces the compound error', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'honour-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErr('REQUEST_VALIDATION_FAILED') as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe('Confirmation honoured (PENDING), but the Due from Issuing Bank asset failed to record: REQUEST_VALIDATION_FAILED');
    });
  });

  // ---------------------------------------------------------------------
  // submit() — B4 Usance/ACCEPT compound (createsAcceptanceReimbReceivableOnCreate)
  // ---------------------------------------------------------------------
  describe('submit() — B4 Usance/ACCEPT compound', () => {
    function primed(comp: TransactionBuilderComponent) {
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.model.amount = '3000';
      comp.model.secondaryRef = 'EB02';
      comp.selectedContract = makeContract({
        balanceContractId: 'bc-cnf',
        instrumentType: 'EPLC_CONFIRMATION',
        logicalContractId: 'lgl-cnf',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
      });
      comp.selectedPayMovement = makeMovement({ movementType: 'ACCEPT', sourceTransactionRef: 'EB02', amount: '3000' });
    }

    it('creates ACCEPT, then the Acceptance liability, then the Reimbursement Receivable asset', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'acceptance-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'receivable-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(3);
      expect(lastReq(api, 0)).toMatchObject({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'ACCEPT' });
      expect(lastReq(api, 1)).toMatchObject({
        instrumentType: 'EPLC_ACCEPTANCE',
        movementType: 'CREATE',
        exposureNature: 'ACTUAL',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
      });
      expect(lastReq(api, 2)).toMatchObject({ instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE', movementType: 'CREATE' });
      expect(comp.submitResult).toEqual({ movementId: 'accept-1', status: 'PENDING' });
      expect(comp.acceptanceMovementId).toBe('acceptance-1');
      expect(comp.acceptanceReimbReceivableMovementId).toBe('receivable-1');
    });

    // Same fix and reasoning as the A3S SG-redemption test above, applied to this compound's own
    // second leg (the new EPLC_ACCEPTANCE CREATE) — a real, in-scope contingent account family whose
    // entry was also being silently dropped, same root cause.
    it("captures the Acceptance liability leg's own full response (including its contingentAccountEntry) separately from submitResult", () => {
      const { comp, api } = setup();
      const acceptanceEntry = {
        drAccount: "Customers' Liability under Acceptances & DPU",
        crAccount: 'Acceptances & DPU Outstanding',
        currency: 'USD',
        amount: '3000',
      };
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING', contingentAccountEntry: null } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'acceptance-1', status: 'PENDING', contingentAccountEntry: acceptanceEntry } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'receivable-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(comp.acceptanceMovement).toEqual({ movementId: 'acceptance-1', status: 'PENDING', contingentAccountEntry: acceptanceEntry });
      expect(comp.submitResult.contingentAccountEntry).toBeNull();
    });

    it('a failed ACCEPT never creates the Acceptance', () => {
      const { comp, api } = setup();
      api.createMovement.mockReturnValueOnce(apiErr('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    });

    it('ACCEPT succeeds, Acceptance CREATE fails — surfaces the compound error, no Receivable call', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErr('REQUEST_VALIDATION_FAILED') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(2);
      expect(comp.submitError).toBe('Confirmation accepted (PENDING), but the Acceptance liability failed to record: REQUEST_VALIDATION_FAILED');
    });

    it('ACCEPT + Acceptance succeed, Receivable CREATE fails — surfaces the compound error', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'acceptance-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErr('REQUEST_VALIDATION_FAILED') as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe(
        'Confirmation accepted (PENDING) and Acceptance created (PENDING), but the Reimbursement Receivable asset failed to record: REQUEST_VALIDATION_FAILED',
      );
    });
  });

  // ---------------------------------------------------------------------
  // submit() — B5 settlesAcceptanceOnMature compound
  // ---------------------------------------------------------------------
  describe('submit() — B5 settlesAcceptanceOnMature compound', () => {
    function primed(comp: TransactionBuilderComponent) {
      comp.selectFunction(B5);
      comp.model.amount = '500';
      comp.selectedContract = makeContract({
        balanceContractId: 'bc-accept',
        instrumentType: 'EPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null },
      });
      comp.selectedContractSnapshot = makeSnapshot({ availableBalance: '500' });
    }

    it('settles the Acceptance then resolves and reimburses the matching Receivable', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'settle-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'reimb-1', status: 'PENDING' } }) as any);
      api.resolveContract.mockReturnValueOnce(
        of(makeContract({ balanceContractId: 'bc-receivable', instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE' })) as any,
      );
      primed(comp);

      comp.submit();

      expect(lastReq(api, 0)).toMatchObject({ instrumentType: 'EPLC_ACCEPTANCE', balanceContractId: 'bc-accept', movementType: 'FULL_SETTLE' });
      expect(api.resolveContract).toHaveBeenCalledWith('EPLC_ACCEPTANCE_REIMB_RECEIVABLE', { lcNumber: 'LC001', ibNumber: 'EB01' });
      expect(lastReq(api, 1)).toMatchObject({
        instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
        balanceContractId: 'bc-receivable',
        movementType: 'REIMBURSE',
      });
      expect(comp.submitResult).toEqual({ movementId: 'settle-1', status: 'PENDING' });
      expect(comp.matchedReceivableMovementId).toBe('reimb-1');
    });

    it('a failed Acceptance settle never resolves the Receivable', () => {
      const { comp, api } = setup();
      api.createMovement.mockReturnValueOnce(apiErr('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(comp.submitError).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    });

    it('settle succeeds but resolveContract fails — surfaces the compound error', () => {
      const { comp, api } = setup();
      api.createMovement.mockReturnValueOnce(of({ body: { movementId: 'settle-1', status: 'PENDING' } }) as any);
      api.resolveContract.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe('Acceptance settled (PENDING), but its matching Reimbursement Receivable could not be found: NOT_FOUND');
    });

    it('settle + resolve succeed but the Receivable createMovement fails — surfaces the compound error', () => {
      const { comp, api } = setup();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'settle-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErr('REQUEST_VALIDATION_FAILED') as any);
      api.resolveContract.mockReturnValueOnce(of(makeContract({ balanceContractId: 'bc-receivable' })) as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe('Acceptance settled (PENDING), but the matching Reimbursement Receivable failed to record: REQUEST_VALIDATION_FAILED');
    });
  });

  // ---------------------------------------------------------------------
  // approveArrival()
  // ---------------------------------------------------------------------
  // SUPERSEDED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易") —
  // approveArrival() no longer has a deferSettlementRequiresBackendAck branch at all (B3 no longer sets
  // it, or deferSettlement itself — see balance-component.model.ts's own doc comment). It always just
  // sets arrivalApproved locally now — A3 (its only remaining caller) is unaffected, this method never
  // calls the backend for anyone any more.
  describe('approveArrival()', () => {
    it('always sets arrivalApproved locally, never calls the backend', () => {
      const { comp } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement();

      comp.approveArrival();

      expect(comp.arrivalApproved).toBe(true);
    });

    it('with no selectedCheckerMovement, still just sets arrivalApproved locally', () => {
      const { comp } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = null;

      comp.approveArrival();

      expect(comp.arrivalApproved).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // arrivalAlreadyApproved
  // ---------------------------------------------------------------------
  // Bug fixed 2026-08-18, reviewer-reported live (LC U01 / IB E03 — "The pending transaction ... cannot
  // be approved by the Checker", the Approve button and its own hint stayed keyed on `arrivalApproved`
  // alone, a per-session flag reset by onSelectCheckerMovement() every time an item is (re-)picked. B3's
  // own acknowledge() is a REAL, persisted API call (unlike plain A3's client-only approveArrival()), so
  // re-searching an already-acknowledged item in a fresh session/page-load left the button re-enabled
  // even though a second click would 409 as "already acknowledged" — surfacing to the user as "cannot be
  // approved". This getter is what the template's own disabled/label/hint bindings now read instead of
  // the bare `arrivalApproved` flag.
  describe('arrivalAlreadyApproved', () => {
    it('true when this session already clicked Approve (arrivalApproved), even with no persisted acknowledgedAt', () => {
      const { comp } = setup();
      comp.arrivalApproved = true;
      comp.selectedCheckerMovement = makeMovement({ acknowledgedAt: null });
      expect(comp.arrivalAlreadyApproved).toBe(true);
    });

    it('true when the selected item was already acknowledged in an EARLIER session — the exact reported gap', () => {
      const { comp } = setup();
      comp.arrivalApproved = false;
      comp.selectedCheckerMovement = makeMovement({ acknowledgedAt: '2026-08-18T07:21:34.406Z', acknowledgedBy: 'checker1' });
      expect(comp.arrivalAlreadyApproved).toBe(true);
    });

    it('false when neither signal is set (a genuinely not-yet-approved item)', () => {
      const { comp } = setup();
      comp.arrivalApproved = false;
      comp.selectedCheckerMovement = makeMovement({ acknowledgedAt: null });
      expect(comp.arrivalAlreadyApproved).toBe(false);
    });

    it('false with no selectedCheckerMovement at all', () => {
      const { comp } = setup();
      comp.arrivalApproved = false;
      comp.selectedCheckerMovement = null;
      expect(comp.arrivalAlreadyApproved).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // lookUp.syncFrom() — child instrumentType -> parent LC/Confirmation mapping
  // ---------------------------------------------------------------------
  // Bug fixed 2026-08-18, reviewer-reported ("B3 Present Docs -> Submit -> Release -> Look Up Current
  // Balance" showed "No Logical Contract exists yet for this natural key"): syncLookupToContext() (called
  // after a Maker Submit and whenever the Checker queue loads — see loadCheckerQueue()) passes the
  // FUNCTION's own instrumentType to lookUp.syncFrom(), which must map every CHILD instrumentType to its
  // PARENT LC/Confirmation before resolving — a child instrumentType's own natural key needs a second
  // field (ibNumber/sgNumber) syncFrom() always clears to '', so resolving the child itself directly can
  // never match. EPLC_EXAMINATION (B3) was missing from this map entirely and fell through to the
  // `return instrumentType` default, unlike its siblings below — these tests cover every mapping
  // together, not just the one that was broken, since no direct test of this method existed before.
  describe('lookUp.syncFrom() — child instrumentType -> parent LC/Confirmation mapping', () => {
    it.each([
      ['IPLC_ACCEPTANCE', 'IPLC_LC'],
      ['SHGT', 'IPLC_LC'],
      ['EPLC_ACCEPTANCE', 'EPLC_CONFIRMATION'],
      ['EPLC_EXAMINATION', 'EPLC_CONFIRMATION'], // the reported gap — was staying 'EPLC_EXAMINATION'
      ['IPLC_LC', 'IPLC_LC'], // already an LC-level type — passes through unchanged
      ['EPLC_CONFIRMATION', 'EPLC_CONFIRMATION'],
    ])('%s resolves Look Up to its LC/Confirmation-level type %s', (childType, expectedLookupType) => {
      const { comp, api } = setup();

      comp.lookUp.syncFrom('E001', childType as any);

      expect(comp.lookUp.lookup.instrumentType).toBe(expectedLookupType);
      expect(api.resolveContract).toHaveBeenCalledWith(expectedLookupType, expect.objectContaining({ lcNumber: 'E001' }));
    });

    // REMOVED 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — this test's own end-to-end
    // path went through approveArrival() (B3's former deferSettlementRequiresBackendAck branch, which
    // called syncCheckerToContext() in its own success callback). B3 no longer routes through
    // approveArrival() at all (checkerAct() now sends it straight to the plain api.release() path,
    // which already syncs the Checker context via the SAME mechanism every other plain-path function
    // uses — see release()'s own tests). The underlying EPLC_EXAMINATION -> EPLC_CONFIRMATION mapping
    // this test was ALSO proving is still directly covered by the it.each block immediately above.
  });

  // ---------------------------------------------------------------------
  // release()
  // ---------------------------------------------------------------------
  describe('release()', () => {
    it('no-ops when there is no submitResult.movementId', () => {
      const { comp, api } = setup();
      comp.submitResult = null;

      comp.release();

      expect(api.release).not.toHaveBeenCalled();
    });

    it('plain path: single release call, success resets actionBusy and — per the 2026-08-17 auto-reset UX — returns to the SAME function with a fresh screen instead of leaving submitResult set', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.model.createdBy = 'maker1';
      comp.submitResult = { movementId: 'mv-amend', status: 'PENDING' };
      api.release.mockReturnValueOnce(of({ movementId: 'mv-amend', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenCalledWith('mv-amend', 'checker1');
      expect(comp.selectedFunction).toBe(A2);
      expect(comp.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toBe('Release completed (movement mv-amend) — screen reset for a new A2 (LC Amendment) transaction.');
    });

    it('plain path: derives checker2 when createdBy is not maker1', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.model.createdBy = 'maker2';
      comp.submitResult = { movementId: 'mv-amend', status: 'PENDING' };

      comp.release();

      expect(api.release).toHaveBeenCalledWith('mv-amend', 'checker2');
    });

    it('plain path: a failed release sets submitError and resets actionBusy', () => {
      const { comp, api } = setup();
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);
      comp.selectFunction(A2);
      comp.submitResult = { movementId: 'mv-amend', status: 'PENDING' };

      comp.release();

      expect(comp.submitError).toBe('ILLEGAL_STATE_TRANSITION');
      expect(comp.actionBusy).toBe(false);
    });

    it('A6 settlesDocumentArrival: releases the source Document Arrival FIRST, then the Acceptance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.model.createdBy = 'maker1';
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-doc-arrival', sourceTransactionRef: 'IB01' });
      comp.selectedParent = makeContract({ balanceContractId: 'bc-parent-lc' });
      comp.submitResult = { movementId: 'mv-acceptance', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-doc-arrival', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'checker1');
      // 2026-08-17 auto-reset UX: a genuine 'released' outcome returns to the SAME function with a
      // fresh screen instead of leaving submitResult set to the compound's own final leg response.
      expect(comp.selectedFunction).toBe(A6);
      expect(comp.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-acceptance');
    });

    it('A6: a failed source release NEVER attempts to release the Acceptance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-doc-arrival', sourceTransactionRef: 'IB01' });
      comp.submitResult = { movementId: 'mv-acceptance', status: 'PENDING' };
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not release the Document Arrival (IB01) — Acceptance NOT approved: ILLEGAL_STATE_TRANSITION');
      expect(comp.actionBusy).toBe(false);
    });

    it('A6: source release succeeds but the Acceptance release fails', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-doc-arrival', sourceTransactionRef: 'IB01' });
      comp.submitResult = { movementId: 'mv-acceptance', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.submitError).toBe('Document Arrival released, but the Confirmation Honour/Accept itself failed to release: ILLEGAL_STATE_TRANSITION');
      expect(comp.actionBusy).toBe(false);
    });

    it('A3S documentArrivalWithSg: releases the SG redemption for real, then acknowledges the Document Arrival WITHOUT a second real release call', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      comp.selectedContract = makeContract({ balanceContractId: 'bc-lc' });
      comp.arrivalSgRedeemMovementId = 'mv-sg-redeem';
      comp.submitResult = { movementId: 'mv-doc-arrival', status: 'PENDING' };
      api.release.mockReturnValueOnce(of({ movementId: 'mv-sg-redeem', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(api.release).toHaveBeenCalledWith('mv-sg-redeem', 'checker1');
      expect(comp.arrivalApproved).toBe(true);
      expect(comp.actionBusy).toBe(false);
    });

    it('A3S: a failed SG release leaves the Document Arrival un-acknowledged', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      comp.arrivalSgRedeemMovementId = 'mv-sg-redeem';
      comp.submitResult = { movementId: 'mv-doc-arrival', status: 'PENDING' };
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.submitError).toBe('Could not release the Shipping Guarantee redemption — Document Arrival NOT acknowledged: ILLEGAL_STATE_TRANSITION');
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.actionBusy).toBe(false);
    });

    it('B5 settlesAcceptanceOnMature: releases the Acceptance then the matching Receivable, then auto-resets to a fresh B5 screen', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.matchedReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-settle', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-settle', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-receivable', 'checker1');
      // 2026-08-17 auto-reset UX: see the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B5);
      expect(comp.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-settle');
    });

    it('B5: a failed Acceptance release never releases the Receivable', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.matchedReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-settle', status: 'PENDING' };
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('ILLEGAL_STATE_TRANSITION');
    });

    it('B5: Acceptance release succeeds but the Receivable release fails', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.matchedReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-settle', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.submitError).toBe('Acceptance settled, but the matching Reimbursement Receivable failed to release: ILLEGAL_STATE_TRANSITION');
    });

    // 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — B4's own source (B3's Present Docs
    // earmark) is now independently Checker-Released BEFORE B4 ever picks it, so B4's own compound
    // release no longer re-releases it — the former "release source first" call is gone from every one
    // of these tests, and every remaining api.release mock/assertion index shifts down by one.
    it('B4 Sight full compound release: Confirmation HONOUR -> Due from Issuing Bank asset (does NOT re-release the already-RELEASED B3 source)', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'HONOUR';
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-b3', movementType: 'CREATE', sourceTransactionRef: 'EB01' });
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION' });
      comp.dueFromIssuingBankMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-honour', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-honour', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-honour', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-receivable', 'checker1');
      expect(api.release).toHaveBeenCalledTimes(2);
      // 2026-08-17 auto-reset UX: see the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B4);
      expect(comp.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-honour');
    });

    it('B4 Sight: the final Due from Issuing Bank release failing surfaces its own compound error', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'HONOUR';
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-b3' });
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION' });
      comp.dueFromIssuingBankMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-honour', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-honour', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.submitError).toBe('Confirmation Honour released, but the Due from Issuing Bank asset failed to release: ILLEGAL_STATE_TRANSITION');
    });

    it('B4 Usance full compound release: ACCEPT -> Acceptance liability -> Receivable asset (does NOT re-release the already-RELEASED B3 source)', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-b3', movementType: 'ACCEPT' });
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION' });
      comp.acceptanceMovementId = 'mv-acceptance';
      comp.acceptanceReimbReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-accept', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-accept', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(3, 'mv-receivable', 'checker1');
      expect(api.release).toHaveBeenCalledTimes(3);
      // 2026-08-17 auto-reset UX: see the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B4);
      expect(comp.submitResult).toBeNull();
      expect(comp.releaseSuccessHint).toContain('mv-accept');
    });

    it('B4 Usance: the Acceptance liability release failing stops before the Receivable leg', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-b3' });
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION' });
      comp.acceptanceMovementId = 'mv-acceptance';
      comp.acceptanceReimbReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-accept', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(2);
      expect(comp.submitError).toBe('Confirmation accepted, but the Acceptance liability failed to release: ILLEGAL_STATE_TRANSITION');
    });

    it('B4 Usance: the Receivable release failing is its own final compound error', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.selectedPayMovement = makeMovement({ movementId: 'mv-b3' });
      comp.selectedContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION' });
      comp.acceptanceMovementId = 'mv-acceptance';
      comp.acceptanceReimbReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-accept', status: 'PENDING' };
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.submitError).toBe('Acceptance released, but the Reimbursement Receivable asset failed to release: ILLEGAL_STATE_TRANSITION');
    });
  });

  // ---------------------------------------------------------------------
  // reject()
  // ---------------------------------------------------------------------
  describe('reject()', () => {
    it('no-ops when there is no submitResult.movementId', () => {
      const { comp, api } = setup();
      comp.submitResult = null;

      comp.reject();

      expect(api.reject).not.toHaveBeenCalled();
    });

    it('success: calls api.reject with checker1/MANUAL_TEST_REJECT and updates submitResult', () => {
      const { comp, api } = setup();
      comp.submitResult = { movementId: 'mv-1', status: 'PENDING' };
      api.reject.mockReturnValueOnce(of({ movementId: 'mv-1', status: 'REJECTED' }) as any);

      comp.reject();

      expect(api.reject).toHaveBeenCalledWith('mv-1', 'checker1', 'MANUAL_TEST_REJECT');
      expect(comp.submitResult).toEqual({ movementId: 'mv-1', status: 'REJECTED' });
      expect(comp.actionBusy).toBe(false);
    });

    it('error: sets submitError and resets actionBusy', () => {
      const { comp, api } = setup();
      comp.submitResult = { movementId: 'mv-1', status: 'PENDING' };
      api.reject.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.reject();

      expect(comp.submitError).toBe('NOT_FOUND');
      expect(comp.actionBusy).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // deleteMakerPending() — Maker EC / Cancel, distinct from reject()
  // ---------------------------------------------------------------------
  describe('deleteMakerPending()', () => {
    it('no-ops when there is no submitResult, or status is not PENDING', () => {
      const { comp, api } = setup();
      comp.submitResult = null;
      comp.deleteMakerPending();
      expect(api.cancel).not.toHaveBeenCalled();

      comp.submitResult = { movementId: 'mv-1', status: 'RELEASED' };
      comp.deleteMakerPending();
      expect(api.cancel).not.toHaveBeenCalled();
    });

    it('plain path: calls api.cancel with createdBy/MAKER_EC, distinct from reject()', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.model.createdBy = 'maker1';
      comp.submitResult = { movementId: 'mv-1', status: 'PENDING' };
      api.cancel.mockReturnValueOnce(of({ movementId: 'mv-1', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledWith('mv-1', 'maker1', 'MAKER_EC');
      expect(api.reject).not.toHaveBeenCalled();
      expect(comp.submitResult).toEqual({ movementId: 'mv-1', status: 'CANCELLED' });
      expect(comp.actionBusy).toBe(false);
    });

    it('plain path: a failed cancel sets submitError', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.submitResult = { movementId: 'mv-1', status: 'PENDING' };
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(comp.submitError).toBe('ILLEGAL_STATE_TRANSITION');
    });

    it('A3S: cancels the linked SG redemption FIRST, then the primary Document Arrival', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      comp.model.createdBy = 'maker1';
      comp.arrivalSgRedeemMovementId = 'mv-sg-redeem';
      comp.submitResult = { movementId: 'mv-doc-arrival', status: 'PENDING' };
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-sg-redeem', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-sg-redeem', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-doc-arrival', 'maker1', 'MAKER_EC');
      expect(comp.submitResult).toEqual({ movementId: 'mv-doc-arrival', status: 'CANCELLED' });
    });

    it('A3S: a failed SG cancel leaves the primary un-cancelled', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      comp.arrivalSgRedeemMovementId = 'mv-sg-redeem';
      comp.submitResult = { movementId: 'mv-doc-arrival', status: 'PENDING' };
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not delete the Shipping Guarantee redemption — Document Arrival NOT deleted: ILLEGAL_STATE_TRANSITION');
    });

    it('B4 Sight (createsIssuingBankReceivableOnHonour): cancels the asset FIRST, then the primary HONOUR', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'HONOUR';
      comp.model.createdBy = 'maker1';
      comp.dueFromIssuingBankMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-honour', status: 'PENDING' };
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-honour', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-receivable', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-honour', 'maker1', 'MAKER_EC');
    });

    it('B4 Sight: a failed asset cancel leaves the Confirmation Honour un-cancelled', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'HONOUR';
      comp.dueFromIssuingBankMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-honour', status: 'PENDING' };
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not delete the Due from Issuing Bank asset — Confirmation Honour NOT deleted: ILLEGAL_STATE_TRANSITION');
    });

    it('B4 Usance: cancels the Receivable, THEN the Acceptance, THEN the primary ACCEPT, in reverse-creation order', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.model.createdBy = 'maker1';
      comp.acceptanceMovementId = 'mv-acceptance';
      comp.acceptanceReimbReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-accept', status: 'PENDING' };
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-receivable', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(3, 'mv-accept', 'maker1', 'MAKER_EC');
    });

    it('B4 Usance: a failed Receivable cancel never attempts the Acceptance/primary cancel', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.acceptanceMovementId = 'mv-acceptance';
      comp.acceptanceReimbReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-accept', status: 'PENDING' };
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not delete the Reimbursement Receivable asset — Acceptance NOT deleted: ILLEGAL_STATE_TRANSITION');
    });

    it('B4 Usance: Receivable cancel succeeds but Acceptance cancel fails', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      comp.model.movementType = 'ACCEPT';
      comp.acceptanceMovementId = 'mv-acceptance';
      comp.acceptanceReimbReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-accept', status: 'PENDING' };
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(2);
      expect(comp.submitError).toBe(
        'Reimbursement Receivable deleted, but the Acceptance liability could not be — Confirmation Accept NOT deleted: ILLEGAL_STATE_TRANSITION',
      );
    });

    it('B5 settlesAcceptanceOnMature: cancels the matching Receivable FIRST, then the primary Settle', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.model.createdBy = 'maker1';
      comp.matchedReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-settle', status: 'PENDING' };
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-receivable', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-settle', 'maker1', 'MAKER_EC');
    });

    it('B5: a failed Receivable cancel leaves the primary Settle un-cancelled', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      comp.matchedReceivableMovementId = 'mv-receivable';
      comp.submitResult = { movementId: 'mv-settle', status: 'PENDING' };
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not delete the matching Reimbursement Receivable — Acceptance Settle NOT deleted: ILLEGAL_STATE_TRANSITION');
    });
  });

  // ---------------------------------------------------------------------
  // checkerAct()
  // ---------------------------------------------------------------------
  describe('checkerAct()', () => {
    it('no-ops when nothing is selected in the Checker queue', () => {
      const { comp, api } = setup();
      comp.selectedCheckerMovement = null;

      comp.checkerAct('release');

      expect(api.release).not.toHaveBeenCalled();
      expect(api.reject).not.toHaveBeenCalled();
    });

    it('dispatches to release() when isCheckerCompoundOwnSubmission and action=release', () => {
      const { comp } = setup();
      comp.selectFunction(A6);
      // referencedTransactionId is required since the 2026-08-16 fix — a real A6 CREATE always carries
      // one (see isCheckerCompoundOwnSubmission's own doc comment); submitResult no longer needs to match.
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-1', referencedTransactionId: 'mv-source' });
      comp.submitResult = { movementId: 'mv-1' };
      const releaseSpy = jest.spyOn(comp, 'release').mockImplementation(() => undefined);
      const rejectSpy = jest.spyOn(comp, 'reject').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(rejectSpy).not.toHaveBeenCalled();
    });

    it('dispatches to reject() when isCheckerCompoundOwnSubmission and action=reject', () => {
      const { comp } = setup();
      comp.selectFunction(A3S);
      // businessEventId is required since the 2026-08-16 fix — a real A3S UTILIZE always carries one
      // (see isCheckerCompoundOwnSubmission's own doc comment); submitResult is no longer needed to match.
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-1', businessEventId: 'be-1' });
      comp.submitResult = { movementId: 'mv-1' };
      const releaseSpy = jest.spyOn(comp, 'release').mockImplementation(() => undefined);
      const rejectSpy = jest.spyOn(comp, 'reject').mockImplementation(() => undefined);

      comp.checkerAct('reject');

      expect(rejectSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy).not.toHaveBeenCalled();
    });

    it('deferSettlement + release + matching movementType (A3): routes through approveArrival(), never api.release', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-2', movementType: 'UTILIZE' });
      comp.submitResult = null; // not the same submission -> isCheckerCompoundOwnSubmission false
      const approveSpy = jest.spyOn(comp, 'approveArrival').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(approveSpy).toHaveBeenCalledTimes(1);
      expect(api.release).not.toHaveBeenCalled();
    });

    it('deferSettlement + reject (A3): does NOT call approveArrival, calls api.reject directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-2', movementType: 'UTILIZE' });
      comp.submitResult = null;
      const approveSpy = jest.spyOn(comp, 'approveArrival').mockImplementation(() => undefined);

      comp.checkerAct('reject');

      expect(approveSpy).not.toHaveBeenCalled();
      expect(api.reject).toHaveBeenCalledWith('mv-2', comp.checkerId, 'MANUAL_QUEUE_REJECT');
    });

    // SUPERSEDED 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — B3 no longer sets
    // deferSettlement at all, so checkerAct('release') for it now falls all the way through to the
    // plain api.release path, same as A2/A8/etc. — it never routes through approveArrival() any more.
    it('B3 (no longer deferSettlement): checkerAct release calls api.release directly, never approveArrival()', () => {
      const { comp, api } = setup();
      comp.selectFunction(B3);
      comp.checkerId = 'checker8';
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-3', movementType: 'CREATE' });
      comp.submitResult = null;
      const approveSpy = jest.spyOn(comp, 'approveArrival').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(approveSpy).not.toHaveBeenCalled();
      expect(api.release).toHaveBeenCalledWith('mv-3', 'checker8');
    });

    it('plain path (A2, no defer/compound flags): release calls api.release directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.checkerId = 'checker7';
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });
      comp.submitResult = null;

      comp.checkerAct('release');

      expect(api.release).toHaveBeenCalledWith('mv-4', 'checker7');
      expect(comp.checkerBusy).toBe(false);
    });

    // 4-eyes redesign 2026-08-16 ("A4 Need Maker and Checker feature... Submit by Maker, then Release
    // by Checker"): A4's own dedicated payExisting() release method was removed; A4's UTILIZE now
    // relies on this SAME plain fallback path, same as A2 above — no special-casing needed since A4
    // has none of the compound/defer flags either. Real Maker Submit redesign, same day ("Add real
    // Maker Submit, then have Checker to Release it"): the plain path is now gated on
    // makerSubmittedAt (see checkerAct()'s own doc comment) — a real A4 Submit always sets it, so a
    // genuinely Maker-submitted item releases exactly as before.
    it('plain path (A4, no defer/compound flags): a Checker-picked, Maker-submitted UTILIZE releases via api.release directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A4);
      comp.checkerId = 'checker9';
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-a4', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-16T00:00:00.000Z' });
      comp.submitResult = null;

      comp.checkerAct('release');

      expect(api.release).toHaveBeenCalledWith('mv-a4', 'checker9');
      expect(comp.checkerBusy).toBe(false);
    });

    // Real Maker Submit redesign 2026-08-16 ("Add real Maker Submit, then have Checker to Release
    // it"): the real gate this whole feature exists for — without it, a Checker could release A4's
    // own picked item before any Maker ever used the new Submit A4 button, reproducing the original
    // "no genuine 4-eyes separation" gap this session's own A4 redesign set out to close.
    it("A4: release is BLOCKED with a clear checkerError when the picked item's makerSubmittedAt is not set (Maker never clicked Submit A4)", () => {
      const { comp, api } = setup();
      comp.selectFunction(A4);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-a4-unsubmitted', movementType: 'UTILIZE', makerSubmittedAt: null });
      comp.submitResult = null;

      comp.checkerAct('release');

      expect(api.release).not.toHaveBeenCalled();
      expect(comp.checkerError).toMatch(/has not been Submitted by a Maker yet/);
    });

    it('A4: reject is NOT gated by makerSubmittedAt — a Checker may decline an unsubmitted item directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A4);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-a4-unsubmitted', movementType: 'UTILIZE', makerSubmittedAt: null });
      comp.submitResult = null;

      comp.checkerAct('reject');

      expect(api.reject).toHaveBeenCalledWith('mv-a4-unsubmitted', comp.checkerId, 'MANUAL_QUEUE_REJECT');
    });

    it('plain path: reject calls api.reject with MANUAL_QUEUE_REJECT', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });
      comp.submitResult = null;

      comp.checkerAct('reject');

      expect(api.reject).toHaveBeenCalledWith('mv-4', comp.checkerId, 'MANUAL_QUEUE_REJECT');
    });

    it('plain path: a failed release sets checkerError and resets checkerBusy', () => {
      const { comp, api } = setup();
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);
      comp.selectFunction(A2);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });
      comp.submitResult = null;

      comp.checkerAct('release');

      expect(comp.checkerError).toBe('ILLEGAL_STATE_TRANSITION');
      expect(comp.checkerBusy).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // loadCheckerQueue()
  // ---------------------------------------------------------------------
  describe('loadCheckerQueue()', () => {
    it('no-ops (no listMovements call) when there is no checker contract resolved', () => {
      const { comp, api } = setup();
      comp.checkerContract = null;

      comp.loadCheckerQueue();

      expect(api.listMovements).not.toHaveBeenCalled();
      expect(comp.checkerItems).toEqual([]);
    });

    it('success: filters to PENDING movements only', () => {
      const { comp, api } = setup();
      comp.checkerContract = makeContract({ balanceContractId: 'bc-9' });
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm1', status: 'PENDING' }),
          makeMovement({ movementId: 'm2', status: 'RELEASED' }),
          makeMovement({ movementId: 'm3', status: 'PENDING' }),
        ]) as any,
      );

      comp.loadCheckerQueue();

      expect(api.listMovements).toHaveBeenCalledWith('bc-9');
      expect(comp.checkerItems.map((m: any) => m.movementId)).toEqual(['m1', 'm3']);
      expect(comp.checkerLoading).toBe(false);
    });

    it('error: resets checkerItems to empty and checkerLoading to false', () => {
      const { comp, api } = setup();
      comp.checkerContract = makeContract({ balanceContractId: 'bc-9' });
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.loadCheckerQueue();

      expect(comp.checkerItems).toEqual([]);
      expect(comp.checkerLoading).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // onSelectCheckerMovement()
  // ---------------------------------------------------------------------
  describe('onSelectCheckerMovement()', () => {
    it('selects the matching movement and clears any stale arrivalApproved flag', () => {
      const { comp } = setup();
      comp.checkerItems = [makeMovement({ movementId: 'm1' }), makeMovement({ movementId: 'm2' })];
      comp.arrivalApproved = true;

      comp.onSelectCheckerMovement('m2');

      expect(comp.selectedCheckerMovement?.movementId).toBe('m2');
      expect(comp.arrivalApproved).toBe(false);
    });

    it('sets null when the movementId is not found in the current queue', () => {
      const { comp } = setup();
      comp.checkerItems = [makeMovement({ movementId: 'm1' })];

      comp.onSelectCheckerMovement('does-not-exist');

      expect(comp.selectedCheckerMovement).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // runLookup()
  // ---------------------------------------------------------------------
  describe('runLookup()', () => {
    it('success: resolves the contract, snapshot, and event timeline (sorted by true Event Date/Time, not eventSeq)', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(
        of(makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } })) as any,
      );
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot({ availableBalance: '750' })) as any);
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm2', eventSeq: 2, createdAt: '2026-08-18T02:00:00.000Z' }),
          makeMovement({ movementId: 'm1', eventSeq: 1, createdAt: '2026-08-18T01:00:00.000Z' }),
        ]) as any,
      );
      comp.lookUp.lookup = { instrumentType: 'SHGT', lcNumber: 'LC001', ibNumber: '', sgNumber: 'SG01' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupResult?.snapshot.availableBalance).toBe('750');
      expect(comp.lookUp.lookupMovements.map((row: any) => row.movement.movementId)).toEqual(['m1', 'm2']);
      expect(comp.lookUp.lookupError).toBeNull();
      // SHGT has no Acceptance-tab type and isn't IPLC_LC, so neither extra catalog fetch fires.
    });

    // 2026-08-18, user-requested ("Look Up Current Balance's own Event Timeline should use the SAME
    // status/display logic as Inquire Events — must not maintain its own independent STATUS mapping"),
    // reproducing the live LC S01 report: a finalized Sight IPLC_LC/UTILIZE (A3's own Document Arrival,
    // later A4-finalized) must split into its own 'create' + 'finalize' rows here too — the exact same
    // toEventRows() split Inquire Events already applies — not render as a single row reading the
    // movement's own current (post-A4) status straight off it.
    it('a finalized Sight IPLC_LC/UTILIZE splits into its own create+finalize rows, matching Inquire Events exactly — not a single row with the raw current status', () => {
      const { comp, api } = setup();
      const sightLc = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const finalizedUtilize = makeMovement({
        movementId: 'mv-utilize',
        movementType: 'UTILIZE',
        status: 'RELEASED',
        eventSeq: 2,
        createdAt: '2026-08-18T01:00:00.000Z',
        releasedAt: '2026-08-18T05:00:00.000Z',
      });
      api.resolveContract.mockReturnValueOnce(of(sightLc) as any);
      api.listMovements.mockReturnValueOnce(of([finalizedUtilize]) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements).toHaveLength(2);
      const [createRow, finalizeRow] = comp.lookUp.lookupMovements;
      expect(createRow.phase).toBe('create');
      // Bug fixed 2026-08-18, reviewer-caught live on this EXACT scenario ("EARMARKING是指A3交易未被
      // RELEASE 但是已經RELEASED了 就該是EARMARKED 不是嗎?"): the 'create' row's own eventStatus is now
      // the movement's real, current status (RELEASED here) — NOT a stale forced 'PENDING' — reversing
      // an earlier same-day design.
      expect(createRow.eventStatus).toBe('RELEASED');
      expect(createRow.eventTime).toBe('2026-08-18T01:00:00.000Z');
      expect(finalizeRow.phase).toBe('finalize');
      expect(finalizeRow.eventStatus).toBe('RELEASED');
      expect(finalizeRow.eventTime).toBe('2026-08-18T05:00:00.000Z');
      // Both rows share the SAME underlying movement — the split is presentational, not two real records.
      expect(createRow.movement).toBe(finalizeRow.movement);
      // Bug fixed 2026-08-18, reviewer-caught live ("Import LC S01 => A4 · Sight Settlement / IPLC_LC /
      // UTILIZE ... EARMARKED — 應該是 Approved 對嗎?"): the 'finalize' row is A4's OWN Release, not
      // A3/A3S's own earmark, so it must display APPROVED. The 'create' row (A3's own submission) is
      // STILL A3/A3S's own earmark — now that its own eventStatus correctly shows RELEASED (not a stale
      // PENDING), it correctly displays EARMARKED, not EARMARKING.
      expect(comp.displayStatus(createRow.eventStatus, createRow.contract.instrumentType, createRow.movement.movementType, createRow.phase)).toBe('EARMARKED');
      expect(comp.displayStatus(finalizeRow.eventStatus, finalizeRow.contract.instrumentType, finalizeRow.movement.movementType, finalizeRow.phase)).toBe('APPROVED');
      // UX enhancement 2026-08-19 ("Look Up Current Balance → Event Timeline" gains a FUNCTION column
      // that "must use the same Function mapping as Inquire Events... Do not implement a separate
      // Function mapping") — lookUp.functionFor() delegates to the exact same functionForEvent() free
      // function InquireEventsService.functionFor() itself now delegates to, so the 'create' row
      // resolves to A3 and the 'finalize' row to A4, matching Inquire Events' own resolution exactly.
      expect(comp.lookUp.functionFor(createRow)?.code).toBe('A3');
      expect(comp.lookUp.functionFor(finalizeRow)?.code).toBe('A4');
    });

    // Companion to the test immediately above — a Sight Document Arrival that has NOT yet been
    // finalized by A4 must stay a SINGLE 'primary' row showing EARMARKING (not RELEASED/EARMARKED) —
    // toEventRows()'s own split never triggers while the movement is still genuinely PENDING (its own
    // isFinalizedSightUtilize condition requires status !== 'PENDING'), so this case is entirely
    // unaffected by the 2026-08-18 eventStatus fix above.
    it('a NOT-yet-finalized Sight IPLC_LC/UTILIZE (still genuinely PENDING) stays a single row showing EARMARKING, never splits', () => {
      const { comp, api } = setup();
      const sightLc = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const stillPendingUtilize = makeMovement({ movementId: 'mv-utilize-pending', movementType: 'UTILIZE', status: 'PENDING', eventSeq: 2, createdAt: '2026-08-18T01:00:00.000Z' });
      api.resolveContract.mockReturnValueOnce(of(sightLc) as any);
      api.listMovements.mockReturnValueOnce(of([stillPendingUtilize]) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements).toHaveLength(1);
      const [row] = comp.lookUp.lookupMovements;
      expect(row.phase).toBe('primary');
      expect(row.eventStatus).toBe('PENDING');
      expect(comp.displayStatus(row.eventStatus, row.contract.instrumentType, row.movement.movementType, row.phase)).toBe('EARMARKING');
    });

    it('resolveContract error sets lookupError and leaves lookupResult null', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC999', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupError).toBe('NOT_FOUND');
      expect(comp.lookUp.lookupResult).toBeNull();
    });

    it('getSnapshot error (after a successful resolveContract) sets lookupError', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract()) as any);
      api.getSnapshot.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupError).toBe('NOT_FOUND');
    });

    it('IPLC_LC contract: fetches both Acceptance and SG candidates, auto-selecting a sole candidate on each', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' })) as any);
      api.catalog
        .mockReturnValueOnce(
          of({ items: [makeContract({ balanceContractId: 'bc-acc-1', instrumentType: 'IPLC_ACCEPTANCE' })], total: 1, page: 1, pageSize: 50 }) as any,
        )
        .mockReturnValueOnce(of({ items: [makeContract({ balanceContractId: 'bc-sg-1', instrumentType: 'SHGT' })], total: 1, page: 1, pageSize: 50 }) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(api.catalog).toHaveBeenCalledWith('IPLC_ACCEPTANCE', undefined, undefined, 1, 50, 'LC001');
      expect(api.catalog).toHaveBeenCalledWith('SHGT', undefined, undefined, 1, 50, 'LC001');
      expect(comp.lookUp.acceptancesUnderLookup.map((c) => c.balanceContractId)).toEqual(['bc-acc-1']);
      expect(comp.lookUp.sgsUnderLookup.map((c) => c.balanceContractId)).toEqual(['bc-sg-1']);
      // Sole candidate on each tab auto-selects.
      expect(comp.lookUp.selectedLookupAcceptance?.balanceContractId).toBe('bc-acc-1');
      expect(comp.lookUp.selectedLookupSg?.balanceContractId).toBe('bc-sg-1');
    });

    it('EPLC_CONFIRMATION contract: fetches Acceptance candidates (EPLC_ACCEPTANCE) only, never SG', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' })) as any);
      comp.lookUp.lookup = { instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(api.catalog).toHaveBeenCalledWith('EPLC_ACCEPTANCE', undefined, undefined, 1, 50, 'LC001');
      expect(api.catalog).not.toHaveBeenCalledWith('SHGT', undefined, undefined, 1, 50, 'LC001');
    });

    // Bug fixed 2026-08-18, reviewer-reported live ("Look Up Current Balance → Event Timeline 明顯有漏
    //資料...主要漏掉的是 B3 Present Docs / EPLC_EXAMINATION 的 Earmark Events") — the Confirmed LC's own
    // Tab 1 Event Timeline previously only ever fetched movements for the LC's OWN contract, so every
    // B3/EPLC_EXAMINATION Earmark event (each living on its own separate per-E01/E02/E03 contract) was
    // invisible here even though Inquire Events' own already-merged timeline showed them correctly.
    it('EPLC_CONFIRMATION contract: merges every B3/EPLC_EXAMINATION Earmark event into the LC tab timeline, sorted by true Event Date/Time across contracts', () => {
      const { comp, api } = setup();
      const confirmationLc = makeContract({ balanceContractId: 'bc-conf-1', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'U01', ibNumber: null, sgNumber: null } });
      const examE01 = makeContract({ balanceContractId: 'bc-exam-e01', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'U01', ibNumber: 'E01', sgNumber: null } });
      const examE02 = makeContract({ balanceContractId: 'bc-exam-e02', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'U01', ibNumber: 'E02', sgNumber: null } });
      api.resolveContract.mockReturnValueOnce(of(confirmationLc) as any);
      (api.catalog as any).mockImplementation((instrumentType: string) =>
        instrumentType === 'EPLC_EXAMINATION'
          ? of({ items: [examE01, examE02], total: 2, page: 1, pageSize: 50 })
          : of({ items: [], total: 0, page: 1, pageSize: 50 }),
      );
      (api.listMovements as any).mockImplementation((contractId: string) => {
        if (contractId === 'bc-conf-1') return of([makeMovement({ movementId: 'mv-issue', movementType: 'ISSUE', status: 'RELEASED', createdAt: '2026-08-18T01:00:00.000Z' })]);
        if (contractId === 'bc-exam-e01') return of([makeMovement({ movementId: 'mv-exam-e01', movementType: 'CREATE', status: 'RELEASED', createdAt: '2026-08-18T02:00:00.000Z' })]);
        if (contractId === 'bc-exam-e02') return of([makeMovement({ movementId: 'mv-exam-e02', movementType: 'CREATE', status: 'PENDING', createdAt: '2026-08-18T03:00:00.000Z' })]);
        return of([]);
      });
      comp.lookUp.lookup = { instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'U01', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements.map((row: any) => row.movement.movementId)).toEqual(['mv-issue', 'mv-exam-e01', 'mv-exam-e02']);
      const [issueRow, e01Row, e02Row] = comp.lookUp.lookupMovements;
      expect(issueRow.contract.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(e01Row.contract.instrumentType).toBe('EPLC_EXAMINATION');
      expect(e01Row.contract.naturalKey.ibNumber).toBe('E01');
      expect(e02Row.contract.naturalKey.ibNumber).toBe('E02');
      // Status mapping stays the SAME shared logic (isEarmarkFunction) both screens use — B3 RELEASED →
      // EARMARKED, B3 still-PENDING → EARMARKING — matching the reported table exactly.
      expect(comp.displayStatus(e01Row.eventStatus, e01Row.contract.instrumentType, e01Row.movement.movementType, e01Row.phase)).toBe('EARMARKED');
      expect(comp.displayStatus(e02Row.eventStatus, e02Row.contract.instrumentType, e02Row.movement.movementType, e02Row.phase)).toBe('EARMARKING');
    });

    it('listMovements error resets lookupMovements to empty (independent of a successful resolveContract/getSnapshot)', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract()) as any);
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookupMovements = [makeEventRow()];
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements).toEqual([]);
    });

    it('a failed Acceptance-candidates catalog fetch resets acceptancesUnderLookup to empty', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' })) as any);
      api.catalog.mockReturnValueOnce(apiErr('NOT_FOUND') as any).mockReturnValueOnce(of({ items: [], total: 0, page: 1, pageSize: 50 }) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.acceptancesUnderLookup).toEqual([]);
    });

    it('a failed SG-candidates catalog fetch resets sgsUnderLookup to empty', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' })) as any);
      api.catalog.mockReturnValueOnce(of({ items: [], total: 0, page: 1, pageSize: 50 }) as any).mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.sgsUnderLookup).toEqual([]);
    });

    it('resets any prior tab/selection state on a fresh call', () => {
      const { comp, api } = setup();
      comp.lookUp.lookupTab = 'ACCEPTANCE';
      comp.lookUp.selectedLookupAcceptance = makeContract({ balanceContractId: 'stale-acc' });
      comp.lookUp.acceptanceSnapshot = makeSnapshot();
      comp.lookUp.selectedLookupSg = makeContract({ balanceContractId: 'stale-sg' });
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'SHGT' })) as any);
      comp.lookUp.lookup = { instrumentType: 'SHGT', lcNumber: 'LC001', ibNumber: '', sgNumber: 'SG01' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupTab).toBe('LC');
      expect(comp.lookUp.selectedLookupAcceptance).toBeNull();
      expect(comp.lookUp.acceptanceSnapshot).toBeNull();
      expect(comp.lookUp.selectedLookupSg).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // selectLookupTab()
  // ---------------------------------------------------------------------
  describe('selectLookupTab()', () => {
    it('ACCEPTANCE tab auto-selects the sole candidate when none is yet selected', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot()) as any);

      comp.lookUp.selectLookupTab('ACCEPTANCE');

      expect(comp.lookUp.lookupTab).toBe('ACCEPTANCE');
      expect(comp.lookUp.selectedLookupAcceptance?.balanceContractId).toBe('bc-acc-1');
    });

    it('SG tab auto-selects the sole candidate when none is yet selected', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot()) as any);

      comp.lookUp.selectLookupTab('SG');

      expect(comp.lookUp.lookupTab).toBe('SG');
      expect(comp.lookUp.selectedLookupSg?.balanceContractId).toBe('bc-sg-1');
    });

    it('LC tab just switches — no auto-select side effects', () => {
      const { comp, api } = setup();

      comp.lookUp.selectLookupTab('LC');

      expect(comp.lookUp.lookupTab).toBe('LC');
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('ACCEPTANCE tab does not re-trigger auto-select when a selection already exists', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.selectedLookupAcceptance = makeContract({ balanceContractId: 'bc-acc-1' });

      comp.lookUp.selectLookupTab('ACCEPTANCE');

      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('ACCEPTANCE tab does not auto-select when there is more than one candidate', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' }), makeContract({ balanceContractId: 'bc-acc-2' })];

      comp.lookUp.selectLookupTab('ACCEPTANCE');

      expect(comp.lookUp.selectedLookupAcceptance).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // pagedLookupMovements / lookupMovementsPaging (2026-08-19, "+ Event Timeline 使用PAGE BY PAGE PATTERN")
  // ---------------------------------------------------------------------
  describe('pagedLookupMovements / lookupMovementsPaging', () => {
    it('windows a >10-item movements array to 10 per page and computes totalPages', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 23 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `m${i}` }) }));

      const page1 = comp.lookUp.pagedLookupMovements;

      expect(page1).toHaveLength(10);
      expect(page1.map((r: any) => r.movement.movementId)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`));
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(23);
      expect(comp.lookUp.lookupMovementsPaging.totalPages).toBe(3);
    });

    it('nextLookupMovementsPage()/prevLookupMovementsPage() move within bounds and refuse past either edge', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 15 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `m${i}` }) }));
      void comp.lookUp.pagedLookupMovements; // establish paging.total/totalPages for this array

      comp.lookUp.prevLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1); // already at page 1, refuses to go below

      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2);
      expect(comp.lookUp.pagedLookupMovements.map((r: any) => r.movement.movementId)).toEqual(['m10', 'm11', 'm12', 'm13', 'm14']);

      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2); // already at the last page, refuses to advance further

      comp.lookUp.prevLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
    });

    it('resets to page 1 when a fresh runLookup() replaces the LC tab movements array', () => {
      const { comp, api } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 12 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `old${i}` }) }));
      void comp.lookUp.pagedLookupMovements;
      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2);

      comp.lookUp.lookup.lcNumber = 'S01';
      api.listMovements.mockReturnValueOnce(of([{ movementId: 'mv-issue', movementType: 'ISSUE', status: 'RELEASED', createdAt: '2026-01-01T00:00:00Z' }]));
      comp.lookUp.runLookup();

      expect(comp.lookUp.pagedLookupMovements).toHaveLength(1);
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(1);
    });

    it('switching to an ALREADY-LOADED tab (no re-fetch) resets to page 1 against that tab\'s own array — must not carry over a stale page from a different tab', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 25 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `lc${i}` }) }));
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.selectedLookupAcceptance = makeContract({ balanceContractId: 'bc-acc-1' });
      comp.lookUp.acceptanceMovements = Array.from({ length: 3 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `acc${i}` }) }));

      // Drive the LC tab's own timeline to page 3 first.
      void comp.lookUp.pagedLookupMovements;
      comp.lookUp.nextLookupMovementsPage();
      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(3);

      // Switch to the Acceptance tab — already has selectedLookupAcceptance set, so this does NOT re-fetch
      // (see the "does not re-trigger auto-select when a selection already exists" test above), yet the
      // paging must still land back on page 1 against the Acceptance tab's own (much shorter) array.
      comp.lookUp.selectLookupTab('ACCEPTANCE');

      const acceptancePage = comp.lookUp.pagedLookupMovements;
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(3);
      expect(acceptancePage.map((r: any) => r.movement.movementId)).toEqual(['acc0', 'acc1', 'acc2']);

      // And switching back to LC must independently restore ITS OWN paging context (page 1 of 25, not a
      // leftover page 3 or the Acceptance tab's own total of 3).
      comp.lookUp.selectLookupTab('LC');
      const lcPage = comp.lookUp.pagedLookupMovements;
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(25);
      expect(lcPage.map((r: any) => r.movement.movementId)).toEqual(Array.from({ length: 10 }, (_, i) => `lc${i}`));
    });

    it('regression — switching to a tab whose own array is currently EMPTY must not leave a stale total/page from the previous tab visible via activeLookupMovements/totalPages (bug caught live: the SG tab with 2+ un-auto-selected candidates showed "Page 2/2 (12 total)" over an empty table)', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 12 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `lc${i}` }) }));
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' }), makeContract({ balanceContractId: 'bc-sg-2' })];
      comp.lookUp.sgMovements = []; // no auto-select with 2+ candidates — mirrors the live-reproduced scenario exactly

      // Drive the LC tab to page 2 of 2 first, exactly like the live repro.
      void comp.lookUp.pagedLookupMovements;
      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(12);

      // Switch to the SG tab — no fetch fires (2 candidates, no auto-select), so pagedLookupMovements is
      // never called by the template (activeLookupMovements.length is 0, the *ngIf table wrapper never
      // renders) — only activeLookupMovements itself gets read, by the template's own *ngIf/hint bindings.
      comp.lookUp.selectLookupTab('SG');
      void comp.lookUp.activeLookupMovements; // the ONLY binding the template guarantees gets read here

      expect(comp.lookUp.lookupMovementsPaging.total).toBe(0);
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.totalPages).toBe(1); // Math.max(1, ceil(0/10)) — the .tb-pagination block's own totalPages > 1 guard correctly stays hidden
    });
  });

  // ---------------------------------------------------------------------
  // selectLookupSg()
  // ---------------------------------------------------------------------
  describe('selectLookupSg()', () => {
    it('found: loads snapshot + event timeline sorted by true Event Date/Time, not eventSeq', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot({ availableBalance: '250' })) as any);
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm2', eventSeq: 2, createdAt: '2026-08-18T02:00:00.000Z' }),
          makeMovement({ movementId: 'm1', eventSeq: 1, createdAt: '2026-08-18T01:00:00.000Z' }),
        ]) as any,
      );

      comp.lookUp.selectLookupSg('bc-sg-1');

      expect(comp.lookUp.selectedLookupSg?.balanceContractId).toBe('bc-sg-1');
      expect(comp.lookUp.sgSnapshot?.availableBalance).toBe('250');
      expect(comp.lookUp.sgMovements.map((row: any) => row.movement.movementId)).toEqual(['m1', 'm2']);
    });

    it('not found: resets selection, snapshot, and movements', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      comp.lookUp.sgSnapshot = makeSnapshot();
      comp.lookUp.sgMovements = [makeEventRow()];

      comp.lookUp.selectLookupSg('does-not-exist');

      expect(comp.lookUp.selectedLookupSg).toBeNull();
      expect(comp.lookUp.sgSnapshot).toBeNull();
      expect(comp.lookUp.sgMovements).toEqual([]);
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('getSnapshot/listMovements errors reset sgSnapshot/sgMovements respectively', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      api.getSnapshot.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.lookUp.selectLookupSg('bc-sg-1');

      expect(comp.lookUp.sgSnapshot).toBeNull();
      expect(comp.lookUp.sgMovements).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // selectLookupAcceptance()
  // ---------------------------------------------------------------------
  describe('selectLookupAcceptance()', () => {
    it('found: loads snapshot + event timeline sorted by true Event Date/Time, not eventSeq, independent of the LC tab', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.lookupResult = { contract: makeContract({ balanceContractId: 'bc-lc-1' }), snapshot: makeSnapshot({ availableBalance: '999' }) };
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot({ availableBalance: '400' })) as any);
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm2', eventSeq: 2, createdAt: '2026-08-18T02:00:00.000Z' }),
          makeMovement({ movementId: 'm1', eventSeq: 1, createdAt: '2026-08-18T01:00:00.000Z' }),
        ]) as any,
      );

      comp.lookUp.selectLookupAcceptance('bc-acc-1');

      expect(comp.lookUp.selectedLookupAcceptance?.balanceContractId).toBe('bc-acc-1');
      expect(comp.lookUp.acceptanceSnapshot?.availableBalance).toBe('400');
      expect(comp.lookUp.acceptanceMovements.map((row: any) => row.movement.movementId)).toEqual(['m1', 'm2']);
      // The LC tab's own lookupResult is untouched.
      expect(comp.lookUp.lookupResult?.snapshot.availableBalance).toBe('999');
    });

    it('not found: resets selection, snapshot, and movements', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.acceptanceSnapshot = makeSnapshot();
      comp.lookUp.acceptanceMovements = [makeEventRow()];

      comp.lookUp.selectLookupAcceptance('does-not-exist');

      expect(comp.lookUp.selectedLookupAcceptance).toBeNull();
      expect(comp.lookUp.acceptanceSnapshot).toBeNull();
      expect(comp.lookUp.acceptanceMovements).toEqual([]);
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('getSnapshot/listMovements errors reset acceptanceSnapshot/acceptanceMovements respectively', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      api.getSnapshot.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.lookUp.selectLookupAcceptance('bc-acc-1');

      expect(comp.lookUp.acceptanceSnapshot).toBeNull();
      expect(comp.lookUp.acceptanceMovements).toEqual([]);
    });
  });
});
