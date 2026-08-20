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
  groupThousands,
  defaultLcInstrumentTypeForSide,
  childInstrumentTypesOf,
  BALANCE_SNAPSHOT_LABEL,
  CURRENCY_OPTIONS,
  isEarmarkFunction,
  tenorTypeLabel,
  displayMovementType,
  displayMovementAmount,
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

    // A3/A3S's own deferSettlement/documentArrivalWithSg behavior (F-01 Strategy flags, since PR-5 no
    // longer stored on TransactionFunction at all) is covered by function-strategy.spec.ts instead —
    // this file only asserts the registry's own non-flag configuration.
    it('A3 targets IPLC_LC/UTILIZE', () => {
      const a3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3') as TransactionFunction;
      expect(a3.movementType).toBe('UTILIZE');
    });

    it('A4 filters the catalog to SIGHT', () => {
      const a4 = IMPORT_FUNCTIONS.find((f) => f.code === 'A4') as TransactionFunction;
      expect(a4.catalogTenorFilter).toBe('SIGHT');
    });

    it("A6 is sourced from A3's own UTILIZE, on IPLC_ACCEPTANCE, Usance-tenor-only", () => {
      const a6 = IMPORT_FUNCTIONS.find((f) => f.code === 'A6') as TransactionFunction;
      expect(a6.payableMovementType).toBe('UTILIZE');
      expect(a6.pendingItemSourceHint).toContain('A3');
      expect(a6.instrumentType).toBe('IPLC_ACCEPTANCE');
      expect(a6.tenorTypeOptions?.map((o) => o.value)).toEqual(['SELLERS_USANCE', 'BUYERS_USANCE']);
    });

    it('A7 offers Full/Partial Settle as a subChoice and filters the catalog to USANCE (an Acceptance never exists under a Sight LC)', () => {
      const a7 = IMPORT_FUNCTIONS.find((f) => f.code === 'A7') as TransactionFunction;
      expect(a7.subChoice?.options.map((o) => o.value)).toEqual(['FULL_SETTLE', 'PARTIAL_SETTLE']);
      expect(a7.catalogTenorFilter).toBe('USANCE');
      expect(a7.instrumentType).toBe('IPLC_ACCEPTANCE');
    });

    it('A9 targets SHGT', () => {
      const a9 = IMPORT_FUNCTIONS.find((f) => f.code === 'A9') as TransactionFunction;
      expect(a9.instrumentType).toBe('SHGT');
    });

    it('SHGT/IPLC_ACCEPTANCE functions declare defaultParentInstrumentType: IPLC_LC (A6/A8/A9/A7)', () => {
      for (const code of ['A6', 'A7', 'A8', 'A9']) {
        const f = IMPORT_FUNCTIONS.find((fn) => fn.code === code) as TransactionFunction;
        expect(f.defaultParentInstrumentType).toBe('IPLC_LC');
      }
    });

    it('A1 is the sole function with no secondaryRefLabel (it creates a brand-new natural key with nothing to reference yet)', () => {
      // Per the interface's own doc comment ("every function except LC Issue (A1/B1) requires ONE
      // generic secondary reference").
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

    // B3/B4/B5's own deferSettlement/settlesDocumentArrival/movementTypeFromContractTenor/
    // createsIssuingBankReceivableOnHonour/createsAcceptanceReimbReceivableOnCreate/
    // settlesAcceptanceOnMature/settleableBalanceIndex behavior (F-01 Strategy flags, since PR-5 no
    // longer stored on TransactionFunction at all) is covered by function-strategy.spec.ts instead —
    // this file only asserts the registry's own non-flag configuration.
    it('B3 (Present Docs) is EPLC_EXAMINATION/CREATE and has no secondaryRefLabel of its own', () => {
      const b3 = EXPORT_FUNCTIONS.find((f) => f.code === 'B3') as TransactionFunction;
      expect(b3.instrumentType).toBe('EPLC_EXAMINATION');
      expect(b3.movementType).toBe('CREATE');
      expect(b3.defaultParentInstrumentType).toBe('EPLC_CONFIRMATION');
      expect(b3.deferSettlementMovementType).toBeUndefined();
      expect(b3.secondaryRefLabel).toBeUndefined();
    });

    it('B4 (Honour / Acceptance) targets EPLC_CONFIRMATION/HONOUR, sources still-RELEASED B3 Present Docs records, and has an EB Number secondaryRefLabel', () => {
      const b4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4') as TransactionFunction;
      expect(b4.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(b4.movementType).toBe('HONOUR');
      expect(b4.payableMovementType).toBe('CREATE');
      expect(b4.payableMovementInstrumentType).toBe('EPLC_EXAMINATION');
      expect(b4.pendingItemSourceCode).toBe('B3');
      expect(b4.secondaryRefLabel).toBe('EB Number');
    });

    it('B4 is the only function with payableMovementInstrumentType', () => {
      for (const f of [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS]) {
        if (f.code === 'B4') continue;
        expect(f.payableMovementInstrumentType).toBeUndefined();
      }
    });

    it('B5 (Settlement — Reimbursement / Maturity) settles the Acceptance on Maturity, USANCE-only', () => {
      const b5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5') as TransactionFunction;
      expect(b5.instrumentType).toBe('EPLC_ACCEPTANCE');
      expect(b5.movementType).toBe('FULL_SETTLE');
      expect(b5.catalogTenorFilter).toBe('USANCE');
      expect(b5.defaultParentInstrumentType).toBe('EPLC_CONFIRMATION');
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
  });

  describe('groupThousands (Quality-report-balance.md Security Hotspot fix — non-regex thousand-separator formatting)', () => {
    it('leaves a 1-3 digit string unchanged', () => {
      expect(groupThousands('0')).toBe('0');
      expect(groupThousands('5')).toBe('5');
      expect(groupThousands('25')).toBe('25');
      expect(groupThousands('999')).toBe('999');
    });

    it('inserts one comma for 4-6 digits', () => {
      expect(groupThousands('1000')).toBe('1,000');
      expect(groupThousands('25000')).toBe('25,000');
      expect(groupThousands('999999')).toBe('999,999');
    });

    it('inserts multiple commas for longer digit strings', () => {
      expect(groupThousands('1000000')).toBe('1,000,000');
      expect(groupThousands('1234567890')).toBe('1,234,567,890');
    });

    it('handles an empty string', () => {
      expect(groupThousands('')).toBe('');
    });

    it('handles a string whose length is an exact multiple of 3 (no leading comma)', () => {
      expect(groupThousands('123456')).toBe('123,456');
      expect(groupThousands('123456789')).toBe('123,456,789');
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

    it("the three ON_BALANCE_ASSET instrumentTypes never appear as anyone's child (their own PARENT_INSTRUMENT_OPTIONS entries are empty by design)", () => {
      for (const root of ALL_INSTRUMENT_TYPES) {
        expect(childInstrumentTypesOf(root)).not.toContain('EPLC_DUE_FROM_ISSUING_BANK');
        expect(childInstrumentTypesOf(root)).not.toContain('EPLC_ACCEPTANCE_REIMB_RECEIVABLE');
        expect(childInstrumentTypesOf(root)).not.toContain('EPLC_EXPORT_BILLS_DISCOUNTED');
      }
    });
  });

  // resolveFunctionForMovement's own test coverage moved to function-strategy.spec.ts in PR-5 (the
  // function itself relocated there — see balance-component.model.ts's own note at its former location).

  // 2026-08-18, business instruction — "APPROVED still required. EARMARK only applied for RELEASED
  // event in Import LC Document Arrival and Export Present Docs" (narrowing an earlier same-day
  // instruction that had, incorrectly, relabeled every RELEASED status to EARMARK universally).
  describe('isEarmarkFunction', () => {
    it('is true for Import LC Document Arrival (IPLC_LC/UTILIZE) — A3/A3S', () => {
      expect(isEarmarkFunction('IPLC_LC', 'UTILIZE')).toBe(true);
    });

    it('is true for Export Present Docs (EPLC_EXAMINATION/CREATE) — B3', () => {
      expect(isEarmarkFunction('EPLC_EXAMINATION', 'CREATE')).toBe(true);
    });

    it('is false for every other (instrumentType, movementType) pair, including a different movementType on the same two instrumentTypes', () => {
      expect(isEarmarkFunction('IPLC_LC', 'ISSUE')).toBe(false);
      expect(isEarmarkFunction('IPLC_LC', 'AMEND_INCREASE')).toBe(false);
      expect(isEarmarkFunction('EPLC_EXAMINATION', 'AMEND')).toBe(false);
      expect(isEarmarkFunction('EPLC_CONFIRMATION', 'ISSUE')).toBe(false);
      expect(isEarmarkFunction('SHGT', 'ISSUE')).toBe(false);
    });

    it('is false for EPLC_LC — a reference-only instrumentType no function in this registry ever actually creates', () => {
      expect(isEarmarkFunction('EPLC_LC', 'UTILIZE')).toBe(false);
    });

    it('handles a missing/undefined instrumentType or movementType gracefully (no instrumentType/movementType supplied at all)', () => {
      expect(isEarmarkFunction(undefined, undefined)).toBe(false);
      expect(isEarmarkFunction(null, null)).toBe(false);
    });

    // Bug fixed 2026-08-18, reviewer-caught live: "Import LC S01 => A4 · Sight Settlement / IPLC_LC /
    // UTILIZE / ... / EARMARKED — 應該是 Approved 對嗎?" (shouldn't that be Approved?). A finalized Sight
    // Document Arrival's own 'finalize' row (A4's own Release) shares the IDENTICAL (IPLC_LC, UTILIZE)
    // as its sibling 'create' row (A3's own submission), but represents a DIFFERENT function's own real
    // legal event — A4 is not A3/A3S, so it must NOT be treated as an earmark function.
    it("is false for a 'finalize'-phase IPLC_LC/UTILIZE row (A4's own completion of a Sight Document Arrival) — the exact bug reported live on LC S01", () => {
      expect(isEarmarkFunction('IPLC_LC', 'UTILIZE', 'finalize')).toBe(false);
    });

    it("stays true for the SAME (IPLC_LC, UTILIZE) pair under every OTHER phase — 'create' (A3's own submission), 'primary' (never split, e.g. a Usance Document Arrival), and omitted (callers that never split anything)", () => {
      expect(isEarmarkFunction('IPLC_LC', 'UTILIZE', 'create')).toBe(true);
      expect(isEarmarkFunction('IPLC_LC', 'UTILIZE', 'primary')).toBe(true);
      expect(isEarmarkFunction('IPLC_LC', 'UTILIZE')).toBe(true);
    });

    it("'finalize' disqualifies unconditionally, regardless of instrumentType/movementType — B3/EPLC_EXAMINATION never actually splits in practice (this exact input can't occur from real data), but the guard is intentionally a blanket 'finalize is never an earmark function' rule, not narrowly scoped to just IPLC_LC/UTILIZE", () => {
      expect(isEarmarkFunction('EPLC_EXAMINATION', 'CREATE', 'finalize')).toBe(false);
    });
  });

  // payExistingUtilizeFunctionFor's own test coverage moved to function-strategy.spec.ts in PR-5.

  describe('displayMovementType / displayMovementAmount', () => {
    it('B2 (EPLC_CONFIRMATION/AMEND): a positive amount reads as AMEND_INCREASE', () => {
      expect(displayMovementType('EPLC_CONFIRMATION', 'AMEND', '5000')).toBe('AMEND_INCREASE');
      expect(displayMovementType('EPLC_CONFIRMATION', 'AMEND', 5000)).toBe('AMEND_INCREASE');
    });

    it('B2: a negative amount reads as AMEND_DECREASE, and the displayed amount is de-signed to its own magnitude', () => {
      expect(displayMovementType('EPLC_CONFIRMATION', 'AMEND', '-7000')).toBe('AMEND_DECREASE');
      expect(displayMovementAmount('EPLC_CONFIRMATION', 'AMEND', '-7000')).toBe('7000');
    });

    it('B2: a positive amount is returned unchanged by displayMovementAmount (already the correct magnitude)', () => {
      expect(displayMovementAmount('EPLC_CONFIRMATION', 'AMEND', '5000')).toBe('5000');
    });

    it("B2: zero reads as AMEND_INCREASE (not < 0), matching submit-rules.ts's own Amount > 0 guard already ruling out a genuine zero from ever reaching here", () => {
      expect(displayMovementType('EPLC_CONFIRMATION', 'AMEND', '0')).toBe('AMEND_INCREASE');
    });

    it("every other (instrumentType, movementType) pair passes through completely unchanged — including A2's own genuinely distinct AMEND_INCREASE/AMEND_DECREASE, which already read correctly with no transformation needed", () => {
      expect(displayMovementType('IPLC_LC', 'AMEND_INCREASE', '5000')).toBe('AMEND_INCREASE');
      expect(displayMovementType('IPLC_LC', 'AMEND_DECREASE', '5000')).toBe('AMEND_DECREASE');
      expect(displayMovementType('IPLC_LC', 'UTILIZE', '5000')).toBe('UTILIZE');
      expect(displayMovementType('EPLC_CONFIRMATION', 'ISSUE', '5000')).toBe('ISSUE');
      expect(displayMovementAmount('IPLC_LC', 'AMEND_DECREASE', '5000')).toBe('5000');
      expect(displayMovementAmount('EPLC_CONFIRMATION', 'ISSUE', '-5000')).toBe('-5000');
    });

    it('handles missing/undefined/null instrumentType, movementType, and amount gracefully', () => {
      expect(displayMovementType(undefined, undefined, undefined)).toBe('');
      expect(displayMovementType(null, null, null)).toBe('');
      expect(displayMovementAmount(undefined, undefined, undefined)).toBe('');
      expect(displayMovementAmount(null, null, null)).toBe('');
      expect(displayMovementAmount('EPLC_CONFIRMATION', 'AMEND', null)).toBe('');
    });
  });

  describe('BALANCE_SNAPSHOT_LABEL', () => {
    it('covers exactly the 5 instrumentTypes the user named as real Balance Components, no more, no fewer', () => {
      expect(new Set(Object.keys(BALANCE_SNAPSHOT_LABEL))).toEqual(new Set(['IPLC_LC', 'IPLC_ACCEPTANCE', 'SHGT', 'EPLC_CONFIRMATION', 'EPLC_ACCEPTANCE']));
    });

    it("deliberately excludes EPLC_EXAMINATION (MEMO_ONLY, never a real Balance Component) even though it is one of childInstrumentTypesOf('EPLC_CONFIRMATION')'s own results", () => {
      expect(childInstrumentTypesOf('EPLC_CONFIRMATION')).toContain('EPLC_EXAMINATION');
      expect(BALANCE_SNAPSHOT_LABEL['EPLC_EXAMINATION']).toBeUndefined();
    });

    it('excludes the three ON_BALANCE_ASSET instrumentTypes, same scope boundary as contingentAccountEntry', () => {
      expect(BALANCE_SNAPSHOT_LABEL['EPLC_DUE_FROM_ISSUING_BANK']).toBeUndefined();
      expect(BALANCE_SNAPSHOT_LABEL['EPLC_ACCEPTANCE_REIMB_RECEIVABLE']).toBeUndefined();
      expect(BALANCE_SNAPSHOT_LABEL['EPLC_EXPORT_BILLS_DISCOUNTED']).toBeUndefined();
    });

    it("exact label text matches the user's own wording", () => {
      expect(BALANCE_SNAPSHOT_LABEL['IPLC_LC']).toBe('LC Balance');
      expect(BALANCE_SNAPSHOT_LABEL['IPLC_ACCEPTANCE']).toBe('Acceptance Balance');
      expect(BALANCE_SNAPSHOT_LABEL['SHGT']).toBe('Shipping Guarantee Balance');
      expect(BALANCE_SNAPSHOT_LABEL['EPLC_CONFIRMATION']).toBe('Confirmed LC Balance');
      expect(BALANCE_SNAPSHOT_LABEL['EPLC_ACCEPTANCE']).toBe('Confirmed LC Acceptance Balance');
    });
  });

  // Business instruction 2026-08-17 ("For A1 and B1, the Currency Code field should be implemented as a
  // drop-down list, consistent with the existing implementation in lc-payment-wc").
  describe('CURRENCY_OPTIONS', () => {
    it("matches lc-payment-wc/backend/data/currencies.json's own 10-code set exactly, no more no fewer", () => {
      expect(CURRENCY_OPTIONS.map((o) => o.value)).toEqual(['USD', 'EUR', 'JPY', 'GBP', 'TWD', 'IDR', 'CNY', 'HKD', 'SGD', 'AUD']);
    });

    it('label is the bare code, matching lc-payment-wc\'s own dropdown convention (not "USD - US Dollar")', () => {
      for (const o of CURRENCY_OPTIONS) expect(o.label).toBe(o.value);
    });

    it('every option resolves through decimalPlacesForCurrency() without needing a new CURRENCY_DECIMALS entry (JPY/TWD/IDR are the three 0dp exceptions already covered there)', () => {
      const zeroDp = ['JPY', 'TWD', 'IDR'];
      for (const code of zeroDp) expect(decimalPlacesForCurrency(code)).toBe(0);
      for (const o of CURRENCY_OPTIONS.filter((c) => !zeroDp.includes(c.value))) expect(decimalPlacesForCurrency(o.value)).toBe(2);
    });
  });

  // LC Master Records Index's own new "Tenor Type" column (2026-08-19, user-requested — positioned
  // right after LC Number, both Import LC and Export Confirmed LC). Reuses A1's/B1's own tenorType
  // Formly select option labels rather than a third copy of the same three strings.
  describe('tenorTypeLabel', () => {
    it("Import side spells out Seller's/Buyer's Usance (matches A1's own tenorTypeOptions exactly)", () => {
      expect(tenorTypeLabel('SIGHT', 'IMPORT')).toBe('Sight');
      expect(tenorTypeLabel('SELLERS_USANCE', 'IMPORT')).toBe("Seller's Usance");
      expect(tenorTypeLabel('BUYERS_USANCE', 'IMPORT')).toBe("Buyer's Usance");
    });

    it("Export side labels SELLERS_USANCE as plain \"Usance\" (matches B1's own tenorTypeOptions exactly — Buyer's/Seller's is Import-only)", () => {
      expect(tenorTypeLabel('SIGHT', 'EXPORT')).toBe('Sight');
      expect(tenorTypeLabel('SELLERS_USANCE', 'EXPORT')).toBe('Usance');
    });

    it('falls back to "—" for null/undefined (legacy data) and for a value that never legitimately occurs on that side (BUYERS_USANCE on Export)', () => {
      expect(tenorTypeLabel(null, 'IMPORT')).toBe('—');
      expect(tenorTypeLabel(undefined, 'EXPORT')).toBe('—');
      expect(tenorTypeLabel('BUYERS_USANCE', 'EXPORT')).toBe('—');
    });
  });
});
