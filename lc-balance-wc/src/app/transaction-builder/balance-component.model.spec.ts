import {
  InstrumentType,
  INSTRUMENT_TYPE_OPTIONS,
  MOVEMENT_TYPES_BY_INSTRUMENT,
  NATURAL_KEY_FIELDS_BY_INSTRUMENT,
  TOLERANCE_APPLICABLE_INSTRUMENT_TYPES,
  TOLERANCE_APPLICABLE_MOVEMENT_TYPES,
  isToleranceApplicable,
  CREATING_MOVEMENT_TYPES,
  HAS_PARENT,
  PARENT_INSTRUMENT_OPTIONS,
  DECREASING_MOVEMENT_TYPES,
  IMPORT_FUNCTIONS,
  EXPORT_FUNCTIONS,
  TransactionFunction,
  CURRENCY_DECIMALS,
  decimalPlacesForCurrency,
  amountExceedsCurrencyDecimals,
  defaultLcInstrumentTypeForSide,
  childInstrumentTypesOf,
  resolveFunctionForMovement,
} from './balance-component.model';

// The 10 InstrumentType values, per src/types.ts / the CLAUDE.md domain-model section. This is the
// independent source of truth the data tables below are all cross-checked against.
const ALL_INSTRUMENT_TYPES: InstrumentType[] = [
  'IPLC_LC',
  'EPLC_LC',
  'IPLC_ACCEPTANCE',
  'EPLC_ACCEPTANCE',
  'SHGT',
  'EPLC_CONFIRMATION',
  'EPLC_DUE_FROM_ISSUING_BANK',
  'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
  'EPLC_EXPORT_BILLS_DISCOUNTED',
  'EPLC_EXAMINATION',
];

