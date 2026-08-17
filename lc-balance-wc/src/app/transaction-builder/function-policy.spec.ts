import {
  BuilderModel,
  ContextRefState,
  carriedCurrency,
  checkerSecondaryField,
  checkerSecondaryLabel,
  contextLcNumber,
  contextSecondaryRef,
  hasParent,
  ibNumberLabel,
  isCreatingMovement,
  isReady,
  lcNumberFromParent,
  parentOptions,
  parentTenorFamily,
  requiredNaturalKeyFields,
  toleranceApplicable,
  usesTwoFieldSearch,
} from './function-policy';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceContract } from './balance-component-api.service';

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

describe('function-policy', () => {
  describe('isCreatingMovement', () => {
    it('is true for ISSUE (A1)', () => {
      expect(isCreatingMovement({ movementType: 'ISSUE' })).toBe(true);
    });
    it('is true for CREATE (A6/A8)', () => {
      expect(isCreatingMovement({ movementType: 'CREATE' })).toBe(true);
    });
    it('is false for a non-creating movementType (e.g. AMEND)', () => {
      expect(isCreatingMovement({ movementType: 'AMEND' })).toBe(false);
    });
    it('is false when movementType is unset (boundary — no subChoice picked yet)', () => {
      expect(isCreatingMovement({})).toBe(false);
    });
  });

  describe('requiredNaturalKeyFields', () => {
    it('returns [] for IPLC_LC (single-key instrument)', () => {
      expect(requiredNaturalKeyFields({ instrumentType: 'IPLC_LC' })).toEqual([]);
    });
    it('returns [ibNumber] for IPLC_ACCEPTANCE', () => {
      expect(requiredNaturalKeyFields({ instrumentType: 'IPLC_ACCEPTANCE' })).toEqual(['ibNumber']);
    });
    it('returns [sgNumber] for SHGT', () => {
      expect(requiredNaturalKeyFields({ instrumentType: 'SHGT' })).toEqual(['sgNumber']);
    });
    it('returns [] when instrumentType is unset (boundary)', () => {
      expect(requiredNaturalKeyFields({})).toEqual([]);
    });
  });

  describe('ibNumberLabel', () => {
    it('is "IB Number" for IMPORT', () => {
      expect(ibNumberLabel('IMPORT')).toBe('IB Number');
    });
    it('is "EB Number" for EXPORT', () => {
      expect(ibNumberLabel('EXPORT')).toBe('EB Number');
    });
  });

  describe('hasParent', () => {
    it('is true for IPLC_ACCEPTANCE (hangs off a parent LC)', () => {
      expect(hasParent({ instrumentType: 'IPLC_ACCEPTANCE' })).toBe(true);
    });
    it('is false for IPLC_LC (no parent)', () => {
      expect(hasParent({ instrumentType: 'IPLC_LC' })).toBe(false);
    });
    it('is false when instrumentType is unset (boundary)', () => {
      expect(hasParent({})).toBe(false);
    });
  });

  describe('parentOptions', () => {
    it('returns the parent instrumentType options for IPLC_ACCEPTANCE', () => {
      expect(parentOptions({ instrumentType: 'IPLC_ACCEPTANCE' })).toEqual(['IPLC_LC']);
    });
    it('returns [] for an instrumentType with no parent (IPLC_LC)', () => {
      expect(parentOptions({ instrumentType: 'IPLC_LC' })).toEqual([]);
    });
    it('returns [] when instrumentType is unset (boundary)', () => {
      expect(parentOptions({})).toEqual([]);
    });
  });

  describe('carriedCurrency', () => {
    it('prefers selectedParent.currency when both are set', () => {
      expect(carriedCurrency(contract({ currency: 'EUR' }), contract({ currency: 'USD' }))).toBe('EUR');
    });
    it('falls back to selectedContract.currency when there is no selectedParent', () => {
      expect(carriedCurrency(null, contract({ currency: 'USD' }))).toBe('USD');
    });
    it('is null when neither is set (A1/B1 — nothing carried yet)', () => {
      expect(carriedCurrency(null, null)).toBeNull();
    });
  });

  describe('usesTwoFieldSearch', () => {
    it('is true for a two-field-key instrument on a non-creating movementType (e.g. A7 Settlement on IPLC_ACCEPTANCE)', () => {
      expect(usesTwoFieldSearch({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' })).toBe(true);
    });
    it('is false when creating a new movement, even for a two-field-key instrument (A6/A8 supply the key themselves)', () => {
      expect(usesTwoFieldSearch({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' })).toBe(false);
    });
    it('is false for a single-field-key instrument (IPLC_LC) regardless of movementType', () => {
      expect(usesTwoFieldSearch({ instrumentType: 'IPLC_LC', movementType: 'AMEND' })).toBe(false);
    });
  });

  describe('toleranceApplicable', () => {
    it('is true for IPLC_LC ISSUE', () => {
      expect(toleranceApplicable({ instrumentType: 'IPLC_LC', movementType: 'ISSUE' })).toBe(true);
    });
    it('is false for IPLC_LC HONOUR (not an ISSUE/AMEND* movementType)', () => {
      expect(toleranceApplicable({ instrumentType: 'IPLC_LC', movementType: 'HONOUR' })).toBe(false);
    });
    it('is false for IPLC_ACCEPTANCE CREATE (not a tolerance-applicable instrumentType)', () => {
      expect(toleranceApplicable({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' })).toBe(false);
    });
    it('is false when instrumentType/movementType are unset (boundary)', () => {
      expect(toleranceApplicable({})).toBe(false);
    });
  });

  describe('isReady', () => {
    it('is true once function/instrumentType/movementType are all resolved', () => {
      expect(isReady(fn('A1'), { instrumentType: 'IPLC_LC', movementType: 'ISSUE' })).toBe(true);
    });
    it('is false with no selectedFunction', () => {
      expect(isReady(null, { instrumentType: 'IPLC_LC', movementType: 'ISSUE' })).toBe(false);
    });
    it('is false while a subChoice is still pending (movementType unresolved)', () => {
      expect(isReady(fn('A1'), { instrumentType: 'IPLC_LC' })).toBe(false);
    });
  });

  describe('lcNumberFromParent', () => {
    it('is true for a creating, has-parent function (A6-shape: CREATE + IPLC_ACCEPTANCE)', () => {
      expect(lcNumberFromParent({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' })).toBe(true);
    });
    it('is false for A1/B1 (creating but no parent)', () => {
      expect(lcNumberFromParent({ instrumentType: 'IPLC_LC', movementType: 'ISSUE' })).toBe(false);
    });
    it('is false for a non-creating movementType even on a has-parent instrument', () => {
      expect(lcNumberFromParent({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' })).toBe(false);
    });
  });

  describe('checkerSecondaryField / checkerSecondaryLabel', () => {
    it('resolves ibNumber / "IB Number" for IPLC_ACCEPTANCE (Import Bill terminology)', () => {
      expect(checkerSecondaryField(fn('A6'))).toBe('ibNumber');
      expect(checkerSecondaryLabel(fn('A6'))).toBe('IB Number');
    });
    it('resolves ibNumber / "EB Number" for EPLC_ACCEPTANCE (Export Bill terminology — B5, whose own instrumentType is fixed to EPLC_ACCEPTANCE)', () => {
      expect(checkerSecondaryField(fn('B5'))).toBe('ibNumber');
      expect(checkerSecondaryLabel(fn('B5'))).toBe('EB Number');
    });
    it('resolves sgNumber / "SG Number" for SHGT', () => {
      expect(checkerSecondaryField(fn('A8'))).toBe('sgNumber');
      expect(checkerSecondaryLabel(fn('A8'))).toBe('SG Number');
    });
    it('resolves null / "SG Number" (the non-ibNumber fallback label) when there is no selectedFunction', () => {
      expect(checkerSecondaryField(null)).toBeNull();
      expect(checkerSecondaryLabel(null)).toBe('SG Number');
    });
  });

  describe('parentTenorFamily', () => {
    it('is USANCE when the function declares tenorTypeOptions (A6 — Usance-only Acceptance)', () => {
      expect(parentTenorFamily(fn('A6'))).toBe('USANCE');
    });
    it('is USANCE when the function sets catalogTenorFilter to USANCE (A7 — Acceptance Settlement)', () => {
      expect(parentTenorFamily(fn('A7'))).toBe('USANCE');
    });
    it('is undefined when neither condition holds (A8 — SHGT, unfiltered by tenor)', () => {
      expect(parentTenorFamily(fn('A8'))).toBeUndefined();
    });
    it('is undefined when there is no selectedFunction (boundary)', () => {
      expect(parentTenorFamily(null)).toBeUndefined();
    });
  });

  describe('contextLcNumber / contextSecondaryRef', () => {
    function state(overrides: Partial<ContextRefState> = {}): ContextRefState {
      return {
        model: {},
        naturalKey: { lcNumber: '', ibNumber: '', sgNumber: '' },
        searchNaturalKey: { lcNumber: '', ibNumber: '', sgNumber: '' },
        selectedParent: null,
        selectedContract: null,
        selectedFunction: null,
        ...overrides,
      };
    }

    it('contextLcNumber reads from selectedParent when lcNumberFromParent (A6-shape)', () => {
      const s = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' },
        selectedParent: contract({ naturalKey: { lcNumber: 'PARENT-LC' } }),
        selectedFunction: fn('A6'),
      });
      expect(contextLcNumber(s)).toBe('PARENT-LC');
    });

    it('contextLcNumber reads from naturalKey.lcNumber when creating without a parent (A1-shape)', () => {
      const s = state({
        model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE' },
        naturalKey: { lcNumber: 'TYPED-LC', ibNumber: '', sgNumber: '' },
        selectedFunction: fn('A1'),
      });
      expect(contextLcNumber(s)).toBe('TYPED-LC');
    });

    it('contextLcNumber falls back to null when creating and naturalKey.lcNumber is blank (boundary)', () => {
      const s = state({ model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE' }, selectedFunction: fn('A1') });
      expect(contextLcNumber(s)).toBeNull();
    });

    it('contextLcNumber prefers selectedContract, falls back to searchNaturalKey, for a two-field search (A7-shape)', () => {
      const withContract = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        selectedContract: contract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'RESOLVED-LC', ibNumber: 'IB01' } }),
        selectedFunction: fn('A7'),
      });
      expect(contextLcNumber(withContract)).toBe('RESOLVED-LC');

      const searchOnly = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        searchNaturalKey: { lcNumber: 'SEARCH-LC', ibNumber: '', sgNumber: '' },
        selectedFunction: fn('A7'),
      });
      expect(contextLcNumber(searchOnly)).toBe('SEARCH-LC');
    });

    it('contextLcNumber falls back to selectedContract for a plain flat-Catalog function (A2-shape, no create/two-field-search)', () => {
      const s = state({
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND' },
        selectedContract: contract({ naturalKey: { lcNumber: 'CATALOG-LC' } }),
        selectedFunction: fn('A2'),
      });
      expect(contextLcNumber(s)).toBe('CATALOG-LC');
    });

    it('contextSecondaryRef is null when the function has no secondary natural-key field (IPLC_LC)', () => {
      const s = state({ model: { instrumentType: 'IPLC_LC', movementType: 'AMEND' }, selectedFunction: fn('A2') });
      expect(contextSecondaryRef(s)).toBeNull();
    });

    it('contextSecondaryRef reads from naturalKey when creating (A6-shape)', () => {
      const s = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' },
        naturalKey: { lcNumber: '', ibNumber: 'IB-TYPED', sgNumber: '' },
        selectedFunction: fn('A6'),
      });
      expect(contextSecondaryRef(s)).toBe('IB-TYPED');
    });

    it('contextSecondaryRef is null (not empty string) when creating and the naturalKey field has not been typed yet (A6-shape)', () => {
      const s = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' },
        naturalKey: { lcNumber: '', ibNumber: '', sgNumber: '' },
        selectedFunction: fn('A6'),
      });
      expect(contextSecondaryRef(s)).toBeNull();
    });

    it('contextSecondaryRef falls back to selectedContract when the function is resolved (secondary field known) but model.instrumentType has not resolved yet (subChoice still pending, so neither isCreatingMovement nor usesTwoFieldSearch is true)', () => {
      const s = state({
        model: {},
        selectedContract: contract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB-FROM-CONTRACT' } }),
        selectedFunction: fn('A6'),
      });
      expect(contextSecondaryRef(s)).toBe('IB-FROM-CONTRACT');
    });

    it('contextSecondaryRef prefers selectedContract, falls back to searchNaturalKey, for a two-field search (A7-shape)', () => {
      const withContract = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        selectedContract: contract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB-RESOLVED' } }),
        selectedFunction: fn('A7'),
      });
      expect(contextSecondaryRef(withContract)).toBe('IB-RESOLVED');

      const searchOnly = state({
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        searchNaturalKey: { lcNumber: 'S001', ibNumber: 'IB-SEARCH', sgNumber: '' },
        selectedFunction: fn('A7'),
      });
      expect(contextSecondaryRef(searchOnly)).toBe('IB-SEARCH');
    });
  });
});
