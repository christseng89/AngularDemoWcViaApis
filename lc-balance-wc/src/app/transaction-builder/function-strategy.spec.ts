import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import { FUNCTION_STRATEGIES, deriveFunctionStrategy, resolveFunctionForMovement, payExistingUtilizeFunctionFor } from './function-strategy';

/**
 * PR-2 of the F-01 Strategy refactoring — equivalence proof only. Every assertion here cross-references
 * a fact already locked in by PR-1's `transaction-function-flags.characterization.spec.ts` (search that
 * file's own `codesWith(...)` assertions for the flag-to-function-code mapping this file's own
 * expectations are derived from), so the two files independently arriving at the same answer is real
 * evidence of equivalence, not a coincidence of one being copy-pasted from the other's expected values.
 *
 * `FUNCTION_STRATEGIES` is not wired into any production code path yet — this file tests the new
 * scaffolding in isolation, the same way `paged-list-state.spec.ts` tests that class in isolation before
 * any consumer relies on it.
 */
describe('PR-2 — FunctionStrategy is a faithful projection of the current registry (not yet consumed by production code)', () => {
  it('every one of the 14 registered function codes has exactly one FunctionStrategy entry', () => {
    const allCodes = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((f) => f.code);
    expect(allCodes).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3', 'B4', 'B5']);
    expect(Object.keys(FUNCTION_STRATEGIES).sort()).toEqual([...allCodes].sort());
  });

  describe('movementDerivation — matches PR-1\'s autoRedeemType/settlesAcceptanceOnMature/movementTypeFromContractTenor characterization', () => {
    it('A9 (autoRedeemType) -> REDEEM, no other function derives REDEEM', () => {
      expect(FUNCTION_STRATEGIES['A9'].movementDerivation.amountVsAvailableDerivation).toBe('REDEEM');
      const redeemCodes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === 'REDEEM');
      expect(redeemCodes.map((s) => s.code)).toEqual(['A9']);
    });

    it('B5 (settlesAcceptanceOnMature) -> SETTLE, no other function derives SETTLE', () => {
      expect(FUNCTION_STRATEGIES['B5'].movementDerivation.amountVsAvailableDerivation).toBe('SETTLE');
      const settleCodes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === 'SETTLE');
      expect(settleCodes.map((s) => s.code)).toEqual(['B5']);
    });

    it('every other function derives neither (null)', () => {
      const neither = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === null);
      expect(neither.map((s) => s.code).sort()).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'B1', 'B2', 'B3', 'B4'].sort());
    });

    it('B4 (movementTypeFromContractTenor) is the ONLY function reading movementType from the contract\'s own tenor', () => {
      const tenorDerived = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.derivesMovementTypeFromTenor);
      expect(tenorDerived.map((s) => s.code)).toEqual(['B4']);
    });
  });

  describe('compoundSubmission — matches PR-1\'s MakerSubmitService dispatch-table characterization', () => {
    it('A3S (documentArrivalWithSg) -> possibleShapes includes documentArrivalWithSg, only A3S does', () => {
      expect(FUNCTION_STRATEGIES['A3S'].compoundSubmission.possibleShapes).toEqual(['documentArrivalWithSg']);
      const withShape = Object.values(FUNCTION_STRATEGIES).filter((s) => s.compoundSubmission.possibleShapes.includes('documentArrivalWithSg'));
      expect(withShape.map((s) => s.code)).toEqual(['A3S']);
    });

    it('B4 is the ONLY function with two possible shapes — Honour and Accept, chosen at runtime by movementType, never fixed', () => {
      expect(FUNCTION_STRATEGIES['B4'].compoundSubmission.possibleShapes).toEqual(['confirmationHonourWithReceivable', 'confirmationAcceptWithReceivable']);
      const twoShapes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.compoundSubmission.possibleShapes.length > 1);
      expect(twoShapes.map((s) => s.code)).toEqual(['B4']);
    });

    it('B5 (settlesAcceptanceOnMature) -> acceptanceSettleWithReceivable, only B5', () => {
      expect(FUNCTION_STRATEGIES['B5'].compoundSubmission.possibleShapes).toEqual(['acceptanceSettleWithReceivable']);
    });

    it('every function without a compound flag falls back to plain (matches "no matching flag -> submitPlain" in PR-1)', () => {
      const plainCodes = Object.values(FUNCTION_STRATEGIES)
        .filter((s) => s.compoundSubmission.possibleShapes.length === 1 && s.compoundSubmission.possibleShapes[0] === 'plain')
        .map((s) => s.code)
        .sort();
      expect(plainCodes).toEqual(['A1', 'A2', 'A3', 'A4', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3'].sort());
    });
  });

  describe('checkerRelease — matches PR-1\'s CheckerActionsService A6-vs-B4 asymmetry characterization', () => {
    it('A4 (payExistingUtilize) -> releasesExistingMovementInPlace, only A4', () => {
      const inPlace = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.releasesExistingMovementInPlace);
      expect(inPlace.map((s) => s.code)).toEqual(['A4']);
    });

    it('A6 and B4 (settlesDocumentArrival) -> exactly these two', () => {
      const settles = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.settlesDocumentArrival);
      expect(settles.map((s) => s.code)).toEqual(['A6', 'B4']);
    });

    it('the A6-vs-B4 asymmetry itself: only B4 has sourceAlreadyReleasedBeforePick true — this is the exact fact that makes A6 release its source first while B4 does not', () => {
      expect(FUNCTION_STRATEGIES['A6'].checkerRelease.sourceAlreadyReleasedBeforePick).toBe(false);
      expect(FUNCTION_STRATEGIES['B4'].checkerRelease.sourceAlreadyReleasedBeforePick).toBe(true);
    });

    it('A3 and A3S (deferSettlement) -> exactly these two (B3 lost this flag in the 2026-08-18 redesign, per PR-1)', () => {
      const defer = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.deferSettlement);
      expect(defer.map((s) => s.code)).toEqual(['A3', 'A3S']);
    });
  });

  describe('selectionFlow', () => {
    it('B5 (settleableBalanceIndex) -> usesSettleableBalanceIndex, only B5', () => {
      const uses = Object.values(FUNCTION_STRATEGIES).filter((s) => s.selectionFlow.usesSettleableBalanceIndex);
      expect(uses.map((s) => s.code)).toEqual(['B5']);
    });
  });

  it('deriveFunctionStrategy is a pure function — calling it twice on the same registry entry yields deep-equal, independent objects', () => {
    const b4 = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === 'B4')!;
    const first = deriveFunctionStrategy(b4);
    const second = deriveFunctionStrategy(b4);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

/**
 * Relocated from `balance-component.model.spec.ts` in PR-5, alongside `resolveFunctionForMovement()`/
 * `payExistingUtilizeFunctionFor()` themselves (see `function-strategy.ts`'s own top-of-file doc comment
 * for why — a sixth real consumer of the 11 now-removed flags, discovered while removing them).
 */
describe('resolveFunctionForMovement', () => {
  it('resolves a literal fn.movementType match (A1 — IPLC_LC/ISSUE)', () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'ISSUE')?.code).toBe('A1');
  });

  it('resolves via subChoice.options (A2 — IPLC_LC/AMEND_INCREASE and AMEND_DECREASE, both from the same A2 subChoice)', () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_INCREASE')?.code).toBe('A2');
    expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_DECREASE')?.code).toBe('A2');
  });

  it('resolves via derivesMovementTypeFromTenor for BOTH derived movementTypes (B4 — EPLC_CONFIRMATION/HONOUR and ACCEPT)', () => {
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'HONOUR')?.code).toBe('B4');
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'ACCEPT')?.code).toBe('B4');
  });

  it("resolves the derived PARTIAL_REDEEM via amountVsAvailableDerivation 'REDEEM' (A9), not only the registry's own literal FULL_REDEEM default", () => {
    expect(resolveFunctionForMovement('SHGT', 'FULL_REDEEM')?.code).toBe('A9');
    expect(resolveFunctionForMovement('SHGT', 'PARTIAL_REDEEM')?.code).toBe('A9');
  });

  it("resolves the derived PARTIAL_SETTLE via amountVsAvailableDerivation 'SETTLE' (B5), not only the registry's own literal FULL_SETTLE default", () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'FULL_SETTLE')?.code).toBe('B5');
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'PARTIAL_SETTLE')?.code).toBe('B5');
  });

  it('returns undefined for a movementType/instrumentType combination no current function produces', () => {
    expect(resolveFunctionForMovement('EPLC_EXAMINATION', 'AMEND')).toBeUndefined();
  });

  // Bug fixed 2026-08-18, reviewer-reported live (Inquire Events on LC U01 — the EPLC_ACCEPTANCE/
  // CREATE row, B4's own Usance compound secondary leg, showed a blank "–" Function column). No
  // EXPORT_FUNCTIONS entry has instrumentType EPLC_ACCEPTANCE + movementType CREATE — B4's own
  // registry entry is instrumentType EPLC_CONFIRMATION, so the direct find() could never match this
  // leg's own instrumentType (unlike A6 on the Import side, whose registry entry IS instrumentType
  // IPLC_ACCEPTANCE/CREATE directly).
  it("resolves EPLC_ACCEPTANCE/CREATE (B4's own Usance Acceptance-liability compound leg) to B4, via compoundSubmission.possibleShapes including confirmationAcceptWithReceivable, not a direct instrumentType match", () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'CREATE')?.code).toBe('B4');
  });

  it('the fallback above is scoped to EPLC_ACCEPTANCE/CREATE only — a different movementType on the same instrumentType still resolves normally (B5) rather than also falling back to B4', () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'FULL_SETTLE')?.code).toBe('B5');
  });

  it("known limitation, explicitly accepted (see the function's own doc comment): IPLC_LC/UTILIZE is produced by BOTH A3 and A3S (both literal movementType: 'UTILIZE') — the resolver deterministically returns the first registry match, A3, since it's declared first", () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'UTILIZE')?.code).toBe('A3');
  });
});

// 2026-08-18, "A4 Sight Payment" ordering bug fix — InquireEventsService uses this instead of
// resolveFunctionForMovement() specifically for the LATER (Release) half of a finalized Sight
// Document Arrival, since the generic resolver above always returns A3 for that same pair.
describe('payExistingUtilizeFunctionFor', () => {
  it('resolves IPLC_LC to A4 — the one function in the registry with releasesExistingMovementInPlace set', () => {
    expect(payExistingUtilizeFunctionFor('IPLC_LC')?.code).toBe('A4');
  });

  it('returns undefined for any instrumentType with no matching function of its own (e.g. SHGT, EPLC_CONFIRMATION — no Export equivalent exists)', () => {
    expect(payExistingUtilizeFunctionFor('SHGT')).toBeUndefined();
    expect(payExistingUtilizeFunctionFor('EPLC_CONFIRMATION')).toBeUndefined();
  });
});