describe('balance-component.model data invariants', () => {
  describe('InstrumentType coverage', () => {
    it('INSTRUMENT_TYPE_OPTIONS covers every InstrumentType exactly once', () => {
      const values = INSTRUMENT_TYPE_OPTIONS.map((o) => o.value);
      expect(new Set(values)).toEqual(new Set(ALL_INSTRUMENT_TYPES));
      expect(values).toHaveLength(ALL_INSTRUMENT_TYPES.length);
      expect(new Set(values).size).toBe(values.length); // no duplicates
    });

    it('every option has a non-empty label', () => {
      for (const opt of INSTRUMENT_TYPE_OPTIONS) {
        expect(opt.label).toBeTruthy();
        expect(opt.label).toContain(opt.value);
      }
    });

    it('MOVEMENT_TYPES_BY_INSTRUMENT has an entry for every InstrumentType, no extras', () => {
      expect(new Set(Object.keys(MOVEMENT_TYPES_BY_INSTRUMENT))).toEqual(new Set(ALL_INSTRUMENT_TYPES));
    });

    it('every instrument has a non-empty movementType list', () => {
      for (const t of ALL_INSTRUMENT_TYPES) {
        expect(MOVEMENT_TYPES_BY_INSTRUMENT[t].length).toBeGreaterThan(0);
      }
    });

    it('NATURAL_KEY_FIELDS_BY_INSTRUMENT has an entry for every InstrumentType, no extras', () => {
      expect(new Set(Object.keys(NATURAL_KEY_FIELDS_BY_INSTRUMENT))).toEqual(new Set(ALL_INSTRUMENT_TYPES));
    });

    it('PARENT_INSTRUMENT_OPTIONS has an entry for every InstrumentType, no extras', () => {
      expect(new Set(Object.keys(PARENT_INSTRUMENT_OPTIONS))).toEqual(new Set(ALL_INSTRUMENT_TYPES));
    });
  });

  describe('MOVEMENT_TYPES_BY_INSTRUMENT — design doc §5, exact legal movementType sets', () => {
    const expected: Record<InstrumentType, string[]> = {
      IPLC_LC: ['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'UTILIZE'],
      EPLC_LC: ['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE'],
      IPLC_ACCEPTANCE: ['CREATE', 'PARTIAL_SETTLE', 'FULL_SETTLE'],
      EPLC_ACCEPTANCE: ['CREATE', 'PARTIAL_SETTLE', 'FULL_SETTLE'],
      SHGT: ['ISSUE', 'PARTIAL_REDEEM', 'FULL_REDEEM'],
      EPLC_CONFIRMATION: ['ISSUE', 'AMEND', 'HONOUR', 'ACCEPT'],
      EPLC_DUE_FROM_ISSUING_BANK: ['CREATE', 'REIMBURSE'],
      EPLC_ACCEPTANCE_REIMB_RECEIVABLE: ['CREATE', 'REIMBURSE', 'RECLASSIFY_OUT'],
      EPLC_EXPORT_BILLS_DISCOUNTED: ['CREATE', 'REIMBURSE'],
      EPLC_EXAMINATION: ['CREATE'],
    };

    it.each(ALL_INSTRUMENT_TYPES)('%s matches its documented movementType set exactly', (t) => {
      expect(MOVEMENT_TYPES_BY_INSTRUMENT[t]).toEqual(expected[t]);
    });
  });

  describe('NATURAL_KEY_FIELDS_BY_INSTRUMENT — design doc §3.1', () => {
    const expected: Record<InstrumentType, ('ibNumber' | 'sgNumber')[]> = {
      IPLC_LC: [],
      EPLC_LC: [],
      IPLC_ACCEPTANCE: ['ibNumber'],
      EPLC_ACCEPTANCE: ['ibNumber'],
      SHGT: ['sgNumber'],
      EPLC_CONFIRMATION: [],
      EPLC_DUE_FROM_ISSUING_BANK: ['ibNumber'],
      EPLC_ACCEPTANCE_REIMB_RECEIVABLE: ['ibNumber'],
      EPLC_EXPORT_BILLS_DISCOUNTED: ['ibNumber'],
      EPLC_EXAMINATION: ['ibNumber'],
    };

    it.each(ALL_INSTRUMENT_TYPES)('%s matches its documented natural-key field set exactly', (t) => {
      expect(NATURAL_KEY_FIELDS_BY_INSTRUMENT[t]).toEqual(expected[t]);
    });

    it('only SHGT declares sgNumber as a natural key field', () => {
      for (const t of ALL_INSTRUMENT_TYPES) {
        if (t === 'SHGT') {
          expect(NATURAL_KEY_FIELDS_BY_INSTRUMENT[t]).toContain('sgNumber');
        } else {
          expect(NATURAL_KEY_FIELDS_BY_INSTRUMENT[t]).not.toContain('sgNumber');
        }
      }
    });
  });

  describe('PARENT_INSTRUMENT_OPTIONS — design doc §3.1/§6.1', () => {
    const expected: Record<InstrumentType, InstrumentType[]> = {
      IPLC_LC: [],
      EPLC_LC: [],
      IPLC_ACCEPTANCE: ['IPLC_LC'],
      EPLC_ACCEPTANCE: ['EPLC_CONFIRMATION'],
      SHGT: ['IPLC_LC'],
      EPLC_CONFIRMATION: [],
      EPLC_DUE_FROM_ISSUING_BANK: [],
      EPLC_ACCEPTANCE_REIMB_RECEIVABLE: [],
      EPLC_EXPORT_BILLS_DISCOUNTED: [],
      EPLC_EXAMINATION: ['EPLC_CONFIRMATION'],
    };

    it.each(ALL_INSTRUMENT_TYPES)('%s matches its documented parent-instrument option set exactly', (t) => {
      expect(PARENT_INSTRUMENT_OPTIONS[t]).toEqual(expected[t]);
    });

    it('HAS_PARENT is exactly the set of instrumentTypes with a non-empty PARENT_INSTRUMENT_OPTIONS entry', () => {
      const withParentOptions = ALL_INSTRUMENT_TYPES.filter((t) => PARENT_INSTRUMENT_OPTIONS[t].length > 0);
      expect(new Set(withParentOptions)).toEqual(HAS_PARENT);
      expect(HAS_PARENT).toEqual(new Set(['IPLC_ACCEPTANCE', 'EPLC_ACCEPTANCE', 'SHGT', 'EPLC_EXAMINATION']));
    });

    it('every parent option value listed is itself a valid InstrumentType', () => {
      for (const t of ALL_INSTRUMENT_TYPES) {
        for (const parent of PARENT_INSTRUMENT_OPTIONS[t]) {
          expect(ALL_INSTRUMENT_TYPES).toContain(parent);
        }
      }
    });
  });

  describe('isToleranceApplicable() — design doc §6.2 truth table', () => {
    it('TOLERANCE_APPLICABLE_INSTRUMENT_TYPES is exactly {IPLC_LC, EPLC_LC, EPLC_CONFIRMATION}', () => {
      expect(TOLERANCE_APPLICABLE_INSTRUMENT_TYPES).toEqual(new Set(['IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION']));
    });

    it('TOLERANCE_APPLICABLE_MOVEMENT_TYPES is exactly {ISSUE, AMEND_INCREASE, AMEND_DECREASE, AMEND}', () => {
      expect(TOLERANCE_APPLICABLE_MOVEMENT_TYPES).toEqual(new Set(['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND']));
    });

    it.each([
      ['IPLC_LC', 'ISSUE', true],
      ['IPLC_LC', 'AMEND_INCREASE', true],
      ['IPLC_LC', 'AMEND_DECREASE', true],
      ['IPLC_LC', 'UTILIZE', false],
      ['EPLC_LC', 'ISSUE', true],
      ['EPLC_LC', 'AMEND_INCREASE', true],
      ['EPLC_LC', 'AMEND_DECREASE', true],
      ['EPLC_CONFIRMATION', 'ISSUE', true],
      ['EPLC_CONFIRMATION', 'AMEND', true],
      ['EPLC_CONFIRMATION', 'HONOUR', false],
      ['EPLC_CONFIRMATION', 'ACCEPT', false],
      // The gate checks BOTH instrumentType AND movementType — SHGT's own 'ISSUE' string collides
      // with LC's 'ISSUE' but SHGT is not in the tolerance-applicable instrument set, so this must
      // stay false ("Tolerance 只有開證與修證適用...SG或IB就是SG AMOUNT或BILLS AMOUNT").
      ['SHGT', 'ISSUE', false],
      ['SHGT', 'PARTIAL_REDEEM', false],
      ['SHGT', 'FULL_REDEEM', false],
      ['IPLC_ACCEPTANCE', 'CREATE', false],
      ['EPLC_ACCEPTANCE', 'CREATE', false],
      ['EPLC_DUE_FROM_ISSUING_BANK', 'CREATE', false],
      ['EPLC_ACCEPTANCE_REIMB_RECEIVABLE', 'CREATE', false],
      ['EPLC_EXPORT_BILLS_DISCOUNTED', 'CREATE', false],
      ['EPLC_EXAMINATION', 'CREATE', false],
      // Unknown/unrelated movementType on an otherwise-applicable instrument.
      ['IPLC_LC', 'SOME_UNKNOWN_TYPE', false],
    ] as [InstrumentType, string, boolean][])('isToleranceApplicable(%s, %s) === %s', (instrumentType, movementType, expected) => {
      expect(isToleranceApplicable(instrumentType, movementType)).toBe(expected);
    });

    it('is true only for the exact cross-product of the tolerance-applicable instrument/movementType sets, across every real movementType this app declares', () => {
      for (const t of ALL_INSTRUMENT_TYPES) {
        for (const mv of MOVEMENT_TYPES_BY_INSTRUMENT[t]) {
          const expected = TOLERANCE_APPLICABLE_INSTRUMENT_TYPES.has(t) && TOLERANCE_APPLICABLE_MOVEMENT_TYPES.has(mv);
          expect(isToleranceApplicable(t, mv)).toBe(expected);
        }
      }
    });
  });

  describe('CREATING_MOVEMENT_TYPES', () => {
    it('is exactly {ISSUE, CREATE}', () => {
      expect(CREATING_MOVEMENT_TYPES).toEqual(new Set(['ISSUE', 'CREATE']));
    });
  });

  describe('DECREASING_MOVEMENT_TYPES — business instruction 2026-08-14, mirrors MOVEMENT_DIRECTION -1 rows', () => {
    it('is exactly the documented set', () => {
      expect(DECREASING_MOVEMENT_TYPES).toEqual(
        new Set([
          'AMEND_DECREASE',
          'UTILIZE',
          'HONOUR',
          'ACCEPT',
          'PARTIAL_SETTLE',
          'FULL_SETTLE',
          'PARTIAL_REDEEM',
          'FULL_REDEEM',
          'REIMBURSE',
          'RECLASSIFY_OUT',
        ]),
      );
    });

    it('deliberately excludes AMEND_INCREASE/ISSUE/CREATE/AMEND — 0 is a normal starting point for these', () => {
      for (const mv of ['AMEND_INCREASE', 'ISSUE', 'CREATE', 'AMEND']) {
        expect(DECREASING_MOVEMENT_TYPES.has(mv)).toBe(false);
      }
    });

    it('every DECREASING_MOVEMENT_TYPES entry is a real movementType declared somewhere in MOVEMENT_TYPES_BY_INSTRUMENT', () => {
      const allDeclaredMovementTypes = new Set(ALL_INSTRUMENT_TYPES.flatMap((t) => MOVEMENT_TYPES_BY_INSTRUMENT[t]));
      for (const mv of DECREASING_MOVEMENT_TYPES) {
        expect(allDeclaredMovementTypes.has(mv)).toBe(true);
      }
    });
  });

  describe('IMPORT_FUNCTIONS (A-series)', () => {
    it('has exactly the 9 surviving A-codes, in order (A5 was retired, not reused)', () => {
      expect(IMPORT_FUNCTIONS.map((f) => f.code)).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9']);
    });

    it('every function has a unique code', () => {
      const codes = IMPORT_FUNCTIONS.map((f) => f.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('every function is side IMPORT, has a non-empty label/help, and a valid instrumentType', () => {
      for (const f of IMPORT_FUNCTIONS) {
        expect(f.side).toBe('IMPORT');
        expect(f.label).toBeTruthy();
        expect(f.help).toBeTruthy();
        expect(ALL_INSTRUMENT_TYPES).toContain(f.instrumentType);
      }
    });

    it('every function declares a fixed movementType or a subChoice (never neither)', () => {
      for (const f of IMPORT_FUNCTIONS) {
        expect(!!f.movementType || !!f.subChoice).toBe(true);
      }
    });

    it("every fixed movementType is legal for that function's own instrumentType", () => {
      for (const f of IMPORT_FUNCTIONS) {
        if (f.movementType) {
          expect(MOVEMENT_TYPES_BY_INSTRUMENT[f.instrumentType]).toContain(f.movementType);
        }
      }
    });

    it('every subChoice keyed on movementType only offers legal movementType values for that instrumentType', () => {
      for (const f of IMPORT_FUNCTIONS) {
        if (f.subChoice && f.subChoice.key === 'movementType') {
          for (const opt of f.subChoice.options) {
            expect(MOVEMENT_TYPES_BY_INSTRUMENT[f.instrumentType]).toContain(opt.value);
          }
        }
      }
    });

    it('A1 (LC Issue) offers all three tenor options and pins IPLC_LC/ISSUE', () => {
      const a1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1') as TransactionFunction;
      expect(a1.instrumentType).toBe('IPLC_LC');
      expect(a1.movementType).toBe('ISSUE');
      expect(a1.tenorTypeOptions?.map((o) => o.value)).toEqual(['SIGHT', 'SELLERS_USANCE', 'BUYERS_USANCE']);
    });

    it('A2 (LC Amendment) offers Increase/Decrease as a movementType subChoice, with a secondaryRefLabel', () => {
      const a2 = IMPORT_FUNCTIONS.find((f) => f.code === 'A2') as TransactionFunction;
      expect(a2.subChoice?.key).toBe('movementType');
      expect(a2.subChoice?.options.map((o) => o.value)).toEqual(['AMEND_INCREASE', 'AMEND_DECREASE']);
      expect(a2.secondaryRefLabel).toBe('Amendment No./Times');
    });

    it('A3 defers settlement (Checker acknowledgment only) and does not settle a document arrival itself', () => {
      const a3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3') as TransactionFunction;
      expect(a3.deferSettlement).toBe(true);
      expect(a3.settlesDocumentArrival).toBeFalsy();
      expect(a3.movementType).toBe('UTILIZE');
    });

    it('A3S is the only function with documentArrivalWithSg, and also defers settlement', () => {
      for (const f of IMPORT_FUNCTIONS) {
        if (f.code === 'A3S') {
          expect(f.documentArrivalWithSg).toBe(true);
          expect(f.deferSettlement).toBe(true);
        } else {
          expect(f.documentArrivalWithSg).toBeFalsy();
        }
      }
    });

    it('A4 is the only function with payExistingUtilize, filters the catalog to SIGHT, and never creates a movement of its own', () => {
      for (const f of IMPORT_FUNCTIONS) {
        if (f.code === 'A4') {
          expect(f.payExistingUtilize).toBe(true);
          expect(f.catalogTenorFilter).toBe('SIGHT');
        } else {
          expect(f.payExistingUtilize).toBeFalsy();
        }
      }
    });

    it("A6 is the only IMPORT function with settlesDocumentArrival, sourced from A3's own UTILIZE", () => {
      for (const f of IMPORT_FUNCTIONS) {
        if (f.code === 'A6') {
          expect(f.settlesDocumentArrival).toBe(true);
          expect(f.payableMovementType).toBe('UTILIZE');
          expect(f.pendingItemSourceHint).toContain('A3');
          expect(f.instrumentType).toBe('IPLC_ACCEPTANCE');
          expect(f.tenorTypeOptions?.map((o) => o.value)).toEqual(['SELLERS_USANCE', 'BUYERS_USANCE']);
        } else {
          expect(f.settlesDocumentArrival).toBeFalsy();
        }
      }
    });

    it('A7 offers Full/Partial Settle as a subChoice and filters the catalog to USANCE (an Acceptance never exists under a Sight LC)', () => {
      const a7 = IMPORT_FUNCTIONS.find((f) => f.code === 'A7') as TransactionFunction;
      expect(a7.subChoice?.options.map((o) => o.value)).toEqual(['FULL_SETTLE', 'PARTIAL_SETTLE']);
      expect(a7.catalogTenorFilter).toBe('USANCE');
      expect(a7.instrumentType).toBe('IPLC_ACCEPTANCE');
    });

    it('A9 is the only function with autoRedeemType, on SHGT', () => {
      for (const f of IMPORT_FUNCTIONS) {
        if (f.code === 'A9') {
          expect(f.autoRedeemType).toBe(true);
          expect(f.instrumentType).toBe('SHGT');
        } else {
          expect(f.autoRedeemType).toBeFalsy();
        }
      }
    });

    it('SHGT/IPLC_ACCEPTANCE functions declare defaultParentInstrumentType: IPLC_LC (A6/A8/A9/A7)', () => {
      for (const code of ['A6', 'A7', 'A8', 'A9']) {
        const f = IMPORT_FUNCTIONS.find((fn) => fn.code === code) as TransactionFunction;
        expect(f.defaultParentInstrumentType).toBe('IPLC_LC');
      }
    });

    it("every function except A1 carries a secondaryRefLabel OR relies on documentArrivalWithSg/payExistingUtilize/autoRedeemType's own natural-key flow", () => {
      // A1 (LC Issue) is the sole function creating a brand-new natural key with nothing to
      // reference yet, per the interface's own doc comment ("every function except LC Issue (A1/B1)
      // requires ONE generic secondary reference").
      const a1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1') as TransactionFunction;
      expect(a1.secondaryRefLabel).toBeUndefined();
    });
  });

  describe('EXPORT_FUNCTIONS (B-series)', () => {
    it('has exactly the 5 B-codes, in order', () => {
      expect(EXPORT_FUNCTIONS.map((f) => f.code)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
    });

    it('every function has a unique code', () => {
      const codes = EXPORT_FUNCTIONS.map((f) => f.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('every function is side EXPORT, has a non-empty label/help, and a valid instrumentType', () => {
      for (const f of EXPORT_FUNCTIONS) {
        expect(f.side).toBe('EXPORT');
        expect(f.label).toBeTruthy();
        expect(f.help).toBeTruthy();
        expect(ALL_INSTRUMENT_TYPES).toContain(f.instrumentType);
      }
    });

    it('every function declares a fixed movementType or a subChoice (never neither)', () => {
      for (const f of EXPORT_FUNCTIONS) {
        expect(!!f.movementType || !!f.subChoice).toBe(true);
      }
    });

    it("every fixed movementType is legal for that function's own instrumentType", () => {
      for (const f of EXPORT_FUNCTIONS) {
        if (f.movementType) {
          expect(MOVEMENT_TYPES_BY_INSTRUMENT[f.instrumentType]).toContain(f.movementType);
        }
      }
    });

    it('B1 (Confirm LC) pins EPLC_CONFIRMATION/ISSUE and offers Sight/Usance-only tenor options labelled plain "Usance"', () => {
      const b1 = EXPORT_FUNCTIONS.find((f) => f.code === 'B1') as TransactionFunction;
      expect(b1.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(b1.movementType).toBe('ISSUE');
      expect(b1.tenorTypeOptions).toEqual([
        { value: 'SIGHT', label: 'Sight' },
        { value: 'SELLERS_USANCE', label: 'Usance' },
      ]);
    });

    it('B2 (Confirm LC Amendment) pins EPLC_CONFIRMATION/AMEND with a secondaryRefLabel', () => {
      const b2 = EXPORT_FUNCTIONS.find((f) => f.code === 'B2') as TransactionFunction;
      expect(b2.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(b2.movementType).toBe('AMEND');
      expect(b2.secondaryRefLabel).toBe('Amendment No./Times');
    });

    it('B3 (Present Docs) is EPLC_EXAMINATION/CREATE, defers settlement with a real backend acknowledgment, and has no secondaryRefLabel of its own', () => {
      const b3 = EXPORT_FUNCTIONS.find((f) => f.code === 'B3') as TransactionFunction;
      expect(b3.instrumentType).toBe('EPLC_EXAMINATION');
      expect(b3.movementType).toBe('CREATE');
      expect(b3.defaultParentInstrumentType).toBe('EPLC_CONFIRMATION');
      expect(b3.deferSettlement).toBe(true);
      expect(b3.deferSettlementMovementType).toBe('CREATE');
      expect(b3.deferSettlementRequiresBackendAck).toBe(true);
      expect(b3.secondaryRefLabel).toBeUndefined();
    });

    it('B3 is the only function with deferSettlementRequiresBackendAck', () => {
      for (const f of [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS]) {
        if (f.code === 'B3') {
          expect(f.deferSettlementRequiresBackendAck).toBe(true);
        } else {
          expect(f.deferSettlementRequiresBackendAck).toBeFalsy();
        }
      }
    });

    it("B4 (Honour / Acceptance) is the unified legal-event step: movementTypeFromContractTenor, settlesDocumentArrival against B3's CREATE, and both compound-creation flags", () => {
      const b4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4') as TransactionFunction;
      expect(b4.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(b4.movementType).toBe('HONOUR');
      expect(b4.movementTypeFromContractTenor).toBe(true);
      expect(b4.settlesDocumentArrival).toBe(true);
      expect(b4.payableMovementType).toBe('CREATE');
      expect(b4.payableMovementInstrumentType).toBe('EPLC_EXAMINATION');
      expect(b4.payableMovementRequiresAcknowledgment).toBe(true);
      expect(b4.pendingItemSourceCode).toBe('B3');
      expect(b4.createsIssuingBankReceivableOnHonour).toBe(true);
      expect(b4.createsAcceptanceReimbReceivableOnCreate).toBe(true);
      expect(b4.secondaryRefLabel).toBe('EB Number');
    });

    it('B4 is the only function with movementTypeFromContractTenor / payableMovementInstrumentType / payableMovementRequiresAcknowledgment', () => {
      for (const f of [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS]) {
        if (f.code === 'B4') continue;
        expect(f.movementTypeFromContractTenor).toBeFalsy();
        expect(f.payableMovementInstrumentType).toBeUndefined();
        expect(f.payableMovementRequiresAcknowledgment).toBeFalsy();
      }
    });

    it('B4 and A6 are the only functions with settlesDocumentArrival', () => {
      const withFlag = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].filter((f) => f.settlesDocumentArrival).map((f) => f.code);
      expect(new Set(withFlag)).toEqual(new Set(['A6', 'B4']));
    });

    it('B5 (Settlement — Reimbursement / Maturity) settles the Acceptance on Maturity, USANCE-only, and drives a settleable-balance two-step index', () => {
      const b5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5') as TransactionFunction;
      expect(b5.instrumentType).toBe('EPLC_ACCEPTANCE');
      expect(b5.movementType).toBe('FULL_SETTLE');
      expect(b5.settlesAcceptanceOnMature).toBe(true);
      expect(b5.catalogTenorFilter).toBe('USANCE');
      expect(b5.settleableBalanceIndex).toBe(true);
      expect(b5.defaultParentInstrumentType).toBe('EPLC_CONFIRMATION');
    });

    it('B5 is the only function with settlesAcceptanceOnMature / settleableBalanceIndex', () => {
      for (const f of [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS]) {
        if (f.code === 'B5') continue;
        expect(f.settlesAcceptanceOnMature).toBeFalsy();
        expect(f.settleableBalanceIndex).toBeFalsy();
      }
    });

    it('no EXPORT function ever creates a plain EPLC_LC movement (EBL is out of Balance Component scope, business instruction 2026-08-15)', () => {
      for (const f of EXPORT_FUNCTIONS) {
        expect(f.instrumentType).not.toBe('EPLC_LC');
      }
    });
  });

  describe('cross-cutting registry invariants (IMPORT_FUNCTIONS + EXPORT_FUNCTIONS combined)', () => {
    const ALL_FUNCTIONS = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS];

    it('has 14 total functions (9 Import + 5 Export)', () => {
      expect(ALL_FUNCTIONS).toHaveLength(14);
    });

    it('every function code is globally unique across both sides', () => {
      const codes = ALL_FUNCTIONS.map((f) => f.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('every function whose subChoice key is "movementType" has no separately-fixed movementType of its own', () => {
      for (const f of ALL_FUNCTIONS) {
        if (f.subChoice?.key === 'movementType') {
          expect(f.movementType).toBeUndefined();
        }
      }
    });

    it('every tenorTypeOptions entry has a non-empty label and a legal TenorType value', () => {
      const legalTenorValues = new Set(['SIGHT', 'SELLERS_USANCE', 'BUYERS_USANCE']);
      for (const f of ALL_FUNCTIONS) {
        for (const opt of f.tenorTypeOptions ?? []) {
          expect(legalTenorValues.has(opt.value)).toBe(true);
          expect(opt.label).toBeTruthy();
        }
      }
    });

    it('catalogTenorFilter, where present, is SIGHT or USANCE', () => {
      for (const f of ALL_FUNCTIONS) {
        if (f.catalogTenorFilter) {
          expect(['SIGHT', 'USANCE']).toContain(f.catalogTenorFilter);
        }
      }
    });

    it("defaultParentInstrumentType, where present, is itself a valid parent option for that function's own instrumentType", () => {
      for (const f of ALL_FUNCTIONS) {
        if (f.defaultParentInstrumentType) {
          expect(PARENT_INSTRUMENT_OPTIONS[f.instrumentType]).toContain(f.defaultParentInstrumentType);
        }
      }
    });

    it("payableMovementType, where present, is a legal movementType for wherever it actually lives (payableMovementInstrumentType when set — e.g. B4's EPLC_EXAMINATION — else the parent instrument it's browsed from, e.g. A6's IPLC_LC — else its own instrumentType)", () => {
      for (const f of ALL_FUNCTIONS) {
        if (f.payableMovementType) {
          const sourceInstrument = f.payableMovementInstrumentType ?? f.defaultParentInstrumentType ?? f.instrumentType;
          expect(MOVEMENT_TYPES_BY_INSTRUMENT[sourceInstrument]).toContain(f.payableMovementType);
        }
      }
    });
  });

  describe('decimalPlacesForCurrency / amountExceedsCurrencyDecimals (Amount input follows Currency decimal places)', () => {
    it('returns 0 for JPY (the reported example: "JPY 10000 without cents")', () => {
      expect(decimalPlacesForCurrency('JPY')).toBe(0);
    });

    it('is case-insensitive and trims whitespace', () => {
      expect(decimalPlacesForCurrency('jpy')).toBe(0);
      expect(decimalPlacesForCurrency(' JPY ')).toBe(0);
    });

    it('returns 3 for the standard ISO 4217 3-decimal exceptions (e.g. KWD, BHD)', () => {
      expect(decimalPlacesForCurrency('KWD')).toBe(3);
      expect(decimalPlacesForCurrency('BHD')).toBe(3);
    });

    it('falls back to 2 for an unlisted currency and for null/undefined/empty', () => {
      expect(decimalPlacesForCurrency('USD')).toBe(2);
      expect(decimalPlacesForCurrency('XYZ')).toBe(2);
      expect(decimalPlacesForCurrency(null)).toBe(2);
      expect(decimalPlacesForCurrency(undefined)).toBe(2);
      expect(decimalPlacesForCurrency('')).toBe(2);
    });

    it("every CURRENCY_DECIMALS entry is 0, 2, or 3 (the only minor-unit counts this project's own MONETARY_AMOUNT_PATTERN ceiling allows)", () => {
      for (const decimals of Object.values(CURRENCY_DECIMALS)) {
        expect([0, 2, 3]).toContain(decimals);
      }
    });

    it('amountExceedsCurrencyDecimals: true for "10000.5" against JPY (0dp)', () => {
      expect(amountExceedsCurrencyDecimals('10000.5', 'JPY')).toBe(true);
    });

    it('amountExceedsCurrencyDecimals: false for a whole-number amount against JPY', () => {
      expect(amountExceedsCurrencyDecimals('10000', 'JPY')).toBe(false);
    });

    it('amountExceedsCurrencyDecimals: false for "100.12" against USD (2dp, exactly at the limit)', () => {
      expect(amountExceedsCurrencyDecimals('100.12', 'USD')).toBe(false);
    });

    it('amountExceedsCurrencyDecimals: true for "100.123" against USD (3dp, over the 2dp limit)', () => {
      expect(amountExceedsCurrencyDecimals('100.123', 'USD')).toBe(true);
    });

    it('amountExceedsCurrencyDecimals: false for "100.123" against KWD (3dp, exactly at the limit)', () => {
      expect(amountExceedsCurrencyDecimals('100.123', 'KWD')).toBe(false);
    });

    it('amountExceedsCurrencyDecimals: false for an empty/undefined amount (nothing typed yet, no false-positive warning)', () => {
      expect(amountExceedsCurrencyDecimals('', 'JPY')).toBe(false);
      expect(amountExceedsCurrencyDecimals(undefined, 'JPY')).toBe(false);
      expect(amountExceedsCurrencyDecimals(null, 'JPY')).toBe(false);
    });

    // Live bug, reviewer-reported 2026-08-16 ("All the Submit functions are not working in UI"): every
    // test above passes a genuine string literal, which is exactly why the whole suite missed this —
    // the Amount field is a native <input type="number">, and Angular's own NumberValueAccessor
    // coerces its value to a real JS `number` before it ever reaches model.amount, regardless of the
    // `amount?: string` compile-time type. `amount.split('.')` threw TypeError on a number, and since
    // this function backs a template getter evaluated every change-detection cycle, the error re-fired
    // continuously and froze the whole form for every business function, not just ones with a real
    // violation. These prove the fix's `String(amount)` coercion makes it robust to a number, matching
    // what the DOM/Formly layer actually passes in a live browser.
    it('amountExceedsCurrencyDecimals: handles a NUMBER (not just a string) — the actual runtime shape a native <input type="number"> passes via Angular\'s NumberValueAccessor', () => {
      expect(amountExceedsCurrencyDecimals(10000, 'JPY')).toBe(false);
      expect(amountExceedsCurrencyDecimals(10000.5, 'JPY')).toBe(true);
      expect(amountExceedsCurrencyDecimals(100.12, 'USD')).toBe(false);
      expect(amountExceedsCurrencyDecimals(100.123, 'USD')).toBe(true);
      expect(amountExceedsCurrencyDecimals(0, 'JPY')).toBe(false);
    });
  });

  // Inquire Events (2026-08-17) — defaultLcInstrumentTypeForSide/childInstrumentTypesOf/
  // resolveFunctionForMovement.
  describe('defaultLcInstrumentTypeForSide', () => {
    it('IMPORT -> IPLC_LC, EXPORT -> EPLC_CONFIRMATION', () => {
      expect(defaultLcInstrumentTypeForSide('IMPORT')).toBe('IPLC_LC');
      expect(defaultLcInstrumentTypeForSide('EXPORT')).toBe('EPLC_CONFIRMATION');
    });
  });

  describe('childInstrumentTypesOf', () => {
    it('IPLC_LC -> IPLC_ACCEPTANCE and SHGT (order-independent)', () => {
      expect(new Set(childInstrumentTypesOf('IPLC_LC'))).toEqual(new Set(['IPLC_ACCEPTANCE', 'SHGT']));
    });

    it('EPLC_CONFIRMATION -> EPLC_ACCEPTANCE and EPLC_EXAMINATION (order-independent)', () => {
      expect(new Set(childInstrumentTypesOf('EPLC_CONFIRMATION'))).toEqual(new Set(['EPLC_ACCEPTANCE', 'EPLC_EXAMINATION']));
    });

    it('a leaf instrumentType (no PARENT_INSTRUMENT_OPTIONS ever names it as a parent) has no children', () => {
      expect(childInstrumentTypesOf('SHGT')).toEqual([]);
      expect(childInstrumentTypesOf('IPLC_ACCEPTANCE')).toEqual([]);
    });

    it('the three ON_BALANCE_ASSET instrumentTypes never appear as anyone\'s child (their own PARENT_INSTRUMENT_OPTIONS entries are empty by design)', () => {
      for (const root of ALL_INSTRUMENT_TYPES) {
        expect(childInstrumentTypesOf(root)).not.toContain('EPLC_DUE_FROM_ISSUING_BANK');
        expect(childInstrumentTypesOf(root)).not.toContain('EPLC_ACCEPTANCE_REIMB_RECEIVABLE');
        expect(childInstrumentTypesOf(root)).not.toContain('EPLC_EXPORT_BILLS_DISCOUNTED');
      }
    });
  });

  describe('resolveFunctionForMovement', () => {
    it('resolves a literal fn.movementType match (A1 — IPLC_LC/ISSUE)', () => {
      expect(resolveFunctionForMovement('IPLC_LC', 'ISSUE')?.code).toBe('A1');
    });

    it('resolves via subChoice.options (A2 — IPLC_LC/AMEND_INCREASE and AMEND_DECREASE, both from the same A2 subChoice)', () => {
      expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_INCREASE')?.code).toBe('A2');
      expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_DECREASE')?.code).toBe('A2');
    });

    it('resolves via movementTypeFromContractTenor for BOTH derived movementTypes (B4 — EPLC_CONFIRMATION/HONOUR and ACCEPT)', () => {
      expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'HONOUR')?.code).toBe('B4');
      expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'ACCEPT')?.code).toBe('B4');
    });

    it('resolves the derived PARTIAL_REDEEM via autoRedeemType (A9), not only the registry\'s own literal FULL_REDEEM default', () => {
      expect(resolveFunctionForMovement('SHGT', 'FULL_REDEEM')?.code).toBe('A9');
      expect(resolveFunctionForMovement('SHGT', 'PARTIAL_REDEEM')?.code).toBe('A9');
    });

    it('resolves the derived PARTIAL_SETTLE via settlesAcceptanceOnMature (B5), not only the registry\'s own literal FULL_SETTLE default', () => {
      expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'FULL_SETTLE')?.code).toBe('B5');
      expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'PARTIAL_SETTLE')?.code).toBe('B5');
    });

    it('returns undefined for a movementType/instrumentType combination no current function produces', () => {
      expect(resolveFunctionForMovement('EPLC_EXAMINATION', 'AMEND')).toBeUndefined();
    });

    it('known limitation, explicitly accepted (see the function\'s own doc comment): IPLC_LC/UTILIZE is produced by BOTH A3 and A3S (both literal movementType: \'UTILIZE\') — the resolver deterministically returns the first registry match, A3, since it\'s declared first', () => {
      expect(resolveFunctionForMovement('IPLC_LC', 'UTILIZE')?.code).toBe('A3');
    });
  });
});
